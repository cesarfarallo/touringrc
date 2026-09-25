import { useState } from "react";
import { Mail, X } from "lucide-react";
import { T } from "../theme";
import { supabase } from "../lib/supabase";
import SubirFotoPiloto from "./SubirFotoPiloto";

// Toggle de opt-in para el aviso por email de "se abrió la inscripción"
// (migración 0026) -- nadie recibe nada hasta que lo activa a mano. Usa
// actualizar_mis_notificaciones() (security definer, mismo patrón que
// actualizar_mi_transponder()) porque `pilotos` no tiene policy de update
// para el propio piloto más allá de esa función acotada. Vivía antes
// dentro de `MiPerfil.jsx`; se mudó acá junto con el resto de lo editable.
function TogglePreferenciaEmail({ piloto, onGuardado }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function toggle() {
    setGuardando(true);
    setError(null);
    const { error } = await supabase.rpc("actualizar_mis_notificaciones", {
      p_acepta: !piloto.acepta_notificaciones,
    });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    onGuardado();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: T.text,
          cursor: guardando ? "default" : "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={!!piloto.acepta_notificaciones}
          disabled={guardando}
          onChange={toggle}
        />
        <Mail size={13} /> Avisarme por email cuando abra la inscripción de una fecha
      </label>
      {error && <div style={{ color: T.red, fontSize: 11 }}>{error}</div>}
    </div>
  );
}

// Popup "Mi perfil" -- se abre desde el menú del botón de usuario del
// header (opción "Ver perfil"), no vive fijo en ningún tab. A propósito
// solo tiene lo que el propio piloto puede editar (foto + aviso por
// email) -- nombre/apellido/roles los maneja un admin desde Pilotos, y el
// estado de vinculación/aprobación ya se muestra aparte en el cartel de
// `MiPerfil.jsx` del Calendario.
export default function PanelPerfil({ session, piloto, onCambioPiloto, onClose }) {
  const nombre = [piloto?.first_name, piloto?.last_name].filter(Boolean).join(" ");

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.surface,
          border: `1px solid ${T.line}`,
          borderRadius: 12,
          padding: 24,
          maxWidth: 360,
          width: "100%",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 20, fontWeight: 600 }}>Mi perfil</div>
            <div style={{ color: T.muted, fontSize: 13, marginTop: 2, overflowWrap: "anywhere" }}>
              {nombre || session?.user?.email}
            </div>
          </div>
          <button
            onClick={onClose}
            title="Cerrar"
            style={{ display: "flex", background: "transparent", border: "none", color: T.muted, cursor: "pointer", padding: 4, flexShrink: 0 }}
          >
            <X size={18} />
          </button>
        </div>

        {piloto ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <SubirFotoPiloto pilotoId={piloto.id} fotoUrl={piloto.foto_url} onGuardado={onCambioPiloto} />
            <TogglePreferenciaEmail piloto={piloto} onGuardado={onCambioPiloto} />
          </div>
        ) : (
          <div style={{ color: T.muted, fontSize: 13 }}>
            Todavía no hay ningún piloto vinculado a esta cuenta.
          </div>
        )}
      </div>
    </div>
  );
}
