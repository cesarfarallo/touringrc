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

// Árbol de largada estilo drag strip: dos etapas rojas, tres ámbar, y la
// verde recién el día de la fecha -- en vez del semáforo horizontal de F1
// de siete columnas que tenía antes. La última etapa que se prende titila
// siempre (marca "esto es lo nuevo"); una vez que la verde está prendida,
// el protagonismo del titileo pasa a ella. Con `todasTitilan` (últimas 12
// horas) titilan todas juntas, el estado de máxima urgencia.
const ETAPAS = ["red", "red", "amber", "amber", "amber"];

const COLORES = {
  red: {
    off: { bg: "#2A0E0E", border: "#4A1C1C" },
    on: { bg: "radial-gradient(circle at 35% 30%, #FF9B8C, #E2372A 65%, #8A1810)", border: "#FF9B8C", glow: "#E2372AAA" },
  },
  amber: {
    off: { bg: "#241A08", border: "#3D2E10" },
    on: { bg: "radial-gradient(circle at 35% 30%, #FFE07A, #FFB400 65%, #B37800)", border: "#FFD37A", glow: "#FFB400AA" },
  },
  green: {
    off: { bg: "#0C2415", border: "#1C3D28" },
    on: { bg: "radial-gradient(circle at 35% 30%, #8CFFAE, #22E55E 65%, #0E7A34)", border: "#9CFFB8", glow: "#22E55ECC" },
  },
};

function Bulb({ color, on, blink }) {
  const c = COLORES[color][on ? "on" : "off"];
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: c.bg,
        border: `2px solid ${c.border}`,
        boxShadow: on ? `0 0 12px 2px ${c.glow}` : "none",
        animation: blink ? "start-lights-blink 1s ease-in-out infinite" : "none",
        transition: "all 0.3s ease",
      }}
    />
  );
}

export default function StartLights({ diasRestantes, horasRestantes }) {
  const progreso = Math.min(7, Math.max(0, 8 - Math.ceil(horasRestantes / 24)));
  const greenOn = progreso === 7;
  const stagesLit = Math.min(ETAPAS.length, progreso);
  const todasTitilan = greenOn && horasRestantes <= 12;

  return (
    <div
      title="Semáforo de largada: las luces se encienden a medida que se acerca la fecha"
      aria-label={`Faltan ${diasRestantes} días. ${stagesLit} de ${ETAPAS.length} etapas encendidas${greenOn ? " y verde encendida" : ""}.`}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}
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
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 22, fontWeight: 600, color: T.text }}>
          {diasRestantes === 0
            ? todasTitilan
              ? "¡SE LARGA!"
              : "HOY"
            : `FALTAN ${diasRestantes} ${diasRestantes === 1 ? "DÍA" : "DÍAS"}`}
        </div>
        <div style={{ color: T.muted, fontSize: 12, fontStyle: "italic", marginTop: 3, maxWidth: 220 }}>
          {fraseParaDias(diasRestantes)}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "stretch", gap: 14 }}>
        <div
          style={{
            width: 5,
            alignSelf: "stretch",
            background: "linear-gradient(#3a3a3a, #1a1a1a)",
            borderRadius: 3,
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 7 }}>
          {ETAPAS.map((color, i) => {
            const on = i < stagesLit;
            const esUltimaPrendida = on && !greenOn && i === stagesLit - 1;
            const blink = on && (todasTitilan || esUltimaPrendida);
            return (
              <div key={i} style={{ display: "flex", gap: 7 }}>
                <Bulb color={color} on={on} blink={blink} />
                <Bulb color={color} on={on} blink={blink} />
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 7 }}>
            <Bulb color="green" on={greenOn} blink={greenOn} />
            <Bulb color="green" on={greenOn} blink={greenOn} />
          </div>
        </div>
      </div>
    </div>
  );
}
