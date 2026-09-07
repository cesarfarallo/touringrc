import { Search, X } from "lucide-react";
import { T } from "../theme";

// Input de búsqueda con lupa a la izquierda y una cruz a la derecha para
// vaciarlo (solo visible con contenido cargado) -- mismo patrón repetido
// en Pilotos/VinculosPendientes/GestionEventos/OficinaTecnica, unificado
// acá para que la cruz se comporte igual en todos lados. `onChange` recibe
// el string directo (no el evento) para que "borrar" sea simplemente
// `onChange("")`.
export default function CampoBusqueda({ value, onChange, placeholder, autoFocus, wrapperStyle, inputStyle }) {
  return (
    <div style={{ position: "relative", ...wrapperStyle }}>
      <Search size={13} color={T.muted} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{
          background: T.surfaceRaised,
          border: `1px solid ${T.line}`,
          borderRadius: 8,
          padding: "7px 30px 7px 30px",
          color: T.text,
          fontSize: 13,
          width: "100%",
          boxSizing: "border-box",
          ...inputStyle,
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          title="Borrar búsqueda"
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            background: "transparent",
            border: "none",
            color: T.muted,
            cursor: "pointer",
            padding: 2,
          }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
