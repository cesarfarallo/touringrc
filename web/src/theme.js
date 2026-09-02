// Tokens de diseño: asfalto de noche + luces de largada (start lights).
// Portado tal cual del mockup (touringrc-sync/mockup/touringrc-app-skeleton.jsx).
export const T = {
  bg: "#15181A",
  surface: "#1D2124",
  surfaceRaised: "#242829",
  line: "rgba(255,255,255,0.08)",
  text: "#F3F1EA",
  muted: "#8B9296",
  amber: "#FFB400",
  teal: "#3A9C92",
  red: "#E2574C",
};

export const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
`;

// Ajustes que no se pueden resolver con estilos inline (necesitan media
// queries): en mobile, el nav de tabs pasa a su propia fila con scroll
// horizontal en vez de apretarse junto al logo y el botón de login, y se
// reduce el padding lateral del contenido. Todo lo demás (tablas con
// scroll horizontal, formularios que wrappean) ya se resuelve con
// estilos inline (`overflowX: "auto"`, `flexWrap: "wrap"`).
export const RESPONSIVE_CSS = `
@media (max-width: 640px) {
  .header-inner { flex-wrap: wrap; row-gap: 10px; }
  .nav-tabs {
    order: 3;
    flex-basis: 100%;
    overflow-x: auto;
    white-space: nowrap;
    -webkit-overflow-scrolling: touch;
  }
  .nav-tabs::-webkit-scrollbar { display: none; }
  .page-content { padding-left: 14px !important; padding-right: 14px !important; }
}
`;

// Checklist de archivos que se esperan por cada fecha corrida, en el orden
// en que se exportan de Live Timing. 'clave' matchea las keys del jsonb
// `eventos.archivos`.
export const TIPOS_ARCHIVO = [
  { clave: "resultadosFinales", label: "Resultados finales", archivo: "FinalResults.xls" },
  { clave: "detalleRondas", label: "Detalle de rondas", archivo: "RoundResult-*.xls" },
  { clave: "vueltaRapida", label: "Vuelta rápida", archivo: "RoundTopTimes-*.xls" },
  { clave: "clasificacion", label: "Clasificación", archivo: "Leaderboard-Event*.xls" },
  { clave: "campeonato", label: "Campeonato", archivo: "SeriesResultReport.xls" },
];
