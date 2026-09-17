import React, { useState, useEffect } from "react";
import {
  PlayCircle,
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
  Database,
  Cpu
} from "lucide-react";
import {
  runFullPipeline,
  fetchMonitoringUnits,
  fetchReferenceBaselines,
  fetchDatasets
} from "../api";

export default function PipelineView({
  pipelineData,
  setPipelineData,
  onNavigateTab,
  onRefreshSummary
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState("drifted");
  const [forceRefine, setForceRefine] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Dynamic Units, Baselines & Datasets state
  const [units, setUnits] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [baselines, setBaselines] = useState([]);
  const [selectedBaselineId, setSelectedBaselineId] = useState("");
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");

  const stagesList = [
    { key: "Intake", label: "Model Intake", icon: Layers },
    { key: "Profiling", label: "Data Profiling", icon: Activity },
    { key: "Compatibility", label: "Schema Check", icon: CheckCircle2 },
    { key: "Health Analysis", label: "Health & Drift", icon: AlertTriangle },
    { key: "Diagnosis", label: "Diagnosis & SHAP", icon: Sparkles },
    { key: "Refinement", label: "Auto-Refinement", icon: Zap },
    { key: "Evaluation", label: "Held-out Test", icon: TrendingUp },
    { key: "Promotion Decision", label: "Model Selection", icon: Award },
    { key: "Deployment", label: "Version Deploy", icon: GitCommit },
  ];

  useEffect(() => {
    async function loadUnits() {
      try {
        const uList = await fetchMonitoringUnits();
        setUnits(uList || []);
        if (uList && uList.length > 0) {
          setSelectedUnitId(String(uList[0].id));
        }
      } catch (err) {
        console.error("Could not load units in PipelineView", err);
      }
    }
    loadUnits();
  }, []);

  useEffect(() => {
    if (!selectedUnitId) return;
    async function loadUnitData() {
      try {
        const [bList, dList] = await Promise.all([
          fetchReferenceBaselines(selectedUnitId).catch(() => []),
          fetchDatasets(selectedUnitId).catch(() => []),
        ]);
        setBaselines(bList || []);
        if (bList && bList.length > 0) {
          const defB = bList.find((b) => b.is_default) || bList[0];
          setSelectedBaselineId(String(defB.id));
        } else {
          setSelectedBaselineId("");
        }
        setDatasets(dList || []);
        if (dList && dList.length > 0) {
          const curD = dList.find((d) => d.status === "CURRENT") || dList[0];
          setSelectedDatasetId(String(curD.id));
        } else {
          setSelectedDatasetId("");
        }
      } catch (err) {
        console.error("Error loading unit baselines/datasets", err);
      }
    }
    loadUnitData();
  }, [selectedUnitId]);

  async function handleExecute() {
    setIsRunning(true);
    setErrorMsg(null);
    try {
      const payload = {
        unit_id: selectedUnitId ? parseInt(selectedUnitId, 10) : 1,
        force_refinement: forceRefine,
      };

      if (selectedBaselineId) {
        payload.baseline_id = parseInt(selectedBaselineId, 10);
      }
      if (selectedDatasetId) {
        payload.dataset_id = parseInt(selectedDatasetId, 10);
      } else {
        payload.current_path =
          selectedBatch === "drifted"
            ? "data/processed/drifted_batch.csv"
            : "data/processed/test.csv";
        payload.dataset_name =
          selectedBatch === "drifted" ? "Drifted Production Batch" : "Clean Test Batch";
      }

      const res = await runFullPipeline(payload);
      setPipelineData(res);
      if (onRefreshSummary) onRefreshSummary();
    } catch (err) {
      setErrorMsg(err.message || "Pipeline execution failed");
    } finally {
      setIsRunning(false);
    }
  }

  // Calculate executed stage status
  const executedStagesMap = {};
  if (pipelineData?.stages) {
    pipelineData.stages.forEach((s) => {
      executedStagesMap[s.stage] = s;
    });
  }

  const comp = pipelineData?.evaluation?.comparison;
  const promo = pipelineData?.promotion;

  return (
    <div className="fade-in">
      {/* Hero Action Card */}
      <div className="card" style={{ marginBottom: "24px", background: "linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.8) 100%)", border: "1px solid rgba(99, 102, 241, 0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "20px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <span className="badge badge-info" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <Sparkles size={12} /> Autonomous MLOps Pipeline
              </span>
              {pipelineData && (
                <span className="badge badge-healthy">
                  Completed in {pipelineData.pipeline_duration_sec}s
                </span>
              )}
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, letterSpacing: "-0.02em", color: "#fff" }}>
              AI Model Health & Automated Refinement Engine
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", maxWidth: "720px", marginTop: "6px" }}>
              Takes an existing production model + dataset, profiles and verifies compatibility, diagnoses data drift & performance drops in plain English, retrains & tunes superior candidates, and safely promotes the winner to active status.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: "320px", flex: "1", maxWidth: "420px" }}>
            {/* Unit & Data Selection Dropdowns */}
            {units.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "rgba(0,0,0,0.3)", padding: "10px", borderRadius: "8px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "2px" }}>
                    Monitoring Unit
                  </label>
                  <select
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    disabled={isRunning}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      backgroundColor: "var(--bg-main)",
                      color: "#fff",
                      border: "1px solid var(--border-subtle)",
                      fontSize: "0.82rem",
                    }}
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} (Unit #{u.id})
                      </option>
                    ))}
                  </select>
                </div>

                {baselines.length > 0 && (
                  <div>
                    <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "2px" }}>
                      Reference Baseline
                    </label>
                    <select
                      value={selectedBaselineId}
                      onChange={(e) => setSelectedBaselineId(e.target.value)}
                      disabled={isRunning}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        borderRadius: "6px",
                        backgroundColor: "var(--bg-main)",
                        color: "var(--primary)",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "0.82rem",
                      }}
                    >
                      {baselines.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.row_count ? `${b.row_count.toLocaleString()} rows` : "Ref"}) {b.is_default ? "★ DEFAULT" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {datasets.length > 0 && (
                  <div>
                    <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "2px" }}>
                      Production Dataset Batch
                    </label>
                    <select
                      value={selectedDatasetId}
                      onChange={(e) => setSelectedDatasetId(e.target.value)}
                      disabled={isRunning}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        borderRadius: "6px",
                        backgroundColor: "var(--bg-main)",
                        color: "#38bdf8",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "0.82rem",
                      }}
                    >
                      {datasets.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.row_count ? `${d.row_count.toLocaleString()} rows` : "Batch"}) [{d.status}]
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <button
              className="btn btn-primary btn-lg"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={handleExecute}
              disabled={isRunning}
            >
              <PlayCircle size={20} />
              <span>{isRunning ? "Executing Autonomous Pipeline..." : "Run End-to-End Pipeline"}</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="banner banner-critical" style={{ marginTop: "20px", marginBottom: "0" }}>
            <AlertTriangle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Visual Stepper */}
      <div className="card" style={{ marginBottom: "24px" }}>
        <div className="card-header" style={{ marginBottom: "0" }}>
          <div>
            <h2 className="card-title">
              <Activity size={18} color="var(--accent-primary)" />
              Pipeline Execution Stepper
            </h2>
            <p className="card-subtitle">Live progression of autonomous diagnostics, refinement, and deployment stages</p>
          </div>
          {pipelineData && (
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "JetBrains Mono" }}>
              Active Model: <strong style={{ color: "var(--status-healthy)" }}>{pipelineData.active_model?.version}</strong>
            </span>
          )}
        </div>

        <div className="stepper-container" style={{ padding: "0 10px" }}>
          <div className="stepper-line" />
          <div
            className="stepper-progress"
            style={{
              width: pipelineData?.stages ? `${Math.min(100, (pipelineData.stages.length / stagesList.length) * 100)}%` : "0%",
            }}
          />

          {stagesList.map((step, idx) => {
            const executed = executedStagesMap[step.key];
            const isCompleted = executed && executed.status === "COMPLETED";
            const isFailed = executed && executed.status === "FAILED";
            const isCurrent = isRunning && !executed;

            let stepClass = "";
            if (isCompleted) stepClass = "completed";
            else if (isFailed) stepClass = "failed";
            else if (isCurrent) stepClass = "active";

            const Icon = step.icon;

            return (
              <div key={step.key} className={`step-item ${stepClass}`}>
                <div className="step-circle" title={executed ? JSON.stringify(executed.details) : step.label}>
                  {isCompleted ? <CheckCircle2 size={18} /> : isFailed ? <AlertTriangle size={18} /> : <Icon size={16} />}
                </div>
                <div className="step-label">{step.label}</div>
                {executed && (
                  <span
                    style={{
                      fontSize: "0.68rem",
                      color: isCompleted ? "var(--status-healthy)" : "var(--status-critical)",
                      fontFamily: "JetBrains Mono",
                    }}
                  >
                    {executed.status}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pipeline Execution Summary & Results */}
      {pipelineData && (
        <>
          {/* Promotion Winner Celebration Banner */}
          {promo && (
            <div
              className={`banner ${promo.promoted ? "banner-success" : "banner-warning"}`}
              style={{ padding: "20px 24px", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1 }}>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    background: promo.promoted ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Award size={26} color={promo.promoted ? "var(--status-healthy)" : "var(--status-warning)"} />
                </div>
                <div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                    {promo.promoted
                      ? "🎉 Refined Model Outperformed Baseline — Promoted to Active Version!"
                      : "Baseline Model Retained as Active Version"}
                  </div>
                  <div style={{ fontSize: "0.88rem", opacity: 0.9, marginTop: "2px" }}>
                    {promo.reason}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button className="btn btn-secondary btn-sm" onClick={() => onNavigateTab("refinement")}>
                  Compare Metrics <ArrowRight size={14} />
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => onNavigateTab("versions")}>
                  View Version Timeline <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Quick Metrics Grid */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-card-label">Health Score</div>
              <div className="metric-card-value" style={{ color: pipelineData.health_report?.health_score >= 80 ? "var(--status-healthy)" : "var(--status-critical)" }}>
                {pipelineData.health_report?.health_score}/100
              </div>
              <div className="metric-card-delta">
                Status: <strong style={{ color: "var(--text-primary)" }}>{pipelineData.health_report?.status}</strong>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-card-label">Input Data Drift</div>
              <div className="metric-card-value">
                {roundVal(pipelineData.health_report?.data_drift?.drift_rate * 100)}%
              </div>
              <div className="metric-card-delta">
                {pipelineData.health_report?.data_drift?.drifted_feature_count} features shifted
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-card-label">Baseline F1 / ROC-AUC</div>
              <div className="metric-card-value" style={{ fontSize: "1.4rem" }}>
                {pipelineData.evaluation?.baseline?.f1} / {pipelineData.evaluation?.baseline?.roc_auc}
              </div>
              <div className="metric-card-delta delta-neu">
                Original Model v1.0.0
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-card-label">Refined F1 / ROC-AUC</div>
              <div className="metric-card-value" style={{ fontSize: "1.4rem", color: "var(--status-healthy)" }}>
                {pipelineData.evaluation?.candidate?.f1} / {pipelineData.evaluation?.candidate?.roc_auc}
              </div>
              <div className="metric-card-delta delta-pos">
                <TrendingUp size={14} /> F1 Delta: {comp?.improvement?.f1 > 0 ? `+${comp.improvement.f1}` : comp?.improvement?.f1}
              </div>
            </div>
          </div>

          {/* Detailed Stage Cards Grid */}
          <div className="grid-2">
            {/* Health & Diagnosis Summary */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <AlertTriangle size={18} color="var(--status-warning)" />
                  Detected Issues & Diagnosis
                </h3>
                <button className="btn btn-secondary btn-sm" onClick={() => onNavigateTab("diagnosis")}>
                  Full Report <ArrowRight size={13} />
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {pipelineData.diagnosis?.diagnoses?.map((d, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "12px",
                      background: "rgba(15, 23, 42, 0.6)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <strong style={{ fontSize: "0.9rem" }}>{d.issue}</strong>
                      <span className={`badge badge-${d.severity.toLowerCase()}`}>{d.severity}</span>
                    </div>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{d.explanation}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Refinement & Fixes Applied */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <Zap size={18} color="var(--accent-primary)" />
                  Auto-Refinement & Data Fixes
                </h3>
                <button className="btn btn-secondary btn-sm" onClick={() => onNavigateTab("refinement")}>
                  Tuning Details <ArrowRight size={13} />
                </button>
              </div>

              <div>
                <div style={{ marginBottom: "12px", fontSize: "0.88rem", color: "var(--text-secondary)" }}>
                  Selected Winner: <strong style={{ color: "var(--text-primary)" }}>{pipelineData.refinement?.best_candidate_name}</strong>
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "6px" }}>
                    Automated Data Fixes Applied:
                  </div>
                  {pipelineData.refinement?.data_fixes_applied?.map((fix, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", color: "#cbd5e1", marginBottom: "4px" }}>
                      <CheckCircle2 size={14} color="var(--status-healthy)" />
                      <span>{fix}</span>
                    </div>
                  ))}
                </div>

                {pipelineData.refinement?.all_candidates && (
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Candidate Algorithm</th>
                          <th>F1 Score</th>
                          <th>ROC-AUC</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pipelineData.refinement.all_candidates.map((cand, idx) => (
                          <tr key={idx} style={{ background: cand.is_selected ? "rgba(99, 102, 241, 0.1)" : "transparent" }}>
                            <td><strong>{cand.name}</strong></td>
                            <td>{cand.metrics.f1}</td>
                            <td>{cand.metrics.roc_auc}</td>
                            <td>
                              {cand.is_selected ? (
                                <span className="badge badge-healthy">WINNER</span>
                              ) : (
                                <span className="badge badge-neutral">Candidate</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function roundVal(val) {
  if (val === undefined || val === null) return 0;
  return Math.round(val * 10) / 10;
}
