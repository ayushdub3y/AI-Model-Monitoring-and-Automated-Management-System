import React, { useState, useEffect } from "react";
import {
  Layers,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Cpu,
  BarChart2,
  ArrowRight,
  Database
} from "lucide-react";
import {
  uploadIntake,
  profileDataset,
  profileModel,
  checkCompatibility,
  loadSampleData
} from "../api";

export default function IntakeView({ onNavigateTab }) {
  const [modelPath, setModelPath] = useState("models/baseline_model.pkl");
  const [datasetPath, setDatasetPath] = useState("data/processed/drifted_batch.csv");
  const [targetColumn, setTargetColumn] = useState("Churn");

  const [loading, setLoading] = useState(false);
  const [intakeResult, setIntakeResult] = useState(null);
  const [datasetProfile, setDatasetProfile] = useState(null);
  const [modelProfile, setModelProfile] = useState(null);
  const [compatibility, setCompatibility] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Auto-load profiles on initial mount or when sample is selected
  async function handleAnalyze(mPath = modelPath, dPath = datasetPath) {
    setLoading(true);
    setErrorMsg(null);
    try {
      const intakeRes = await uploadIntake(
        new URLSearchParams({
          model_path: mPath,
          dataset_path: dPath,
          target_column: targetColumn,
        })
      );
      setIntakeResult(intakeRes);

      const [dProf, mProf, comp] = await Promise.all([
        profileDataset(dPath, targetColumn),
        profileModel(mPath),
        checkCompatibility(mPath, dPath, targetColumn),
      ]);

      setDatasetProfile(dProf);
      setModelProfile(mProf);
      setCompatibility(comp);
    } catch (err) {
      setErrorMsg(err.message || "Failed to intake and profile data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    handleAnalyze();
  }, []);

  function handleSelectPreset(type) {
    if (type === "drifted") {
      setDatasetPath("data/processed/drifted_batch.csv");
      handleAnalyze(modelPath, "data/processed/drifted_batch.csv");
    } else if (type === "clean") {
      setDatasetPath("data/processed/test.csv");
      handleAnalyze(modelPath, "data/processed/test.csv");
    } else if (type === "mismatched") {
      setDatasetPath("data/processed/mismatched_batch.csv");
      handleAnalyze(modelPath, "data/processed/mismatched_batch.csv");
    }
  }

  return (
    <div className="fade-in">
      {/* Intake & Selection Header */}
      <div className="card" style={{ marginBottom: "20px" }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <Layers size={18} color="var(--accent-primary)" />
              Model & Dataset Intake Layer
            </h2>
            <p className="card-subtitle">
              Universal adapter intake for Scikit-Learn & XGBoost models with statistical profiling & schema verification
            </p>
          </div>

          {/* Quick Presets */}
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn btn-secondary btn-sm" onClick={() => handleSelectPreset("clean")}>
              Clean Test Data
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => handleSelectPreset("drifted")}>
              Drifted Production Data
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => handleSelectPreset("mismatched")}>
              Mismatched Schema Data
            </button>
          </div>
        </div>

        <div className="grid-3" style={{ marginTop: "12px" }}>
          <div className="form-group">
            <label className="form-label">Model Artifact</label>
            <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: "var(--bg-main)", borderRadius: "6px", border: "1px solid var(--border-subtle)", fontSize: "0.85rem", color: "var(--text-primary)" }}>
              <Cpu size={16} style={{ marginRight: "8px", color: "var(--accent-primary)" }} />
              <span>{modelPath.split("/").pop() || "Champion Model"}</span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Dataset Source</label>
            <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", background: "var(--bg-main)", borderRadius: "6px", border: "1px solid var(--border-subtle)", fontSize: "0.85rem", color: "#38bdf8" }}>
              <Database size={16} style={{ marginRight: "8px" }} />
              <span>{datasetPath.split("/").pop() || "Telemetry Dataset"}</span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Target Column</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                className="form-control"
                value={targetColumn}
                onChange={(e) => setTargetColumn(e.target.value)}
              />
              <button
                className="btn btn-primary"
                onClick={() => handleAnalyze()}
                disabled={loading}
              >
                {loading ? "Loading..." : "Intake & Profile"}
              </button>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="banner banner-critical" style={{ marginTop: "14px", marginBottom: 0 }}>
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Compatibility Status Banner */}
      {compatibility && (
        <div
          className={`banner ${compatibility.compatible ? "banner-success" : "banner-critical"}`}
          style={{ marginBottom: "20px" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
            {compatibility.compatible ? (
              <CheckCircle2 size={20} color="var(--status-healthy)" />
            ) : (
              <AlertTriangle size={20} color="var(--status-critical)" />
            )}
            <div>
              <strong>
                {compatibility.compatible
                  ? "Schema Compatibility Verified: Dataset matches model expectations"
                  : "Compatibility Mismatch Detected!"}
              </strong>
              <div style={{ fontSize: "0.82rem", opacity: 0.9 }}>
                {compatibility.compatible
                  ? `Expected ${compatibility.expected_features.length} features • Dry-run prediction test PASSED.`
                  : compatibility.errors?.join(" • ") || "Missing required features."}
              </div>
            </div>
          </div>

          {compatibility.compatible && (
            <button className="btn btn-success btn-sm" onClick={() => onNavigateTab("health")}>
              Proceed to Health Analysis <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}

      {/* Profiling Details Grid */}
      <div className="grid-2">
        {/* Dataset Profile Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Database size={18} color="var(--status-info)" />
              Dataset Statistical Profile
            </h3>
            {datasetProfile && (
              <span className="badge badge-info">
                {datasetProfile.rows} Rows • {datasetProfile.columns} Columns
              </span>
            )}
          </div>

          {datasetProfile ? (
            <div>
              {/* Target Class Distribution */}
              {datasetProfile.target && (
                <div style={{ marginBottom: "18px", padding: "14px", background: "rgba(15, 23, 42, 0.6)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
                    Target Class Balance ({datasetProfile.target.column})
                  </div>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    {Object.entries(datasetProfile.target.class_percentages).map(([cls, pct]) => (
                      <div key={cls} style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "4px" }}>
                          <span>Class {cls} ({cls === "1" ? "Churn" : "Stay"}):</span>
                          <strong>{pct}%</strong>
                        </div>
                        <div style={{ height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${pct}%`,
                              background: cls === "1" ? "var(--status-critical)" : "var(--status-healthy)",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Values & Column Types Table */}
              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
                Feature Types & Quality
              </div>
              <div className="table-container" style={{ maxHeight: "280px" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th>Type</th>
                      <th>Missing %</th>
                      <th>Unique</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datasetProfile.column_names.map((col) => {
                      const missPct = datasetProfile.missing_percentages[col] || 0;
                      return (
                        <tr key={col}>
                          <td><strong>{col}</strong></td>
                          <td><code>{datasetProfile.dtypes[col]}</code></td>
                          <td>
                            {missPct > 0 ? (
                              <span style={{ color: "var(--status-critical)", fontWeight: 700 }}>
                                {missPct}%
                              </span>
                            ) : (
                              <span style={{ color: "var(--status-healthy)" }}>0%</span>
                            )}
                          </td>
                          <td>{datasetProfile.unique_counts[col]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)" }}>Loading dataset stats...</p>
          )}
        </div>

        {/* Model Profile Card */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Cpu size={18} color="var(--accent-secondary)" />
              Model Architecture & Adapter
            </h3>
            {modelProfile && (
              <span className="badge badge-healthy">
                {modelProfile.model_type}
              </span>
            )}
          </div>

          {modelProfile ? (
            <div>
              <div style={{ marginBottom: "16px", padding: "14px", background: "rgba(15, 23, 42, 0.6)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.88rem" }}>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Estimator:</span>{" "}
                    <strong>{modelProfile.estimator_type || modelProfile.model_type}</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Module:</span>{" "}
                    <code>{modelProfile.estimator_module || modelProfile.model_module}</code>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Pipeline Steps:</span>{" "}
                    <strong>{modelProfile.pipeline_steps?.join(" ➔ ") || "None"}</strong>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Features Count:</span>{" "}
                    <strong>{modelProfile.feature_names?.length || "Dynamic"}</strong>
                  </div>
                </div>
              </div>

              {/* Feature Names List */}
              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "8px" }}>
                Expected Feature Schema ({modelProfile.feature_names?.length || 0})
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", maxHeight: "180px", overflowY: "auto", padding: "8px", background: "rgba(15, 23, 42, 0.4)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                {modelProfile.feature_names?.map((f) => (
                  <span key={f} className="badge badge-neutral" style={{ textTransform: "none", fontFamily: "JetBrains Mono" }}>
                    {f}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--text-muted)" }}>Loading model architecture...</p>
          )}
        </div>
      </div>
    </div>
  );
}
