import { useState } from "react";
import { Link2, Users, ShieldCheck } from "lucide-react";
import { T } from "../theme";
import VinculosPendientes from "./VinculosPendientes";
import PilotosAdmin from "./PilotosAdmin";
import RolesAdmin from "./RolesAdmin";

const TABS = [
  { id: "vinculos", label: "Vínculos pendientes", icon: Link2, Componente: VinculosPendientes },
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

// Agrupa los paneles admin en sub-tabs para no tener que escrolear
// todos apilados. Cada módulo nuevo (ej. Fase C/D/E) se suma acá.
export default function AdminPanel() {
  const [tab, setTab] = useState(TABS[0].id);
  const activa = TABS.find((t) => t.id === tab) ?? TABS[0];
  const Panel = activa.Componente;

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <SubTab key={t.id} icon={t.icon} label={t.label} active={tab === t.id} onClick={() => setTab(t.id)} />
        ))}
      </div>
      <Panel />
    </div>
  );
}
