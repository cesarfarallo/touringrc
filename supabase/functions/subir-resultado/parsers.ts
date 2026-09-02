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
}

export function parseSeriesResult(bytes: Uint8Array): { nombreTorneo: string | null; filas: FilaCampeonato[] } {
  const filasCrudas = leerFilasXls(bytes);
  let nombreTorneo: string | null = null;
  const out: FilaCampeonato[] = [];
  let claseActual: string | null = null;
  let fechasCols: [number, string][] | null = null;

  for (const fila of filasCrudas) {
    const vals = fila.map(limpiar);
    const valsNoNone = vals.filter((v): v is string => v !== null);
    if (valsNoNone.length === 0) continue;

    if (nombreTorneo === null && valsNoNone[0]?.includes("\n")) {
      nombreTorneo = valsNoNone[0].split("\n")[0];
      continue;
    }

    if (valsNoNone.length === 1 && valsNoNone[0] !== "Driver Name" && !valsNoNone[0].includes("www.")) {
      claseActual = valsNoNone[0];
      fechasCols = null;
      continue;
    }

    if (vals.includes("Driver Name")) {
      fechasCols = [];
      vals.forEach((v, idx) => {
        if (v && /^\d{2}\/\d{2}$/.test(v)) fechasCols!.push([idx, v]);
      });
      continue;
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
      });
    }
  }
  return { nombreTorneo, filas: out };
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
  const filas = leerFilasXls(bytes);
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
