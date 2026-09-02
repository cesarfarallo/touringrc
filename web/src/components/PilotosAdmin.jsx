import { useState } from "react";
import { Check, X, Pencil, Search, UserPlus } from "lucide-react";
import { T } from "../theme";
import { usePilotos, useRolesYModulos, usePilotoRoles } from "../hooks";
import { supabase } from "../lib/supabase";
import VinculosPendientes from "./VinculosPendientes";

function EmailEditable({ piloto, onGuardado }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(piloto.email ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const { error } = await supabase
      .from("pilotos")
      .update({ email: valor.trim() || null })
      .eq("id", piloto.id);
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
          setValor(piloto.email ?? "");
          setEditando(true);
        }}
        title="Editar email a mano"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "transparent",
          border: "none",
          color: T.muted,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 12,
          cursor: "pointer",
          padding: 0,
        }}
      >
        {piloto.email ?? "—"} <Pencil size={11} />
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="email"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") guardar();
            if (e.key === "Escape") setEditando(false);
          }}
          autoFocus
          style={{
            background: T.surfaceRaised,
            border: `1px solid ${T.line}`,
            borderRadius: 6,
            padding: "4px 8px",
            color: T.text,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12,
            width: 180,
          }}
        />
        <button
          onClick={guardar}
          disabled={guardando}
          style={{
            border: "none",
            background: `${T.teal}22`,
            color: T.teal,
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 11,
            cursor: guardando ? "default" : "pointer",
          }}
        >
          {guardando ? "..." : "Guardar"}
        </button>
        <button
          onClick={() => setEditando(false)}
          style={{ border: "none", background: "transparent", color: T.muted, fontSize: 11, cursor: "pointer" }}
        >
          Cancelar
        </button>
      </div>
      {error && <div style={{ color: T.red, fontSize: 11 }}>{error}</div>}
    </div>
  );
}

function RolChip({ nombre, marcado, onToggle, disabled }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      style={{
        padding: "3px 9px",
        borderRadius: 20,
        border: `1px solid ${marcado ? T.amber : T.line}`,
        background: marcado ? `${T.amber}18` : "transparent",
        color: marcado ? T.amber : T.muted,
        fontSize: 11,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {nombre}
    </button>
  );
}

function NuevoPiloto({ roles, onCreado }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [rolesElegidos, setRolesElegidos] = useState(new Set(["piloto"]));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  function toggleRolElegido(rolId) {
    setRolesElegidos((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(rolId)) nuevo.delete(rolId);
      else nuevo.add(rolId);
      return nuevo;
    });
  }

  async function crear(e) {
    e.preventDefault();
    if (!nombre.trim() || !apellido.trim()) return;
    setGuardando(true);
    setError(null);

    const { data, error } = await supabase
      .from("pilotos")
      .insert({ first_name: nombre.trim(), last_name: apellido.trim(), email: email.trim() || null })
      .select("id")
      .single();

    if (error) {
      setGuardando(false);
      setError(error.message);
      return;
    }

    if (rolesElegidos.size > 0) {
      const filas = [...rolesElegidos].map((rol_id) => ({ piloto_id: data.id, rol_id }));
      const { error: errorRoles } = await supabase.from("piloto_roles").insert(filas);
      if (errorRoles) {
        setGuardando(false);
        setError(`Piloto creado, pero falló al asignar roles: ${errorRoles.message}`);
        onCreado();
        return;
      }
    }

    setGuardando(false);
    setNombre("");
    setApellido("");
    setEmail("");
    setRolesElegidos(new Set(["piloto"]));
    setAbierto(false);
    onCreado();
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
          padding: "9px 14px",
          borderRadius: 8,
          border: `1px dashed ${T.amber}66`,
          background: "transparent",
          color: T.amber,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <UserPlus size={15} /> Agregar piloto a mano
      </button>
    );
  }

  return (
    <form
      onSubmit={crear}
      style={{
        marginBottom: 16,
        padding: 16,
        borderRadius: 10,
        border: `1px solid ${T.line}`,
        background: T.surface,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: T.muted }}>Nombre</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            style={{
              background: T.surfaceRaised,
              border: `1px solid ${T.line}`,
              borderRadius: 8,
              padding: "8px 12px",
              color: T.text,
              fontSize: 13,
              minWidth: 150,
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: T.muted }}>Apellido</label>
          <input
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            required
            style={{
              background: T.surfaceRaised,
              border: `1px solid ${T.line}`,
              borderRadius: 8,
              padding: "8px 12px",
              color: T.text,
              fontSize: 13,
              minWidth: 150,
            }}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: T.muted }}>Email (opcional, hasta que se vincule)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              background: T.surfaceRaised,
              border: `1px solid ${T.line}`,
              borderRadius: 8,
              padding: "8px 12px",
              color: T.text,
              fontSize: 13,
              minWidth: 200,
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: T.muted }}>Roles:</span>
        {roles.map((r) => (
          <RolChip key={r.id} nombre={r.nombre} marcado={rolesElegidos.has(r.id)} onToggle={() => toggleRolElegido(r.id)} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          type="submit"
          disabled={guardando}
          style={{
            padding: "9px 16px",
            borderRadius: 8,
            border: "none",
            background: T.amber,
            color: "#1A1300",
            fontSize: 13,
            fontWeight: 600,
            cursor: guardando ? "default" : "pointer",
          }}
        >
          {guardando ? "Creando..." : "Crear piloto"}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          style={{ border: "none", background: "transparent", color: T.muted, fontSize: 13, cursor: "pointer" }}
        >
          Cancelar
        </button>
      </div>
      {error && <div style={{ color: T.red, fontSize: 12 }}>{error}</div>}
    </form>
  );
}

// Auditoría + gestión de pilotos: email editable a mano, roles
// asignables por chip, y un filtro para enfocarse en los que todavía
// no tienen ninguna cuenta vinculada (para completarles el email de
// antemano y que el próximo login los matchee solo). Incluye arriba
// la cola de logins ambiguos/duplicados a confirmar o fusionar.
export default function PilotosAdmin() {
  const { pilotos, loading, error, recargar } = usePilotos();
  const { roles } = useRolesYModulos(true);
  const { porPiloto, recargar: recargarRoles } = usePilotoRoles(true);
  const [trabajandoRol, setTrabajandoRol] = useState(null);
  const [soloSinVincular, setSoloSinVincular] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [rolesFiltro, setRolesFiltro] = useState(new Set());

  function toggleFiltroRol(rolId) {
    setRolesFiltro((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(rolId)) nuevo.delete(rolId);
      else nuevo.add(rolId);
      return nuevo;
    });
  }

  async function toggleRol(pilotoId, rolId) {
    const clave = `${pilotoId}:${rolId}`;
    setTrabajandoRol(clave);
    const tiene = porPiloto[pilotoId]?.has(rolId);
    if (tiene) {
      await supabase.from("piloto_roles").delete().eq("piloto_id", pilotoId).eq("rol_id", rolId);
    } else {
      await supabase.from("piloto_roles").insert({ piloto_id: pilotoId, rol_id: rolId });
    }
    setTrabajandoRol(null);
    recargarRoles();
  }

  const textoBusqueda = busqueda.trim().toLowerCase();
  const visibles = pilotos.filter((p) => {
    if (soloSinVincular && p.auth_user_id) return false;
    if (textoBusqueda) {
      const nombreCompleto = [p.first_name, p.last_name].filter(Boolean).join(" ").toLowerCase();
      if (!nombreCompleto.includes(textoBusqueda)) return false;
    }
    if (rolesFiltro.size > 0) {
      const rolesDelPiloto = porPiloto[p.id];
      const tieneAlguno = rolesDelPiloto && [...rolesFiltro].some((r) => rolesDelPiloto.has(r));
      if (!tieneAlguno) return false;
    }
    return true;
  });

  return (
    <div>
      <VinculosPendientes />

      <div style={{ color: T.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
        Pilotos
      </div>

      <NuevoPiloto
        roles={roles}
        onCreado={() => {
          recargar();
          recargarRoles();
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <Search size={13} color={T.muted} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o apellido..."
            style={{
              background: T.surfaceRaised,
              border: `1px solid ${T.line}`,
              borderRadius: 8,
              padding: "7px 12px 7px 30px",
              color: T.text,
              fontSize: 13,
              width: 220,
            }}
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted, cursor: "pointer" }}>
          <input type="checkbox" checked={soloSinVincular} onChange={(e) => setSoloSinVincular(e.target.checked)} />
          Solo sin vincular
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: T.muted }}>Filtrar por rol:</span>
          {roles.map((r) => (
            <RolChip
              key={r.id}
              nombre={r.nombre}
              marcado={rolesFiltro.has(r.id)}
              onToggle={() => toggleFiltroRol(r.id)}
            />
          ))}
        </div>
      </div>

      {loading && <div style={{ color: T.muted, fontSize: 13 }}>Cargando pilotos...</div>}
      {error && <div style={{ color: T.red, fontSize: 13 }}>Error: {error.message}</div>}

      {!loading && !error && (
        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.line}` }}>
                {["Nombre", "Email", "Roles", "Vinculado"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "10px 16px",
                      fontFamily: "Inter, sans-serif",
                      fontSize: 11,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: T.muted,
                      fontWeight: 600,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${T.line}` }}>
                  <td style={{ padding: "10px 16px", fontFamily: "Inter, sans-serif", fontSize: 13 }}>
                    {[p.first_name, p.last_name].filter(Boolean).join(" ") || "(sin nombre)"}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <EmailEditable piloto={p} onGuardado={recargar} />
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 260 }}>
                      {roles.map((r) => (
                        <RolChip
                          key={r.id}
                          nombre={r.nombre}
                          marcado={!!porPiloto[p.id]?.has(r.id)}
                          disabled={trabajandoRol === `${p.id}:${r.id}`}
                          onToggle={() => toggleRol(p.id, r.id)}
                        />
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    {p.auth_user_id ? <Check size={14} color={T.teal} /> : <X size={14} color={T.red} />}
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: "16px", color: T.muted, fontSize: 13 }}>
                    {pilotos.length === 0
                      ? "Todavía no hay pilotos cargados."
                      : "Ningún piloto coincide con la búsqueda/filtros."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
