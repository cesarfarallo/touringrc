import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { T } from "../theme";

// Chiquito, pensado como auto-chequeo de que el login se vinculó bien a un
// piloto (el trigger on_auth_user_created de
// touringrc-sync/sql/migrations/0001_auth_vincula_piloto.sql corre en el
// primer login). Si loading terminó y piloto es null, algo no vinculó.
// El texto que ve un piloto común es amigable (avisarle al admin); el
// detalle técnico (migración, panel de Pilotos) solo se muestra si quien
// está viendo el cartel es admin -- a un piloto normal decirle "revisá la
// migración 0001" no le sirve para nada.
export default function MiPerfil({ session, piloto, loading, esAdmin }) {
  if (!session) return null;

  const nombre = [piloto?.first_name, piloto?.last_name].filter(Boolean).join(" ");
  const ok = !loading && !!piloto;
  const faltaVincular = !loading && !piloto;

  return (
    <div
      style={{
        marginBottom: 24,
        padding: "12px 16px",
        borderRadius: 8,
        background: faltaVincular ? `${T.red}15` : `${T.teal}15`,
        border: `1px solid ${faltaVincular ? T.red : T.teal}40`,
        fontSize: 13,
        color: faltaVincular ? T.red : T.teal,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {faltaVincular ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
      {loading && "Verificando piloto vinculado..."}
      {ok && (
        <span>
          Conectado como <strong>{session.user.email}</strong> · piloto vinculado:{" "}
          <strong>{nombre || "(sin nombre todavía)"}</strong>
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
