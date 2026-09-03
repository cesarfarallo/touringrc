// El dibujo del circuito no se guarda en la base -- se arma por convención
// a partir de la columna `numero` de `circuitos` (ver migración 0009).
// Compartido entre EventoCard.jsx, CircuitosView.jsx y App.jsx (tarjeta
// destacada).
export function rutaImagenCircuito(circuito, sentido) {
  const carpeta = sentido === "invertido" ? "circuitos-invertidos" : "circuitos-normales";
  return `/${carpeta}/Circuito${circuito.numero}.png`;
}
