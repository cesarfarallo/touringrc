import { useState } from "react";
import { Lock } from "lucide-react";
import { T } from "../theme";
import { supabase } from "../lib/supabase";

// Alternativa a Apple Sign In (que requiere cuenta de Apple Developer paga):
// login por link mágico a email, vía Supabase Auth. Sin contraseña propia,
// coherente con la idea original de "sin usuario/clave, guardando el email".
export default function LoginCard() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const ingresarConGoogle = () =>
    supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });

  const ingresarConEmail = async (e) => {
    e.preventDefault();
    if (!email) return;
    setEnviando(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setEnviando(false);
    if (error) setError(error.message);
    else setEnviado(true);
  };

  return (
    <div
      style={{
        marginBottom: 24,
        padding: "16px",
        borderRadius: 8,
        background: `${T.teal}15`,
        border: `1px solid ${T.teal}40`,
        color: T.teal,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 12 }}>
        <Lock size={14} /> Ingresá para inscribirte a una fecha.
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <button
          onClick={ingresarConGoogle}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: T.amber,
            color: "#1A1300",
            fontFamily: "Inter, sans-serif",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Continuar con Google
        </button>

        <span style={{ fontSize: 12, color: T.muted }}>o</span>

        {!enviado ? (
          <form onSubmit={ingresarConEmail} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="email"
              required
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                background: T.surfaceRaised,
                border: `1px solid ${T.line}`,
                borderRadius: 8,
                padding: "8px 12px",
                color: T.text,
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                minWidth: 200,
              }}
            />
            <button
              type="submit"
              disabled={enviando}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${T.line}`,
                background: T.surfaceRaised,
                color: T.text,
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                fontWeight: 500,
                cursor: enviando ? "default" : "pointer",
              }}
            >
              {enviando ? "Enviando..." : "Enviarme un link de acceso"}
            </button>
          </form>
        ) : (
          <span style={{ fontSize: 13 }}>Te mandamos un link a {email} — revisá tu casilla (y spam).</span>
        )}
      </div>

      {error && <div style={{ marginTop: 8, fontSize: 12, color: T.red }}>{error}</div>}
    </div>
  );
}
