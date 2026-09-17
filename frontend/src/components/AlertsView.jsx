import React, { useState, useEffect } from "react";
import { fetchAlerts } from "../api";

export default function AlertsView({ selectedUnitId, onNavigateTab }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await fetchAlerts(selectedUnitId);
        setAlerts(data || []);
      } catch (e) {
        console.error("Alerts fetch failed:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [selectedUnitId]);

  const fallbackAlerts = [
    {
      id: 1,
      unit_id: 1,
      model_name: "Customer Churn Model",
      alert_type: "PERFORMANCE_DEGRADATION",
      severity: "CRITICAL",
      message: "F1 decreased from 0.81 → 0.74 (-8.6%) over the last 6-hour evaluation cycle.",
      root_cause: "Covariate feature shift in tenure, Contract, and MonthlyCharges.",
      status: "OPEN",
      created_at: "12 min ago",
      action: "Retraining & Hyperparameter Search Mandated",
    },
    {
      id: 2,
      unit_id: 2,
      model_name: "Fraud Detection Model",
      alert_type: "FEATURE_DRIFT",
      severity: "WARNING",
      message: "Covariate shift in ip_geo_velocity and card_bin_country. P99 latency up +14ms.",
      root_cause: "High-frequency card transaction bins distribution anomaly.",
      status: "INVESTIGATING",
      created_at: "28 min ago",
      action: "Proxy Anomaly Threshold Shift",
    },
    {
      id: 3,
      unit_id: 4,
      model_name: "Credit Risk Scoring",
      alert_type: "PREDICTION_DRIFT",
      severity: "WARNING",
      message: "Prediction distribution shift detected. Labels unavailable (72h delayed).",
      root_cause: "Macroeconomic interest rate adjustment in borrower sample.",
      status: "ACKNOWLEDGED",
      created_at: "2 hours ago",
      action: "Evaluate Unsupervised Proxy Confidence",
    },
  ];

  const displayedAlerts = alerts.length > 0 ? alerts : fallbackAlerts;

  return (
    <div className="flex flex-col w-full gap-space-xl">
      <div className="flex flex-col gap-space-xxs">
        <div className="flex items-center gap-space-xs text-on-surface-variant font-label-mono-sm text-label-mono-sm tracking-wider uppercase text-[11px]">
          <span>Monitoring</span>
          <span className="text-outline">/</span>
          <span className="text-primary font-semibold">Operational Alerts</span>
        </div>
        <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight font-bold">
          Operational Alert Center
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Autonomous safety triggers, performance decays, and data drift incidents requiring engineering attention.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter-normal">
        <div className="p-space-md rounded-xl bg-surface-container border border-error/30 shadow-sm flex items-center justify-between">
          <div>
            <span className="font-label-mono-sm text-error uppercase text-[11px]">Critical Alerts</span>
            <div className="text-[28px] font-bold text-error">1</div>
          </div>
          <span className="material-symbols-outlined text-error text-[28px]">crisis_alert</span>
        </div>
        <div className="p-space-md rounded-xl bg-surface-container border border-secondary/30 shadow-sm flex items-center justify-between">
          <div>
            <span className="font-label-mono-sm text-secondary uppercase text-[11px]">Warning Triggers</span>
            <div className="text-[28px] font-bold text-secondary">2</div>
          </div>
          <span className="material-symbols-outlined text-secondary text-[28px]">warning</span>
        </div>
        <div className="p-space-md rounded-xl bg-surface-container border border-tertiary/30 shadow-sm flex items-center justify-between">
          <div>
            <span className="font-label-mono-sm text-tertiary uppercase text-[11px]">Resolved Today</span>
            <div className="text-[28px] font-bold text-tertiary">5</div>
          </div>
          <span className="material-symbols-outlined text-tertiary text-[28px]">task_alt</span>
        </div>
      </div>

      <div className="bg-surface-container rounded-xl border border-outline-variant/30 shadow-md overflow-hidden">
        <div className="p-space-md border-b border-outline-variant/20 flex items-center justify-between">
          <h2 className="font-headline-sm text-on-surface font-semibold text-[16px]">Active Incident Stream</h2>
          <span className="font-label-mono-sm text-on-surface-variant text-[11px]">Auto-refreshing (12s interval)</span>
        </div>

        <div className="divide-y divide-outline-variant/10">
          {displayedAlerts.map((alt) => {
            const isCrit = alt.severity === "CRITICAL";
            return (
              <div key={alt.id} className="p-space-lg flex flex-col gap-space-sm hover:bg-surface-container-high/30 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-space-sm">
                    <span className={`px-2 py-0.5 rounded font-label-mono-sm text-[11px] font-bold ${
                      isCrit ? "bg-error-container text-on-error-container" : "bg-surface-container-highest text-secondary"
                    }`}>
                      {alt.severity}
                    </span>
                    <span className="font-headline-sm text-on-surface font-semibold text-[15px]">
                      {alt.model_name || `Unit #${alt.unit_id}`}
                    </span>
                    <span className="font-label-mono-sm text-outline text-[11px]">
                      {alt.alert_type}
                    </span>
                  </div>
                  <span className="font-label-mono-sm text-on-surface-variant text-[11px]">
                    {alt.created_at || "Just now"}
                  </span>
                </div>

                <p className="text-body-md text-on-surface text-[13px] leading-relaxed">
                  {alt.message}
                </p>

                {alt.root_cause && (
                  <div className="p-space-sm rounded-lg bg-surface-container-low border border-outline-variant/20 flex items-center gap-space-xs text-[12px]">
                    <span className="material-symbols-outlined text-primary text-[16px]">psychology</span>
                    <span className="text-on-surface-variant">Root Cause:</span>
                    <span className="text-on-surface font-medium">{alt.root_cause}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-space-xs">
                  <span className="font-label-mono-sm text-tertiary text-[11px]">
                    Prescribed Action: {alt.action || "Retrain with balanced sampling"}
                  </span>
                  <div className="flex items-center gap-space-xs">
                    <button
                      onClick={() => onNavigateTab("model-maintenance")}
                      className="px-3 py-1 bg-primary hover:bg-primary-container text-on-primary rounded font-label-mono-sm text-[11px] font-bold"
                    >
                      Remediate
                    </button>
                    <button
                      onClick={() => onNavigateTab("models")}
                      className="px-3 py-1 bg-surface-container-high hover:bg-surface-container-highest text-on-surface rounded font-label-mono-sm text-[11px]"
                    >
                      View Telemetry
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
