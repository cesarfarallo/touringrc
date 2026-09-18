import { useEffect, useRef, useState } from "react";
import { T } from "../theme";

// Editor de recorte manual -- reemplaza el recorte automático centrado que
// tenía `fotoPiloto.js` (cortaba mal fotos donde la persona queda chica en
// el cuadro, ej. plano general con fondo). El piloto arrastra para mover
// la foto y usa el slider para acercar, viendo en vivo el mismo círculo
// que después va a mostrar `FotoPiloto.jsx` -- lo que se ve acá es
// exactamente lo que queda guardado, sin sorpresas.
const VIEWPORT = 240;
const SALIDA = 480;
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function escalaBase(w, h) {
  return Math.max(VIEWPORT / w, VIEWPORT / h);
}

export default function RecortarFoto({ file, onConfirmar, onCancelar }) {
  const [url, setUrl] = useState(null);
  const [natural, setNatural] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState(null);
  const imgRef = useRef(null);
  const arrastreRef = useRef(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function totalScale() {
    if (!natural) return 1;
    return escalaBase(natural.w, natural.h) * zoom;
  }

  function clampOffset(next, escala) {
    if (!natural) return next;
    const dispW = natural.w * escala;
    const dispH = natural.h * escala;
    return {
      x: clamp(next.x, VIEWPORT - dispW, 0),
      y: clamp(next.y, VIEWPORT - dispH, 0),
    };
  }

  function onImgLoad() {
    const img = imgRef.current;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNatural({ w, h });
    const escala = escalaBase(w, h);
    setOffset({ x: (VIEWPORT - w * escala) / 2, y: (VIEWPORT - h * escala) / 2 });
  }

  function onPointerDown(e) {
    arrastreRef.current = { startX: e.clientX, startY: e.clientY, offsetX: offset.x, offsetY: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!arrastreRef.current) return;
    const dx = e.clientX - arrastreRef.current.startX;
    const dy = e.clientY - arrastreRef.current.startY;
    setOffset(
      clampOffset(
        { x: arrastreRef.current.offsetX + dx, y: arrastreRef.current.offsetY + dy },
        totalScale()
      )
    );
  }

  function onPointerUp() {
    arrastreRef.current = null;
  }

  function onZoomChange(nuevoZoom) {
    setZoom(nuevoZoom);
    setOffset((prev) => clampOffset(prev, escalaBase(natural.w, natural.h) * nuevoZoom));
  }

  function confirmar() {
    if (!natural) return;
    const escala = totalScale();
    const canvas = document.createElement("canvas");
    canvas.width = SALIDA;
    canvas.height = SALIDA;
    const ctx = canvas.getContext("2d");
    const sx = -offset.x / escala;
    const sy = -offset.y / escala;
    const sSize = VIEWPORT / escala;
    ctx.drawImage(imgRef.current, sx, sy, sSize, sSize, 0, 0, SALIDA, SALIDA);
    canvas.toBlob(
      (blob) => (blob ? onConfirmar(blob) : setError("No se pudo procesar la imagen")),
      "image/jpeg",
      0.85
    );
  }

  return (
    <div
      onClick={onCancelar}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.surface,
          border: `1px solid ${T.line}`,
          borderRadius: 12,
          padding: 24,
          maxWidth: 340,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          alignItems: "center",
        }}
      >
        <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 18, fontWeight: 600, alignSelf: "flex-start" }}>
          Ajustar foto
        </div>
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          style={{
            width: VIEWPORT,
            height: VIEWPORT,
            borderRadius: "50%",
            overflow: "hidden",
            position: "relative",
            background: T.surfaceRaised,
            border: `1px solid ${T.line}`,
            cursor: "grab",
            touchAction: "none",
          }}
        >
          {url && (
            <img
              ref={imgRef}
              src={url}
              onLoad={onImgLoad}
              draggable={false}
              alt=""
              style={{
                position: "absolute",
                left: offset.x,
                top: offset.y,
                width: natural ? natural.w * totalScale() : undefined,
                height: natural ? natural.h * totalScale() : undefined,
                userSelect: "none",
              }}
            />
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
          <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>Zoom</span>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.01}
            value={zoom}
            disabled={!natural}
            onChange={(e) => onZoomChange(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>
        <div style={{ fontSize: 11, color: T.muted, textAlign: "center" }}>
          Arrastrá la foto para centrarla y usá el control para acercar
        </div>
        {error && <div style={{ color: T.red, fontSize: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, width: "100%", justifyContent: "flex-end" }}>
          <button
            onClick={onCancelar}
            style={{
              background: "transparent",
              border: `1px solid ${T.line}`,
              borderRadius: 8,
              padding: "6px 14px",
              color: T.text,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!natural}
            style={{
              background: T.amber,
              border: "none",
              borderRadius: 8,
              padding: "6px 14px",
              color: "#15181A",
              fontSize: 13,
              fontWeight: 600,
              cursor: natural ? "pointer" : "default",
            }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
