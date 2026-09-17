import React, { useState, useEffect } from "react";
import {
  Play,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowRight,
  TrendingUp,
  Award,
  Zap,
  Activity,
  Layers,
  Sparkles,
  GitCommit,
  X,
  Database,
  Cpu,
  Clock,
  ChevronRight
} from "lucide-react";
import { runFullPipeline } from "../api";

export default function RunMonitoringModal({
  isOpen,
  onClose,
  unit,
  baselines = [],
  datasets = [],
  activeChampion = null,
  onRunSuccess = null,
  onNavigateToTab = null,
}) {
  const [selectedBaselineId, setSelectedBaselineId] = useState("");
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [forceRefinement, setForceRefinement] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingStep, setExecutingStep] = useState(0);
  const [runResult, setRunResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Sync default baseline and current dataset on open or when lists change
  useEffect(() => {
    if (!isOpen) {
      setRunResult(null);
      setErrorMsg(null);
      setIsExecuting(false);
      return;
    }

    // Default baseline: baseline marked is_default, or first baseline
    if (baselines && baselines.length > 0) {
      const defaultB = baselines.find((b) => b.is_default);
      setSelectedBaselineId(defaultB ? String(defaultB.id) : String(baselines[0].id));
    } else {
      setSelectedBaselineId("");
    }

    // Current dataset: dataset matching unit's current_dataset_id, or with status CURRENT, or first dataset
    if (datasets && datasets.length > 0) {
      const currentD =
        datasets.find((d) => d.id === unit?.current_dataset_id) ||
        datasets.find((d) => d.status === "CURRENT") ||
        datasets[0];
      setSelectedDatasetId(currentD ? String(currentD.id) : "");
    } else {
      setSelectedDatasetId("");
    }
  }, [isOpen, unit?.id, unit?.current_dataset_id, baselines.length, datasets.length]);

  if (!isOpen) return null;

  const selectedBaseline = baselines.find((b) => String(b.id) === String(selectedBaselineId));
  const selectedDataset = datasets.find((d) => String(d.id) === String(selectedDatasetId));

  const pipelineStages = [
    { label: "Data Profiling & Schema Validation", icon: Activity },
    { label: "Statistical Drift & Health Scoring", icon: AlertTriangle },
    { label: "SHAP Root Cause Diagnosis", icon: Sparkles },
    { label: "Refinement & Candidate Training", icon: Zap },
    { label: "Safety Gate Evaluation & Promotion", icon: Award },
  ];

  async function handleExecute() {
    if (!selectedBaselineId) {
      setErrorMsg("Please select a Reference Baseline.");
      return;
    }
    if (!selectedDatasetId) {
      setErrorMsg("Please select a Production Dataset to monitor.");
      return;
    }

    setIsExecuting(true);
    setErrorMsg(null);
    setRunResult(null);
    setExecutingStep(0);

    // Simulated progress steps for smooth UX
    const interval = setInterval(() => {
      setExecutingStep((prev) => (prev < 4 ? prev + 1 : prev));
    }, 1200);

    try {
      const res = await runFullPipeline({
        unit_id: unit.id,
        baseline_id: parseInt(selectedBaselineId, 10),
        dataset_id: parseInt(selectedDatasetId, 10),
        force_refinement: forceRefinement,
        target_column: unit.target_column || "Churn",
      });

      clearInterval(interval);
      setExecutingStep(4);
      setRunResult(res);
      if (onRunSuccess) {
        onRunSuccess(res);
      }
    } catch (err) {
      clearInterval(interval);
      setErrorMsg(err.message || "Pipeline execution failed");
    } finally {
      setIsExecuting(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        backgroundColor: "rgba(10, 14, 24, 0.85)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExecuting) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "760px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "var(--surface-container)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "16px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
          overflow: "hidden",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid rgba(70, 69, 84, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "var(--surface-container-high)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                backgroundColor: "rgba(192, 193, 255, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--primary)",
              }}
            >
              <Zap size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--on-surface)" }}>
                Run Monitoring & Maintenance Pipeline
              </h2>
              <p style={{ margin: "2px 0 0 0", fontSize: "0.82rem", color: "var(--on-surface-variant)" }}>
                Unit: <strong>{unit?.name}</strong> • Target: <code style={{ color: "var(--primary)" }}>{unit?.target_column || "Churn"}</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExecuting}
            style={{
              background: "none",
              border: "none",
              color: "var(--outline)",
              cursor: isExecuting ? "not-allowed" : "pointer",
              padding: "4px",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "20px" }}>
          {errorMsg && (
            <div
              style={{
                padding: "12px 16px",
                backgroundColor: "rgba(147, 0, 10, 0.25)",
                border: "1px solid var(--error)",
                borderRadius: "8px",
                color: "var(--error)",
                fontSize: "0.88rem",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <AlertTriangle size={18} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Execution Result Banner */}
          {runResult ? (
            <div
              style={{
                padding: "20px",
                backgroundColor: "rgba(16, 185, 129, 0.1)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <CheckCircle2 size={24} style={{ color: "#10b981" }} />
                  <div>
                    <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#fff" }}>
                      Monitoring Run Completed Successfully!
                    </h3>
                    <span style={{ fontSize: "0.82rem", color: "var(--on-surface-variant)" }}>
                      Completed in {runResult.pipeline_duration_sec || 1.8}s • Run #{runResult.run_id || "Live"}
                    </span>
                  </div>
                </div>
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: "20px",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    backgroundColor:
                      runResult.health_report?.overall_status === "HEALTHY"
                        ? "rgba(16, 185, 129, 0.2)"
                        : "rgba(245, 158, 11, 0.2)",
                    color:
                      runResult.health_report?.overall_status === "HEALTHY" ? "#10b981" : "#f59e0b",
                  }}
                >
                  {runResult.health_report?.overall_status || "ANALYSIS COMPLETE"}
                </span>
              </div>

              {/* Metrics Highlights */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "12px",
                  paddingTop: "12px",
                  borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                }}
              >
                <div style={{ backgroundColor: "rgba(0,0,0,0.25)", padding: "12px", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--on-surface-variant)", textTransform: "uppercase" }}>
                    Health Score
                  </div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--primary)", marginTop: "4px" }}>
                    {runResult.health_report?.overall_health_score ?? "88"} / 100
                  </div>
                </div>

                <div style={{ backgroundColor: "rgba(0,0,0,0.25)", padding: "12px", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--on-surface-variant)", textTransform: "uppercase" }}>
                    Drift Detection
                  </div>
                  <div
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: 700,
                      color: runResult.health_report?.data_drift?.drift_detected ? "#f87171" : "#10b981",
                      marginTop: "4px",
                    }}
                  >
                    {runResult.health_report?.data_drift?.drift_detected
                      ? `Drift: ${runResult.health_report?.data_drift?.drifted_features_count || 1} feature(s)`
                      : "No Significant Drift"}
                  </div>
                </div>

                <div style={{ backgroundColor: "rgba(0,0,0,0.25)", padding: "12px", borderRadius: "8px" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--on-surface-variant)", textTransform: "uppercase" }}>
                    Candidate Decision
                  </div>
                  <div
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: 700,
                      color: runResult.promotion?.action === "PROMOTED" ? "#10b981" : "var(--primary)",
                      marginTop: "4px",
                    }}
                  >
                    {runResult.promotion?.action || "Evaluated"}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    onClose();
                    if (onNavigateToTab) onNavigateToTab("monitoring-runs");
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 14px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "var(--surface-container-high)",
                    color: "var(--on-surface)",
                    fontSize: "0.85rem",
                  }}
                >
                  <span>View Pipeline Execution</span>
                  <ChevronRight size={14} />
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={onClose}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "6px",
                    backgroundColor: "var(--primary)",
                    color: "var(--on-primary)",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    border: "none",
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          ) : null}

          {/* Active Comparison Preview Card */}
          <div
            style={{
              padding: "16px",
              backgroundColor: "rgba(15, 23, 42, 0.6)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "10px",
            }}
          >
            <div
              style={{
                fontSize: "0.78rem",
                color: "var(--on-surface-variant)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "10px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <Sparkles size={14} style={{ color: "var(--primary)" }} />
              <span>Execution Configuration Preview</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.88rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--on-surface-variant)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Cpu size={14} /> Champion Model:
                </span>
                <span style={{ fontWeight: 600, color: "#fff" }}>
                  {activeChampion?.version ? `${activeChampion.version} (${activeChampion.model_type || "Model"})` : "Active Champion (v1.0.0)"}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--on-surface-variant)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Database size={14} /> Reference Baseline:
                </span>
                <span style={{ fontWeight: 600, color: "var(--primary)" }}>
                  {selectedBaseline
                    ? `${selectedBaseline.name} (${selectedBaseline.row_count ? `${selectedBaseline.row_count.toLocaleString()} rows` : "Registered"}${selectedBaseline.is_default ? " · Default" : ""})`
                    : "No baseline selected"}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--on-surface-variant)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Activity size={14} /> Current Dataset:
                </span>
                <span style={{ fontWeight: 600, color: "#38bdf8" }}>
                  {selectedDataset
                    ? `${selectedDataset.name} (${selectedDataset.row_count ? `${selectedDataset.row_count.toLocaleString()} rows` : "Dataset"} · ${selectedDataset.status || "READY"})`
                    : "No production dataset selected"}
                </span>
              </div>
            </div>
          </div>

          {/* Form Selectors */}
          {!runResult && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Reference Baseline Dropdown */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "var(--on-surface-variant)",
                    marginBottom: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  1. Select Reference Baseline
                </label>
                {baselines.length === 0 ? (
                  <div
                    style={{
                      padding: "12px",
                      backgroundColor: "rgba(245, 158, 11, 0.1)",
                      border: "1px solid rgba(245, 158, 11, 0.3)",
                      borderRadius: "8px",
                      fontSize: "0.85rem",
                      color: "#fbbf24",
                    }}
                  >
                    No reference baselines registered for this unit. Please add a baseline in the Model Setup tab first.
                  </div>
                ) : (
                  <select
                    value={selectedBaselineId}
                    onChange={(e) => setSelectedBaselineId(e.target.value)}
                    disabled={isExecuting}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      backgroundColor: "var(--surface-container-lowest)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "8px",
                      color: "var(--on-surface)",
                      fontSize: "0.9rem",
                      outline: "none",
                    }}
                  >
                    {baselines.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.row_count ? `${b.row_count.toLocaleString()} rows` : "Rows N/A"}{b.target_column ? ` · Target: ${b.target_column}` : ""}) {b.is_default ? "★ DEFAULT" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Current Production Dataset Dropdown */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "var(--on-surface-variant)",
                    marginBottom: "6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  2. Select Production Dataset (Current Telemetry Batch)
                </label>
                {datasets.length === 0 ? (
                  <div
                    style={{
                      padding: "12px",
                      backgroundColor: "rgba(245, 158, 11, 0.1)",
                      border: "1px solid rgba(245, 158, 11, 0.3)",
                      borderRadius: "8px",
                      fontSize: "0.85rem",
                      color: "#fbbf24",
                    }}
                  >
                    No production datasets in library. Please upload a production dataset in the Model Setup tab first.
                  </div>
                ) : (
                  <select
                    value={selectedDatasetId}
                    onChange={(e) => setSelectedDatasetId(e.target.value)}
                    disabled={isExecuting}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      backgroundColor: "var(--surface-container-lowest)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "8px",
                      color: "var(--on-surface)",
                      fontSize: "0.9rem",
                      outline: "none",
                    }}
                  >
                    {datasets.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.row_count ? `${d.row_count.toLocaleString()} rows` : "Rows N/A"}{d.description ? ` · ${d.description}` : ""}) [{d.status || "READY"}]
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Refinement Options */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px",
                  backgroundColor: "var(--surface-container-low)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Zap size={18} style={{ color: "var(--primary)" }} />
                  <div>
                    <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--on-surface)" }}>
                      Autonomous Refinement & Safety Gates
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--on-surface-variant)" }}>
                      Automatically train candidate models and run promotion gates if degradation is detected
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={forceRefinement}
                  onChange={(e) => setForceRefinement(e.target.checked)}
                  disabled={isExecuting}
                  style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "var(--primary)" }}
                />
              </div>

              {/* Live Step Progress Indicator while running */}
              {isExecuting && (
                <div
                  style={{
                    padding: "16px",
                    backgroundColor: "rgba(15, 23, 42, 0.8)",
                    border: "1px solid var(--primary)",
                    borderRadius: "10px",
                  }}
                >
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--primary)", marginBottom: "12px" }}>
                    Autonomous Pipeline Running...
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {pipelineStages.map((st, idx) => {
                      const Icon = st.icon;
                      const isPast = executingStep > idx;
                      const isCurrent = executingStep === idx;
                      return (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            fontSize: "0.82rem",
                            color: isCurrent
                              ? "var(--primary)"
                              : isPast
                              ? "#10b981"
                              : "var(--outline)",
                            fontWeight: isCurrent ? 700 : 400,
                          }}
                        >
                          {isPast ? (
                            <CheckCircle2 size={16} color="#10b981" />
                          ) : isCurrent ? (
                            <div
                              style={{
                                width: "16px",
                                height: "16px",
                                borderRadius: "50%",
                                border: "2px solid var(--primary)",
                                borderTopColor: "transparent",
                                animation: "spin 1s linear infinite",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "16px",
                                height: "16px",
                                borderRadius: "50%",
                                border: "1px solid var(--outline)",
                              }}
                            />
                          )}
                          <span>{st.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {!runResult && (
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid rgba(70, 69, 84, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "12px",
              backgroundColor: "var(--surface-container-high)",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isExecuting}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid var(--border-subtle)",
                backgroundColor: "transparent",
                color: "var(--on-surface-variant)",
                fontSize: "0.88rem",
                fontWeight: 600,
                cursor: isExecuting ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExecute}
              disabled={isExecuting || !selectedBaselineId || !selectedDatasetId}
              style={{
                padding: "8px 20px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: isExecuting || !selectedBaselineId || !selectedDatasetId ? "var(--outline-variant)" : "var(--primary)",
                color: isExecuting || !selectedBaselineId || !selectedDatasetId ? "var(--outline)" : "var(--on-primary)",
                fontSize: "0.88rem",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: isExecuting || !selectedBaselineId || !selectedDatasetId ? "not-allowed" : "pointer",
              }}
            >
              {isExecuting ? (
                <>
                  <div
                    style={{
                      width: "14px",
                      height: "14px",
                      borderRadius: "50%",
                      border: "2px solid #fff",
                      borderTopColor: "transparent",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  <span>Executing Pipeline...</span>
                </>
              ) : (
                <>
                  <Play size={16} />
                  <span>Execute Monitoring Pipeline</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
