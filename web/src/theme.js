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

// Checklist de archivos que se esperan por cada fecha corrida, en el orden
// en que se exportan de Live Timing. 'clave' matchea las keys del jsonb
// `eventos.archivos`.
export const TIPOS_ARCHIVO = [
  { clave: "pilotos", label: "Pilotos", archivo: "GenericImport.csv" },
  { clave: "resultadosFinales", label: "Resultados finales", archivo: "FinalResults.xls" },
  { clave: "detalleRondas", label: "Detalle de rondas", archivo: "RoundResult-*.xls" },
  { clave: "vueltaRapida", label: "Vuelta rápida", archivo: "RoundTopTimes-*.xls" },
  { clave: "campeonato", label: "Campeonato", archivo: "SeriesResultReport.xls" },
];
