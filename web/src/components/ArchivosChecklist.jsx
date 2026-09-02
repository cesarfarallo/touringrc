import { Check, X } from "lucide-react";
import { T, TIPOS_ARCHIVO } from "../theme";

export default function ArchivosChecklist({ archivos }) {
  if (!archivos) return null;
  const faltantes = TIPOS_ARCHIVO.filter((t) => !archivos[t.clave]);
  const completo = faltantes.length === 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
      {TIPOS_ARCHIVO.map((t) => {
        const ok = !!archivos[t.clave];
        return (
          <span
            key={t.clave}
            title={`${t.label} (${t.archivo}) ${ok ? "— cargado" : "— falta subir"}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: ok ? `${T.teal}22` : `${T.red}18`,
              border: `1px solid ${ok ? T.teal : T.red}55`,
              cursor: "default",
            }}
          >
            {ok ? <Check size={11} color={T.teal} /> : <X size={11} color={T.red} />}
          </span>
        );
      })}
      <span
        style={{
          fontSize: 11,
          fontFamily: "JetBrains Mono, monospace",
          color: completo ? T.teal : T.red,
          marginLeft: 2,
        }}
      >
        {completo ? "Completo" : `Faltan ${faltantes.length}: ${faltantes.map((f) => f.label).join(", ")}`}
      </span>
    </div>
  );
}
