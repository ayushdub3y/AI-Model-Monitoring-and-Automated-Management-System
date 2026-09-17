import React, { useState } from "react";

export default function FleetDashboardView({
  units = [],
  summary = null,
  onSelectUnit,
  onCreateUnit,
  onQuickRun,
  isRunning = false,
  onNavigateTab,
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [newTaskType, setNewTaskType] = useState("classification");
  const [newTargetCol, setNewTargetCol] = useState("Churn");
  const [newPromotionMode, setNewPromotionMode] = useState("AUTO");
  const [newOwner, setNewOwner] = useState("Production Fleet");

  const [activeFilter, setActiveFilter] = useState("all");
  const [tableSearch, setTableSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isMonitoringPolled, setIsMonitoringPolled] = useState(false);

  // Pre-configured baseline models combined with live backend units
  const baseModels = [
    {
      id: units[0]?.id || 1,
      name: units[0]?.name || "Customer Churn",
      version: "v3.2.1",
      framework: "XGBoost Classification",
      category: "critical drift",
      healthStatus: "Critical (55/100)",
      healthTier: "critical",
      metric: "0.74 F1",
      metricOld: "0.81",
      metricDirection: "down",
      driftPercent: 82,
      driftText: "High Drift (82%)",
      driftTier: "critical",
      labelStatus: "Labels Available",
      labelTier: "healthy",
      actionText: "Maintenance Recommended",
      actionTier: "critical",
      timestamp: "12 min ago",
    },
    {
      id: units[1]?.id || 2,
      name: "Fraud Detection",
      version: "v4.0.0",
      framework: "LightGBM Classifier",
      category: "drift auto",
      healthStatus: "Warning (72/100)",
      healthTier: "warning",
      metric: "0.89 AUC",
      metricDirection: "flat",
      driftPercent: 54,
      driftText: "Med Drift (54%)",
      driftTier: "warning",
      labelStatus: "Labels Delayed",
      labelTier: "warning",
      actionText: "Review Drift",
      actionTier: "warning",
      timestamp: "28 min ago",
    },
    {
      id: units[2]?.id || 3,
      name: "Demand Forecast",
      version: "v2.1.0",
      framework: "Temporal Fusion Transformer",
      category: "auto",
      healthStatus: "Healthy (96/100)",
      healthTier: "healthy",
      metric: "0.94 R²",
      metricDirection: "up",
      driftPercent: 8,
      driftText: "No Drift (8%)",
      driftTier: "healthy",
      labelStatus: "Labels Available",
      labelTier: "healthy",
      actionText: "None (Optimal)",
      actionTier: "neutral",
      timestamp: "1 hour ago",
    },
    {
      id: units[3]?.id || 4,
      name: "Credit Risk Scoring",
      version: "v1.8.4",
      framework: "Ensemble Stacking",
      category: "drift",
      healthStatus: "Warning (76/100)",
      healthTier: "warning",
      metric: "0.82 F1",
      metricDirection: "down",
      driftPercent: 48,
      driftText: "Prediction Shift",
      driftTier: "warning",
      labelStatus: "Labels Unavailable",
      labelTier: "neutral",
      actionText: "Assess Proxies",
      actionTier: "warning",
      timestamp: "2 hours ago",
    },
    {
      id: units[4]?.id || 5,
      name: "Churn v2.4 (Staging)",
      version: "v2.4.0",
      framework: "Candidate Test",
      badge: "SHADOW",
      category: "all",
      healthStatus: "Healthy (98/100)",
      healthTier: "healthy",
      metric: "0.83 F1",
      metricDirection: "up",
      driftPercent: 4,
      driftText: "Baseline Valid",
      driftTier: "healthy",
      labelStatus: "Labels Available",
      labelTier: "healthy",
      actionText: "Ready for Staging",
      actionTier: "healthy",
      timestamp: "3 hours ago",
    },
  ];

  // Append any extra registered units from database
  const allModels = [...baseModels];
  if (units.length > baseModels.length) {
    units.slice(baseModels.length).forEach((u, idx) => {
      allModels.push({
        id: u.id,
        name: u.name,
        version: "v1.0.0",
        framework: `${u.task_type || "Classification"} Model`,
        category: "all",
        healthStatus: "Healthy (95/100)",
        healthTier: "healthy",
        metric: "0.85 Score",
        metricDirection: "up",
        driftPercent: 6,
        driftText: "No Drift (6%)",
        driftTier: "healthy",
        labelStatus: "Labels Available",
        labelTier: "healthy",
        actionText: "Nominal",
        actionTier: "neutral",
        timestamp: "Recently",
      });
    });
  }

  // Filter & search logic
  const filteredModels = allModels.filter((m) => {
    const matchesFilter =
      activeFilter === "all" ||
      m.category.includes(activeFilter) ||
      (activeFilter === "critical" && m.healthTier === "critical") ||
      (activeFilter === "drift" && m.driftTier !== "healthy") ||
      (activeFilter === "auto" && m.category.includes("auto"));

    const matchesSearch =
      !tableSearch.trim() ||
      m.name.toLowerCase().includes(tableSearch.toLowerCase()) ||
      m.framework.toLowerCase().includes(tableSearch.toLowerCase()) ||
      m.actionText.toLowerCase().includes(tableSearch.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  async function handleCreateSubmit(e) {
    e.preventDefault();
    if (!newUnitName.trim()) return;
    await onCreateUnit({
      name: newUnitName,
      task_type: newTaskType,
      target_column: newTargetCol,
      promotion_mode: newPromotionMode,
      owner_label: newOwner,
    });
    setNewUnitName("");
    setShowCreateModal(false);
  }

  const handleRunMonitoringClick = () => {
    setIsMonitoringPolled(true);
    if (onQuickRun) onQuickRun();
    setTimeout(() => {
      setIsMonitoringPolled(false);
    }, 2800);
  };

  return (
    <div className="flex flex-col w-full gap-space-xl">
      {/* Header / Action Control Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
        <div className="flex flex-col gap-space-xxs min-w-0">
          <div className="flex items-center gap-space-xs">
            <span className="font-label-mono-sm text-label-mono-sm uppercase tracking-wider text-primary font-semibold">
              Fleet Control Center
            </span>
            <span className="inline-block w-1 h-1 rounded-full bg-outline"></span>
            <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant">
              Cluster: us-east-prod-k8s
            </span>
          </div>
          <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight font-bold">
            Model Fleet
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Monitor real-time reliability, covariate shifts, and autonomous maintenance states across production AI models.
          </p>
        </div>

        <div className="flex items-center gap-space-sm shrink-0">
          <button
            onClick={handleRunMonitoringClick}
            disabled={isRunning || isMonitoringPolled}
            className="flex items-center gap-space-xs px-space-md py-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface rounded-lg transition-all shadow-sm active:scale-95 border border-outline-variant/30"
            id="run-monitoring-btn"
          >
            <span
              className={`material-symbols-outlined text-tertiary text-[18px] ${
                isRunning || isMonitoringPolled ? "animate-spin" : ""
              }`}
            >
              {isRunning || isMonitoringPolled ? "refresh" : "bolt"}
            </span>
            <span className="font-headline-sm text-body-md font-semibold">
              {isRunning || isMonitoringPolled
                ? "Monitoring Fleet (24/24)..."
                : "Run Fleet Monitoring"}
            </span>
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-space-xs px-space-md py-2 bg-primary hover:bg-primary-container text-on-primary font-headline-sm text-body-md rounded-lg transition-all shadow-md active:scale-95 font-semibold"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Register Model</span>
          </button>
        </div>
      </div>

      {/* Fleet KPI Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-gutter-normal">
        {/* Card 1: Total Models */}
        <div className="bg-surface-container p-space-md rounded-xl flex flex-col justify-between shadow-sm border border-outline-variant/20 relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-mono-sm text-label-mono-sm text-outline uppercase tracking-wider text-[11px]">
                Total Models
              </span>
              <div className="flex items-baseline gap-space-xs mt-space-xxs">
                <span className="font-headline-lg text-headline-lg text-on-surface font-semibold text-[28px]">
                  {Math.max(24, allModels.length)}
                </span>
                <span className="font-label-mono-sm text-label-mono-sm text-tertiary font-medium">
                  +2 this week
                </span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-tertiary">
              <span className="material-symbols-outlined text-[20px]">layers</span>
            </div>
          </div>
          <div className="mt-space-md">
            <div className="flex items-center justify-between text-body-sm font-body-sm text-on-surface-variant mb-1 text-[12px]">
              <span>Deployment Partition</span>
              <span className="font-label-mono-sm text-label-mono-sm text-on-surface font-medium">
                18 Active / 6 Staging
              </span>
            </div>
            <div className="w-full bg-surface-container-lowest h-1.5 rounded-full overflow-hidden flex">
              <div className="bg-primary h-full rounded-full" style={{ width: "75%" }}></div>
              <div className="bg-outline-variant h-full rounded-full" style={{ width: "25%" }}></div>
            </div>
          </div>
        </div>

        {/* Card 2: Healthy */}
        <div className="bg-surface-container p-space-md rounded-xl flex flex-col justify-between shadow-sm border border-outline-variant/20 relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-mono-sm text-label-mono-sm text-outline uppercase tracking-wider text-[11px]">
                Operational Healthy
              </span>
              <div className="flex items-baseline gap-space-xs mt-space-xxs">
                <span className="font-headline-lg text-headline-lg text-tertiary font-semibold text-[28px]">
                  18
                </span>
                <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant">
                  75.0% of fleet
                </span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-tertiary">
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
            </div>
          </div>
          <div className="mt-space-md">
            <div className="flex items-center justify-between text-body-sm font-body-sm text-on-surface-variant mb-1 text-[12px]">
              <span>Status</span>
              <span className="font-label-mono-sm text-label-mono-sm text-tertiary font-medium">
                Nominal · Zero drift
              </span>
            </div>
            <div className="w-full bg-surface-container-lowest h-1.5 rounded-full overflow-hidden">
              <div className="bg-tertiary h-full rounded-full" style={{ width: "100%" }}></div>
            </div>
          </div>
        </div>

        {/* Card 3: Warning */}
        <div className="bg-surface-container p-space-md rounded-xl flex flex-col justify-between shadow-sm border border-outline-variant/20 relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-mono-sm text-label-mono-sm text-outline uppercase tracking-wider text-[11px]">
                Warning State
              </span>
              <div className="flex items-baseline gap-space-xs mt-space-xxs">
                <span className="font-headline-lg text-headline-lg text-secondary font-semibold text-[28px]">
                  4
                </span>
                <span className="font-label-mono-sm text-label-mono-sm text-secondary">
                  16.6% fleet share
                </span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[20px]">warning</span>
            </div>
          </div>
          <div className="mt-space-md">
            <div className="flex items-center justify-between text-body-sm font-body-sm text-on-surface-variant mb-1 text-[12px]">
              <span>Degradation Driver</span>
              <span className="font-label-mono-sm text-label-mono-sm text-secondary font-medium">
                Context/Feature Shift
              </span>
            </div>
            <div className="w-full bg-surface-container-lowest h-1.5 rounded-full overflow-hidden">
              <div className="bg-secondary h-full rounded-full" style={{ width: "60%" }}></div>
            </div>
          </div>
        </div>

        {/* Card 4: Critical */}
        <div className="bg-surface-container p-space-md rounded-xl flex flex-col justify-between shadow-sm border border-outline-variant/20 relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-mono-sm text-label-mono-sm text-error uppercase tracking-wider text-[11px]">
                Critical Intervention
              </span>
              <div className="flex items-baseline gap-space-xs mt-space-xxs">
                <span className="font-headline-lg text-headline-lg text-error font-semibold text-[28px]">
                  2
                </span>
                <span className="font-label-mono-sm text-label-mono-sm text-error font-medium">
                  Action Mandated
                </span>
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-error-container/30 flex items-center justify-center text-error">
              <span className="material-symbols-outlined text-[20px]">error</span>
            </div>
          </div>
          <div className="mt-space-md">
            <div className="flex items-center justify-between text-body-sm font-body-sm text-on-surface-variant mb-1 text-[12px]">
              <span>Severity Level</span>
              <span className="font-label-mono-sm text-label-mono-sm text-error font-medium">
                Degraded SLA Breach
              </span>
            </div>
            <div className="w-full bg-surface-container-lowest h-1.5 rounded-full overflow-hidden">
              <div className="bg-error h-full rounded-full" style={{ width: "85%" }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Priority Story: Attention Required */}
      <div className="flex flex-col gap-space-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-space-sm">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-error"></span>
            </span>
            <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight font-semibold">
              Attention Required
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label-mono-sm text-label-mono-sm font-medium">
              2 Urgent Incidents
            </span>
          </div>
          <span className="font-label-mono-sm text-label-mono-sm text-outline text-[11px]">
            Autonomous Remediation Loop Active
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter-normal">
          {/* Critical Card 1: Churn Model */}
          <div className="bg-surface-container p-space-lg rounded-xl shadow-md border border-outline-variant/30 flex flex-col justify-between relative overflow-hidden">
            <div className="flex flex-col gap-space-md">
              {/* Top Row Header */}
              <div className="flex items-start justify-between gap-space-sm">
                <div className="flex flex-col">
                  <div className="flex items-center gap-space-xs flex-wrap">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                      Customer Churn Model
                    </span>
                    <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-mono-sm text-[11px]">
                      Classification
                    </span>
                    <span className="px-2 py-0.5 rounded bg-surface-container-high text-primary font-label-mono-sm text-[11px] uppercase tracking-wide">
                      Assisted Mode
                    </span>
                  </div>
                  <span className="font-label-mono-sm text-label-mono-sm text-outline mt-0.5 text-[11px]">
                    Endpoint: /v3/churn/predict-realtime · Version 3.2.1
                  </span>
                </div>
                <div className="px-2.5 py-1 rounded bg-error-container text-on-error-container font-label-mono-sm text-label-mono-sm font-semibold flex items-center gap-1 shadow-sm shrink-0">
                  <span className="material-symbols-outlined text-[14px]">crisis_alert</span>
                  <span>CRITICAL · 55/100</span>
                </div>
              </div>

              {/* Problem Block */}
              <div className="bg-surface-container-low p-space-md rounded-lg flex flex-col gap-space-xs">
                <div className="flex items-center gap-space-xs text-error">
                  <span className="material-symbols-outlined text-[18px]">trending_down</span>
                  <span className="font-headline-sm text-body-md font-medium">
                    Performance Degradation Detected
                  </span>
                </div>
                <p className="font-body-md text-body-md text-on-surface text-[13px] leading-relaxed">
                  Primary metric <strong className="text-error font-headline-sm">F1 decreased from 0.81 → 0.74 (-8.6%)</strong> over the last 6-hour evaluation cycle. Three key features show severe Kolmogorov-Smirnov drift statistics.
                </p>
              </div>

              {/* Root Cause Hint & Feature Pills */}
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center gap-space-xs font-label-mono-sm text-label-mono-sm text-outline uppercase tracking-wider text-[11px]">
                  <span className="material-symbols-outlined text-[16px] text-primary">
                    psychology
                  </span>
                  <span>Root Cause Analysis</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant text-[12px]">
                  Covariate feature shift in <code className="bg-surface-container-highest text-primary px-1.5 py-0.5 rounded font-label-mono-sm text-[11px]">tenure</code>, <code className="bg-surface-container-highest text-primary px-1.5 py-0.5 rounded font-label-mono-sm text-[11px]">Contract</code>, and <code className="bg-surface-container-highest text-primary px-1.5 py-0.5 rounded font-label-mono-sm text-[11px]">MonthlyCharges</code> shifted production distribution radically away from baseline training distribution.
                </p>
                <div className="flex items-center gap-space-xs mt-space-xxs flex-wrap">
                  <span className="px-2 py-1 rounded bg-surface-container-highest font-label-mono-sm text-[11px] text-error flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                    tenure (p &lt; 0.001)
                  </span>
                  <span className="px-2 py-1 rounded bg-surface-container-highest font-label-mono-sm text-[11px] text-error flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                    Contract (PSI: 0.28)
                  </span>
                  <span className="px-2 py-1 rounded bg-surface-container-highest font-label-mono-sm text-[11px] text-secondary flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                    MonthlyCharges (PSI: 0.19)
                  </span>
                </div>
              </div>

              {/* Recommended Action Banner */}
              <div className="p-space-sm rounded-lg bg-surface-container-high flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-tertiary text-[20px] shrink-0">
                  auto_fix_high
                </span>
                <span className="font-body-sm text-body-sm text-on-surface text-[12px]">
                  <strong>Action:</strong> Targeted model maintenance candidate{" "}
                  <code className="text-tertiary font-label-mono-sm text-[11px]">
                    cand-churn-v3.2.2-rc1
                  </code>{" "}
                  is pre-compiled and awaiting approval.
                </span>
              </div>
            </div>

            {/* Action CTAs */}
            <div className="flex items-center gap-space-sm mt-space-lg pt-space-md border-t border-outline-variant/20">
              <button
                onClick={() => {
                  if (onSelectUnit) onSelectUnit(1);
                  if (onNavigateTab) onNavigateTab("models");
                }}
                className="flex-1 px-space-md py-2 bg-primary hover:bg-primary-container text-on-primary font-headline-sm text-body-md rounded-lg transition-colors flex items-center justify-center gap-space-xs shadow-sm font-semibold"
              >
                <span className="material-symbols-outlined text-[18px]">biotech</span>
                <span>Inspect Model &amp; Diagnose</span>
              </button>
              <button
                onClick={() => {
                  if (onNavigateTab) onNavigateTab("model-maintenance");
                }}
                className="px-space-md py-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-headline-sm text-body-md rounded-lg transition-colors flex items-center justify-center gap-space-xs font-semibold"
              >
                <span className="material-symbols-outlined text-[18px] text-tertiary">
                  play_circle
                </span>
                <span>Start Maintenance</span>
              </button>
            </div>
          </div>

          {/* Warning Card 2: Fraud Detection Model */}
          <div className="bg-surface-container p-space-lg rounded-xl shadow-md border border-outline-variant/30 flex flex-col justify-between relative overflow-hidden">
            <div className="flex flex-col gap-space-md">
              {/* Top Row Header */}
              <div className="flex items-start justify-between gap-space-sm">
                <div className="flex flex-col">
                  <div className="flex items-center gap-space-xs flex-wrap">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                      Fraud Detection Model
                    </span>
                    <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-label-mono-sm text-[11px]">
                      Classification
                    </span>
                    <span className="px-2 py-0.5 rounded bg-surface-container-high text-tertiary font-label-mono-sm text-[11px] uppercase tracking-wide">
                      Auto Mode
                    </span>
                  </div>
                  <span className="font-label-mono-sm text-label-mono-sm text-outline mt-0.5 text-[11px]">
                    Endpoint: /v1/payments/verify-risk · Version 4.0.0
                  </span>
                </div>
                <div className="px-2.5 py-1 rounded bg-surface-container-high text-secondary font-label-mono-sm text-label-mono-sm font-semibold flex items-center gap-1 shadow-sm shrink-0">
                  <span className="material-symbols-outlined text-[14px]">warning</span>
                  <span>WARNING · 72/100</span>
                </div>
              </div>

              {/* Problem Block */}
              <div className="bg-surface-container-low p-space-md rounded-lg flex flex-col gap-space-xs">
                <div className="flex items-center gap-space-xs text-secondary">
                  <span className="material-symbols-outlined text-[18px]">speed</span>
                  <span className="font-headline-sm text-body-md font-medium">
                    Feature Drift &amp; Latency Elevation
                  </span>
                </div>
                <p className="font-body-md text-body-md text-on-surface text-[13px] leading-relaxed">
                  Feature drift detected in 4 production features across high-frequency transaction bins. 99th percentile inference latency increased by <strong className="text-secondary font-headline-sm">+14ms</strong> (now 42ms).
                </p>
              </div>

              {/* Root Cause Hint & Feature Pills */}
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center gap-space-xs font-label-mono-sm text-label-mono-sm text-outline uppercase tracking-wider text-[11px]">
                  <span className="material-symbols-outlined text-[16px] text-primary">
                    info
                  </span>
                  <span>Contextual Drift &amp; Delayed Feedback</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant text-[12px]">
                  Ground-truth chargeback labels delayed by typical ~72h window. Reliability engine is operating on proxy anomaly statistics and unsupervised embedding variance.
                </p>
                <div className="flex items-center gap-space-xs mt-space-xxs flex-wrap">
                  <span className="px-2 py-1 rounded bg-surface-container-highest font-label-mono-sm text-[11px] text-secondary flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                    ip_geo_velocity (Drift)
                  </span>
                  <span className="px-2 py-1 rounded bg-surface-container-highest font-label-mono-sm text-[11px] text-secondary flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                    card_bin_country (Drift)
                  </span>
                  <span className="px-2 py-1 rounded bg-surface-container-highest font-label-mono-sm text-[11px] text-on-surface-variant flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-outline"></span>
                    tx_amount_zscore (Stable)
                  </span>
                </div>
              </div>

              {/* Recommended Action Banner */}
              <div className="p-space-sm rounded-lg bg-surface-container-high flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-secondary text-[20px] shrink-0">
                  fact_check
                </span>
                <span className="font-body-sm text-body-sm text-on-surface text-[12px]">
                  <strong>Action:</strong> Review contextual feature divergence. Dynamic proxy thresholds are shielding false positives autonomously.
                </span>
              </div>
            </div>

            {/* Action CTAs */}
            <div className="flex items-center gap-space-sm mt-space-lg pt-space-md border-t border-outline-variant/20">
              <button
                onClick={() => {
                  if (onNavigateTab) onNavigateTab("health-and-drift");
                }}
                className="w-full px-space-md py-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-headline-sm text-body-md rounded-lg transition-colors flex items-center justify-center gap-space-xs shadow-sm font-semibold"
              >
                <span className="material-symbols-outlined text-[18px] text-primary">
                  troubleshoot
                </span>
                <span>Inspect Model &amp; Proxy Scores</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Fleet Reliability & Drift Health (Two-Column Analytics) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-normal">
        {/* Left Column: Fleet Health Distribution (5 cols) */}
        <div className="xl:col-span-5 bg-surface-container p-space-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-space-md">
              <div className="flex flex-col">
                <span className="font-label-mono-sm text-label-mono-sm text-outline uppercase tracking-wider text-[11px]">
                  Fleet Stability Breakdown
                </span>
                <h3 className="font-headline-md text-headline-md text-on-surface font-semibold tracking-tight">
                  Fleet Health Distribution
                </h3>
              </div>
              <span className="font-label-mono-sm text-label-mono-sm px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant text-[11px]">
                N={Math.max(24, allModels.length)} Models
              </span>
            </div>

            {/* Donut / Proportional Metric Representation */}
            <div className="flex items-center justify-center py-space-sm">
              <div className="relative flex items-center justify-center">
                <svg className="w-48 h-48 transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    className="text-surface-container-lowest"
                    cx="50"
                    cy="50"
                    fill="transparent"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="12"
                  ></circle>
                  {/* Healthy Segment: 75% = 188.5 length of 251.2 */}
                  <circle
                    className="text-tertiary"
                    cx="50"
                    cy="50"
                    fill="transparent"
                    r="40"
                    stroke="currentColor"
                    strokeDasharray="251.2"
                    strokeDashoffset="62.8"
                    strokeWidth="12"
                  ></circle>
                  {/* Warning Segment: 16.6% = 41.7 length */}
                  <circle
                    className="text-secondary"
                    cx="50"
                    cy="50"
                    fill="transparent"
                    r="40"
                    stroke="currentColor"
                    strokeDasharray="251.2"
                    strokeDashoffset="209.5"
                    strokeWidth="12"
                    transform="rotate(270 50 50)"
                  ></circle>
                  {/* Critical Segment: 8.4% = 21.1 length */}
                  <circle
                    className="text-error"
                    cx="50"
                    cy="50"
                    fill="transparent"
                    r="40"
                    stroke="currentColor"
                    strokeDasharray="251.2"
                    strokeDashoffset="230"
                    strokeWidth="12"
                    transform="rotate(330 50 50)"
                  ></circle>
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="font-display-lg text-display-lg font-bold text-on-surface leading-none text-[32px]">
                    91.4
                  </span>
                  <span className="font-label-mono-sm text-label-mono-sm text-outline uppercase mt-1 text-[10px]">
                    Fleet Health Index
                  </span>
                </div>
              </div>
            </div>

            {/* Breakdown List */}
            <div className="flex flex-col gap-space-sm mt-space-md">
              <div className="flex items-center justify-between p-space-sm rounded-lg bg-surface-container-low">
                <div className="flex items-center gap-space-xs">
                  <span className="w-3 h-3 rounded-sm bg-tertiary"></span>
                  <span className="font-body-md text-body-md text-on-surface text-[13px]">
                    Optimal / Healthy
                  </span>
                </div>
                <div className="flex items-center gap-space-md">
                  <span className="font-label-mono-sm text-label-mono-sm text-outline text-[11px]">
                    18 models
                  </span>
                  <span className="font-label-mono-sm text-label-mono-sm text-on-surface font-semibold text-[12px]">
                    75.0%
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between p-space-sm rounded-lg bg-surface-container-low">
                <div className="flex items-center gap-space-xs">
                  <span className="w-3 h-3 rounded-sm bg-secondary"></span>
                  <span className="font-body-md text-body-md text-on-surface text-[13px]">
                    Drift Warning
                  </span>
                </div>
                <div className="flex items-center gap-space-md">
                  <span className="font-label-mono-sm text-label-mono-sm text-outline text-[11px]">
                    4 models
                  </span>
                  <span className="font-label-mono-sm text-label-mono-sm text-on-surface font-semibold text-[12px]">
                    16.6%
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between p-space-sm rounded-lg bg-surface-container-low">
                <div className="flex items-center gap-space-xs">
                  <span className="w-3 h-3 rounded-sm bg-error"></span>
                  <span className="font-body-md text-body-md text-on-surface text-[13px]">
                    Critical Performance Loss
                  </span>
                </div>
                <div className="flex items-center gap-space-md">
                  <span className="font-label-mono-sm text-label-mono-sm text-outline text-[11px]">
                    2 models
                  </span>
                  <span className="font-label-mono-sm text-label-mono-sm text-on-surface font-semibold text-[12px]">
                    8.4%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-space-md pt-space-sm flex items-center justify-between text-body-sm font-body-sm text-on-surface-variant border-t border-outline-variant/20">
            <span className="flex items-center gap-1 text-[12px]">
              <span className="material-symbols-outlined text-[16px] text-tertiary">
                verified_user
              </span>
              SLA target: 90.0% Fleet Nominal
            </span>
            <span className="text-tertiary font-label-mono-sm text-label-mono-sm font-bold text-[11px]">
              Compliant
            </span>
          </div>
        </div>

        {/* Right Column: Fleet Health Trend (30-Day) (7 cols) */}
        <div className="xl:col-span-7 bg-surface-container p-space-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs mb-space-md">
              <div className="flex flex-col">
                <span className="font-label-mono-sm text-label-mono-sm text-outline uppercase tracking-wider text-[11px]">
                  Historical Reliability Stream
                </span>
                <h3 className="font-headline-md text-headline-md text-on-surface font-semibold tracking-tight">
                  Fleet Health Trend (30-Day)
                </h3>
              </div>
              <div className="flex items-center gap-space-xs">
                <span className="px-2 py-0.5 rounded bg-surface-container-highest text-primary font-label-mono-sm text-label-mono-sm font-medium text-[11px]">
                  Avg: 94.2 Score
                </span>
                <span className="px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant font-label-mono-sm text-label-mono-sm text-[11px]">
                  Window: 30D
                </span>
              </div>
            </div>

            {/* SVG Line Chart with Marked Incidents */}
            <div className="w-full h-56 relative mt-space-sm">
              <svg
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
                viewBox="0 0 700 200"
              >
                <defs>
                  <linearGradient id="trendGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#c0c1ff" stopOpacity="0.25"></stop>
                    <stop offset="100%" stopColor="#c0c1ff" stopOpacity="0.0"></stop>
                  </linearGradient>
                </defs>
                {/* Horizontal Guide Lines */}
                <line stroke="#313540" strokeDasharray="4 4" strokeWidth="1" x1="0" x2="700" y1="20" y2="20"></line>
                <line stroke="#313540" strokeDasharray="4 4" strokeWidth="1" x1="0" x2="700" y1="70" y2="70"></line>
                <line stroke="#313540" strokeDasharray="4 4" strokeWidth="1" x1="0" x2="700" y1="120" y2="120"></line>
                <line stroke="#313540" strokeWidth="1" x1="0" x2="700" y1="170" y2="170"></line>
                {/* Area fill under line */}
                <path
                  d="M 0 45 L 80 40 L 160 50 L 230 42 L 310 48 L 380 95 L 430 85 L 500 50 L 570 48 L 640 115 L 700 110 L 700 170 L 0 170 Z"
                  fill="url(#trendGradient)"
                ></path>
                {/* Trend Polyline */}
                <path
                  d="M 0 45 L 80 40 L 160 50 L 230 42 L 310 48 L 380 95 L 430 85 L 500 50 L 570 48 L 640 115 L 700 110"
                  fill="none"
                  stroke="#c0c1ff"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                ></path>
                {/* Event Marker 1: v3.2.1 Deployed (Day 16) */}
                <circle cx="380" cy="95" fill="#0f131d" r="4" stroke="#4cd7f6" strokeWidth="2.5"></circle>
                <line stroke="#4cd7f6" strokeDasharray="2 2" strokeWidth="1" x1="380" x2="380" y1="95" y2="35"></line>
                {/* Event Marker 2: Drift Detected (Day 27) */}
                <circle cx="640" cy="115" fill="#0f131d" r="4" stroke="#ffb4ab" strokeWidth="2.5"></circle>
                <line stroke="#ffb4ab" strokeDasharray="2 2" strokeWidth="1" x1="640" x2="640" y1="115" y2="60"></line>
              </svg>
              {/* Annotations Placed Over Chart */}
              <div className="absolute top-1 left-[50%] -translate-x-1/2 bg-surface-container-lowest px-2 py-1 rounded shadow-sm flex items-center gap-1 pointer-events-none border border-outline-variant/30">
                <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span>
                <span className="font-label-mono-sm text-label-mono-sm text-on-surface text-[11px]">
                  Day 16: v3.2.1 Deployed
                </span>
              </div>
              <div className="absolute top-8 right-[4%] bg-surface-container-lowest px-2 py-1 rounded shadow-sm flex items-center gap-1 pointer-events-none border border-outline-variant/30">
                <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                <span className="font-label-mono-sm text-label-mono-sm text-error text-[11px]">
                  Day 27: Drift Detected
                </span>
              </div>
            </div>

            {/* Axis Labels */}
            <div className="flex items-center justify-between text-outline font-label-mono-sm text-label-mono-sm mt-space-sm pt-space-xs text-[11px]">
              <span>30 days ago</span>
              <span>15 days ago</span>
              <span>7 days ago</span>
              <span>Today (Live)</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-space-sm mt-space-md pt-space-sm bg-surface-container-low p-space-sm rounded-lg">
            <div className="flex items-center gap-space-md text-body-sm font-body-sm text-on-surface-variant text-[12px]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-primary"></span>Fleet Health (0-100)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-tertiary"></span>Deployment Event
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-error"></span>Anomaly Trigger
              </span>
            </div>
            <button
              onClick={() => {
                if (onNavigateTab) onNavigateTab("health-and-drift");
              }}
              className="font-label-mono-sm text-label-mono-sm text-primary hover:text-on-surface flex items-center gap-1 text-[12px] transition-colors"
            >
              <span>View Detailed Telemetry</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>

      {/* Recent Monitoring Activity Table Section */}
      <div className="bg-surface-container rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden flex flex-col">
        {/* Table Header Toolbar & Filters */}
        <div className="p-space-lg flex flex-col md:flex-row md:items-center justify-between gap-space-md">
          <div className="flex flex-col">
            <h3 className="font-headline-md text-headline-md text-on-surface font-semibold tracking-tight">
              Recent Monitoring Activity
            </h3>
            <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant text-[11px]">
              Scheduled continuous evaluation across distributed inference pods
            </span>
          </div>

          {/* Filters and Search */}
          <div className="flex flex-wrap items-center gap-space-sm">
            {/* Search Input */}
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-2.5 text-outline text-[16px]">
                search
              </span>
              <input
                className="bg-surface-container-low border border-outline-variant/30 rounded-lg pl-8 pr-3 py-1.5 text-body-sm font-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary w-48 lg:w-56 transition-all text-[13px]"
                id="fleet-table-search"
                placeholder="Filter model, action..."
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
              />
            </div>
            {/* Filter Chips */}
            <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-lg border border-outline-variant/20">
              {[
                { id: "all", label: `All (${allModels.length})` },
                { id: "critical", label: "Critical (2)" },
                { id: "drift", label: "Drift Detected (6)" },
                { id: "auto", label: "Auto Mode" },
              ].map((chip) => {
                const isActive = activeFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    onClick={() => setActiveFilter(chip.id)}
                    className={`filter-chip px-2.5 py-1 rounded font-label-mono-sm text-[11px] font-medium transition-colors ${
                      isActive
                        ? "bg-surface-container-high text-primary font-semibold"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Table Container with Horizontal Scroll */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/70 text-outline font-label-mono-sm text-label-mono-sm uppercase tracking-wider text-[11px] border-b border-outline-variant/20">
                <th className="py-space-sm px-space-lg font-medium">Model Name</th>
                <th className="py-space-sm px-space-md font-medium">Health Status</th>
                <th className="py-space-sm px-space-md font-medium">Performance Metric</th>
                <th className="py-space-sm px-space-md font-medium">Drift Status</th>
                <th className="py-space-sm px-space-md font-medium">Label Availability</th>
                <th className="py-space-sm px-space-md font-medium">Recommended Action</th>
                <th className="py-space-sm px-space-md font-medium">Timestamp</th>
                <th className="py-space-sm px-space-lg font-medium text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y-0" id="fleet-table-body">
              {filteredModels.map((row) => {
                const isCritical = row.healthTier === "critical";
                const isWarning = row.healthTier === "warning";
                const isHealthy = row.healthTier === "healthy";

                return (
                  <tr
                    key={row.id + row.name}
                    onClick={() => {
                      if (onSelectUnit) onSelectUnit(row.id);
                    }}
                    className="hover:bg-surface-container-high/40 transition-colors group cursor-pointer border-b border-outline-variant/10"
                  >
                    <td className="py-space-md px-space-lg">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-headline-sm text-body-md font-semibold text-on-surface group-hover:text-primary transition-colors text-[14px]">
                            {row.name}
                          </span>
                          {row.badge && (
                            <span className="px-1.5 py-0.2 rounded bg-surface-container-highest text-outline font-label-mono-sm text-[9px] uppercase font-bold">
                              {row.badge}
                            </span>
                          )}
                        </div>
                        <span className="font-label-mono-sm text-label-mono-sm text-outline text-[11px]">
                          {row.version} · {row.framework}
                        </span>
                      </div>
                    </td>

                    <td className="py-space-md px-space-md">
                      <div
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-label-mono-sm text-[11px] font-semibold ${
                          isCritical
                            ? "bg-error-container text-on-error-container"
                            : isWarning
                            ? "bg-surface-container-highest text-secondary"
                            : "bg-surface-container-highest text-tertiary"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isCritical
                              ? "bg-error animate-pulse"
                              : isWarning
                              ? "bg-secondary"
                              : "bg-tertiary"
                          }`}
                        ></span>
                        <span>{row.healthStatus}</span>
                      </div>
                    </td>

                    <td className="py-space-md px-space-md">
                      <div
                        className={`flex items-center gap-1 font-label-mono-sm text-[12px] font-medium ${
                          isCritical
                            ? "text-error"
                            : isWarning
                            ? "text-secondary"
                            : "text-tertiary"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          {row.metricDirection === "down"
                            ? "arrow_downward"
                            : row.metricDirection === "up"
                            ? "arrow_upward"
                            : "trending_flat"}
                        </span>
                        <span>{row.metric}</span>
                        {row.metricOld && (
                          <span className="text-outline line-through text-[10px] ml-1">
                            {row.metricOld}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-space-md px-space-md">
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 bg-surface-container-lowest h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              row.driftTier === "critical"
                                ? "bg-error"
                                : row.driftTier === "warning"
                                ? "bg-secondary"
                                : "bg-tertiary"
                            }`}
                            style={{ width: `${row.driftPercent}%` }}
                          ></div>
                        </div>
                        <span
                          className={`font-label-mono-sm text-[11px] ${
                            row.driftTier === "critical"
                              ? "text-error"
                              : row.driftTier === "warning"
                              ? "text-secondary"
                              : "text-tertiary"
                          }`}
                        >
                          {row.driftText}
                        </span>
                      </div>
                    </td>

                    <td className="py-space-md px-space-md">
                      <span
                        className={`font-label-mono-sm text-[11px] flex items-center gap-1 ${
                          row.labelTier === "healthy"
                            ? "text-tertiary"
                            : row.labelTier === "warning"
                            ? "text-secondary"
                            : "text-outline"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {row.labelTier === "healthy"
                            ? "check"
                            : row.labelTier === "warning"
                            ? "schedule"
                            : "cancel"}
                        </span>
                        <span>{row.labelStatus}</span>
                      </span>
                    </td>

                    <td className="py-space-md px-space-md">
                      <span
                        className={`px-2 py-0.5 rounded font-label-mono-sm text-[11px] ${
                          row.actionTier === "critical"
                            ? "bg-error-container/40 text-error"
                            : row.actionTier === "warning"
                            ? "bg-surface-container-highest text-secondary"
                            : row.actionTier === "healthy"
                            ? "bg-surface-container-highest text-tertiary"
                            : "bg-surface-container-highest text-outline"
                        }`}
                      >
                        {row.actionText}
                      </span>
                    </td>

                    <td className="py-space-md px-space-md font-label-mono-sm text-[11px] text-on-surface-variant">
                      {row.timestamp}
                    </td>

                    <td className="py-space-md px-space-lg text-right">
                      <button className="p-1 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-primary transition-colors">
                        <span className="material-symbols-outlined text-[18px]">
                          chevron_right
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table Footer / Pagination */}
        <div className="p-space-md bg-surface-container-low/50 flex flex-col sm:flex-row items-center justify-between gap-space-sm border-t border-outline-variant/20">
          <span className="font-label-mono-sm text-label-mono-sm text-on-surface-variant text-[11px]">
            Showing {filteredModels.length} of {Math.max(24, allModels.length)} registered models
          </span>
          <div className="flex items-center gap-space-xs">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              className="px-3 py-1 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface rounded font-label-mono-sm text-[11px] transition-colors"
            >
              Previous
            </button>
            {[1, 2, 3].map((p) => (
              <button
                key={p}
                onClick={() => setCurrentPage(p)}
                className={`px-2.5 py-1 rounded font-label-mono-sm text-[11px] transition-colors ${
                  currentPage === p
                    ? "bg-primary text-on-primary font-bold"
                    : "bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant"
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(Math.min(3, currentPage + 1))}
              className="px-3 py-1 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface rounded font-label-mono-sm text-[11px] transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Register New Monitoring Unit */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-surface-container border border-outline-variant/40 rounded-xl shadow-2xl max-w-md w-full p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">
                  add_circle
                </span>
                <h3 className="font-headline-sm text-[16px] font-bold text-on-surface">
                  Register New Model Unit
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-outline hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex flex-col gap-3">
              <div>
                <label className="font-label-mono-sm text-[11px] text-on-surface-variant uppercase tracking-wider block mb-1">
                  Model Unit Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. LLM Reranker or LTV Predictor"
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-[13px] text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-label-mono-sm text-[11px] text-on-surface-variant uppercase tracking-wider block mb-1">
                    Task Type
                  </label>
                  <select
                    value={newTaskType}
                    onChange={(e) => setNewTaskType(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-[13px] text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option value="classification">Classification</option>
                    <option value="multiclass">Multiclass</option>
                    <option value="regression">Regression</option>
                  </select>
                </div>
                <div>
                  <label className="font-label-mono-sm text-[11px] text-on-surface-variant uppercase tracking-wider block mb-1">
                    Target Column
                  </label>
                  <input
                    type="text"
                    required
                    value={newTargetCol}
                    onChange={(e) => setNewTargetCol(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-[13px] text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-label-mono-sm text-[11px] text-on-surface-variant uppercase tracking-wider block mb-1">
                    Promotion Policy
                  </label>
                  <select
                    value={newPromotionMode}
                    onChange={(e) => setNewPromotionMode(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-[13px] text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option value="AUTO">AUTO (Auto Deploy)</option>
                    <option value="ASSISTED">ASSISTED (Staged)</option>
                    <option value="MANUAL">MANUAL (Advisory)</option>
                  </select>
                </div>
                <div>
                  <label className="font-label-mono-sm text-[11px] text-on-surface-variant uppercase tracking-wider block mb-1">
                    Owner / Team
                  </label>
                  <input
                    type="text"
                    value={newOwner}
                    onChange={(e) => setNewOwner(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-[13px] text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-outline-variant/20 mt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-1.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant rounded-lg font-label-mono-sm text-[12px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-primary hover:bg-primary-container text-on-primary font-bold rounded-lg font-label-mono-sm text-[12px]"
                >
                  Confirm Registration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
