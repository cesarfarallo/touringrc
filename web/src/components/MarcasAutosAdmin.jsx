import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { T } from "../theme";
import { useMarcasAutos } from "../hooks";
import { supabase } from "../lib/supabase";

// Cada logo nuevo que aparece en un SeriesResultReport.xls se guarda solo
// (migración 0029) con nombre genérico ("Marca sin nombre N") -- acá se
// renombra, y opcionalmente se pisa el logo (por si el que se extrajo del
// reporte no es el correcto, o el admin prefiere uno propio) o se borra
// una marca que no correspondía (los piloto_marca_evento que la usaban
// quedan sin marca, `on delete set null`, no rotos).
function FilaMarca({ marca, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(marca.nombre);
  const [logoUrl, setLogoUrl] = useState(marca.logo_url ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function guardar() {
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    const { error } = await supabase
      .from("marcas_autos")
      .update({ nombre: nombre.trim(), logo_url: logoUrl.trim() })
      .eq("id", marca.id);
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setEditando(false);
    onGuardado();
  }

  async function borrar() {
    if (!confirm(`¿Borrar la marca "${marca.nombre}"? Los pilotos que la tenían asociada en algún evento quedan sin marca ahí (no se puede deshacer).`)) return;
    const { error } = await supabase.from("marcas_autos").delete().eq("id", marca.id);
    if (error) {
      setError(error.message);
      return;
    }
    onGuardado();
  }

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
      {!editando ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {marca.logo_url ? (
              <img src={marca.logo_url} alt={marca.nombre} style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 4, background: "#FFFFFF", flexShrink: 0 }} />
            ) : (
              <div style={{ width: 32, height: 32, borderRadius: 4, background: T.surfaceRaised, flexShrink: 0 }} />
            )}
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 500, color: T.text }}>{marca.nombre}</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            <button
              onClick={() => setEditando(true)}
              title="Editar marca"
              style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${T.line}`, borderRadius: 8, padding: "7px 12px", color: T.text, fontSize: 12, cursor: "pointer" }}
            >
              <Pencil size={12} /> Editar
            </button>
            <button onClick={borrar} title="Borrar marca" style={{ display: "flex", background: "transparent", border: "none", color: T.red, cursor: "pointer", padding: 0 }}>
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, color: T.muted }}>Nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
              style={{ background: T.surfaceRaised, border: `1px solid ${T.line}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 13, minWidth: 180 }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 220 }}>
            <label style={{ fontSize: 11, color: T.muted }}>URL del logo</label>
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://..."
              style={{ background: T.surfaceRaised, border: `1px solid ${T.line}`, borderRadius: 8, padding: "8px 12px", color: T.text, fontSize: 13, width: "100%" }}
            />
          </div>
          <button onClick={guardar} disabled={guardando} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: T.amber, color: "#1A1300", fontSize: 13, fontWeight: 600, cursor: guardando ? "default" : "pointer" }}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          <button onClick={() => setEditando(false)} style={{ border: "none", background: "transparent", color: T.muted, fontSize: 13, cursor: "pointer" }}>
            Cancelar
          </button>
          {error && <div style={{ width: "100%", color: T.red, fontSize: 12 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}

// Catálogo de marcas de auto (migración 0029) -- a diferencia de
// marcas_neumaticos (carga manual desde Oficina técnica), estas se crean
// solas al importar un SeriesResultReport.xls con un logo que no matchea
// ninguna ya cargada; esta pantalla es solo para renombrarlas (y, si hace
// falta, corregir el logo o borrar una que no correspondía).
export default function MarcasAutosAdmin() {
  const { marcas, loading, error, recargar } = useMarcasAutos();

  return (
    <div>
      <p style={{ color: T.muted, fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        Estas marcas se cargan solas cuando se sube un reporte de campeonato con un logo nuevo (columna "Mfr" de
        SeriesResultReport.xls) -- acá se les pone el nombre real en vez de "Marca sin nombre N".
      </p>
      {loading && <div style={{ color: T.muted, fontSize: 13 }}>Cargando marcas...</div>}
      {error && <div style={{ color: T.red, fontSize: 13 }}>Error: {error.message}</div>}
      {!error && marcas.length === 0 && !loading && (
        <div style={{ color: T.muted, fontSize: 13 }}>Todavía no se cargó ninguna marca.</div>
      )}
      {!error && marcas.map((m) => <FilaMarca key={m.id} marca={m} onGuardado={recargar} />)}
    </div>
  );
}
