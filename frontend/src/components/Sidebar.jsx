import React from "react";

export default function Sidebar({ activeTab, onSelectTab, alertsCount = 2 }) {
  const sections = [
    {
      label: "Guided Walkthrough",
      items: [
        { id: "guided-demo", label: "Guided Demo", icon: "auto_fix_high", badgeText: "DEMO" },
      ],
    },
    {
      label: "Overview",
      items: [
        { id: "fleet-overview", label: "Fleet Overview", icon: "dashboard" },
      ],
    },
    {
      label: "Monitoring",
      items: [
        { id: "models", label: "Models", icon: "layers" },
        { id: "health-and-drift", label: "Health & Drift", icon: "vital_signs" },
        { id: "alerts", label: "Alerts", icon: "notifications", badge: alertsCount },
        { id: "monitoring-runs", label: "Monitoring Runs", icon: "history" },
      ],
    },
    {
      label: "Maintenance",
      items: [
        { id: "model-maintenance", label: "Model Maintenance", icon: "build" },
        { id: "candidates", label: "Candidates", icon: "auto_awesome" },
        { id: "versions", label: "Versions", icon: "fork_right" },
      ],
    },
    {
      label: "Governance",
      items: [
        { id: "audit-log", label: "Audit Log", icon: "shield" },
      ],
    },
    {
      label: "Tools",
      items: [
        { id: "inference-sandbox", label: "Inference Sandbox", icon: "terminal" },
      ],
    },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-72 bg-surface-container-lowest z-50 flex flex-col justify-between border-r border-outline-variant/30 select-none">
      <div className="flex flex-col">
        {/* Brand Header */}
        <div
          className="h-16 px-space-lg flex items-center gap-space-md border-b border-outline-variant/20 bg-surface-container-low/40 cursor-pointer"
          onClick={() => onSelectTab("fleet-overview")}
        >
          <img
            alt="AI Model Reliability Platform Logo"
            className="h-8 w-auto object-contain"
            src="/logo.svg"
          />
          <div className="flex flex-col min-w-0">
            <span className="font-headline-sm text-headline-sm text-on-surface truncate tracking-tight font-semibold">
              AI Model Reliability
            </span>
            <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant truncate uppercase tracking-wider text-[11px]">
              Autonomous Platform
            </span>
          </div>
        </div>

        {/* Navigation Groups */}
        <div className="px-space-md py-space-md overflow-y-auto max-h-[calc(100vh-8.5rem)]">
          {sections.map((section) => (
            <div key={section.label} className="mb-space-sm">
              <div className="px-space-sm pt-space-xs pb-space-xxs">
                <span className="font-label-mono-sm text-label-mono-sm uppercase tracking-wider text-outline text-[10px]">
                  {section.label}
                </span>
              </div>
              <nav className="flex flex-col gap-space-xxs mt-1">
                {section.items.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectTab(item.id)}
                      className={`w-full flex items-center justify-between px-space-sm py-space-xs rounded-lg transition-colors text-left ${
                        isActive
                          ? "bg-surface-container-high text-primary font-headline-sm border-l-2 border-primary"
                          : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface font-body-md text-body-md"
                      }`}
                    >
                      <div className="flex items-center gap-space-sm">
                        <span className={`material-symbols-outlined text-[18px] ${isActive ? "text-primary" : ""}`}>
                          {item.icon}
                        </span>
                        <span className="text-[14px]">{item.label}</span>
                      </div>
                      {item.badgeText && (
                        <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 font-mono text-[9px] font-bold">
                          {item.badgeText}
                        </span>
                      )}
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-error-container text-on-error-container font-label-mono-sm text-[11px] font-semibold">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Cluster & Settings */}
      <div className="border-t border-outline-variant/30 bg-surface-container-low/50 p-space-md flex flex-col gap-space-xs">
        <div className="flex items-center justify-between px-space-xs">
          <div className="flex items-center gap-space-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-tertiary"></span>
            </span>
            <span className="font-label-mono-sm text-label-mono-sm uppercase tracking-wide text-on-surface text-[11px]">
              Production
            </span>
          </div>
          <span className="font-label-mono-sm text-label-mono-sm text-outline text-[11px]">
            v2.4
          </span>
        </div>
        <div className="text-body-sm font-body-sm text-on-surface-variant px-space-xs flex items-center justify-between text-[12px]">
          <span>System Operational</span>
          <span className="material-symbols-outlined text-tertiary text-[14px]">
            check_circle
          </span>
        </div>
        <button
          onClick={() => onSelectTab("settings")}
          className={`mt-space-xs flex items-center gap-space-sm px-space-xs py-space-xs rounded-lg transition-colors text-body-sm font-body-sm text-left ${
            activeTab === "settings"
              ? "text-primary bg-surface-container-high font-semibold"
              : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">settings</span>
          <span className="text-[13px]">Platform Settings</span>
        </button>
      </div>
    </aside>
  );
}
