import React, { useState } from "react";

export default function Header({
  activeTab,
  units = [],
  selectedUnitId,
  onSelectUnit,
  activeModel,
  systemStatus = "HEALTHY",
  onSearch,
  onNavigateTab,
}) {
  const [searchVal, setSearchVal] = useState("");
  const [showUnitDropdown, setShowUnitDropdown] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);

  const currentUnit =
    units.find((u) => u.id === selectedUnitId) || units[0] || {
      id: 1,
      name: "Customer Churn Model",
      health_status: "CRITICAL",
    };

  const getStatusBadge = (status) => {
    switch (status?.toUpperCase()) {
      case "CRITICAL":
        return {
          icon: "warning",
          iconClass: "text-error",
          badgeClass: "bg-error-container text-on-error-container",
          label: "CRITICAL",
        };
      case "WARNING":
        return {
          icon: "warning",
          iconClass: "text-secondary",
          badgeClass: "bg-surface-container-highest text-secondary",
          label: "WARNING",
        };
      case "HEALTHY":
      default:
        return {
          icon: "check_circle",
          iconClass: "text-tertiary",
          badgeClass: "bg-surface-container-highest text-tertiary",
          label: "HEALTHY",
        };
    }
  };

  const statusBadge = getStatusBadge(currentUnit.health_status || systemStatus);

  const getBreadcrumbTitle = (tab) => {
    switch (tab) {
      case "guided-demo":
        return "Interactive Guided Demo";
      case "fleet-overview":
        return "Fleet Overview";
      case "models":
        return "Models & Lineage";
      case "health-and-drift":
        return "Health & Drift Telemetry";
      case "alerts":
        return "Operational Alerts";
      case "monitoring-runs":
        return "Monitoring Pipeline Runs";
      case "model-maintenance":
        return "Model Maintenance & Diagnosis";
      case "candidates":
        return "Model Candidates Evaluation";
      case "versions":
        return "Deployment Versions";
      case "audit-log":
        return "Audit & Governance";
      case "inference-sandbox":
        return "Inference Sandbox";
      case "settings":
        return "Platform Settings";
      default:
        return "Overview";
    }
  };

  const handleSearchChange = (e) => {
    setSearchVal(e.target.value);
    if (onSearch) onSearch(e.target.value);
  };

  return (
    <header className="fixed top-0 left-72 right-0 h-16 bg-surface-container-lowest/90 backdrop-blur-xl border-b border-outline-variant/30 z-40 px-space-lg flex items-center justify-between">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-space-md min-w-0">
        <img
          alt="AI Model Reliability Platform Logo"
          className="h-6 w-auto object-contain"
          src="/logo.svg"
        />
        <div className="flex items-center gap-space-xs text-body-sm font-body-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px]">domain</span>
          <button
            onClick={() => onNavigateTab("fleet-overview")}
            className="hover:text-on-surface cursor-pointer transition-colors"
          >
            Platform
          </button>
          <span className="text-outline">/</span>
          <span className="text-on-surface font-headline-sm font-semibold">
            {getBreadcrumbTitle(activeTab)}
          </span>
          <span className="text-outline">/</span>
          <span className="font-label-mono-sm text-label-mono-sm text-primary">
            {currentUnit.name}
          </span>
        </div>
      </div>

      {/* Action Controls & User Identity */}
      <div className="flex items-center gap-space-md">
        {/* Global Search */}
        <div className="relative flex items-center">
          <span className="material-symbols-outlined absolute left-2.5 text-outline text-[18px]">
            search
          </span>
          <input
            className="bg-surface-container-low border border-outline-variant/40 rounded-lg pl-8 pr-12 py-1.5 text-body-sm font-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary w-60 lg:w-64 transition-all"
            placeholder="Search telemetry, models..."
            type="text"
            value={searchVal}
            onChange={handleSearchChange}
          />
          <kbd className="absolute right-2 font-label-mono-sm text-[10px] bg-surface-container-highest px-1.5 py-0.5 rounded text-on-surface-variant border border-outline-variant/40 pointer-events-none">
            ⌘K
          </kbd>
        </div>

        {/* Model Selector Dropdown Pill */}
        <div className="relative">
          <button
            onClick={() => setShowUnitDropdown(!showUnitDropdown)}
            className="flex items-center gap-space-xs bg-surface-container-low hover:bg-surface-container-high border border-outline-variant/40 rounded-lg px-space-sm py-1.5 transition-colors cursor-pointer"
          >
            <span
              className={`material-symbols-outlined text-[18px] ${statusBadge.iconClass}`}
            >
              {statusBadge.icon}
            </span>
            <span className="font-label-mono-sm text-label-mono-sm text-on-surface truncate max-w-[170px]">
              {currentUnit.name} ({activeModel?.version || "v3.2.1"})
            </span>
            <span
              className={`px-1.5 py-0.2 rounded font-label-mono-sm text-[10px] font-semibold ${statusBadge.badgeClass}`}
            >
              {statusBadge.label}
            </span>
            <span className="material-symbols-outlined text-outline text-[16px]">
              arrow_drop_down
            </span>
          </button>

          {/* Unit Dropdown Menu */}
          {showUnitDropdown && (
            <div className="absolute right-0 mt-2 w-72 bg-surface-container-high border border-outline-variant/40 rounded-xl shadow-xl z-50 overflow-hidden py-1">
              <div className="px-3 py-2 border-b border-outline-variant/30 text-outline font-label-mono-sm text-[11px] uppercase tracking-wider">
                Select Active Fleet Unit
              </div>
              {units.map((u) => {
                const uBadge = getStatusBadge(u.health_status);
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      onSelectUnit(u.id);
                      setShowUnitDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-surface-container-highest transition-colors ${
                      u.id === selectedUnitId ? "bg-surface-container-highest" : ""
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-semibold text-on-surface truncate">
                        {u.name}
                      </span>
                      <span className="font-label-mono-sm text-[11px] text-on-surface-variant">
                        ID: {u.id} · {u.task_type}
                      </span>
                    </div>
                    <span
                      className={`px-1.5 py-0.5 rounded font-label-mono-sm text-[10px] font-semibold ${uBadge.badgeClass}`}
                    >
                      {uBadge.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Runtime Badge */}
        <div className="hidden xl:flex items-center gap-space-xs px-space-sm py-1 rounded bg-surface-container-high border border-outline-variant/40">
          <span className="h-1.5 w-1.5 rounded-full bg-tertiary"></span>
          <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant uppercase text-[11px]">
            PRODUCTION · FASTAPI V2.4
          </span>
        </div>

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative p-1.5 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">
              notifications
            </span>
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-error ring-2 ring-surface-container-lowest"></span>
          </button>

          {showNotifs && (
            <div className="absolute right-0 mt-2 w-80 bg-surface-container-high border border-outline-variant/40 rounded-xl shadow-xl z-50 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2">
                <span className="font-headline-sm text-[13px] font-semibold text-on-surface">
                  Operational Incidents
                </span>
                <span className="px-1.5 py-0.2 rounded bg-error-container text-on-error-container font-label-mono-sm text-[10px] font-semibold">
                  2 Critical
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <div
                  className="p-2 rounded-lg bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors flex flex-col gap-1"
                  onClick={() => {
                    onNavigateTab("alerts");
                    setShowNotifs(false);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-error">
                      Customer Churn Degradation
                    </span>
                    <span className="font-label-mono-sm text-[10px] text-outline">
                      12m ago
                    </span>
                  </div>
                  <span className="text-[11px] text-on-surface-variant">
                    F1 score dropped 0.81 → 0.74 due to covariate shift in tenure.
                  </span>
                </div>
                <div
                  className="p-2 rounded-lg bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors flex flex-col gap-1"
                  onClick={() => {
                    onNavigateTab("alerts");
                    setShowNotifs(false);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-secondary">
                      Fraud Detection Drift
                    </span>
                    <span className="font-label-mono-sm text-[10px] text-outline">
                      28m ago
                    </span>
                  </div>
                  <span className="text-[11px] text-on-surface-variant">
                    Feature drift detected in 4 features; latency elevated +14ms.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Identity */}
        <div className="flex items-center gap-space-sm pl-space-xs border-l border-outline-variant/40">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold text-[13px]">
            <span className="material-symbols-outlined text-[18px]">person</span>
          </div>
          <div className="hidden md:flex flex-col text-left">
            <span className="font-headline-sm text-body-sm text-on-surface leading-tight font-semibold">
              Sarah Lin
            </span>
            <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant leading-tight text-[11px]">
              ML Staff Eng
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
