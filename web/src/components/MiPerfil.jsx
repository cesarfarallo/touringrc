import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { T } from "../theme";

// Chiquito, pensado como auto-chequeo de que el login se vinculó bien a un
// piloto (el trigger on_auth_user_created de
// touringrc-sync/sql/migrations/0001_auth_vincula_piloto.sql corre en el
// primer login). Si loading terminó y piloto es null, algo no vinculó.
export default function MiPerfil({ session, piloto, loading }) {
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
          Conectado como <strong>{session.user.email}</strong>, pero no se encontró ningún piloto
          vinculado a esta cuenta — revisá que la migración 0001 esté corrida en este proyecto de
          Supabase.
        </span>
      )}
    </div>
  );
}
