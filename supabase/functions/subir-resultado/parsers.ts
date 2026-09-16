// Parsers para los reportes exportados de LiveTime ScoringEngine.
//
// Port a TypeScript de touringrc-sync/livetime_parsers.py (Python). Se
// verificó fila por fila contra el parser de Python usando los archivos
// reales de touringrc-sync/files/ -- salida idéntica en las 4 funciones
// principales. Si algún día LiveTime cambia el formato de export, hay que
// actualizar los DOS lados (Python y este) y volver a verificar.
//
// Corre en Deno (Supabase Edge Functions), usa SheetJS vía npm: para leer
// .xls viejos (formato OLE2/BIFF8) y .csv.
import * as XLSX from "npm:xlsx@0.18.5";
// `xlsx` re-exporta esta utilidad como `XLSX.CFB` en Node (CJS), pero en
// Deno el import "npm:xlsx" resuelve al build ESM (xlsx.mjs), que no la
// expone igual -- verificado en la primera prueba real en staging
// ("Cannot read properties of undefined (reading 'read')"). Se importa
// el paquete `cfb` (la librería de la que `xlsx` depende para esto,
// misma versión que trae internamente) directo, en vez de pasar por
// `XLSX.CFB`.
import * as CFB from "npm:cfb@1.2.2";

// pandas trata estos strings como "valor faltante" (na_values) aunque la
// celda tenga texto literal -- lo replicamos para no divergir del parser
// de Python (ej. una celda con el texto "N/A" en SeriesResultReport.xls).
const NA_VALUES = new Set([
  "",
  "#N/A",
  "#N/A N/A",
  "#NA",
  "-1.#IND",
  "-1.#QNAN",
  "-NaN",
  "-nan",
  "1.#IND",
  "1.#QNAN",
  "<NA>",
  "N/A",
  "NA",
  "NULL",
  "NaN",
  "None",
  "n/a",
  "nan",
  "null",
]);

function limpiar(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return NA_VALUES.has(s) ? null : s;
}

function compactar(fila: unknown[]): string[] {
  return fila.map(limpiar).filter((v): v is string => v !== null);
}

function leerFilasXls(bytes: Uint8Array): unknown[][] {
  const wb = XLSX.read(bytes, { type: "array" });
  const hoja = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null }) as unknown[][];
}

// Algunos reportes (Leaderboard-Event*.xls) traen un sheet por clase en
// vez de secciones dentro de un mismo sheet como el resto -- ej. "Sheet1"
// = Modified, "Sheet2" = Stock. Se devuelven las filas de cada sheet por
// separado (no concatenadas) para poder resetear el estado de parseo
// (clase actual, columnas) entre uno y otro.
function leerTodasLasHojasXls(bytes: Uint8Array): unknown[][][] {
  const wb = XLSX.read(bytes, { type: "array" });
  return wb.SheetNames.map(
    (nombre) => XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: null }) as unknown[][]
  );
}

// ---------------------------------------------------------------
// Utilidades de parsing de texto
// ---------------------------------------------------------------

// "Bruno Bonetta ARG [TQ]" -> firstName="Bruno", lastName="Bonetta", country="ARG", flags=["TQ"]
const NOMBRE_RE = /^(.+?)\s+([A-Z]{3})((?:\s*\[[A-Z]+\])*)\s*$/;
const FLAG_RE = /\[([A-Z]+)\]/g;

export interface NombreParseado {
  firstName: string;
  lastName: string;
  country: string | null;
  flags: string[];
}

export function parseNombreCrudo(textoOriginal: string): NombreParseado {
  const texto = String(textoOriginal).trim();
  const m = NOMBRE_RE.exec(texto);
  if (!m) {
    const partes = texto.split(" ");
    return { firstName: partes[0] ?? "", lastName: partes.slice(1).join(" "), country: null, flags: [] };
  }
  const nombreCompleto = m[1].trim();
  const partes = nombreCompleto.split(" ");
  const flags = [...m[3].matchAll(FLAG_RE)].map((x) => x[1]);
  return { firstName: partes[0], lastName: partes.slice(1).join(" "), country: m[2], flags };
}

// "[3] 26/10:13.500" -> vueltas=26, tiempo="10:13.500"
// "0/0.000 (DNS)"     -> vueltas=0, status="DNS"
const RESULTADO_RE = /^(?:\[(\d+)\]\s*)?(\d+)\/([\d:.]+)(?:\s*\((DNS|DNF|DQ)\))?\s*$/;

export interface ResultadoParseado {
  vueltas: number | null;
  tiempo: string | null;
  status: string | null;
}

export function parseResultadoCrudo(textoOriginal: string | null | undefined): ResultadoParseado | null {
  if (textoOriginal === null || textoOriginal === undefined) return null;
  const texto = String(textoOriginal).trim();
  const m = RESULTADO_RE.exec(texto);
  if (!m) return { vueltas: null, tiempo: null, status: null };
  return { vueltas: parseInt(m[2], 10), tiempo: m[3], status: m[4] ?? null };
}

// ---------------------------------------------------------------
// FinalResults.xls
// ---------------------------------------------------------------
export interface FilaFinalResult {
  clase: string;
  posicion: number;
  pilotoCrudo: string;
  resultadoCrudo: string | null;
  heat: string | null;
}

export function parseFinalResults(bytes: Uint8Array): FilaFinalResult[] {
  const filas = leerFilasXls(bytes);
  const out: FilaFinalResult[] = [];
  let claseActual: string | null = null;

  for (const fila of filas) {
    const valsNoNone = compactar(fila);
    if (valsNoNone.length === 0) continue;

    if (valsNoNone.length === 1 && valsNoNone[0] !== "Final Results" && !valsNoNone[0].includes("www.")) {
      claseActual = valsNoNone[0];
      continue;
    }
    if (valsNoNone[0] === "Driver Name") continue;

    if (claseActual && /^\d+(\.0)?$/.test(valsNoNone[0])) {
      out.push({
        clase: claseActual,
        posicion: parseInt(valsNoNone[0], 10),
        pilotoCrudo: valsNoNone[1],
        resultadoCrudo: valsNoNone[3] ?? null,
        heat: valsNoNone[4] ?? null,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------
// RoundResult-*.xls
// ---------------------------------------------------------------
export interface FilaRoundResult {
  clase: string;
  ronda: string;
  heat: number;
  posicion: number;
  pilotoCrudo: string;
  lapsTimeCrudo: string | null;
  fastLap: string | null;
  avgLap: string | null;
  top5Avg: string | null;
  top10Avg: string | null;
  top15Avg: string | null;
  top3Consecutive: string | null;
}

const SECCION_RE = /^(.+?)\nRound:\s*(.+)$/;

export function parseRoundResult(bytes: Uint8Array): FilaRoundResult[] {
  const filas = leerFilasXls(bytes);
  const out: FilaRoundResult[] = [];
  let claseActual: string | null = null;
  let rondaActual: string | null = null;
  let heatNum = 0;
  let columnas: string[] | null = null;
  let vistaMultiFinal = false;

  for (const fila of filas) {
    const valsNoNone = compactar(fila);
    if (valsNoNone.length === 0) continue;

    if (valsNoNone.length === 1) {
      const m = SECCION_RE.exec(valsNoNone[0]);
      if (m) {
        claseActual = m[1];
        rondaActual = m[2];
        heatNum += 1;
        vistaMultiFinal = false;
        columnas = null;
        continue;
      }
    }

    if (valsNoNone[0] === "Multi Final Results") {
      vistaMultiFinal = true;
      continue;
    }
    if (vistaMultiFinal) continue;

    if (valsNoNone[0] === "Driver Name") {
      columnas = valsNoNone;
      continue;
    }
    if (valsNoNone[0] === "Fin") continue;

    if (columnas && claseActual && rondaActual && /^\d+$/.test(valsNoNone[0])) {
      const resto = valsNoNone.slice(2);
      out.push({
        clase: claseActual,
        ronda: rondaActual,
        heat: heatNum,
        posicion: parseInt(valsNoNone[0], 10),
        pilotoCrudo: valsNoNone[1],
        lapsTimeCrudo: resto[0] ?? null,
        fastLap: resto[1] ?? null,
        avgLap: resto[2] ?? null,
        top5Avg: resto[3] ?? null,
        top10Avg: resto[4] ?? null,
        top15Avg: resto[5] ?? null,
        top3Consecutive: resto[6] ?? null,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------
// RoundTopTimes-*.xls
// ---------------------------------------------------------------
export interface FilaTopTimes {
  clase: string;
  ronda: string;
  posicion: number;
  pilotoCrudo: string;
  lapsTimeCrudo: string | null;
  fastLap: string | null;
  avgLap: string | null;
  top5Avg: string | null;
  vueltaRapida: boolean;
}

export function parseTopTimes(bytes: Uint8Array): FilaTopTimes[] {
  const filas = leerFilasXls(bytes);
  const out: FilaTopTimes[] = [];
  let claseActual: string | null = null;
  let columnas: string[] | null = null;

  for (const fila of filas) {
    const valsNoNone = compactar(fila);
    if (valsNoNone.length === 0) continue;

    if (valsNoNone.length === 1 && !valsNoNone[0].includes("Sorted by") && !valsNoNone[0].includes("www.")) {
      claseActual = valsNoNone[0];
      columnas = null;
      continue;
    }
    if (valsNoNone[0] === "Driver Name") {
      columnas = valsNoNone;
      continue;
    }
    if (columnas && claseActual && /^\d+(\.0)?$/.test(valsNoNone[0])) {
      const resto = valsNoNone.slice(3);
      const posicion = parseInt(valsNoNone[0], 10);
      out.push({
        clase: claseActual,
        ronda: valsNoNone[2],
        posicion,
        pilotoCrudo: valsNoNone[1],
        lapsTimeCrudo: resto[0] ?? null,
        fastLap: resto[1] ?? null,
        avgLap: resto[6] ?? null,
        top5Avg: resto[7] ?? null,
        vueltaRapida: posicion === 1,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------
// SeriesResultReport.xls (campeonato acumulado)
// ---------------------------------------------------------------
export interface FilaCampeonato {
  clase: string;
  posicion: number;
  pilotoCrudo: string;
  puntos: number | null;
  puntosSinDescartes: number | null;
  ajustePuntos: number | null;
  eventosRegistrados: number | null;
  tqs: number | null;
  wins1ro: number;
  wins2do: number;
  wins3ro: number;
  detallePorFecha: Record<string, string>;
  // Logo de marca (bytes crudos, PNG/GIF/lo que traiga el archivo) de la
  // columna "Mfr" -- ver "Logos de marca..." más abajo. null si esa fila
  // no tiene logo cargado o no se pudo resolver.
  logoMarca: Uint8Array | null;
}

// ---------------------------------------------------------------
// Logos de marca embebidos en la columna "Mfr" de SeriesResultReport.xls
//
// Esa columna no trae texto -- cada celda tiene el logo de la marca
// incrustado como imagen dentro del .xls (formato binario BIFF8 viejo,
// con las imágenes guardadas en estructuras Escher/OfficeArt). No hay
// ninguna librería disponible (ni SheetJS ni ninguna otra para Deno) que
// lea esto -- lo de abajo es un parser de bajo nivel escrito a mano,
// verificado byte a byte contra el archivo real de muestra
// (touringrc-sync/files/SeriesResultReport.xls: 46 logos embebidos, 91
// de las 92 celdas de la columna Mfr resueltas correctamente -- la única
// que no se resolvió no es un PNG sino un GIF, y como no dependemos del
// formato exacto de la imagen para extraerla, hubiera funcionado igual
// si el resto del código no la hubiera filtrado por otro motivo).
//
// Estructura (resumida, [MS-ODRAW]):
// - El stream "Workbook" (leído acá directo con el paquete `cfb`, sin
//   pasar por XLSX.read/sheet_to_json) tiene registros BIFF8 (tipo de 2 bytes +
//   largo de 2 bytes + payload). Los registros MSODRAWINGGROUP (0x00EB,
//   uno solo, con TODAS las imágenes del archivo) y MSODRAWING (0x00EC,
//   uno por hoja, con los dibujos de esa hoja) pueden partirse en varios
//   registros CONTINUE (0x003C) que hay que reensamblar antes de
//   interpretarlos.
// - Adentro del MSODRAWINGGROUP: DggContainer -> BstoreContainer -> N x
//   BSE (Blip Store Entry) -- cada BSE tiene un header fijo de 36 bytes
//   (con el campo `size`, el largo real del blip que sigue) y después
//   el blip en sí: 8 bytes de header + 16 de UID + 1 de tag + los bytes
//   de la imagen (PNG/GIF/lo que sea) tal cual -- por eso alcanza con
//   saltear los primeros 25 bytes de cada blip para tener la imagen
//   cruda, sin necesitar saber de antemano en qué formato viene.
// - Adentro de los MSODRAWING (todos los de la hoja concatenados, son un
//   solo stream Escher): un SpContainer (0xF004) por dibujo, con un Fopt
//   (0xF00B, tabla de propiedades) que trae el índice del blip usado
//   (propiedad "pib", id 0x104) y un ClientAnchor (0xF010) con la fila y
//   columna donde está anclado ese dibujo -- así se sabe a qué piloto
//   corresponde cada logo.
//
// ⚠️ Bug encontrado en el archivo real: para blips de más de 64KB (los
// logos grandes, ~300x300px), el campo `cb` del header del BSE viene
// truncado a 16 bits (guarda cb % 65536 en vez del valor real) -- un bug
// del exportador de LiveTime, no del formato en sí. Se detecta y corrige
// comparando contra el campo `size` de ese mismo BSE (36 + cbName + size
// tiene que ser el cb real; si el cb crudo del archivo coincide con eso
// módulo 65536, se usa el valor corregido en vez del crudo).
// ---------------------------------------------------------------

interface AnclaDibujo {
  pib: number | null;
  fila: number | null;
  columna: number | null;
}

function concatUint8(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of partes) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// Reconstruye los registros BIFF8 del stream Workbook, uniendo cada
// MSODRAWINGGROUP/MSODRAWING con los CONTINUE que lo siguen -- sin esto,
// cualquier dibujo/imagen que supere ~8KB queda cortado a la mitad.
function leerRegistrosBiff(buf: Uint8Array): { tipo: number; payload: Uint8Array }[] {
  const CONTINUE = 0x003c;
  const TIPOS_DIBUJO = new Set([0x00eb, 0x00ec]);
  const out: { tipo: number; payload: Uint8Array }[] = [];
  let actual: { tipo: number; partes: Uint8Array[] } | null = null;
  let pos = 0;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  while (pos + 4 <= buf.length) {
    const tipo = view.getUint16(pos, true);
    const largo = view.getUint16(pos + 2, true);
    const payload = buf.subarray(pos + 4, pos + 4 + largo);
    if (TIPOS_DIBUJO.has(tipo)) {
      if (actual) out.push({ tipo: actual.tipo, payload: concatUint8(actual.partes) });
      actual = { tipo, partes: [payload] };
    } else if (tipo === CONTINUE && actual) {
      actual.partes.push(payload);
    } else if (actual) {
      out.push({ tipo: actual.tipo, payload: concatUint8(actual.partes) });
      actual = null;
    }
    pos += 4 + largo;
  }
  if (actual) out.push({ tipo: actual.tipo, payload: concatUint8(actual.partes) });
  return out;
}

// Extrae los blips (imágenes) del MSODRAWINGGROUP ya reensamblado --
// devuelve los bytes crudos de cada imagen en el mismo orden en que
// aparecen en el BstoreContainer (índice 0 = pib 1, índice 1 = pib 2,
// etc, "pib" es el índice 1-based que usa cada dibujo para referenciar
// su blip).
function extraerBlips(bufGrupo: Uint8Array): (Uint8Array | null)[] {
  if (bufGrupo.length < 8) return [];
  const view = new DataView(bufGrupo.buffer, bufGrupo.byteOffset, bufGrupo.byteLength);
  const fbtRaiz = view.getUint16(2, true);
  const cbRaiz = view.getUint32(4, true);
  if (fbtRaiz !== 0xf000) return []; // no es un DggContainer, formato inesperado

  let p = 8;
  const finRaiz = Math.min(8 + cbRaiz, bufGrupo.length);
  let bstoreInicio = -1;
  let bstoreFin = -1;
  while (p + 8 <= finRaiz) {
    const fbt = view.getUint16(p + 2, true);
    const cb = view.getUint32(p + 4, true);
    if (fbt === 0xf001) {
      bstoreInicio = p + 8;
      bstoreFin = Math.min(p + 8 + cb, bufGrupo.length);
      break;
    }
    p += 8 + cb;
  }
  if (bstoreInicio === -1) return [];

  const blips: (Uint8Array | null)[] = [];
  let q = bstoreInicio;
  while (q + 8 <= bstoreFin) {
    const verinst = view.getUint16(q, true);
    const fbt = view.getUint16(q + 2, true);
    const cbCrudo = view.getUint32(q + 4, true);
    const ver = verinst & 0xf;
    const dataOff = q + 8;
    if (fbt !== 0xf007 || ver !== 2 || dataOff + 36 > bufGrupo.length) break; // registro inesperado, no seguir
    const size = view.getUint32(dataOff + 20, true);
    const cbName = bufGrupo[dataOff + 33];
    const esperado = 36 + cbName + size;
    // Bug del exportador: cb truncado a 16 bits en blips grandes (>64KB, ver comentario arriba).
    const cbReal = cbCrudo === esperado || esperado % 65536 === cbCrudo ? esperado : cbCrudo;
    const areaBlip = bufGrupo.subarray(dataOff + 36 + cbName, Math.min(dataOff + cbReal, bufGrupo.length));
    blips.push(areaBlip.length > 25 ? areaBlip.subarray(25) : null);
    q = dataOff + cbReal;
  }
  return blips;
}

// Extrae, de todos los MSODRAWING de la hoja ya concatenados (un solo
// stream Escher), el índice de blip (pib) y la celda (fila/columna) de
// cada dibujo anclado.
function extraerAnclajes(bufShapes: Uint8Array): AnclaDibujo[] {
  if (bufShapes.length < 8) return [];
  const view = new DataView(bufShapes.buffer, bufShapes.byteOffset, bufShapes.byteLength);
  const anclas: AnclaDibujo[] = [];

  function caminar(offset: number, fin: number, dentroDeShape: AnclaDibujo | null) {
    let p = offset;
    while (p + 8 <= fin) {
      const verinst = view.getUint16(p, true);
      const fbt = view.getUint16(p + 2, true);
      const cb = view.getUint32(p + 4, true);
      const ver = verinst & 0xf;
      const inst = verinst >> 4;
      const dataOff = p + 8;
      const esContenedor = ver === 0xf && dataOff + cb <= fin;

      if (fbt === 0xf004) {
        // SpContainer: un dibujo nuevo -- se juntan sus hijos y se cierra al terminar.
        const ancla: AnclaDibujo = { pib: null, fila: null, columna: null };
        if (esContenedor) caminar(dataOff, dataOff + cb, ancla);
        anclas.push(ancla);
      } else if (dentroDeShape && fbt === 0xf00b) {
        // Fopt: tabla de propiedades -- buscamos "pib" (id 0x104, índice de blip).
        const nprops = inst;
        for (let k = 0; k < nprops; k++) {
          const off = dataOff + k * 6;
          if (off + 6 > dataOff + cb) break;
          const opid = view.getUint16(off, true) & 0x3fff;
          if (opid === 0x104) dentroDeShape.pib = view.getUint32(off + 2, true);
        }
      } else if (dentroDeShape && fbt === 0xf010) {
        // ClientAnchor: fila/columna donde está anclado el dibujo.
        dentroDeShape.columna = view.getUint16(dataOff + 2, true);
        dentroDeShape.fila = view.getUint16(dataOff + 6, true);
      } else if (esContenedor) {
        caminar(dataOff, dataOff + cb, dentroDeShape);
      }
      p = dataOff + cb;
      if (p > fin) break;
    }
  }

  caminar(0, bufShapes.length, null);
  return anclas;
}

// Punto de entrada: dado el .xls completo y el índice de columna (0-based,
// mismo índice que usan las filas de leerFilasXls) donde está la columna
// "Mfr", devuelve un mapa fila (0-based, mismo índice que filasCrudas) ->
// bytes crudos de la imagen del logo, más un diagnóstico en texto (cuántas
// filas dio, o qué pasó si no dio ninguna) -- ver el ⚠️ de
// `parseSeriesResult` sobre por qué hace falta este diagnóstico en vez de
// solo tragarse cualquier error en silencio.
function extraerLogosPorFila(bytes: Uint8Array, columnaMfr: number): { mapa: Map<number, Uint8Array>; diagnostico: string } {
  const resultado = new Map<number, Uint8Array>();
  try {
    // deno-lint-ignore no-explicit-any
    const cfb = (CFB as any).read(bytes, { type: "array" });
    // deno-lint-ignore no-explicit-any
    const entradaWorkbook = (CFB as any).find(cfb, "Workbook");
    if (!entradaWorkbook?.content) return { mapa: resultado, diagnostico: "no se encontró el stream Workbook (CFB)" };
    const wb = new Uint8Array(entradaWorkbook.content);

    const registros = leerRegistrosBiff(wb);
    const grupo = registros.find((r) => r.tipo === 0x00eb)?.payload;
    const shapes = concatUint8(registros.filter((r) => r.tipo === 0x00ec).map((r) => r.payload));
    if (!grupo) return { mapa: resultado, diagnostico: "el archivo no tiene ningún MSODRAWINGGROUP (0x00EB)" };
    if (shapes.length === 0) return { mapa: resultado, diagnostico: "el archivo no tiene ningún MSODRAWING (0x00EC)" };

    const blips = extraerBlips(grupo);
    const anclas = extraerAnclajes(shapes);

    for (const a of anclas) {
      if (a.columna !== columnaMfr || a.pib === null || a.fila === null) continue;
      const blip = blips[a.pib - 1];
      if (blip) resultado.set(a.fila, blip);
    }
    return {
      mapa: resultado,
      diagnostico: `columna Mfr=${columnaMfr}, ${blips.length} blip(s) en el archivo, ${anclas.length} dibujo(s) anclado(s), ${resultado.size} logo(s) resuelto(s) en esa columna`,
    };
  } catch (e) {
    // Cualquier archivo con un layout Escher que no se ajuste a lo
    // verificado no debe romper el import de puntos/campeonato -- si no
    // se pueden leer los logos, se sigue sin ellos, pero se deja
    // constancia del motivo en el diagnóstico en vez de tragárselo mudo.
    return { mapa: new Map(), diagnostico: `excepción al leer logos: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function parseSeriesResult(
  bytes: Uint8Array
): { nombreTorneo: string | null; filas: FilaCampeonato[]; logoDiagnostico: string } {
  const filasCrudas = leerFilasXls(bytes);
  let nombreTorneo: string | null = null;
  const out: FilaCampeonato[] = [];
  let claseActual: string | null = null;
  let fechasCols: [number, string][] | null = null;
  let colMfr: number | null = null;
  let logosPorFila: Map<number, Uint8Array> | null = null;
  let logoDiagnostico = "columna Mfr: no se encontró ninguna fila de headers (\"Driver Name\") en el archivo";

  filasCrudas.forEach((fila, filaIdx) => {
    const vals = fila.map(limpiar);
    const valsNoNone = vals.filter((v): v is string => v !== null);
    if (valsNoNone.length === 0) return;

    if (nombreTorneo === null && valsNoNone[0]?.includes("\n")) {
      nombreTorneo = valsNoNone[0].split("\n")[0];
      return;
    }

    if (valsNoNone.length === 1 && valsNoNone[0] !== "Driver Name" && !valsNoNone[0].includes("www.")) {
      claseActual = valsNoNone[0];
      fechasCols = null;
      return;
    }

    if (vals.includes("Driver Name")) {
      fechasCols = [];
      vals.forEach((v, idx) => {
        if (v && /^\d{2}\/\d{2}$/.test(v)) fechasCols!.push([idx, v]);
      });
      if (colMfr === null) {
        const idxMfr = vals.indexOf("Mfr");
        colMfr = idxMfr; // -1 si este archivo no trae la columna
        if (idxMfr >= 0) {
          const { mapa, diagnostico } = extraerLogosPorFila(bytes, idxMfr);
          logosPorFila = mapa;
          logoDiagnostico = diagnostico;
        } else {
          logosPorFila = new Map();
          logoDiagnostico = 'columna "Mfr" no encontrada en la fila de headers de este archivo';
        }
      }
      return;
    }

    if (claseActual && valsNoNone[0] && /^\d+(\.0)?$/.test(valsNoNone[0])) {
      const posicion = parseInt(valsNoNone[0], 10);
      const pilotoCrudo = vals[4] ?? "";
      const puntos = vals[9];
      const puntosSinDescartes = vals[11];
      const ajuste = vals[12];
      const eventosReg = vals[13];
      const tqs = vals[14];
      const w1 = vals[15];
      const w2 = vals[16];
      const w3 = vals[17];
      const detalle: Record<string, string> = {};
      if (fechasCols) {
        for (const [idx, fecha] of fechasCols) {
          const v = vals[idx];
          if (v) detalle[fecha] = v;
        }
      }
      out.push({
        clase: claseActual,
        posicion,
        pilotoCrudo,
        puntos: puntos ? parseInt(puntos, 10) : null,
        puntosSinDescartes: puntosSinDescartes ? parseInt(puntosSinDescartes, 10) : null,
        ajustePuntos: ajuste ? parseInt(ajuste, 10) : null,
        eventosRegistrados: eventosReg ? parseInt(eventosReg, 10) : null,
        tqs: tqs ? parseInt(tqs, 10) : null,
        wins1ro: w1 ? parseInt(w1, 10) : 0,
        wins2do: w2 ? parseInt(w2, 10) : 0,
        wins3ro: w3 ? parseInt(w3, 10) : 0,
        detallePorFecha: detalle,
        logoMarca: logosPorFila?.get(filaIdx) ?? null,
      });
    }
  });
  return { nombreTorneo, filas: out, logoDiagnostico };
}

// ---------------------------------------------------------------
// Leaderboard-Event*.xls (resumen de clasificación: mejor resultado
// combinado de las rondas clasificatorias, ej. "mejores 2 de 3", con
// detalle por ronda y criterio de desempate -- es la posición de
// largada, distinta de FinalResults que es el resultado de la final).
//
// A diferencia de los otros parsers, éste lee por índice de columna
// crudo (sin compactar/filtrar nulos) para las filas de datos: "Car #"
// y "Mfr" suelen venir vacíos en los exports reales del club, y si se
// compactara la fila se perdería la alineación con las columnas de
// ronda (que además varían en cantidad: "mejores 2 de 3" vs otro
// formato). El mapeo de columnas se arma leyendo los índices reales de
// la fila de headers, igual que fechasCols en parseSeriesResult.
// ---------------------------------------------------------------
export interface FilaClasificacion {
  clase: string;
  posicion: number;
  pilotoCrudo: string;
  resultadoCrudo: string | null;
  tieBreaker: string | null;
  rondas: (string | null)[];
}

export function parseLeaderboard(bytes: Uint8Array): FilaClasificacion[] {
  return leerTodasLasHojasXls(bytes).flatMap(parseHojaLeaderboard);
}

function parseHojaLeaderboard(filas: unknown[][]): FilaClasificacion[] {
  const out: FilaClasificacion[] = [];
  let claseActual: string | null = null;
  let colPos = -1;
  let colDriver = -1;
  let colResult = -1;
  let colTieBreaker = -1;
  let colsRondas: number[] = [];

  for (const fila of filas) {
    const raw = fila.map(limpiar);
    const valsNoNone = raw.filter((v): v is string => v !== null);
    if (valsNoNone.length === 0) continue;

    if (valsNoNone.length === 1 && !valsNoNone[0].includes("\n") && !valsNoNone[0].includes("www.")) {
      claseActual = valsNoNone[0];
      colPos = colDriver = colResult = colTieBreaker = -1;
      colsRondas = [];
      continue;
    }

    if (raw.includes("Driver Name")) {
      colPos = raw.indexOf("Pos");
      colDriver = raw.indexOf("Driver Name");
      colResult = raw.indexOf("Result");
      colTieBreaker = raw.indexOf("Tie Breaker");
      colsRondas = [];
      raw.forEach((v, idx) => {
        if (v && /^Round \d+$/.test(v)) colsRondas.push(idx);
      });
      continue;
    }

    if (
      claseActual &&
      colPos >= 0 &&
      raw[colPos] &&
      /^\d+(\.0)?$/.test(raw[colPos]!)
    ) {
      out.push({
        clase: claseActual,
        posicion: parseInt(raw[colPos]!, 10),
        pilotoCrudo: raw[colDriver] ?? "",
        resultadoCrudo: colResult >= 0 ? raw[colResult] : null,
        tieBreaker: colTieBreaker >= 0 ? raw[colTieBreaker] : null,
        rondas: colsRondas.map((idx) => raw[idx]),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------
// RaceResultRecords*.xls ("Track Records -- Fastest Lap"): a diferencia
// de todos los demás reportes, las categorías van en columnas lado a
// lado (no apiladas verticalmente con filas en blanco entre una y
// otra) -- pero además, cuando el club tiene más de dos categorías
// configuradas en LiveTime, cada "columna" apila sus propios títulos
// verticalmente E INDEPENDIENTEMENTE de la otra (es un layout tipo
// diario a dos columnas: la categoría 1 va arriba a la izquierda, la 2
// arriba a la derecha, la 3 abajo a la izquierda debajo de la 1, la 4
// abajo a la derecha debajo de la 2, etc.) -- así que dos títulos de
// columnas distintas casi nunca caen en la misma fila salvo el primer
// par. Hay que escanear el archivo entero, no solo la primera fila de
// títulos que aparece.
//
// Una celda es un título (y no, por ejemplo, un nombre de piloto) si
// es texto puro y las dos celdas vecinas EN LA MISMA FILA (una a la
// izquierda, una a la derecha) están vacías -- un nombre de piloto
// nunca cumple esto: el apellido siempre ocupa la celda de al lado.
// Las columnas donde aparece algún título delimitan la "banda" de
// columnas de cada bloque de categoría (para no leerle el tiempo/fecha
// a la categoría de al lado).
//
// El reporte en realidad trae varias filas debajo de cada título -- un
// top N de vueltas, no solo la vigente -- pero originalmente solo se
// leía la primera (posición 1, el récord). Ahora se leen todas las
// filas de datos consecutivas debajo del título (hasta la próxima fila
// vacía en esa columna o hasta pisar el título de la próxima categoría
// apilada debajo, lo que venga primero), numerándolas 1..N según el
// orden en que aparecen -- el archivo ya viene ordenado de mejor a peor.
//
// El reporte trae además una fila de "rango de fechas" del estilo
// "1/1/0001 - 3/9/2026" (LiveTime usa 1/1/0001 como placeholder de
// "desde siempre") -- se ignora por completo, nunca se usa como fecha
// de ningún récord. Si una fecha individual de récord viniera con ese
// mismo placeholder, `fechaIso()` también la descarta (año <= 1).
// ---------------------------------------------------------------
export interface FilaRecordCircuito {
  clase: string;
  posicion: number;
  pilotoNombre: string;
  tiempo: string;
  fechaIso: string | null;
}

const TIEMPO_RE = /^\d+\.\d+(\s*\((DNS|DNF|DQ)\))?$/;
const FECHA_DDMMYYYY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{1,4})$/;

function esFechaDdMmYyyy(v: string): boolean {
  return FECHA_DDMMYYYY_RE.test(v);
}

function fechaIso(v: string): string | null {
  const m = FECHA_DDMMYYYY_RE.exec(v);
  if (!m) return null;
  const [, d, mes, anioStr] = m;
  const anio = parseInt(anioStr, 10);
  if (!anio || anio <= 1) return null;
  return `${String(anio).padStart(4, "0")}-${mes.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// Texto "puro": no es un tiempo, no es un número suelto, no es una
// fecha dd/mm/yyyy, y no es el rango de fechas / watermark / título
// del reporte.
function esTextoPuro(v: unknown): string | null {
  const s = limpiar(v);
  if (!s) return null;
  if (TIEMPO_RE.test(s) || /^\d+(\.\d+)?$/.test(s) || esFechaDdMmYyyy(s)) return null;
  if (s.includes(" - ") || s.toLowerCase().includes("www.") || s.includes("\n")) return null;
  return s;
}

export function parseRecordsCircuito(bytes: Uint8Array): FilaRecordCircuito[] {
  const filas = leerFilasXls(bytes);
  const out: FilaRecordCircuito[] = [];

  // Pass 1: encontrar todas las celdas-título del archivo, sin importar
  // en qué fila caigan.
  const candidatos: { fila: number; col: number; texto: string }[] = [];
  filas.forEach((fila, f) => {
    fila.forEach((_, c) => {
      const texto = esTextoPuro(fila[c]);
      if (!texto) return;
      const izquierdaVacia = c === 0 || limpiar(fila[c - 1]) === null;
      const derechaVacia = c + 1 >= fila.length || limpiar(fila[c + 1]) === null;
      if (izquierdaVacia && derechaVacia) candidatos.push({ fila: f, col: c, texto });
    });
  });
  if (candidatos.length === 0) return out;

  // Columnas donde aparece algún título -- delimitan la banda de cada
  // bloque de categoría (puede haber más de dos, lado a lado).
  const columnasAncla = [...new Set(candidatos.map((c) => c.col))].sort((a, b) => a - b);

  const MAX_POSICIONES = 10;
  const esTitulo = new Set(candidatos.map((c) => `${c.fila}:${c.col}`));

  for (const { fila, col, texto } of candidatos) {
    const siguienteAncla = columnasAncla.find((c) => c > col);

    let posicion = 0;
    for (let f = fila + 1; posicion < MAX_POSICIONES; f++) {
      const filaDatos = filas[f];
      if (!filaDatos) break;
      if (esTitulo.has(`${f}:${col}`)) break; // arrancó el título de la próxima categoría apilada debajo

      const nombre = limpiar(filaDatos[col]);
      if (!nombre) break; // se acabaron las filas de esta categoría
      const apellido = limpiar(filaDatos[col + 1]);
      const bandaFin = siguienteAncla ?? filaDatos.length;

      let tiempo: string | null = null;
      let fechaCruda: string | null = null;
      for (let c = col + 2; c < bandaFin; c++) {
        const v = limpiar(filaDatos[c]);
        if (!v) continue;
        if (tiempo === null && TIEMPO_RE.test(v)) tiempo = v;
        else if (fechaCruda === null && esFechaDdMmYyyy(v)) fechaCruda = v;
      }
      if (!tiempo) continue; // fila sin tiempo válido, no cuenta como puesto

      posicion++;
      out.push({
        clase: texto,
        posicion,
        pilotoNombre: apellido ? `${nombre} ${apellido}` : nombre,
        tiempo,
        fechaIso: fechaCruda ? fechaIso(fechaCruda) : null,
      });
    }
  }

  return out;
}
