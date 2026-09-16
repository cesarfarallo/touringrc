// Logo de la marca del auto al lado del nombre de un piloto (migración
// 0029) -- un solo componente chico para no repetir el mismo <img> con
// title/estilos en cada lugar donde aparece un nombre de piloto
// (Resultados finales, Clasificación, Campeonato, Pilotos, Circuitos).
// Si no hay marca cargada para ese piloto en ese contexto, no renderiza
// nada -- no hay un ícono "sin marca", es simplemente ausencia de dato.
export default function LogoMarca({ marca, size = 16, style }) {
  if (!marca?.logoUrl) return null;
  return (
    <img
      src={marca.logoUrl}
      alt={marca.nombre}
      title={marca.nombre}
      style={{ width: size, height: size, objectFit: "contain", borderRadius: 3, flexShrink: 0, ...style }}
    />
  );
}
