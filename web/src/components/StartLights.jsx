import { T } from "../theme";

export default function StartLights({ diasRestantes }) {
  const encendidas = Math.max(0, 5 - Math.min(5, Math.ceil(diasRestantes / 6)));
  return (
    <div
      title="Semáforo de largada: las luces se encienden a medida que se acerca la fecha"
      aria-label={`Semáforo de largada: ${encendidas} de 5 luces encendidas`}
      style={{
        display: "flex",
        gap: 7,
        padding: "9px 11px",
        borderRadius: 9,
        background: "#080909",
        border: "1px solid #303336",
        boxShadow: "inset 0 1px 2px #000, 0 2px 5px #0006",
      }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            width: 19,
            height: 19,
            borderRadius: "50%",
            background: i < encendidas ? "#F22B2B" : "#250D0D",
            border: `2px solid ${i < encendidas ? "#FF5A5A" : "#5A2020"}`,
            boxShadow: i < encendidas ? "0 0 12px #FF2525CC" : "inset 0 2px 3px #000",
            transition: "all 0.4s ease",
          }}
        />
      ))}
    </div>
  );
}
