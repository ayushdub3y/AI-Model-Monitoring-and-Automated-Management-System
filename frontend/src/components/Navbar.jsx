import React from "react";
import {
  Activity,
  Layers,
  ShieldCheck,
  Stethoscope,
  Wrench,
  GitBranch,
  PlayCircle,
  Cpu,
  RefreshCw,
  LayoutGrid
} from "lucide-react";

export default function Navbar({
  activeTab,
  setActiveTab,
  units = [],
  selectedUnitId,
  onSelectUnit,
  systemStatus,
  activeModel,
  onQuickRun,
  isRunning,
  onReset
}) {
  const tabs = [
    { id: "fleet", label: "Fleet Dashboard", icon: LayoutGrid },
    { id: "pipeline", label: "Pipeline Runner", icon: PlayCircle },
    { id: "intake", label: "Intake & Profiling", icon: Layers },
    { id: "health", label: "Health & Drift", icon: Activity },
    { id: "diagnosis", label: "Diagnosis & SHAP", icon: Stethoscope },
    { id: "refinement", label: "Refinement & Tuning", icon: Wrench },
    { id: "versions", label: "Version Registry", icon: GitBranch },
    { id: "inference", label: "Live Inference", icon: Cpu },
  ];

  const statusClass =
    systemStatus === "HEALTHY"
      ? "badge-healthy"
      : systemStatus === "WARNING"
      ? "badge-warning"
      : systemStatus === "CRITICAL"
      ? "badge-critical"
      : "badge-neutral";

  return (
    <header className="navbar">
      <div className="navbar-inner">
        {/* Brand & Unit Selector */}
        <div className="brand" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div className="brand-icon" onClick={() => setActiveTab("fleet")} style={{ cursor: "pointer" }}>AI</div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="brand-title" onClick={() => setActiveTab("fleet")} style={{ cursor: "pointer" }}>
                Model Health & Refinement
              </span>
              <span className="brand-badge">Fleet Ops</span>
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", gap: "8px", alignItems: "center", marginTop: "2px" }}>
              <span>
                Champion: <strong style={{ color: "var(--accent-primary)" }}>{activeModel?.version || "v1.0.0"}</strong>
              </span>
              <span>•</span>
              <span className={`badge ${statusClass}`} style={{ padding: "1px 6px", fontSize: "0.68rem" }}>
                <span className={`pulse-dot ${systemStatus?.toLowerCase() || "healthy"}`} />
                {systemStatus || "HEALTHY"}
              </span>
            </div>
          </div>

          {/* Unit Dropdown */}
          {units.length > 0 && (
            <div style={{ marginLeft: "8px" }}>
              <select
                className="input-field"
                value={selectedUnitId || (units[0] ? units[0].id : 1)}
                onChange={(e) => onSelectUnit(Number(e.target.value))}
                style={{
                  padding: "4px 10px",
                  fontSize: "0.8rem",
                  background: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid var(--accent-primary)",
                  borderRadius: "6px",
                  color: "#fff",
                  fontWeight: 600
                }}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    Unit #{u.id}: {u.name} ({u.task_type})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <nav className="nav-tabs">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                className={`nav-tab ${activeTab === t.id ? "active" : ""}`}
                onClick={() => setActiveTab(t.id)}
              >
                <Icon size={16} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Action Controls */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={onReset}
            title="Load demo samples into storage"
          >
            <RefreshCw size={14} />
            <span>Load Demo</span>
          </button>

          <button
            className="btn btn-primary btn-sm"
            onClick={onQuickRun}
            disabled={isRunning}
          >
            <PlayCircle size={15} />
            <span>{isRunning ? "Running Pipeline..." : "⚡ 1-Click Run"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
