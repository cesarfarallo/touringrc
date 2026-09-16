import { User } from "lucide-react";
import { T } from "../theme";

// Foto de piloto (tipo carnet) a la izquierda del nombre, en los lugares
// donde se lista o identifica a un piloto puntual -- por ahora siempre
// muestra el placeholder (silueta genérica) porque todavía no hay upload
// de fotos de piloto ni columna en la base para guardarlas; `fotoUrl`
// queda preparado para cuando se sume esa parte (mismo criterio en dos
// pasos que se usó para la marca del auto: welcomes un `fotoUrl` real
// sin que ningún caller tenga que cambiar cómo llama al componente).
//
// A propósito NO se usa en el récord de circuitos (`CircuitosView.jsx`):
// ahí el piloto es texto libre (`piloto_nombre`, sin FK a `pilotos`), no
// hay ningún id de piloto del cual eventualmente sacar una foto real.
export default function FotoPiloto({ fotoUrl, size = 28, style }) {
  const dims = { width: size, height: Math.round(size * 1.2) };
  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt=""
        style={{
          ...dims,
          objectFit: "cover",
          borderRadius: 4,
          border: `1px solid ${T.line}`,
          flexShrink: 0,
          ...style,
        }}
      />
    );
  }
  return (
    <div
      style={{
        ...dims,
        borderRadius: 4,
        background: T.surfaceRaised,
        border: `1px solid ${T.line}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        ...style,
      }}
    >
      <User size={Math.round(size * 0.6)} color={T.muted} strokeWidth={1.6} />
    </div>
  );
}
