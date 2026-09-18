import { T } from "../theme";

// Avatar de piloto a la izquierda del nombre, en los lugares donde se
// lista o identifica a un piloto puntual -- por ahora siempre muestra el
// placeholder (silueta genérica, dibujada a mano en `Placeholder` más
// abajo) porque todavía no hay upload de fotos de piloto ni columna en
// la base para guardarlas; `fotoUrl` queda preparado para cuando se sume
// esa parte (mismo criterio en dos pasos que se usó para la marca del
// auto: acepta un `fotoUrl` real sin que ningún caller tenga que cambiar
// cómo llama al componente) -- las dos variantes se recortan a círculo.
//
// A propósito NO se usa en el récord de circuitos (`CircuitosView.jsx`):
// ahí el piloto es texto libre (`piloto_nombre`, sin FK a `pilotos`), no
// hay ningún id de piloto del cual eventualmente sacar una foto real.
//
// El placeholder es un dibujo propio (no una imagen de stock -- la
// referencia que mandó el club para esta versión tenía marca de agua y
// derechos de un sitio de terceros) de un piloto genérico sin rasgos:
// gorra con visera e insignia, cabeza en blanco, mono de piloto con
// cuello alto, cierre central, un parche y una insignia en el pecho --
// mismo lenguaje visual que la referencia, en escala de grises, sobre
// fondo blanco (mismo criterio de contraste que ya se usa para los
// dibujos de circuito y los logos de marca).
function Placeholder({ size, style }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ borderRadius: "50%", background: "#FFFFFF", flexShrink: 0, ...style }}
    >
      <ellipse cx="50" cy="42" rx="15" ry="17" fill="#DCDCDC" />
      <path d="M33 34 Q33 14 50 14 Q67 14 67 34 L67 30 Q50 22 33 30 Z" fill="#4A4A4A" />
      <path d="M31 29 Q50 20 69 29 L69 33 Q50 25 31 33 Z" fill="#3A3A3A" />
      <circle cx="50" cy="21" r="3.2" fill="#8A8A8A" stroke="#333" strokeWidth="1" />
      <rect x="45" y="55" width="10" height="10" rx="2" fill="#DCDCDC" />
      <path d="M18 100 C18 78 30 63 50 63 C70 63 82 78 82 100 Z" fill="#3A3A3A" />
      <rect x="47" y="62" width="6" height="10" rx="2" fill="#2E2E2E" />
      <line x1="50" y1="66" x2="50" y2="100" stroke="#2A2A2A" strokeWidth="2" />
      <rect x="27" y="79" width="14" height="5" rx="1.2" fill="#C7C7C7" />
      <circle cx="65" cy="81" r="6.5" fill="#C7C7C7" />
      <circle cx="65" cy="81" r="3.2" fill="#8F8F8F" />
    </svg>
  );
}

export default function FotoPiloto({ fotoUrl, size = 36, style }) {
  const dims = { width: size, height: size };
  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt=""
        style={{
          ...dims,
          objectFit: "cover",
          borderRadius: "50%",
          border: `1px solid ${T.line}`,
          flexShrink: 0,
          ...style,
        }}
      />
    );
  }
  return <Placeholder size={size} style={style} />;
}
