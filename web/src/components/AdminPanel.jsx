import { useState } from "react";
import { CalendarCog, Users, ShieldCheck } from "lucide-react";
import { T } from "../theme";
import GestionEventos from "./GestionEventos";
import PilotosAdmin from "./PilotosAdmin";
import RolesAdmin from "./RolesAdmin";

const TABS = [
  { id: "eventos", label: "Gestión de eventos", icon: CalendarCog, Componente: GestionEventos },
  { id: "pilotos", label: "Pilotos", icon: Users, Componente: PilotosAdmin },
  { id: "roles", label: "Roles", icon: ShieldCheck, Componente: RolesAdmin },
];

function SubTab({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 12px",
        borderRadius: 7,
        border: `1px solid ${active ? T.amber : T.line}`,
        background: active ? `${T.amber}18` : "transparent",
        color: active ? T.amber : T.muted,
        fontFamily: "Inter, sans-serif",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

// Sección admin, separada del Calendario público. Cada módulo nuevo
// (ej. subida de resultados vía Edge Function) se suma a esta lista.
export default function AdminPanel() {
  const [tab, setTab] = useState(TABS[0].id);
  const activa = TABS.find((t) => t.id === tab) ?? TABS[0];
  const Panel = activa.Componente;

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <SubTab key={t.id} icon={t.icon} label={t.label} active={tab === t.id} onClick={() => setTab(t.id)} />
        ))}
      </div>
      <Panel />
    </div>
  );
}
