// El dibujo del circuito no se guarda en la base -- se arma por convención
// a partir de la columna `numero` de `circuitos` (ver migración 0009).
// Compartido entre EventoCard.jsx, CircuitosView.jsx y App.jsx (tarjeta
// destacada).
export function rutaImagenCircuito(circuito, sentido) {
  const carpeta = sentido === "invertido" ? "circuitos-invertidos" : "circuitos-normales";
  return `/${carpeta}/Circuito${circuito.numero}.png`;
}

// Los PNG de circuitos tienen fondo transparente con el trazado en
// colores oscuros -- sin nada detrás, se pierden contra el fondo oscuro
// de la app. En vez de taparlos con un fondo blanco sólido (queda un
// cuadrado blanco feo), esto arma un `filter` con varios `drop-shadow`
// sin blur, repartidos en 16 direcciones parejas alrededor del centro
// -- cada uno sigue el canal alfa del PNG, así que superpuestos dibujan
// un contorno blanco parejo alrededor del trazado (y de cualquier otro
// detalle suelto del dibujo -- textos, marcas de curva, el logo) en vez
// de rellenar todo el rectángulo. Menos de 16 direcciones se nota como
// una estrella en vez de un contorno parejo, sobre todo con `grosor`
// alto -- verificado a ojo (Playwright + captura, no un test
// automatizado) contra `Circuito1.png` en los tres tamaños que usa la
// app (64/160/420px). `grosor` es el desplazamiento en px de cada
// sombra -- a mayor tamaño de imagen en pantalla, conviene uno mayor
// para que se note proporcionalmente igual.
export function contornoCircuito(grosor = 2) {
  const direcciones = 16;
  const sombras = [];
  for (let i = 0; i < direcciones; i++) {
    const angulo = (2 * Math.PI * i) / direcciones;
    const dx = (Math.cos(angulo) * grosor).toFixed(2);
    const dy = (Math.sin(angulo) * grosor).toFixed(2);
    sombras.push(`drop-shadow(${dx}px ${dy}px 0 #fff)`);
  }
  return sombras.join(" ");
}
