import { T } from "../theme";

const FRASES = [
  "¡Hoy se corre!",
  "Últimos ajustes. ¡Mañana es la carrera!",
  "La largada está a la vuelta de la esquina.",
  "Ya se siente la tensión en la pista.",
  "Cada vuelta cuenta. Falta muy poco.",
  "El semáforo empieza a encenderse.",
  "La carrera se acerca a toda velocidad.",
  "Es momento de preparar el auto.",
  "La pista te está esperando.",
  "El motor ya pide largar.",
  "Se viene una fecha imperdible.",
  "La cuenta regresiva ya está en marcha.",
  "Es hora de revisar todo dos veces.",
  "La próxima bandera a cuadros se acerca.",
  "Cada día falta menos para correr.",
  "La temporada sigue acelerando.",
  "La próxima fecha ya se empieza a sentir.",
  "El desafío está cada vez más cerca.",
  "La recta final de la espera.",
  "Pronto se apagan las luces y arranca la acción.",
  "La grilla empieza a tomar forma.",
  "El próximo duelo se acerca.",
  "La próxima largada ya está en el horizonte.",
  "Se acerca el momento de acelerar.",
  "La espera entra en su última etapa.",
  "La carrera se aproxima curva a curva.",
  "Los motores, cada vez más cerca de rugir.",
  "La próxima fecha ya calienta motores.",
  "La bandera verde está cada vez más cerca.",
  "Preparados, listos..."
];

function fraseParaDias(diasRestantes) {
  if (diasRestantes <= 30) return FRASES[30 - Math.max(0, diasRestantes)];
  return "La próxima fecha ya está en el horizonte.";
}

export default function StartLights({ diasRestantes, horasRestantes }) {
  const progreso = horasRestantes <= 24
    ? 5
    : Math.max(0, 5 - Math.min(5, Math.ceil(diasRestantes / 6)));
  const todasTitilan = progreso === 5 && horasRestantes <= 12;
  const colorDeColumna = (columna) => {
    if (columna < progreso) return { activo: "#F22B2B", borde: "#FF5A5A", glow: "#FF2525CC" };
    return { activo: "#3A1111", borde: "#7A2525", glow: "transparent" };
  };

  return (
    <div
      title="Semáforo de largada: las luces se encienden a medida que se acerca la fecha"
      aria-label={`Faltan ${diasRestantes} días. ${progreso} de 5 columnas de luces rojas encendidas.`}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}
    >
      <style>{`
        @keyframes start-lights-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: T.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5 }}>
          Próxima largada
        </div>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 27, fontWeight: 600, color: T.text }}>
          {diasRestantes === 0 ? "HOY" : `FALTAN ${diasRestantes} DÍAS`}
        </div>
        <div style={{ color: T.muted, fontSize: 12, fontStyle: "italic", marginTop: 3 }}>
          {fraseParaDias(diasRestantes)}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "8px 10px 10px",
          borderRadius: 5,
          background: "#080909",
          border: "1px solid #303336",
          boxShadow: "inset 0 1px 2px #000, 0 2px 5px #0006",
        }}
      >
        {[0, 1, 2, 3, 4].map((columna) => (
          <div key={columna} style={{ display: "flex", flexDirection: "column", gap: 5, padding: "4px 5px" }}>
            {[0, 1, 2, 3, 4].map((luz) => {
              const color = colorDeColumna(columna);
              const esUltimaEncendida = progreso > 0 && columna === progreso - 1;
              return (
                <div
                  key={luz}
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: "50%",
                    background: color.activo,
                    border: `1px solid ${color.borde}`,
                    boxShadow: `0 0 9px ${color.glow}`,
                    animation: todasTitilan || esUltimaEncendida ? "start-lights-blink 1s ease-in-out infinite" : "none",
                    transition: "all 0.4s ease",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
