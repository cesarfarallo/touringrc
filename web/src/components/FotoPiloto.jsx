import { T } from "../theme";

// Avatar de piloto a la izquierda del nombre, en los lugares donde se
// lista o identifica a un piloto puntual -- por ahora siempre muestra el
// placeholder (silueta genérica, dibujada a mano en `Placeholder` más
// abajo) porque todavía no hay upload de fotos de piloto ni columna en
// la base para guardarlas; `fotoUrl` queda preparado para cuando se sume
// esa parte (mismo criterio en dos pasos que se usó para la marca del
// auto: acepta un `fotoUrl` real sin que ningún caller tenga que cambiar
// cómo llama al componente) -- ahí sí se recorta a círculo, a diferencia
// del placeholder (rombo, ver abajo).
//
// A propósito NO se usa en el récord de circuitos (`CircuitosView.jsx`):
// ahí el piloto es texto libre (`piloto_nombre`, sin FK a `pilotos`), no
// hay ningún id de piloto del cual eventualmente sacar una foto real.
//
// El placeholder es un rombo partido en dos grises (imitando la insignia
// bicolor de un logo de referencia que pidió el club) con una silueta
// centrada -- a pedido, sin texto ni logo, solo gris y blanco. La silueta
// es un dibujo propio (trazos gruesos con puntas redondeadas, no un
// ícono de una librería) para poder controlar la pose sin depender de
// que exista un ícono parecido en lucide-react.
function Placeholder({ size, style }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} style={{ flexShrink: 0, ...style }}>
      <polygon points="100,15 15,100 100,185" fill="#E8E9EB" />
      <polygon points="100,15 185,100 100,185" fill="#9AA0A8" />
      <g stroke="#20242A" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="130" cy="58" r="15" fill="#20242A" stroke="none" />
        <polyline points="118,68 105,112" strokeWidth="20" />
        <polyline points="105,112 85,142 62,152" strokeWidth="18" />
        <polyline points="105,112 124,144 145,154" strokeWidth="18" />
        <polyline points="113,80 68,96" strokeWidth="16" />
        <polyline points="68,96 30,58" strokeWidth="9" />
      </g>
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
