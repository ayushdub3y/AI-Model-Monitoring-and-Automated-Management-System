import React, { useState, useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  BarChart,
  Filter,
  ArrowRight,
  RefreshCw,
  Search,
  Sparkles,
  Database
} from "lucide-react";
import {
  analyzeHealth,
  fetchMonitoringUnits,
  fetchReferenceBaselines,
  fetchDatasets
} from "../api";

export default function HealthView({ onNavigateTab }) {
  const [modelPath, setModelPath] = useState("models/baseline_model.pkl");
  const [referencePath, setReferencePath] = useState("data/processed/reference.csv");
  const [currentPath, setCurrentPath] = useState("data/processed/drifted_batch.csv");

  const [units, setUnits] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [baselines, setBaselines] = useState([]);
  const [selectedBaselineId, setSelectedBaselineId] = useState("");
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");

  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [filterDriftOnly, setFilterDriftOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    async function loadUnits() {
      try {
        const uList = await fetchMonitoringUnits();
        setUnits(uList || []);
        if (uList && uList.length > 0) {
          setSelectedUnitId(String(uList[0].id));
        }
      } catch (err) {
        console.error("Could not load units in HealthView", err);
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
        const defB = bList && bList.length > 0 ? (bList.find((b) => b.is_default) || bList[0]) : null;
        if (defB) {
          setSelectedBaselineId(String(defB.id));
          if (defB.file_path) setReferencePath(defB.file_path);
        }

        setDatasets(dList || []);
        const curD = dList && dList.length > 0 ? (dList.find((d) => d.status === "CURRENT") || dList[0]) : null;
        if (curD) {
          setSelectedDatasetId(String(curD.id));
          if (curD.file_path) setCurrentPath(curD.file_path);
        }
      } catch (err) {
        console.error("Error loading unit baselines/datasets", err);
      }
    }
    loadUnitData();
  }, [selectedUnitId]);

  async function handleRunHealthCheck(curP = currentPath, refP = referencePath) {
    setLoading(true);
    setErrorMsg(null);
    try {
      const activeUnit = units.find((u) => String(u.id) === String(selectedUnitId));
      const targetCol = activeUnit?.target_column || "Churn";
      const res = await analyzeHealth(modelPath, refP, curP, targetCol);
      setReport(res);
    } catch (err) {
      setErrorMsg(err.message || "Failed to generate health report");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    handleRunHealthCheck(currentPath, referencePath);
  }, [currentPath, referencePath]);

  function handleBatchSwitch(type) {
    const path =
      type === "drifted"
        ? "data/processed/drifted_batch.csv"
        : "data/processed/test.csv";
    setCurrentPath(path);
  }

  // Filter features table
  const featureEntries = report?.data_drift?.features
    ? Object.entries(report.data_drift.features).filter(([col, info]) => {
        if (filterDriftOnly && !info.drift_detected) return false;
        if (searchTerm && !col.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        return true;
      })
    : [];

  const status = report?.status || "HEALTHY";
  const score = report?.health_score ?? 100;

  return (
    <div className="fade-in">
      {/* Top Controls & Status Summary */}
      <div className="card" style={{ marginBottom: "20px" }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <Activity size={18} color="var(--accent-primary)" />
              Evidently Drift & Health Analysis Monitor
            </h2>
            <p className="card-subtitle">
              Continuous telemetry detecting feature distribution drift, prediction shifts, and performance degradation
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              className={`btn btn-sm ${currentPath.includes("drifted") ? "btn-danger" : "btn-secondary"}`}
              onClick={() => handleBatchSwitch("drifted")}
            >
              Analyze Drifted Batch
            </button>
            <button
              className={`btn btn-sm ${!currentPath.includes("drifted") ? "btn-primary" : "btn-secondary"}`}
              onClick={() => handleBatchSwitch("clean")}
            >
              Analyze Clean Batch
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleRunHealthCheck()}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? "spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {/* Dynamic Unit, Baseline & Dataset Selectors */}
        {units.length > 0 && (
          <div style={{ display: "flex", gap: "12px", marginTop: "16px", padding: "12px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", flexWrap: "wrap" }}>
            <div style={{ flex: "1", minWidth: "180px" }}>
              <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>
                Monitoring Unit
              </label>
              <select
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", backgroundColor: "var(--bg-main)", color: "#fff", border: "1px solid var(--border-subtle)", fontSize: "0.82rem" }}
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} (Unit #{u.id})</option>
                ))}
              </select>
            </div>

            {baselines.length > 0 && (
              <div style={{ flex: "1", minWidth: "200px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>
                  Reference Baseline
                </label>
                <select
                  value={selectedBaselineId}
                  onChange={(e) => {
                    setSelectedBaselineId(e.target.value);
                    const b = baselines.find((x) => String(x.id) === e.target.value);
                    if (b?.file_path) setReferencePath(b.file_path);
                  }}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", backgroundColor: "var(--bg-main)", color: "var(--primary)", border: "1px solid var(--border-subtle)", fontSize: "0.82rem" }}
                >
                  {baselines.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.row_count ? `${b.row_count.toLocaleString()} rows` : "Ref"}) {b.is_default ? "★ DEFAULT" : ""}</option>
                  ))}
                </select>
              </div>
            )}

            {datasets.length > 0 && (
              <div style={{ flex: "1", minWidth: "200px" }}>
                <label style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>
                  Current Telemetry Dataset
                </label>
                <select
                  value={selectedDatasetId}
                  onChange={(e) => {
                    setSelectedDatasetId(e.target.value);
                    const d = datasets.find((x) => String(x.id) === e.target.value);
                    if (d?.file_path) setCurrentPath(d.file_path);
                  }}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", backgroundColor: "var(--bg-main)", color: "#38bdf8", border: "1px solid var(--border-subtle)", fontSize: "0.82rem" }}
                >
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.row_count ? `${d.row_count.toLocaleString()} rows` : "Batch"}) [{d.status}]</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="banner banner-critical" style={{ marginTop: "10px", marginBottom: 0 }}>
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {report && (
        <>
          {/* Health Score & Performance KPIs */}
          <div className="metrics-grid">
            {/* Health Score Meter */}
            <div className="metric-card" style={{ borderLeft: `4px solid ${score >= 80 ? "var(--status-healthy)" : "var(--status-critical)"}` }}>
              <div className="metric-card-label">Overall Health Score</div>
              <div className="metric-card-value" style={{ color: score >= 80 ? "var(--status-healthy)" : "var(--status-critical)" }}>
                {score}/100
              </div>
              <div className="metric-card-delta">
                Status: <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>
              </div>
            </div>

            {/* Feature Drift Rate */}
            <div className="metric-card">
              <div className="metric-card-label">Feature Drift Rate</div>
              <div className="metric-card-value" style={{ color: report.data_drift?.drift_rate > 0.1 ? "var(--status-warning)" : "var(--text-primary)" }}>
                {round(report.data_drift?.drift_rate * 100)}%
              </div>
              <div className="metric-card-delta">
                {report.data_drift?.drifted_feature_count} of {report.data_drift?.total_features} features drifted
              </div>
            </div>

            {/* F1 Score */}
            <div className="metric-card">
              <div className="metric-card-label">Current F1 Score</div>
              <div className="metric-card-value">
                {report.performance?.f1}
              </div>
              <div className="metric-card-delta delta-neu">
                Benchmark Target: 0.65+
              </div>
            </div>

            {/* ROC-AUC */}
            <div className="metric-card">
              <div className="metric-card-label">Current ROC-AUC</div>
              <div className="metric-card-value">
                {report.performance?.roc_auc}
              </div>
              <div className="metric-card-delta delta-neu">
                Optimal Target: 0.80+
              </div>
            </div>
          </div>

          {/* Health Reasons / Alert Banners */}
          {report.reasons && report.reasons.length > 0 && (
            <div className={`banner ${status === "CRITICAL" ? "banner-critical" : "banner-warning"}`} style={{ marginBottom: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
                <AlertTriangle size={22} color={status === "CRITICAL" ? "var(--status-critical)" : "var(--status-warning)"} />
                <div>
                  <strong>Health Diagnostic Findings ({report.reasons.length} Issues):</strong>
                  <div style={{ fontSize: "0.85rem", marginTop: "2px" }}>
                    {report.reasons.join(" • ")}
                  </div>
                </div>
              </div>

              <button className="btn btn-primary btn-sm" onClick={() => onNavigateTab("diagnosis")}>
                <Sparkles size={14} /> View Root Cause <ArrowRight size={14} />
              </button>
            </div>
          )}

          {/* Prediction Drift & Data Quality Summary */}
          <div className="grid-2" style={{ marginBottom: "24px" }}>
            {/* Prediction Drift Card */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <BarChart size={18} color="var(--accent-secondary)" />
                  Prediction Distribution Shift
                </h3>
                <span className={`badge ${report.prediction_drift?.drift_detected ? "badge-warning" : "badge-healthy"}`}>
                  {report.prediction_drift?.drift_detected ? "PREDICTION DRIFT DETECTED" : "PREDICTIONS STABLE"}
                </span>
              </div>

              <div style={{ padding: "14px", background: "rgba(15, 23, 42, 0.6)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: "0.85rem" }}>
                  <span>Reference Predicted Positive Rate:</span>
                  <strong>{report.prediction_drift?.reference_percentages?.["1"] || 0}%</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: "0.85rem" }}>
                  <span>Current Predicted Positive Rate:</span>
                  <strong style={{ color: report.prediction_drift?.drift_detected ? "var(--status-warning)" : "var(--text-primary)" }}>
                    {report.prediction_drift?.current_percentages?.["1"] || 0}%
                  </strong>
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "JetBrains Mono" }}>
                  Kolmogorov-Smirnov Test p-value: {report.prediction_drift?.p_value}
                </div>
              </div>
            </div>

            {/* Data Quality Card */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <CheckCircle2 size={18} color="var(--status-info)" />
                  Data Quality & Integrity Checks
                </h3>
                <span className={`badge ${report.data_quality?.healthy ? "badge-healthy" : "badge-warning"}`}>
                  {report.data_quality?.healthy ? "DATA QUALITY PASSED" : "ISSUES FOUND"}
                </span>
              </div>

              <div>
                {report.data_quality?.issues?.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {report.data_quality.issues.map((iss, i) => (
                      <div key={i} style={{ padding: "10px 12px", background: "rgba(245, 158, 11, 0.1)", borderRadius: "var(--radius-sm)", border: "1px solid var(--status-warning-border)", fontSize: "0.85rem" }}>
                        <strong>{iss.issue}</strong>: <span>{JSON.stringify(iss.details)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: "20px", textAlign: "center", color: "var(--status-healthy)", background: "rgba(16, 185, 129, 0.08)", borderRadius: "var(--radius-md)" }}>
                    <CheckCircle2 size={24} style={{ margin: "0 auto 6px" }} />
                    <p style={{ fontSize: "0.88rem", fontWeight: 600 }}>Zero missing values, duplicates, or constant columns detected.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Feature Drift Detailed Table */}
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">
                  <Activity size={18} color="var(--status-healthy)" />
                  Evidently Feature Drift Breakdown ({featureEntries.length} Features)
                </h3>
                <p className="card-subtitle">Statistical comparison of input features between baseline reference and current production data</p>
              </div>

              {/* Search & Filter */}
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <div style={{ position: "relative" }}>
                  <Search size={14} style={{ position: "absolute", left: "10px", top: "10px", color: "var(--text-muted)" }} />
                  <input
                    type="text"
                    placeholder="Search feature..."
                    className="form-control"
                    style={{ paddingLeft: "30px", width: "180px", height: "34px", fontSize: "0.8rem" }}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <button
                  className={`btn btn-sm ${filterDriftOnly ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setFilterDriftOnly(!filterDriftOnly)}
                >
                  <Filter size={13} /> {filterDriftOnly ? "Drifted Only" : "All Features"}
                </button>
              </div>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Feature Name</th>
                    <th>Type</th>
                    <th>Drift Statistic</th>
                    <th>p-value</th>
                    <th>Test Algorithm</th>
                    <th>Drift Status</th>
                  </tr>
                </thead>
                <tbody>
                  {featureEntries.map(([col, info]) => (
                    <tr key={col} style={{ background: info.drift_detected ? "rgba(239, 68, 68, 0.05)" : "transparent" }}>
                      <td><strong>{col}</strong></td>
                      <td><code>{info.type}</code></td>
                      <td style={{ fontFamily: "JetBrains Mono" }}>{info.statistic}</td>
                      <td style={{ fontFamily: "JetBrains Mono" }}>{info.p_value}</td>
                      <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{info.stattest_name}</td>
                      <td>
                        {info.drift_detected ? (
                          <span className="badge badge-critical">DRIFT DETECTED</span>
                        ) : (
                          <span className="badge badge-healthy">STABLE</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function round(val) {
  if (val === undefined || val === null) return 0;
  return Math.round(val * 10) / 10;
}
