import { T } from "../theme";

export default function StartLights({ diasRestantes }) {
  const encendidas = Math.max(0, 5 - Math.min(5, Math.ceil(diasRestantes / 6)));
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: i < encendidas ? T.amber : "transparent",
            border: `2px solid ${i < encendidas ? T.amber : T.line}`,
            boxShadow: i < encendidas ? `0 0 14px ${T.amber}99` : "none",
            transition: "all 0.4s ease",
          }}
        />
      ))}
    </div>
  );
}
