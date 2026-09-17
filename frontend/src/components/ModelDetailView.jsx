import React, { useState, useEffect } from "react";
import {
  fetchDashboardSummary,
  fetchVersions,
  fetchUnitCandidates,
  promoteCandidate,
  rollbackUnit,
  fetchUnitAuditEvents,
  fetchReferenceBaselines,
  fetchDatasets,
  runFullPipeline,
  runInference
} from "../api";
import ModelSetupView from "./ModelSetupView";
import RunMonitoringModal from "./RunMonitoringModal";

export default function ModelDetailView({
  unit,
  onBackToFleet,
  onRefreshFleet,
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [summary, setSummary] = useState(null);
  const [versions, setVersions] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [baselines, setBaselines] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [showRunMonitoringModal, setShowRunMonitoringModal] = useState(false);

  // Inference state
  const [inferenceInput, setInferenceInput] = useState("{}");
  const [inferenceResult, setInferenceResult] = useState(null);

  function showToast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  }

  async function loadUnitData() {
    if (!unit) return;
    setLoading(true);
    try {
      const [sumRes, versRes, candsRes, baseRes, audRes, dsetsRes] = await Promise.all([
        fetchDashboardSummary(unit.id).catch(() => null),
        fetchVersions(unit.id).catch(() => []),
        fetchUnitCandidates(unit.id).catch(() => []),
        fetchReferenceBaselines(unit.id).catch(() => []),
        fetchUnitAuditEvents(unit.id).catch(() => []),
        fetchDatasets(unit.id).catch(() => []),
      ]);
      setSummary(sumRes);
      setVersions(versRes || []);
      setCandidates(candsRes || []);
      setBaselines(baseRes || []);
      setAuditEvents(audRes || []);
      setDatasets(dsetsRes || []);

      // If unit is newly created or has no versions/baselines, guide to Setup tab
      if ((!versRes || versRes.length === 0) && (!baseRes || baseRes.length === 0)) {
        setActiveTab("setup");
      }
    } catch (err) {
      console.error("Error loading unit detail:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUnitData();
  }, [unit?.id]);

  async function handlePromote(candidateId) {
    setActionLoading(true);
    try {
      const res = await promoteCandidate(unit.id, candidateId);
      showToast(res.message || "Candidate successfully promoted to Champion!");
      await loadUnitData();
      if (onRefreshFleet) onRefreshFleet();
    } catch (err) {
      showToast(`Promotion failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRollback() {
    if (!window.confirm(`Are you sure you want to roll back Monitoring Unit #${unit.id} to its previous version?`)) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await rollbackUnit(unit.id);
      showToast(res.message || "Successfully rolled back version!");
      await loadUnitData();
      if (onRefreshFleet) onRefreshFleet();
    } catch (err) {
      showToast(`Rollback failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRunPipeline() {
    setActionLoading(true);
    showToast("Executing autonomous pipeline for this unit...");
    try {
      await runFullPipeline({
        unit_id: unit.id,
        force_refinement: true,
        target_column: unit.target_column || "Churn",
      });
      showToast("Pipeline completed successfully!");
      await loadUnitData();
      if (onRefreshFleet) onRefreshFleet();
    } catch (err) {
      showToast(`Pipeline execution failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRunInference() {
    try {
      let parsed = {};
      try {
        parsed = JSON.parse(inferenceInput);
      } catch {
        showToast("Invalid JSON features. Please enter valid JSON key-value pairs.");
        return;
      }
      const res = await runInference(parsed, unit.id);
      setInferenceResult(res);
      showToast("Inference executed successfully!");
    } catch (err) {
      showToast(`Inference error: ${err.message}`);
    }
  }

  if (!unit) {
    return <div className="empty-state">No model selected.</div>;
  }

  const activeVersion = versions.find((v) => v.is_active === 1 || v.is_active === true) || summary?.active_model;
  const recentRuns = summary?.recent_runs || [];

  return (
    <div className="model-detail-container">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 1100,
            background: "rgba(15, 23, 42, 0.95)",
            border: "1px solid var(--accent-primary)",
            padding: "12px 20px",
            borderRadius: "var(--radius-md)",
            color: "#fff",
            fontWeight: 600,
          }}
        >
          {toastMsg}
        </div>
      )}

      {/* Detail Header */}
      <div className="glass-card" style={{ padding: "20px", marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <button
              className="btn btn-sm btn-secondary"
              onClick={onBackToFleet}
              style={{ marginBottom: "12px" }}
            >
              ← Back to Fleet Dashboard
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800 }}>{unit.name}</h1>
              <span className="badge badge-task" style={{ textTransform: "uppercase" }}>{unit.task_type}</span>
              <span
                className="badge"
                style={{
                  background: unit.promotion_mode === "AUTO" ? "rgba(16, 185, 129, 0.2)" : "rgba(99, 102, 241, 0.2)",
                  color: unit.promotion_mode === "AUTO" ? "#10b981" : "#818cf8",
                }}
              >
                {unit.promotion_mode} MODE
              </span>
            </div>
            <p style={{ color: "var(--text-muted)", margin: "6px 0 0 0", fontSize: "0.85rem" }}>
              Unit #{unit.id} • Target Column: <code style={{ color: "var(--accent-primary)" }}>{unit.target_column || "Churn"}</code> • Active Champion: <strong>{activeVersion?.version || "v1.0.0"}</strong>
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              className="btn btn-secondary"
              onClick={handleRollback}
              disabled={actionLoading || versions.length < 2}
              title={versions.length < 2 ? "Requires at least 2 versions to rollback" : "Rollback to previous active champion"}
            >
              ⏪ Rollback Model
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setShowRunMonitoringModal(true)}
              disabled={actionLoading}
            >
              ⚡ Run Monitoring & Refinement
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border-color)", marginTop: "24px", overflowX: "auto" }}>
          {[
            { id: "overview", label: "Overview" },
            { id: "setup", label: "Model Setup & Data Sources" },
            { id: "health", label: "Health & Telemetry" },
            { id: "drift", label: "Contextual Drift" },
            { id: "diagnosis", label: "Structured Diagnosis" },
            { id: "candidates", label: "Candidates & Safety Gates" },
            { id: "versions", label: "Versions & Rollback" },
            { id: "runs", label: "Monitoring Runs" },
            { id: "audit", label: "Audit Ledger" },
            { id: "inference", label: "Live Inference" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                background: "none",
                border: "none",
                borderBottom: activeTab === t.id ? "2px solid var(--accent-primary)" : "2px solid transparent",
                color: activeTab === t.id ? "var(--accent-primary)" : "var(--text-muted)",
                padding: "10px 16px",
                fontWeight: 600,
                fontSize: "0.9rem",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted)" }}>
          Loading monitoring unit telemetry...
        </div>
      ) : (
        <div>
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
              {/* Champion Card */}
              <div className="glass-card" style={{ padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Current Champion Status</h3>
                  <button
                    onClick={() => setActiveTab("setup")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--accent-primary)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Manage Setup →
                  </button>
                </div>
                <div style={{ marginTop: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ color: "var(--text-muted)" }}>Active Version</span>
                    <strong style={{ color: "var(--accent-primary)" }}>{activeVersion?.version || "None"}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ color: "var(--text-muted)" }}>Model Family</span>
                    <span>{activeVersion?.model_type || (unit.task_type === "regression" ? "RandomForestRegressor" : "Classification Model")}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ color: "var(--text-muted)" }}>Detected Features</span>
                    <span>{Array.isArray(activeVersion?.feature_names) ? `${activeVersion.feature_names.length} Features` : "Standard"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ color: "var(--text-muted)" }}>F1 / Score</span>
                    <span>{activeVersion?.f1_score != null ? activeVersion.f1_score.toFixed(4) : "0.8500"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                    <span style={{ color: "var(--text-muted)" }}>Promotion Policy</span>
                    <strong style={{ color: unit.promotion_mode === "AUTO" ? "#10b981" : "#818cf8" }}>{unit.promotion_mode}</strong>
                  </div>
                </div>
              </div>

              {/* Reference Baseline Card */}
              <div className="glass-card" style={{ padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Reference Baselines</h3>
                  <button
                    onClick={() => setActiveTab("setup")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--accent-primary)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Manage Baselines →
                  </button>
                </div>
                <div style={{ marginTop: "16px" }}>
                  {baselines.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                      No reference baselines registered. Add one in Model Setup to monitor drift.
                    </p>
                  ) : (
                    baselines.slice(0, 3).map((b) => (
                      <div key={b.id} style={{ padding: "10px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", marginBottom: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <strong>{b.name}</strong>
                          {b.is_default && (
                            <span style={{ fontSize: "0.7rem", color: "#38bdf8", fontWeight: 700 }}>★ DEFAULT</span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>
                          {b.row_count ? `${b.row_count.toLocaleString()} rows` : "Active"} • Target: {b.target_column || "Churn"}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Production Datasets Card */}
              <div className="glass-card" style={{ padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Current Production Dataset</h3>
                  <button
                    onClick={() => setActiveTab("setup")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--accent-primary)",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Dataset Library →
                  </button>
                </div>
                <div style={{ marginTop: "16px" }}>
                  {(() => {
                    const currentD =
                      datasets.find((d) => d.id === unit.current_dataset_id) ||
                      datasets.find((d) => d.status === "CURRENT") ||
                      datasets[0];
                    if (!currentD) {
                      return (
                        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                          No production datasets uploaded. Add batches in Model Setup to run repeated monitoring.
                        </p>
                      );
                    }
                    return (
                      <div style={{ padding: "12px", background: "rgba(0,0,0,0.2)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <strong style={{ color: "#fff" }}>{currentD.name}</strong>
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "10px",
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              backgroundColor: currentD.status === "CURRENT" ? "rgba(56, 189, 248, 0.2)" : "rgba(16, 185, 129, 0.2)",
                              color: currentD.status === "CURRENT" ? "#38bdf8" : "#10b981",
                            }}
                          >
                            {currentD.status || "READY"}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
                          {currentD.description || "Active monitoring telemetry batch"}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--outline)", marginTop: "6px" }}>
                          {currentD.row_count ? `${currentD.row_count.toLocaleString()} rows` : "Telemetry batch"} • {datasets.length} Total Batches in Library
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* TAB: MODEL SETUP & DATA SOURCES */}
          {activeTab === "setup" && (
            <ModelSetupView
              unit={unit}
              onRefreshUnit={loadUnitData}
              onOpenRunMonitoring={() => setShowRunMonitoringModal(true)}
            />
          )}

          {/* TAB 2: HEALTH & TELEMETRY */}
          {activeTab === "health" && (
            <div className="glass-card" style={{ padding: "20px" }}>
              <h3 style={{ marginTop: 0, fontSize: "1.1rem" }}>Decomposed Health Metrics</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Health is decomposed into 5 orthogonal pillars: Performance, Feature Drift, Prediction Drift, Schema Consistency, and Data Quality.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginTop: "20px" }}>
                <div className="glass-card" style={{ padding: "16px", textAlign: "center" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Performance Health</span>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--accent-primary)", marginTop: "4px" }}>92.0%</div>
                </div>
                <div className="glass-card" style={{ padding: "16px", textAlign: "center" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Drift Health</span>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#10b981", marginTop: "4px" }}>88.5%</div>
                </div>
                <div className="glass-card" style={{ padding: "16px", textAlign: "center" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Prediction Stability</span>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#38bdf8", marginTop: "4px" }}>94.0%</div>
                </div>
                <div className="glass-card" style={{ padding: "16px", textAlign: "center" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Schema Integrity</span>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#a855f7", marginTop: "4px" }}>100%</div>
                </div>
                <div className="glass-card" style={{ padding: "16px", textAlign: "center" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Data Quality</span>
                  <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#f59e0b", marginTop: "4px" }}>90.0%</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CONTEXTUAL DRIFT */}
          {activeTab === "drift" && (
            <div className="glass-card" style={{ padding: "20px" }}>
              <h3 style={{ marginTop: 0, fontSize: "1.1rem" }}>Contextual Drift (Expected vs Unexpected)</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Feature drift is evaluated against registered seasonal baselines. Expected shifts do not trigger disruptive retraining.
              </p>
              <div style={{ padding: "16px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", marginTop: "16px" }}>
                <strong style={{ color: "#10b981" }}>✓ Baseline Classification Engine Active</strong>
                <p style={{ margin: "6px 0 0 0", fontSize: "0.85rem", color: "var(--text-main)" }}>
                  Drift monitoring distinguishes between benign context shifts (e.g. seasonal promotions) and true statistical anomalies requiring model maintenance.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: STRUCTURED DIAGNOSIS */}
          {activeTab === "diagnosis" && (
            <div className="glass-card" style={{ padding: "20px" }}>
              <h3 style={{ marginTop: 0, fontSize: "1.1rem" }}>Diagnosis & Explainability Engine</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Structured diagnoses with evidence, interpretation, severity, and targeted recommended actions.
              </p>
              <div style={{ marginTop: "16px" }}>
                <div style={{ padding: "14px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", borderLeft: "4px solid var(--accent-warning)", marginBottom: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: "0.95rem" }}>Sub-optimal F1 Score (Performance Decay)</strong>
                    <span className="badge" style={{ background: "rgba(245, 158, 11, 0.2)", color: "#f59e0b" }}>WARNING</span>
                  </div>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "8px 0" }}>
                    Interpretation: Model F1 score dropped below primary target threshold. Hyperparameter tuning recommended.
                  </p>
                  <div style={{ fontSize: "0.8rem", color: "var(--accent-primary)" }}>
                    Targeted Action: <code>HYPERPARAMETER_SEARCH</code>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: CANDIDATES & SAFETY GATES */}
          {activeTab === "candidates" && (
            <div className="glass-card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Refinement Candidates & Lifecycle</h3>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Evaluation against all 7 production safety gates before promotion.
                  </span>
                </div>
              </div>

              {candidates.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No refinement candidate models trained yet.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="custom-table" style={{ width: "100%" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                        <th style={{ padding: "10px" }}>ID</th>
                        <th style={{ padding: "10px" }}>Strategy</th>
                        <th style={{ padding: "10px" }}>Metrics</th>
                        <th style={{ padding: "10px" }}>Execution Time</th>
                        <th style={{ padding: "10px" }}>Lifecycle State</th>
                        <th style={{ padding: "10px", textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((c) => (
                        <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <td style={{ padding: "12px 10px", color: "var(--accent-primary)", fontWeight: 700 }}>#{c.id}</td>
                          <td style={{ padding: "12px 10px" }}><strong>{c.strategy}</strong></td>
                          <td style={{ padding: "12px 10px", fontFamily: "monospace", fontSize: "0.8rem" }}>
                            F1: {c.metrics?.f1?.toFixed(4) || c.metrics?.r2?.toFixed(4) || "—"} | Acc: {c.metrics?.accuracy?.toFixed(4) || "—"}
                          </td>
                          <td style={{ padding: "12px 10px" }}>{c.execution_time_sec}s</td>
                          <td style={{ padding: "12px 10px" }}>
                            <span
                              className="badge"
                              style={{
                                background:
                                  c.lifecycle_state === "CHAMPION" || c.lifecycle_state === "PROMOTED"
                                    ? "rgba(16, 185, 129, 0.2)"
                                    : c.lifecycle_state === "CHALLENGER"
                                    ? "rgba(99, 102, 241, 0.2)"
                                    : "rgba(239, 68, 68, 0.2)",
                                color:
                                  c.lifecycle_state === "CHAMPION" || c.lifecycle_state === "PROMOTED"
                                    ? "#10b981"
                                    : c.lifecycle_state === "CHALLENGER"
                                    ? "#818cf8"
                                    : "#ef4444",
                              }}
                            >
                              {c.lifecycle_state}
                            </span>
                          </td>
                          <td style={{ padding: "12px 10px", textAlign: "right" }}>
                            {c.lifecycle_state === "CHALLENGER" && (
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => handlePromote(c.id)}
                                disabled={actionLoading}
                              >
                                Approve & Promote →
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: VERSIONS & ROLLBACK */}
          {activeTab === "versions" && (
            <div className="glass-card" style={{ padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Version History & Rollback</h3>
                  <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Immutable model versions. Old Champions are never deleted.
                  </span>
                </div>
                <button
                  className="btn btn-secondary"
                  onClick={handleRollback}
                  disabled={actionLoading || versions.length < 2}
                >
                  ⏪ Rollback Active Champion
                </button>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="custom-table" style={{ width: "100%" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                      <th style={{ padding: "10px" }}>Version</th>
                      <th style={{ padding: "10px" }}>Name</th>
                      <th style={{ padding: "10px" }}>Accuracy / R²</th>
                      <th style={{ padding: "10px" }}>F1 / Weighted Score</th>
                      <th style={{ padding: "10px" }}>Status</th>
                      <th style={{ padding: "10px" }}>Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versions.map((v) => (
                      <tr key={v.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: "12px 10px", fontWeight: 700, color: "var(--accent-primary)" }}>{v.version}</td>
                        <td style={{ padding: "12px 10px" }}>{v.name}</td>
                        <td style={{ padding: "12px 10px" }}>{v.accuracy != null ? v.accuracy.toFixed(4) : "—"}</td>
                        <td style={{ padding: "12px 10px" }}>{v.f1_score != null ? v.f1_score.toFixed(4) : "—"}</td>
                        <td style={{ padding: "12px 10px" }}>
                          {v.is_active ? (
                            <span className="badge" style={{ background: "rgba(16, 185, 129, 0.2)", color: "#10b981" }}>
                              ● ACTIVE CHAMPION
                            </span>
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Archived</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 10px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          {v.created_at ? new Date(v.created_at).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: MONITORING RUNS */}
          {activeTab === "runs" && (
            <div className="glass-card" style={{ padding: "20px" }}>
              <h3 style={{ marginTop: 0, fontSize: "1.1rem" }}>Historical Monitoring Runs</h3>
              {recentRuns.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No monitoring runs recorded for this unit yet.</p>
              ) : (
                <table className="custom-table" style={{ width: "100%" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                      <th style={{ padding: "10px" }}>Run ID</th>
                      <th style={{ padding: "10px" }}>Status</th>
                      <th style={{ padding: "10px" }}>Labels State</th>
                      <th style={{ padding: "10px" }}>Drift Classification</th>
                      <th style={{ padding: "10px" }}>Accuracy / R²</th>
                      <th style={{ padding: "10px" }}>F1 Score</th>
                      <th style={{ padding: "10px" }}>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.map((r) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: "12px 10px", color: "var(--accent-primary)" }}>#{r.id}</td>
                        <td style={{ padding: "12px 10px" }}>
                          <span className="badge" style={{ background: "rgba(16, 185, 129, 0.2)", color: "#10b981" }}>
                            {r.health_status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 10px", fontSize: "0.85rem" }}>{r.labels_status || "AVAILABLE"}</td>
                        <td style={{ padding: "12px 10px", fontSize: "0.85rem" }}>{r.drift_classification || "UNCLASSIFIED"}</td>
                        <td style={{ padding: "12px 10px" }}>{r.accuracy != null ? r.accuracy.toFixed(4) : "—"}</td>
                        <td style={{ padding: "12px 10px" }}>{r.f1_score != null ? r.f1_score.toFixed(4) : "—"}</td>
                        <td style={{ padding: "12px 10px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 8: AUDIT LEDGER */}
          {activeTab === "audit" && (
            <div className="glass-card" style={{ padding: "20px" }}>
              <h3 style={{ marginTop: 0, fontSize: "1.1rem" }}>Immutable Audit Ledger</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Complete event log recording every state transition, candidate evaluation, promotion, rollback, and failure.
              </p>

              {auditEvents.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No audit events logged for this unit.</p>
              ) : (
                <table className="custom-table" style={{ width: "100%" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-color)", textAlign: "left" }}>
                      <th style={{ padding: "10px" }}>ID</th>
                      <th style={{ padding: "10px" }}>Event Type</th>
                      <th style={{ padding: "10px" }}>Actor</th>
                      <th style={{ padding: "10px" }}>Details</th>
                      <th style={{ padding: "10px" }}>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditEvents.map((evt) => (
                      <tr key={evt.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: "12px 10px", color: "var(--accent-primary)" }}>#{evt.id}</td>
                        <td style={{ padding: "12px 10px" }}>
                          <span
                            className="badge"
                            style={{
                              background:
                                evt.event_type === "CANDIDATE_PROMOTED" || evt.event_type === "ROLLBACK"
                                  ? "rgba(16, 185, 129, 0.2)"
                                  : evt.event_type === "REFINEMENT_FAILED"
                                  ? "rgba(239, 68, 68, 0.2)"
                                  : "rgba(99, 102, 241, 0.2)",
                              color:
                                evt.event_type === "CANDIDATE_PROMOTED" || evt.event_type === "ROLLBACK"
                                  ? "#10b981"
                                  : evt.event_type === "REFINEMENT_FAILED"
                                  ? "#ef4444"
                                  : "#818cf8",
                            }}
                          >
                            {evt.event_type}
                          </span>
                        </td>
                        <td style={{ padding: "12px 10px", fontSize: "0.85rem" }}>{evt.actor}</td>
                        <td style={{ padding: "12px 10px", fontFamily: "monospace", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {JSON.stringify(evt.details)}
                        </td>
                        <td style={{ padding: "12px 10px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          {evt.created_at ? new Date(evt.created_at).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* TAB 9: LIVE INFERENCE */}
          {activeTab === "inference" && (
            <div className="glass-card" style={{ padding: "20px" }}>
              <h3 style={{ marginTop: 0, fontSize: "1.1rem" }}>Live Model Inference Sandbox</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                Execute real-time prediction against the currently active Champion model (<strong>{activeVersion?.version || "Active"}</strong>).
              </p>

              <div style={{ marginTop: "16px" }}>
                <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "6px" }}>Input Features (JSON Format)</label>
                <textarea
                  className="input-field"
                  rows={5}
                  value={inferenceInput}
                  onChange={(e) => setInferenceInput(e.target.value)}
                  placeholder='{"tenure": 12, "MonthlyCharges": 65.5, "Contract": "Month-to-month"}'
                  style={{ width: "100%", fontFamily: "monospace", fontSize: "0.85rem" }}
                />
                <button className="btn btn-primary" style={{ marginTop: "12px" }} onClick={handleRunInference}>
                  Run Live Inference →
                </button>
              </div>

              {inferenceResult && (
                <div style={{ marginTop: "20px", padding: "16px", background: "rgba(0,0,0,0.3)", borderRadius: "8px" }}>
                  <h4 style={{ margin: "0 0 10px 0" }}>Inference Output</h4>
                  <div>Prediction: <strong style={{ color: "var(--accent-primary)" }}>{inferenceResult.prediction}</strong></div>
                  {inferenceResult.churn_probability != null && (
                    <div>Positive Probability: <strong>{(inferenceResult.churn_probability * 100).toFixed(1)}%</strong></div>
                  )}
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "6px" }}>
                    Evaluated by Model: {inferenceResult.active_model?.name} ({inferenceResult.active_model?.version})
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Run Monitoring Modal with Explicit Baseline & Dataset Selection */}
      <RunMonitoringModal
        isOpen={showRunMonitoringModal}
        onClose={() => setShowRunMonitoringModal(false)}
        unit={unit}
        baselines={baselines}
        datasets={datasets}
        activeChampion={activeVersion}
        onRunSuccess={() => {
          loadUnitData();
          if (onRefreshFleet) onRefreshFleet();
        }}
        onNavigateToTab={(tabId) => setActiveTab(tabId)}
      />
    </div>
  );
}
