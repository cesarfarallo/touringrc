import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Mail } from "lucide-react";
import { T } from "../theme";
import { supabase } from "../lib/supabase";

// Toggle de opt-in para el aviso por email de "se abrió la inscripción"
// (migración 0026) -- nadie recibe nada hasta que lo activa a mano. Usa
// actualizar_mis_notificaciones() (security definer, mismo patrón que
// actualizar_mi_transponder()) porque `pilotos` no tiene policy de update
// para el propio piloto más allá de esa función acotada.
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
    <div style={{ marginTop: 4, paddingTop: 6, borderTop: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 4 }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
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
        <Mail size={12} /> Avisarme por email cuando abra la inscripción de una fecha
      </label>
      {error && <div style={{ color: T.red, fontSize: 11 }}>{error}</div>}
    </div>
  );
}

// Chiquito, pensado como auto-chequeo de tres estados: (1) todavía sin
// piloto vinculado (el trigger de
// touringrc-sync/sql/migrations/0001_auth_vincula_piloto.sql no encontró
// match y no debería tardar, o falta correrlo en este proyecto), (2) con
// piloto vinculado pero sin NINGÚN rol asignado todavía -- pendiente de
// que un admin lo revise en "Vínculos pendientes" (migración 0013), o
// (3) todo en orden. El texto que ve un piloto común es amigable (avisarle
// al admin); el detalle técnico solo se muestra si quien está viendo el
// cartel es admin -- a un piloto normal decirle "revisá la migración
// 0001" no le sirve para nada.
//
// "Todo en orden" se mide por tener AL MENOS UN rol, no específicamente
// el rol 'piloto' -- una cuenta de solo técnica o solo admin (staff del
// club que no corre) ya fue revisada por un admin al asignarle ese rol,
// aunque no pueda inscribirse a ninguna fecha. Antes de este chequeo, ese
// tipo de cuenta se quedaba mostrando "pendiente de aprobación" para
// siempre, aunque su situación ya estuviera resuelta.
export default function MiPerfil({ session, piloto, loading, esAdmin, onCambioPiloto }) {
  if (!session) return null;

  const nombre = [piloto?.first_name, piloto?.last_name].filter(Boolean).join(" ");
  const tieneAlgunRol = (piloto?.piloto_roles ?? []).length > 0;
  const faltaVincular = !loading && !piloto;
  const pendienteAprobacion = !loading && !!piloto && !tieneAlgunRol;
  const ok = !loading && !!piloto && tieneAlgunRol;

  const color = faltaVincular ? T.red : pendienteAprobacion ? T.amber : T.teal;

  return (
    <div
      style={{
        marginBottom: 24,
        padding: "12px 16px",
        borderRadius: 8,
        background: `${color}15`,
        border: `1px solid ${color}40`,
        fontSize: 13,
        color,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {faltaVincular ? <AlertTriangle size={14} /> : pendienteAprobacion ? <Clock size={14} /> : <CheckCircle2 size={14} />}
        {loading && "Verificando piloto vinculado..."}
        {ok && (
          <span>
            Conectado como <strong>{session.user.email}</strong> · piloto vinculado:{" "}
            <strong>{nombre || "(sin nombre todavía)"}</strong>
          </span>
        )}
        {pendienteAprobacion && (
          <span>
            Conectado como <strong>{session.user.email}</strong>, vinculado a{" "}
            <strong>{nombre || "(sin nombre todavía)"}</strong>, pero pendiente de aprobación.{" "}
            {esAdmin
              ? "Confirmalo desde Admin → Pilotos → Vínculos pendientes."
              : "Un admin de la categoría tiene que darle el visto bueno antes de que puedas inscribirte a una fecha."}
          </span>
        )}
        {faltaVincular && (
          <span>
            Conectado como <strong>{session.user.email}</strong>, pero todavía no hay ningún piloto
            vinculado a esta cuenta.{" "}
            {esAdmin
              ? "Revisá la migración 0001, o vinculalo a mano desde Admin → Pilotos."
              : "Avisale al administrador de la categoría para que te vincule la cuenta con tu piloto."}
          </span>
        )}
      </div>
      {piloto && <TogglePreferenciaEmail piloto={piloto} onGuardado={onCambioPiloto} />}
    </div>
  );
}
