// Generador de imágenes para Instagram (top 10 de Campeonato / Resultados
// finales / Clasificación) -- 100% client-side con <canvas>, sin backend ni
// servicio externo, mismo criterio que el resto de la app (CSV de
// inscriptos, texto de "Compartir"). El diseño (fondo de la pista oscurecido,
// tarjetas tipo vidrio esmerilado, podio con copas, tipografía redondeada
// Baloo 2) se validó primero como mockups HTML estáticos con datos de
// prueba -- las posiciones de acá están medidas en píxeles contra esos
// mockups (`getBoundingClientRect()` real, no estimadas a ojo) para que el
// resultado sea idéntico a lo que se aprobó.
//
// A propósito usa una tipografía distinta (Baloo 2) a la del resto del
// sitio (Oswald/Inter/JetBrains Mono) -- es un asset de marketing para
// redes, no parte de la UI, así que no hace falta que compartan fuente; se
// carga on-demand acá (no en `theme.js`) para no sumarle peso al resto de
// la app.

const ANCHO = 1080;
const ALTO = 1350;

const COLOR = {
  bg: "#15181A",
  text: "#F3F1EA",
  muted: "#8B9296",
  amber: "#FFB400",
  teal: "#3A9C92",
  silver: "#D7DBDE",
  bronze: "#D08A4E",
};

// Códigos de 3 letras que trae `pilotos.country` -- no siempre coincide con
// ISO-3166 (LiveTime a veces usa la variante estilo IOC, ej. "URU" en vez
// de "URY"), así que el mapa cubre las dos variantes para los países que
// realistamente aparecen en un club de RC argentino. Un código que no está
// acá simplemente no muestra bandera -- no hay forma de inventar el dato.
//
// Las banderas se DIBUJAN a mano con canvas (bandas de color, no un emoji de
// bandera) -- se probó primero con el emoji real (🇦🇷 etc.) pero el
// renderizado de banderas por emoji depende de la fuente del sistema
// operativo: Windows en particular no las renderiza como bandera, muestra
// las dos letras del código de país como texto plano en vez del ícono
// (`ctx.fillText()` cae al glyph que tenga esa fuente para esos dos
// "regional indicator" characters, sin garantía de que sea una bandera).
// Dibujarlas como formas vectoriales propias es 100% consistente entre
// navegadores/sistemas operativos, igual que el resto de los íconos de esta
// imagen (trofeos, placeholder de piloto). Son versiones simplificadas
// (sin escudos/soles/estrellas) -- a 16-22px de alto esos detalles no se
// leen igual, así que no vale la pena el esfuerzo de dibujarlos.
const FLAGS = {
  ARG: { bandas: "h", colores: ["#75AADB", "#FFFFFF", "#75AADB"] },
  URY: { bandas: "h", colores: ["#FFFFFF", "#0038A8", "#FFFFFF", "#0038A8", "#FFFFFF"] },
  BRA: { tipo: "brasil" },
  CHL: { tipo: "chile" },
  PRY: { bandas: "h", colores: ["#D52B1E", "#FFFFFF", "#0038A8"] },
  BOL: { bandas: "h", colores: ["#D52B1E", "#F9E300", "#007934"] },
  PER: { bandas: "v", colores: ["#D91023", "#FFFFFF", "#D91023"] },
  ECU: { bandas: "h", colores: ["#FFD100", "#FFD100", "#0038A8", "#D52B1E"] },
  COL: { bandas: "h", colores: ["#FCD116", "#FCD116", "#003893", "#CE1126"] },
  VEN: { bandas: "h", colores: ["#FFD100", "#0038A8", "#CE1126"] },
  MEX: { bandas: "v", colores: ["#006847", "#FFFFFF", "#CE1126"] },
  USA: { tipo: "usa" },
  ESP: { bandas: "h", colores: ["#AA151B", "#F1BF00", "#F1BF00", "#AA151B"] },
  ITA: { bandas: "v", colores: ["#008C45", "#FFFFFF", "#CD212A"] },
  FRA: { bandas: "v", colores: ["#0055A4", "#FFFFFF", "#EF4135"] },
  GER: { bandas: "h", colores: ["#000000", "#DD0000", "#FFCE00"] },
  GBR: { tipo: "reinounido" },
  POR: { bandas: "v", colores: ["#046A38", "#046A38", "#DA020E", "#DA020E", "#DA020E"] },
};
const SINONIMOS_PAIS = { URU: "URY", CHI: "CHL", PAR: "PRY", DEU: "GER", PRT: "POR" };

// Lista de países seleccionables (`PilotosAdmin.jsx`, para completar
// `pilotos.country` a mano) -- un código canónico por cada entrada real de
// `FLAGS` de arriba (sin las variantes de `SINONIMOS_PAIS`, esas son solo
// para normalizar lo que ya vino de Live Timing, no hace falta ofrecerlas
// las dos en un `<select>`). Exportada desde acá para que la lista de
// países que se pueden elegir y la lista de banderas que efectivamente se
// dibujan no se desincronicen con el tiempo.
export const PAISES = [
  { code: "ARG", nombre: "Argentina" },
  { code: "URY", nombre: "Uruguay" },
  { code: "BRA", nombre: "Brasil" },
  { code: "CHL", nombre: "Chile" },
  { code: "PRY", nombre: "Paraguay" },
  { code: "BOL", nombre: "Bolivia" },
  { code: "PER", nombre: "Perú" },
  { code: "ECU", nombre: "Ecuador" },
  { code: "COL", nombre: "Colombia" },
  { code: "VEN", nombre: "Venezuela" },
  { code: "MEX", nombre: "México" },
  { code: "USA", nombre: "Estados Unidos" },
  { code: "ESP", nombre: "España" },
  { code: "ITA", nombre: "Italia" },
  { code: "FRA", nombre: "Francia" },
  { code: "GER", nombre: "Alemania" },
  { code: "GBR", nombre: "Reino Unido" },
  { code: "POR", nombre: "Portugal" },
];

function codigoBandera(pais) {
  if (!pais) return null;
  const code = pais.trim().toUpperCase();
  const normalizado = SINONIMOS_PAIS[code] ?? code;
  return FLAGS[normalizado] ? normalizado : null;
}

// Dibuja la bandera de `code` dentro del rectángulo (x,y,w,h) -- clipeada a
// ese rectángulo así ninguna banda/forma se sale del recuadro.
function dibujarBandera(ctx, code, x, y, w, h) {
  const spec = FLAGS[code];
  if (!spec) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  if (spec.bandas === "h") {
    const n = spec.colores.length;
    spec.colores.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y + (h * i) / n, w, h / n + 0.5);
    });
  } else if (spec.bandas === "v") {
    const n = spec.colores.length;
    spec.colores.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(x + (w * i) / n, y, w / n + 0.5, h);
    });
  } else if (spec.tipo === "brasil") {
    ctx.fillStyle = "#009C3B";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#FFDF00";
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h * 0.12);
    ctx.lineTo(x + w * 0.88, y + h / 2);
    ctx.lineTo(x + w / 2, y + h * 0.88);
    ctx.lineTo(x + w * 0.12, y + h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#002776";
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, h * 0.18, 0, Math.PI * 2);
    ctx.fill();
  } else if (spec.tipo === "chile") {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x, y, w, h / 2);
    ctx.fillStyle = "#D52B1E";
    ctx.fillRect(x, y + h / 2, w, h / 2);
    ctx.fillStyle = "#0039A6";
    ctx.fillRect(x, y, w / 3, h / 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(x + w / 6, y + h / 4, h * 0.14, 0, Math.PI * 2);
    ctx.fill();
  } else if (spec.tipo === "usa") {
    const bandas = 7;
    for (let i = 0; i < bandas; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#B22234" : "#FFFFFF";
      ctx.fillRect(x, y + (h * i) / bandas, w, h / bandas + 0.5);
    }
    ctx.fillStyle = "#3C3B6E";
    ctx.fillRect(x, y, w * 0.45, h * 4.5 / bandas);
  } else if (spec.tipo === "reinounido") {
    ctx.fillStyle = "#00247D";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = h * 0.28;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y);
    ctx.lineTo(x, y + h);
    ctx.stroke();
    ctx.strokeStyle = "#CF142B";
    ctx.lineWidth = h * 0.12;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y);
    ctx.lineTo(x, y + h);
    ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x + w * 0.42, y, w * 0.16, h);
    ctx.fillRect(x, y + h * 0.38, w, h * 0.24);
    ctx.fillStyle = "#CF142B";
    ctx.fillRect(x + w * 0.45, y, w * 0.1, h);
    ctx.fillRect(x, y + h * 0.42, w, h * 0.16);
  }

  ctx.restore();
}

// Mismo dibujo que `FotoPiloto.jsx` (silueta gris genérica) -- se mantiene
// acá como una copia chica en vez de importarlo, porque ese componente
// devuelve JSX (React), no un string de SVG crudo que se pueda convertir en
// `Image` para canvas.
const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200">
  <ellipse cx="50" cy="42" rx="15" ry="17" fill="#DCDCDC"/>
  <path d="M33 34 Q33 14 50 14 Q67 14 67 34 L67 30 Q50 22 33 30 Z" fill="#4A4A4A"/>
  <path d="M31 29 Q50 20 69 29 L69 33 Q50 25 31 33 Z" fill="#3A3A3A"/>
  <circle cx="50" cy="21" r="3.2" fill="#8A8A8A" stroke="#333" stroke-width="1"/>
  <rect x="45" y="55" width="10" height="10" rx="2" fill="#DCDCDC"/>
  <path d="M18 100 C18 78 30 63 50 63 C70 63 82 78 82 100 Z" fill="#3A3A3A"/>
  <rect x="47" y="62" width="6" height="10" rx="2" fill="#2E2E2E"/>
  <line x1="50" y1="66" x2="50" y2="100" stroke="#2A2A2A" stroke-width="2"/>
  <rect x="27" y="79" width="14" height="5" rx="1.2" fill="#C7C7C7"/>
  <circle cx="65" cy="81" r="6.5" fill="#C7C7C7"/>
  <circle cx="65" cy="81" r="3.2" fill="#8F8F8F"/>
</svg>`;
const PLACEHOLDER_URL = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(PLACEHOLDER_SVG);

// Trofeo con degradé (oro/plata/bronce) -- se arma como SVG y se carga como
// `Image` en vez de dibujarse a mano con paths de canvas, para poder
// reusar tal cual las curvas ya validadas visualmente en el mockup sin
// tener que volver a ajustarlas a ojo en la API de canvas.
function trofeoSvg(stops) {
  const [c1, c2, c3] = stops;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="240" height="240">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="45%" stop-color="${c2}"/>
        <stop offset="100%" stop-color="${c3}"/>
      </linearGradient>
      <linearGradient id="gb" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#3A4150"/>
        <stop offset="100%" stop-color="#1B1F27"/>
      </linearGradient>
    </defs>
    <path d="M32,24 C15,21 9,36 18,46 C22,50.5 28,50 31,46.5" fill="none" stroke="url(#g)" stroke-width="7" stroke-linecap="round"/>
    <path d="M68,24 C85,21 91,36 82,46 C78,50.5 72,50 69,46.5" fill="none" stroke="url(#g)" stroke-width="7" stroke-linecap="round"/>
    <path d="M31,14 Q31,11 34,11 L66,11 Q69,11 69,14 L69,26 Q69,49 50,54 Q31,49 31,26 Z" fill="url(#g)"/>
    <path d="M40,15 Q37,30 43,47 Q38,31 40,15 Z" fill="#FFFFFF" opacity="0.35"/>
    <path d="M43,54 L57,54 L61,68 L39,68 Z" fill="url(#g)"/>
    <rect x="35" y="66" width="30" height="6" rx="3" fill="url(#g)"/>
    <rect x="24" y="74" width="52" height="11" rx="3" fill="url(#gb)"/>
    <rect x="32" y="77" width="20" height="4.5" rx="1.5" fill="#4C5566"/>
  </svg>`;
}
const TROFEO_URL = {
  gold: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(trofeoSvg(["#FFEBB0", "#FFB400", "#A66A00"])),
  silver: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(trofeoSvg(["#FFFFFF", "#C9CDD1", "#82878C"])),
  bronze: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(trofeoSvg(["#F2C08E", "#D08A4E", "#8B5527"])),
};

function cargarImagen(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// La app no carga Baloo 2 globalmente (el resto de la UI usa Oswald/Inter/
// JetBrains Mono) -- se inyecta acá una sola vez y se espera a que el
// navegador la tenga lista antes de dibujar texto, si no cae en la fuente
// de respaldo del sistema en el primer uso.
let fuentesListas = null;
function asegurarFuentes() {
  if (fuentesListas) return fuentesListas;
  fuentesListas = new Promise((resolve) => {
    let link = document.querySelector("link[data-baloo2]");
    if (!link) {
      link = document.createElement("link");
      link.rel = "stylesheet";
      link.dataset.baloo2 = "1";
      link.href = "https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&display=swap";
      document.head.appendChild(link);
    }
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", resolve, { once: true });
    setTimeout(resolve, 1500);
  }).then(() =>
    Promise.all([
      document.fonts.load('600 40px "Baloo 2"'),
      document.fonts.load('700 40px "Baloo 2"'),
      document.fonts.load('800 40px "Baloo 2"'),
    ]).catch(() => {})
  );
  return fuentesListas;
}

function redondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Recorta "cover" (llena el círculo entero, recorta lo que sobre) -- para
// fotos de piloto reales, igual que `object-fit: cover` en `FotoPiloto.jsx`.
function dibujarAvatar(ctx, img, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (img) {
    const escala = Math.max((r * 2) / img.width, (r * 2) / img.height);
    const dw = img.width * escala;
    const dh = img.height * escala;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  }
  ctx.restore();
}

// Contain (no recorta, se ve el logo completo) -- para logos de marca, que
// no son cuadrados/circulares como una foto de piloto.
function dibujarLogoMarca(ctx, img, cx, cy, r) {
  if (!img) return;
  const escala = Math.min((r * 2.2) / img.width, (r * 2.2) / img.height);
  const dw = img.width * escala;
  const dh = img.height * escala;
  ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
}

// Dibuja texto con letter-spacing manual (carácter por carácter) en vez de
// depender de `ctx.letterSpacing`, que todavía no está en todos los
// navegadores -- `xDerecha` es el borde derecho contra el que alinea (el
// header de la imagen es todo texto alineado a la derecha).
function textoEspaciadoDerecha(ctx, texto, xDerecha, y, espaciado) {
  // Dibuja cada carácter con `fillText(ch, x, y)` asumiendo alineación
  // izquierda -- si el caller (u otro dibujo anterior en el mismo canvas)
  // dejó `ctx.textAlign` en "right"/"center", cada letra se posiciona mal
  // contra su propio ancho y el texto sale superpuesto/ilegible.
  ctx.textAlign = "left";
  const anchoBase = ctx.measureText(texto).width;
  const anchoTotal = anchoBase + espaciado * (texto.length - 1);
  let x = xDerecha - anchoTotal;
  for (const ch of texto) {
    ctx.fillText(ch, x, y);
    x += ctx.measureText(ch).width + espaciado;
  }
}

// ---- Layout (medido en píxeles contra los mockups aprobados) ----
const PAD_X = 40;
const CONTENT_W = ANCHO - PAD_X * 2; // 1000
const CONTENT_RIGHT = ANCHO - PAD_X; // 1040
const PODIUM_GAP = 14;
const CARD_W = (CONTENT_W - PODIUM_GAP * 2) / 3; // 324
const PODIUM_TOP = 190;
const PODIUM_BOTTOM = 646;
const PODIUM_MARGIN_BOTTOM = 22;
const FOOTER_Y = 1301;
const FOOTER_MARGIN_TOP = 20;
const FILAS_TOP = PODIUM_BOTTOM + PODIUM_MARGIN_BOTTOM; // 668
const FILAS_BOTTOM = FOOTER_Y - FOOTER_MARGIN_TOP; // 1281
const FILA_GAP = 7;

// Tamaños por puesto del podio -- iguales entre Campeonato/Resultados,
// salvo la fuente del dato (más chica en Resultados/Clasificación porque
// "35/8:05.912" es mucho más largo que "612" puntos).
function medidasPodio(tipo) {
  const statFontSize = tipo === "campeonato" ? { 1: 54, 2: 40, 3: 40 } : { 1: 30, 2: 23, 3: 23 };
  const conTrofeos = tipo !== "clasificacion";
  const alturaCard = conTrofeos ? { 1: 456, 2: 382, 3: 370 } : { 1: 430, 2: 366, 3: 354 };
  const medalSize = conTrofeos ? { 1: 76, 2: 58, 3: 58 } : { 1: 58, 2: 46, 3: 46 };
  return {
    conTrofeos,
    statFontSize,
    alturaCard,
    medalSize,
    avatarSize: { 1: 150, 2: 116, 3: 116 },
    nombreFontSize: { 1: 27, 2: 22, 3: 22 },
    marcaSize: { 1: 66, 2: 56, 3: 56 },
  };
}

function dibujarTarjetaPodio(ctx, opts) {
  const {
    x,
    w,
    bottom,
    height,
    esGanador,
    trofeoImg,
    medalColor,
    medalSize,
    avatarImg,
    avatarSize,
    paisCode,
    nombre,
    nombreFontSize,
    marcaImg,
    marcaSize,
    statTexto,
    statFontSize,
    statColor,
  } = opts;
  const top = bottom - height;
  const cx = x + w / 2;

  redondeado(ctx, x, top, w, height, 14);
  ctx.fillStyle = esGanador ? "rgba(255,180,0,0.24)" : "rgba(29,33,36,0.68)";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = esGanador ? "rgba(255,180,0,0.5)" : "rgba(255,255,255,0.1)";
  ctx.stroke();

  let cursor = top + 18;

  // medalla / trofeo -- con copa (Campeonato/Resultados), suma además un
  // numerito de posición en la esquina (mismo color que la medalla lisa de
  // Clasificación) porque las tres copas se distinguen poco entre sí a este
  // tamaño (oro/plata/bronce son sutiles), a pedido del club.
  if (trofeoImg) {
    ctx.drawImage(trofeoImg, cx - medalSize / 2, cursor, medalSize, medalSize);
    const badgeR = medalSize * 0.28;
    const badgeCx = cx + medalSize / 2 - badgeR * 0.5;
    const badgeCy = cursor + medalSize - badgeR * 0.5;
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = medalColor.fondo;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = COLOR.bg;
    ctx.stroke();
    ctx.fillStyle = "#1A1300";
    ctx.font = `800 ${Math.round(badgeR * 1.2)}px "Baloo 2"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(medalColor.texto), badgeCx, badgeCy + 1);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cursor + medalSize / 2, medalSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = medalColor.fondo;
    ctx.fill();
    ctx.fillStyle = "#1A1300";
    ctx.font = `800 ${Math.round(medalSize * 0.5)}px "Baloo 2"`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(medalColor.texto), cx, cursor + medalSize / 2 + 1);
  }
  cursor += medalSize + 6;

  // avatar
  dibujarAvatar(ctx, avatarImg, cx, cursor + avatarSize / 2, avatarSize / 2);
  if (esGanador) {
    ctx.beginPath();
    ctx.arc(cx, cursor + avatarSize / 2, avatarSize / 2 + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = COLOR.amber;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  cursor += avatarSize;

  // bandera + nombre (grupo centrado) -- un nombre largo (dos apellidos,
  // nombre compuesto) puede no entrar en el ancho de la tarjeta al tamaño
  // de fuente nominal; en vez de dejarlo salirse de la caja, se achica la
  // fuente (nombre + bandera juntos, para que sigan viéndose proporcionados
  // entre sí) hasta que entre, con un piso del 65% para que nunca quede
  // ilegible. El renglón sigue ocupando el mismo alto de siempre (el
  // `cursor`/`centerY` de abajo usan el tamaño nominal, no el achicado) --
  // así achicar un nombre largo no corre el logo de marca ni el stat que
  // vienen después.
  cursor += 12;
  const nombreUpper = nombre.toUpperCase();
  const anchoMaximoNombre = w - 32;
  let escalaNombre = 1;
  let fontSizeNombre = nombreFontSize;
  ctx.font = `800 ${fontSizeNombre}px "Baloo 2"`;
  let nombreAncho = ctx.measureText(nombreUpper).width;
  let banderaAncho = paisCode ? fontSizeNombre * 0.9 : 0;
  const gapBandera = paisCode ? 6 : 0;
  while (banderaAncho + gapBandera + nombreAncho > anchoMaximoNombre && escalaNombre > 0.65) {
    escalaNombre -= 0.05;
    fontSizeNombre = Math.round(nombreFontSize * escalaNombre);
    ctx.font = `800 ${fontSizeNombre}px "Baloo 2"`;
    nombreAncho = ctx.measureText(nombreUpper).width;
    banderaAncho = paisCode ? fontSizeNombre * 0.9 : 0;
  }
  let px = cx - (banderaAncho + gapBandera + nombreAncho) / 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const centerY = cursor + nombreFontSize * 0.52;
  if (paisCode) {
    const bh = banderaAncho * (2 / 3);
    dibujarBandera(ctx, paisCode, px, centerY - bh / 2, banderaAncho, bh);
    px += banderaAncho + gapBandera;
  }
  ctx.font = `800 ${fontSizeNombre}px "Baloo 2"`;
  ctx.fillStyle = COLOR.text;
  ctx.fillText(nombreUpper, px, centerY);
  cursor += Math.round(nombreFontSize * 1.05);

  // marca
  cursor += 10;
  dibujarLogoMarca(ctx, marcaImg, cx, cursor + marcaSize / 2, marcaSize / 2);

  // stat, anclado al borde inferior de la tarjeta
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.font = `800 ${statFontSize}px "Baloo 2"`;
  ctx.fillStyle = statColor ?? COLOR.text;
  ctx.fillText(statTexto, cx, bottom - 16);
}

function dibujarFila(ctx, opts) {
  const { x, y, w, h, fondo, pos, avatarImg, paisCode, nombre, tags, marcaImg, statTexto, statFontSize } = opts;
  redondeado(ctx, x, y, w, h, 10);
  ctx.fillStyle = fondo;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.stroke();

  const midY = y + h / 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 26px "Baloo 2"`;
  ctx.fillStyle = COLOR.muted;
  ctx.fillText(String(pos), x + 39, midY);

  const avatarSize = 54;
  dibujarAvatar(ctx, avatarImg, x + 75 + avatarSize / 2, midY, avatarSize / 2);

  let px = x + 145;
  ctx.textAlign = "left";
  if (paisCode) {
    dibujarBandera(ctx, paisCode, px, midY - 9, 24, 18);
    px += 24 + 8;
  }
  const nombreUpper = nombre.toUpperCase();
  ctx.font = `700 25px "Baloo 2"`;
  ctx.fillStyle = COLOR.text;
  ctx.fillText(nombreUpper, px, midY);
  px += ctx.measureText(nombreUpper).width + 8;

  for (const tag of tags ?? []) {
    ctx.font = `700 12px "Baloo 2"`;
    const tw = ctx.measureText(tag.texto).width;
    const padX = 7;
    const boxW = tw + padX * 2;
    const boxH = 20;
    redondeado(ctx, px, midY - boxH / 2, boxW, boxH, 5);
    ctx.strokeStyle = tag.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = tag.color;
    ctx.fillText(tag.texto, px + padX, midY);
    px += boxW + 8;
  }

  // Centrado en x+700 (no en la columna del stat) a propósito: un resultado
  // crudo largo tipo "9/2:15.004 (DNF)" mide ~147px a este tamaño de fuente
  // -- si el logo quedara más cerca del stat (columna que termina en
  // x+982), lo pisaría. Medido contra el string más largo real, no a ojo.
  dibujarLogoMarca(ctx, marcaImg, x + 700, midY, 26);

  ctx.textAlign = "right";
  ctx.font = `800 ${statFontSize}px "Baloo 2"`;
  ctx.fillStyle = COLOR.text;
  ctx.fillText(statTexto, x + 982, midY);
}

// `tipo`: "campeonato" | "resultados" | "clasificacion" -- decide título,
// si el podio lleva copas o el numerito simple, y el tamaño de fuente del
// dato (puntos vs. resultado crudo, mucho más largo).
//
// `filas`: ya ordenadas por posición, se usan como mucho las primeras 10 --
// { pos, nombre, fotoUrl, marca: {logoUrl} | null, pais, stat, tq?, vr? }.
export async function descargarImagenTop10({ tipo, eyebrow, subtitulo, footerTexto, filas, nombreArchivo }) {
  await asegurarFuentes();

  const canvas = document.createElement("canvas");
  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext("2d");

  const top10 = filas.slice(0, 10);
  const podio = top10.slice(0, 3);
  const resto = top10.slice(3, 10);
  const medidas = medidasPodio(tipo);
  const tituloTexto = tipo === "campeonato" ? "CAMPEONATO" : tipo === "resultados" ? "RESULTADOS" : "CLASIFICACIÓN";

  const [logoImg, fondoImg, trofeoOro, trofeoPlata, trofeoBronce, ...imgsPorFila] = await Promise.all([
    cargarImagen("/logo-mobile.png"),
    cargarImagen("/social-bg.webp"),
    medidas.conTrofeos ? cargarImagen(TROFEO_URL.gold) : Promise.resolve(null),
    medidas.conTrofeos ? cargarImagen(TROFEO_URL.silver) : Promise.resolve(null),
    medidas.conTrofeos ? cargarImagen(TROFEO_URL.bronze) : Promise.resolve(null),
    ...top10.flatMap((f) => [cargarImagen(f.fotoUrl || PLACEHOLDER_URL), cargarImagen(f.marca?.logoUrl)]),
  ]);
  const avatarImgs = top10.map((_, i) => imgsPorFila[i * 2]);
  const marcaImgs = top10.map((_, i) => imgsPorFila[i * 2 + 1]);
  const trofeos = { 1: trofeoOro, 2: trofeoPlata, 3: trofeoBronce };

  // Fondo: foto de la pista oscurecida (mismo criterio "asfalto de noche"
  // del resto del sitio) -- si por lo que sea no carga (sin conexión,
  // bloqueada), cae a un fondo sólido en vez de romper la imagen entera.
  if (fondoImg) {
    ctx.save();
    ctx.filter = "grayscale(25%) brightness(0.55) contrast(1.12) saturate(0.95)";
    const escala = Math.max(ANCHO / fondoImg.width, ALTO / fondoImg.height);
    const dw = fondoImg.width * escala;
    const dh = fondoImg.height * escala;
    const dx = (ANCHO - dw) / 2;
    const dy = -(dh - ALTO) * 0.38;
    ctx.drawImage(fondoImg, dx, dy, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = COLOR.bg;
    ctx.fillRect(0, 0, ANCHO, ALTO);
  }

  const overlay = ctx.createLinearGradient(0, 0, 0, ALTO);
  overlay.addColorStop(0, "rgba(21,24,26,0.18)");
  overlay.addColorStop(0.42, "rgba(21,24,26,0.62)");
  overlay.addColorStop(0.78, "rgba(21,24,26,0.88)");
  overlay.addColorStop(1, "rgba(21,24,26,0.94)");
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  const radial = ctx.createRadialGradient(ANCHO * 0.88, ALTO * 0.03, 0, ANCHO * 0.88, ALTO * 0.03, ANCHO * 0.42);
  radial.addColorStop(0, "rgba(255,180,0,0.14)");
  radial.addColorStop(1, "rgba(255,180,0,0)");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, ANCHO, ALTO);

  // Header
  if (logoImg) {
    const logoH = 92;
    const logoW = logoH * (logoImg.width / logoImg.height);
    ctx.drawImage(logoImg, PAD_X, 56, logoW, logoH);
  }
  ctx.textBaseline = "top";
  ctx.font = `700 17px "Baloo 2"`;
  ctx.fillStyle = COLOR.amber;
  textoEspaciadoDerecha(ctx, eyebrow.toUpperCase(), CONTENT_RIGHT, 40, 2.5);
  ctx.textAlign = "right";
  ctx.font = `800 62px "Baloo 2"`;
  ctx.fillStyle = COLOR.text;
  ctx.fillText(tituloTexto, CONTENT_RIGHT, 62);
  ctx.font = `700 27px "Baloo 2"`;
  ctx.fillStyle = COLOR.muted;
  textoEspaciadoDerecha(ctx, subtitulo.toUpperCase(), CONTENT_RIGHT, 117, 1);

  // Regla
  const rg = ctx.createLinearGradient(PAD_X, 0, CONTENT_RIGHT, 0);
  rg.addColorStop(0, COLOR.amber);
  rg.addColorStop(0.75, "rgba(255,180,0,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(PAD_X, 166, CONTENT_W, 2);

  // Podio: orden visual 2-1-3, igual que un podio real
  const slotsX = [PAD_X, PAD_X + CARD_W + PODIUM_GAP, PAD_X + (CARD_W + PODIUM_GAP) * 2];
  const ordenSlots = [2, 1, 3];
  ordenSlots.forEach((rank, i) => {
    const f = podio[rank - 1];
    if (!f) return;
    const medalSize = medidas.medalSize[rank];
    const medalColor =
      rank === 1
        ? { fondo: COLOR.amber, texto: 1 }
        : rank === 2
          ? { fondo: COLOR.silver, texto: 2 }
          : { fondo: COLOR.bronze, texto: 3 };
    dibujarTarjetaPodio(ctx, {
      x: slotsX[i],
      w: CARD_W,
      bottom: PODIUM_BOTTOM,
      height: medidas.alturaCard[rank],
      esGanador: rank === 1,
      trofeoImg: medidas.conTrofeos ? trofeos[rank] : null,
      medalColor,
      medalSize,
      avatarImg: avatarImgs[rank - 1],
      avatarSize: medidas.avatarSize[rank],
      paisCode: codigoBandera(f.pais),
      nombre: f.nombre,
      nombreFontSize: medidas.nombreFontSize[rank],
      marcaImg: marcaImgs[rank - 1],
      marcaSize: medidas.marcaSize[rank],
      statTexto: f.stat,
      statFontSize: medidas.statFontSize[rank],
      statColor: rank === 1 ? COLOR.amber : COLOR.text,
    });
  });

  // Filas 4-10 -- se reparten el alto disponible entre las que haya (puede
  // ser menos de 7 si la categoría tiene pocos pilotos), mismo criterio
  // `flex:1` que el mockup.
  const n = resto.length;
  if (n > 0) {
    const filaH = (FILAS_BOTTOM - FILAS_TOP - FILA_GAP * (n - 1)) / n;
    const statFontSize = tipo === "campeonato" ? 32 : 20;
    resto.forEach((f, i) => {
      const y = FILAS_TOP + i * (filaH + FILA_GAP);
      const tags =
        tipo === "resultados"
          ? [f.tq && { texto: "TQ", color: COLOR.amber }, f.vr && { texto: "VR", color: COLOR.teal }].filter(Boolean)
          : [];
      dibujarFila(ctx, {
        x: PAD_X,
        y,
        w: CONTENT_W,
        h: filaH,
        fondo: i % 2 === 1 ? "rgba(36,40,41,0.68)" : "rgba(29,33,36,0.68)",
        pos: f.pos,
        avatarImg: avatarImgs[3 + i],
        paisCode: codigoBandera(f.pais),
        nombre: f.nombre,
        tags,
        marcaImg: marcaImgs[3 + i],
        statTexto: f.stat,
        statFontSize,
      });
    });
  }

  // Footer -- a pedido, sin la URL del sitio a la derecha (quedaba
  // redundante con el logo del club que ya está arriba).
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `600 15px "Baloo 2"`;
  ctx.fillStyle = COLOR.muted;
  ctx.fillText(footerTexto, PAD_X, FOOTER_Y);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("No se pudo generar la imagen"));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivo;
      a.click();
      URL.revokeObjectURL(url);
      resolve();
    }, "image/png");
  });
}
