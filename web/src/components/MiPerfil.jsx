import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { T } from "../theme";

// Chiquito, pensado como auto-chequeo de tres estados: (1) todavía sin
// piloto vinculado (el trigger de
// touringrc-sync/sql/migrations/0001_auth_vincula_piloto.sql no encontró
// match y no debería tardar, o falta correrlo en este proyecto), (2) con
// piloto vinculado pero sin el rol 'piloto' -- pendiente de que un admin
// lo confirme en "Vínculos pendientes" (migración 0013, el rol 'piloto'
// es el "visto bueno": sin él no se puede inscribir a ninguna fecha), o
// (3) todo en orden. El texto que ve un piloto común es amigable (avisarle
// al admin); el detalle técnico solo se muestra si quien está viendo el
// cartel es admin -- a un piloto normal decirle "revisá la migración
// 0001" no le sirve para nada.
export default function MiPerfil({ session, piloto, loading, esAdmin, puedeInscribirse }) {
  if (!session) return null;

  const nombre = [piloto?.first_name, piloto?.last_name].filter(Boolean).join(" ");
  const faltaVincular = !loading && !piloto;
  const pendienteAprobacion = !loading && !!piloto && !puedeInscribirse;
  const ok = !loading && !!piloto && puedeInscribirse;

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
        alignItems: "center",
        gap: 8,
      }}
    >
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
  );
}
