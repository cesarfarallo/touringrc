import { useState } from "react";
import { CheckCircle2, XCircle, Plus, Pencil, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { T } from "../theme";
import { useClases, useMarcasNeumaticos, useNeumaticosEstadoClase, useEventos, useHistorialHomologaciones } from "../hooks";
import { supabase } from "../lib/supabase";
import HomologacionesPendientes from "./HomologacionesPendientes";

function fechaCorta(fecha) {
  if (!fecha) return null;
  return new Date(`${fecha}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Cuántos eventos mínimo tienen que pasar entre homologaciones de esta
// categoría -- editable inline, mismo patrón de lápiz que el resto de
// la app (ver InscripcionDiasEditable en GestionEventos.jsx).
function EventosMinimosEditable({ clase, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(clase.homologacion_eventos_minimos);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function guardar() {
    const n = Number(valor);
    if (!n || n < 1) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase.from("clases").update({ homologacion_eventos_minimos: n }).eq("id", clase.id);
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditando(false);
    onGuardado();
  }

  if (!editando) {
    return (
      <button
        onClick={() => {
          setValor(clase.homologacion_eventos_minimos);
          setEditando(true);
        }}
        title="Editar cada cuántos eventos se puede homologar un juego nuevo"
        style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", padding: 0 }}
      >
        Un juego nuevo cada {clase.homologacion_eventos_minimos} evento{clase.homologacion_eventos_minimos === 1 ? "" : "s"} <Pencil size={11} />
      </button>
    );
  }

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        min="1"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        autoFocus
        style={{ background: T.surfaceRaised, border: `1px solid ${T.line}`, borderRadius: 6, padding: "4px 8px", color: T.text, fontSize: 12, width: 50 }}
      />
      <button onClick={guardar} disabled={guardando} style={{ border: "none", background: "transparent", color: T.amber, fontSize: 12, cursor: "pointer" }}>
        {guardando ? "..." : "Guardar"}
      </button>
      <button onClick={() => setEditando(false)} style={{ border: "none", background: "transparent", color: T.muted, fontSize: 12, cursor: "pointer" }}>
        Cancelar
      </button>
      {error && <span style={{ color: T.red, fontSize: 11 }}>{error}</span>}
    </span>
  );
}

// Selector visual de marca por logo -- si la marca no tiene logo
// cargado, muestra un círculo con las iniciales como respaldo.
function SelectorMarca({ marcas, marcaId, onElegir }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {marcas.map((m) => (
        <button
          key={m.id}
          onClick={() => onElegir(m.id)}
          title={m.nombre}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            padding: 6,
            borderRadius: 8,
            border: `2px solid ${marcaId === m.id ? T.amber : T.line}`,
            background: marcaId === m.id ? `${T.amber}18` : "transparent",
            cursor: "pointer",
            width: 68,
          }}
        >
          {m.logo_url ? (
            <img
              src={m.logo_url}
              alt={m.nombre}
              style={{ width: 36, height: 36, objectFit: "contain", background: "#FFFFFF", borderRadius: 4 }}
            />
          ) : (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: T.surfaceRaised,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
                color: T.text,
              }}
            >
              {m.nombre.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span style={{ fontSize: 10, color: T.muted, textAlign: "center", lineHeight: 1.2 }}>{m.nombre}</span>
        </button>
      ))}
      {marcas.length === 0 && <span style={{ color: T.muted, fontSize: 12 }}>Todavía no hay marcas cargadas.</span>}
    </div>
  );
}

function NuevaMarca({ onCreada }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function crear(e) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase.from("marcas_neumaticos").insert({ nombre: nombre.trim(), logo_url: logoUrl.trim() || null });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNombre("");
    setLogoUrl("");
    setAbierto(false);
    onCreada();
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 12px",
          borderRadius: 8,
          border: `1px dashed ${T.amber}66`,
          background: "transparent",
          color: T.amber,
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <Plus size={13} /> Agregar marca
      </button>
    );
  }

  return (
    <form onSubmit={crear} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 11, color: T.muted }}>Nombre</label>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          autoFocus
          style={{ background: T.surfaceRaised, border: `1px solid ${T.line}`, borderRadius: 8, padding: "7px 10px", color: T.text, fontSize: 13, minWidth: 140 }}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 11, color: T.muted }}>URL del logo (opcional)</label>
        <input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://..."
          style={{ background: T.surfaceRaised, border: `1px solid ${T.line}`, borderRadius: 8, padding: "7px 10px", color: T.text, fontSize: 13, minWidth: 220 }}
        />
      </div>
      <button type="submit" disabled={guardando} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: T.amber, color: "#1A1300", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
        {guardando ? "Creando..." : "Crear"}
      </button>
      <button type="button" onClick={() => setAbierto(false)} style={{ border: "none", background: "transparent", color: T.muted, fontSize: 12, cursor: "pointer" }}>
        Cancelar
      </button>
      {error && <div style={{ width: "100%", color: T.red, fontSize: 11 }}>{error}</div>}
    </form>
  );
}

// `modo === "hoy"`: flujo en vivo, atado sin selector a la fecha de hoy
// (eventoHoy) -- no tiene sentido dejar elegir otra si se supone que se
// está cargando en pista, el mismo día. `modo === "historico"`: para
// regularizar homologaciones que ya pasaron y nunca se cargaron, con un
// selector limitado a fechas pasadas (no tendría sentido "regularizar"
// algo que todavía no ocurrió).
function FormularioHomologar({ piloto, claseId, modo, eventoHoy, eventosPasados, marcas, onCancelar, onHomologado }) {
  const [eventoId, setEventoId] = useState(modo === "hoy" ? (eventoHoy?.id ?? "") : (eventosPasados[0]?.id ?? ""));
  const [marcaId, setMarcaId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function guardar() {
    if (!eventoId || !marcaId) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase
      .from("homologaciones_neumaticos")
      .insert({ piloto_id: piloto.piloto_id, clase_id: claseId, marca_id: marcaId, evento_id: eventoId });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    onHomologado();
  }

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 10, border: `1px solid ${T.line}`, background: T.surfaceRaised, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: T.muted }}>Fecha del evento:</span>
        {modo === "hoy" ? (
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {eventoHoy.nombre} — {fechaCorta(eventoHoy.fecha)}
          </span>
        ) : (
          <select
            value={eventoId}
            onChange={(e) => setEventoId(e.target.value)}
            style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 8, padding: "6px 10px", color: T.text, fontSize: 13 }}
          >
            {eventosPasados.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre} — {fechaCorta(e.fecha)}
              </option>
            ))}
          </select>
        )}
      </div>
      <div>
        <span style={{ fontSize: 12, color: T.muted, display: "block", marginBottom: 6 }}>Marca del juego:</span>
        <SelectorMarca marcas={marcas} marcaId={marcaId} onElegir={setMarcaId} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={guardar}
          disabled={!eventoId || !marcaId || guardando}
          style={{
            padding: "7px 14px",
            borderRadius: 8,
            border: "none",
            background: eventoId && marcaId ? T.amber : T.surface,
            color: eventoId && marcaId ? "#1A1300" : T.muted,
            fontSize: 12,
            fontWeight: 600,
            cursor: eventoId && marcaId && !guardando ? "pointer" : "default",
          }}
        >
          {guardando ? "Guardando..." : "Confirmar homologación"}
        </button>
        <button onClick={onCancelar} style={{ border: "none", background: "transparent", color: T.muted, fontSize: 12, cursor: "pointer" }}>
          Cancelar
        </button>
      </div>
      {error && <div style={{ color: T.red, fontSize: 12 }}>{error}</div>}
    </div>
  );
}

// Corregir la marca de una homologación ya cargada: si quien edita es
// admin, aplica el cambio directo; si es técnica, en vez de escribir
// queda propuesto en `homologaciones_pendientes` a la espera de que un
// admin lo apruebe o lo rechace (migración 0018) -- técnica ya no
// puede pisar una homologación por RLS, así que este es el único
// camino que le queda para corregir un error.
function EditarMarcaHomologacion({ homologacion, marcas, esAdmin, onCancelar, onGuardado }) {
  const [marcaId, setMarcaId] = useState(homologacion.marca?.id ?? null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function guardar() {
    if (!marcaId) return;
    setGuardando(true);
    setError(null);
    const { error } = esAdmin
      ? await supabase.from("homologaciones_neumaticos").update({ marca_id: marcaId }).eq("id", homologacion.id)
      : await supabase.from("homologaciones_pendientes").insert({ homologacion_id: homologacion.id, marca_id_nueva: marcaId });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    onGuardado();
  }

  return (
    <div style={{ marginTop: 8, padding: 10, borderRadius: 8, border: `1px solid ${T.line}`, background: T.surfaceRaised, display: "flex", flexDirection: "column", gap: 8 }}>
      <SelectorMarca marcas={marcas} marcaId={marcaId} onElegir={setMarcaId} />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={guardar}
          disabled={!marcaId || marcaId === homologacion.marca?.id || guardando}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "none",
            background: marcaId && marcaId !== homologacion.marca?.id ? T.amber : T.surface,
            color: marcaId && marcaId !== homologacion.marca?.id ? "#1A1300" : T.muted,
            fontSize: 12,
            fontWeight: 600,
            cursor: marcaId && marcaId !== homologacion.marca?.id && !guardando ? "pointer" : "default",
          }}
        >
          {guardando ? "Guardando..." : esAdmin ? "Guardar corrección" : "Proponer corrección"}
        </button>
        <button onClick={onCancelar} style={{ border: "none", background: "transparent", color: T.muted, fontSize: 12, cursor: "pointer" }}>
          Cancelar
        </button>
      </div>
      {!esAdmin && (
        <div style={{ fontSize: 11, color: T.muted }}>Queda pendiente hasta que un admin la apruebe.</div>
      )}
      {error && <div style={{ color: T.red, fontSize: 12 }}>{error}</div>}
    </div>
  );
}

// Historial completo de homologaciones de un piloto en la categoría
// activa (no solo la última) -- cada una con un lápiz para corregir la
// marca, salvo que ya tenga una corrección pendiente de revisión.
function HistorialPiloto({ historial, marcas, esAdmin, onCambio }) {
  const [editando, setEditando] = useState(null);

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 8 }}>
      {historial.map((h) => (
        <div key={h.id} style={{ fontSize: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: T.muted }}>
              {h.eventoNombre} ({fechaCorta(h.fecha)}):
            </span>
            <span>{h.marca?.nombre ?? "—"}</span>
            {h.pendiente ? (
              <span style={{ display: "flex", alignItems: "center", gap: 4, color: T.amber }}>
                <Clock size={11} /> Pendiente: {h.pendiente.marcas_neumaticos?.nombre}
              </span>
            ) : (
              editando !== h.id && (
                <button
                  onClick={() => setEditando(h.id)}
                  title="Corregir la marca cargada"
                  style={{ display: "flex", background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 0 }}
                >
                  <Pencil size={11} />
                </button>
              )
            )}
          </div>
          {editando === h.id && (
            <EditarMarcaHomologacion
              homologacion={h}
              marcas={marcas}
              esAdmin={esAdmin}
              onCancelar={() => setEditando(null)}
              onGuardado={() => {
                setEditando(null);
                onCambio();
              }}
            />
          )}
        </div>
      ))}
      {historial.length === 0 && <div style={{ color: T.muted, fontSize: 12 }}>Sin homologaciones cargadas todavía.</div>}
    </div>
  );
}

function FilaPiloto({ fila, claseId, eventoHoy, eventosPasados, historial, marcas, esAdmin, onCambio }) {
  const [modo, setModo] = useState(null); // null | "hoy" | "historico" | "historial"

  const puedeHomologarHoy = fila.apto && eventoHoy;
  const tituloHomologar = !eventoHoy
    ? "No hay ninguna fecha corriendo hoy"
    : !fila.apto
      ? "Todavía no cumple el mínimo de eventos"
      : "Cargar homologación de hoy";

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{fila.piloto_nombre}</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
            {fila.ultima_homologacion_fecha
              ? `Última: ${fechaCorta(fila.ultima_homologacion_fecha)} — ${fila.ultima_homologacion_marca}`
              : "Nunca homologó en esta categoría"}
            {" · "}
            {fila.eventos_desde_ultima}/{fila.eventos_requeridos} eventos
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {fila.apto ? (
            <span style={{ display: "flex", alignItems: "center", gap: 5, color: T.teal, fontSize: 12, fontWeight: 600 }}>
              <CheckCircle2 size={14} /> Apto
            </span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 5, color: T.red, fontSize: 12, fontWeight: 600 }}>
              <XCircle size={14} /> No apto
            </span>
          )}
          {modo !== "hoy" && modo !== "historico" && (
            <>
              <button
                onClick={() => setModo("hoy")}
                disabled={!puedeHomologarHoy}
                title={tituloHomologar}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: `1px solid ${puedeHomologarHoy ? T.amber + "66" : T.line}`,
                  background: "transparent",
                  color: puedeHomologarHoy ? T.amber : T.muted,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: puedeHomologarHoy ? "pointer" : "not-allowed",
                }}
              >
                Homologar
              </button>
              {esAdmin && (
                <button
                  onClick={() => setModo("historico")}
                  title="Cargar una homologación que ya pasó y no se registró en su momento"
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: `1px solid ${T.line}`,
                    background: "transparent",
                    color: T.muted,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cargar histórico
                </button>
              )}
              <button
                onClick={() => setModo(modo === "historial" ? null : "historial")}
                title="Ver y corregir homologaciones ya cargadas"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: `1px solid ${T.line}`,
                  background: "transparent",
                  color: T.muted,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Historial {modo === "historial" ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </>
          )}
        </div>
      </div>
      {(modo === "hoy" || modo === "historico") && (
        <FormularioHomologar
          piloto={fila}
          claseId={claseId}
          modo={modo}
          eventoHoy={eventoHoy}
          eventosPasados={eventosPasados}
          marcas={marcas}
          onCancelar={() => setModo(null)}
          onHomologado={() => {
            setModo(null);
            onCambio();
          }}
        />
      )}
      {modo === "historial" && <HistorialPiloto historial={historial ?? []} marcas={marcas} esAdmin={esAdmin} onCambio={onCambio} />}
    </div>
  );
}

// Oficina técnica: homologación de neumáticos. Solo llega acá quien
// tiene el módulo 'homologacion' (migración 0017) -- el nav tab en
// App.jsx ya lo gatea, y las tablas de la base lo re-chequean vía RLS
// (tiene_modulo('homologacion')) para que no alcance con adivinar la URL.
export default function OficinaTecnica({ esAdmin }) {
  const { clases, loading: cargandoClases, recargar: recargarClases } = useClases();
  const { marcas, loading: cargandoMarcas, recargar: recargarMarcas } = useMarcasNeumaticos();
  const { eventos } = useEventos();
  const [claseId, setClaseId] = useState(null);
  const claseActiva = clases.find((c) => c.id === claseId) ?? clases[0];

  const { estado, loading: cargandoEstado, recargar: recargarEstado } = useNeumaticosEstadoClase(claseActiva?.id);
  const { porPiloto: historialPorPiloto, recargar: recargarHistorial } = useHistorialHomologaciones(claseActiva?.id);

  function recargarTodo() {
    recargarEstado();
    recargarHistorial();
  }

  const eventosOrdenados = [...eventos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  // El flujo en vivo ("Homologar") solo se habilita el día de una fecha
  // vigente -- se supone que se carga en pista, ese mismo día. El
  // histórico ("Cargar histórico") queda restringido a fechas ya
  // pasadas, para regularizar homologaciones que ocurrieron pero nunca
  // se cargaron en su momento.
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const eventoHoy = eventos.find((e) => new Date(`${e.fecha}T00:00:00`).getTime() === hoy.getTime());
  const eventosPasados = eventosOrdenados.filter((e) => new Date(`${e.fecha}T00:00:00`).getTime() < hoy.getTime());

  return (
    <div>
      <div style={{ color: T.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
        Oficina técnica — Homologación de neumáticos
      </div>

      {esAdmin && <HomologacionesPendientes onCambio={recargarTodo} />}

      {cargandoClases && <div style={{ color: T.muted, fontSize: 13 }}>Cargando categorías...</div>}

      {claseActiva && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {clases.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setClaseId(c.id)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: `1px solid ${claseActiva.id === c.id ? T.amber : T.line}`,
                    background: claseActiva.id === c.id ? `${T.amber}18` : "transparent",
                    color: claseActiva.id === c.id ? T.amber : T.muted,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <EventosMinimosEditable clase={claseActiva} onGuardado={recargarClases} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {cargandoEstado && <div style={{ color: T.muted, fontSize: 13 }}>Cargando pilotos...</div>}
            {!cargandoEstado && estado.length === 0 && (
              <div style={{ color: T.muted, fontSize: 13 }}>Todavía no hay pilotos con resultados en esta categoría.</div>
            )}
            {!cargandoEstado &&
              estado.map((fila) => (
                <FilaPiloto
                  key={fila.piloto_id}
                  fila={fila}
                  claseId={claseActiva.id}
                  eventoHoy={eventoHoy}
                  eventosPasados={eventosPasados}
                  historial={historialPorPiloto[fila.piloto_id]}
                  marcas={marcas}
                  esAdmin={esAdmin}
                  onCambio={recargarTodo}
                />
              ))}
          </div>
        </>
      )}

      <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
        <div style={{ color: T.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
          Marcas de neumáticos
        </div>
        {cargandoMarcas && <div style={{ color: T.muted, fontSize: 13 }}>Cargando marcas...</div>}
        {!cargandoMarcas && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <SelectorMarca marcas={marcas} marcaId={null} onElegir={() => {}} />
            <NuevaMarca onCreada={recargarMarcas} />
          </div>
        )}
      </div>
    </div>
  );
}
