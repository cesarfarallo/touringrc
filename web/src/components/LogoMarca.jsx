// Logo de la marca del auto al lado del nombre de un piloto (migración
// 0029) -- un solo componente chico para no repetir el mismo <img> con
// title/estilos en cada lugar donde aparece un nombre de piloto
// (Resultados finales, Clasificación, Campeonato, Pilotos, Circuitos).
// Si no hay marca cargada para ese piloto en ese contexto, no renderiza
// nada -- no hay un ícono "sin marca", es simplemente ausencia de dato.
//
// ⚠️ A 16px (el tamaño original) el logo quedaba ilegible -- un blip
// chiquito imposible de reconocer como marca. Se probó subirlo a 22px con
// un fondo blanco fijo (mismo criterio que el fix de contraste de los
// dibujos de circuito), pero en la práctica seguía sin notarse -- el
// fondo blanco en un tamaño tan chico no alcanza para que el logo se lea,
// solo agrega un cuadradito blanco. Se sacó el fondo/padding y se duplicó
// el tamaño default (44px) en su lugar.
export default function LogoMarca({ marca, size = 44, style }) {
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
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
