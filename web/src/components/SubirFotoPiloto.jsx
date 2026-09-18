import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { T } from "../theme";
import FotoPiloto from "./FotoPiloto";
import RecortarFoto from "./RecortarFoto";
import { subirFotoPiloto } from "../lib/fotoPiloto";

// Control compartido para cambiar la foto de un piloto -- lo usa tanto
// Mi Perfil (el propio piloto cambia la suya) como PilotosAdmin (el admin
// cambia la de cualquiera). Este componente no decide quién puede subir
// qué -- solo dispara la subida; la autorización real la hace la Edge
// Function `subir-foto-piloto` (dueño del piloto, o admin). Elegir un
// archivo abre `RecortarFoto` (editor de posición/zoom) antes de subir --
// la subida en sí recién dispara al confirmar el recorte.
export default function SubirFotoPiloto({ pilotoId, fotoUrl, size = 44, onGuardado }) {
  const inputRef = useRef(null);
  const [archivoElegido, setArchivoElegido] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);

  function elegirArchivo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setArchivoElegido(file);
  }

  async function confirmarRecorte(blob) {
    setArchivoElegido(null);
    setSubiendo(true);
    setError(null);
    try {
      await subirFotoPiloto(pilotoId, blob);
      onGuardado?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <FotoPiloto fotoUrl={fotoUrl} size={size} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={subiendo}
        title="Cambiar foto"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "transparent",
          border: `1px solid ${T.line}`,
          borderRadius: 8,
          padding: "5px 10px",
          color: T.text,
          fontSize: 12,
          cursor: subiendo ? "default" : "pointer",
        }}
      >
        <Camera size={12} /> {subiendo ? "Subiendo..." : "Cambiar foto"}
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={elegirArchivo} style={{ display: "none" }} />
      {error && <span style={{ color: T.red, fontSize: 11 }}>{error}</span>}
      {archivoElegido && (
        <RecortarFoto file={archivoElegido} onConfirmar={confirmarRecorte} onCancelar={() => setArchivoElegido(null)} />
      )}
    </div>
  );
}
