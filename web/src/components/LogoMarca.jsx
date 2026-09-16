// Logo de la marca del auto al lado del nombre de un piloto (migración
// 0029) -- un solo componente chico para no repetir el mismo <img> con
// title/estilos en cada lugar donde aparece un nombre de piloto
// (Resultados finales, Clasificación, Campeonato, Pilotos, Circuitos).
// Si no hay marca cargada para ese piloto en ese contexto, no renderiza
// nada -- no hay un ícono "sin marca", es simplemente ausencia de dato.
//
// ⚠️ A 16px (el tamaño original) el logo quedaba ilegible -- un blip
// chiquito imposible de reconocer como marca -- y como algunos vienen con
// fondo transparente y colores oscuros, se perdían contra el fondo oscuro
// de la app (mismo problema que ya se había resuelto para los dibujos de
// circuito). Ahora usa un tamaño más grande por default y un fondo blanco
// fijo para que se vea nítido sin importar el color del logo en sí.
export default function LogoMarca({ marca, size = 22, style }) {
  if (!marca?.logoUrl) return null;
  return (
    <img
      src={marca.logoUrl}
      alt={marca.nombre}
      title={marca.nombre}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        borderRadius: 4,
        background: "#FFFFFF",
        padding: 1,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
