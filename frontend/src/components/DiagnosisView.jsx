import React, { useState, useEffect } from "react";
import {
  Stethoscope,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  TrendingUp,
  BarChart2,
  Zap,
  RefreshCw
} from "lucide-react";
import { analyzeHealth, getDiagnosis, API_BASE } from "../api";

export default function DiagnosisView({ onNavigateTab }) {
  const [loading, setLoading] = useState(false);
  const [diagnosisData, setDiagnosisData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  async function loadDiagnosis() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const healthReport = await analyzeHealth(
        "models/baseline_model.pkl",
        "data/processed/reference.csv",
        "data/processed/drifted_batch.csv",
        "Churn"
      );

      const diagRes = await getDiagnosis(
        healthReport,
        "models/baseline_model.pkl",
        "data/processed/drifted_batch.csv",
        "Churn"
      );

      setDiagnosisData(diagRes);
    } catch (err) {
      setErrorMsg(err.message || "Failed to generate diagnosis");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDiagnosis();
  }, []);

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="card" style={{ marginBottom: "20px" }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <Stethoscope size={18} color="var(--accent-primary)" />
              Automated Plain-English Diagnosis & SHAP Root Cause
            </h2>
            <p className="card-subtitle">
              Translates complex drift statistics and performance metrics into clear, human-understandable findings and actionable remediation plans
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button className="btn btn-secondary btn-sm" onClick={loadDiagnosis} disabled={loading}>
              <RefreshCw size={14} className={loading ? "spin" : ""} />
              Re-run Diagnosis
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => onNavigateTab("refinement")}>
              <Zap size={14} /> Trigger Refinement <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="banner banner-critical" style={{ marginTop: "10px", marginBottom: 0 }}>
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {diagnosisData && (
        <div className="grid-2">
          {/* Diagnosis Cards Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Diagnostic Findings ({diagnosisData.diagnoses?.length || 0})
              </h3>
              <span className="badge badge-info">Rule-based NLP Engine</span>
            </div>

            {diagnosisData.diagnoses?.map((item, idx) => {
              const sev = item.severity?.toLowerCase() || "warning";
              return (
                <div
                  key={idx}
                  className="card"
                  style={{
                    borderLeft: `4px solid ${
                      sev === "critical"
                        ? "var(--status-critical)"
                        : sev === "warning"
                        ? "var(--status-warning)"
                        : "var(--status-healthy)"
                    }`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div>
                      <h4 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                        {item.issue}
                      </h4>
                      {item.metric_value && (
                        <div style={{ fontSize: "0.78rem", color: "var(--accent-primary)", fontFamily: "JetBrains Mono", marginTop: "2px" }}>
                          {item.metric_value}
                        </div>
                      )}
                    </div>
                    <span className={`badge badge-${sev}`}>{item.severity}</span>
                  </div>

                  <p style={{ fontSize: "0.88rem", color: "#e2e8f0", lineHeight: 1.5, marginBottom: "12px" }}>
                    {item.explanation}
                  </p>

                  <div
                    style={{
                      padding: "10px 14px",
                      background: "rgba(99, 102, 241, 0.08)",
                      border: "1px solid rgba(99, 102, 241, 0.2)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-primary)", textTransform: "uppercase", marginBottom: "3px" }}>
                      💡 Recommended Action:
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "#cbd5e1" }}>
                      {item.recommended_action}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* SHAP Feature Importance Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-primary)" }}>
                SHAP Explainability & Impact Ranking
              </h3>
              <span className="badge badge-healthy">TreeExplainer</span>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <h4 className="card-title" style={{ fontSize: "0.95rem" }}>
                    <BarChart2 size={16} color="var(--status-healthy)" />
                    Top Root Cause Features
                  </h4>
                  <p className="card-subtitle">Features driving predictions and model variance</p>
                </div>
              </div>

              {/* Display SHAP Summary Bar Chart Image */}
              <div
                style={{
                  borderRadius: "var(--radius-md)",
                  overflow: "hidden",
                  border: "1px solid var(--border-subtle)",
                  marginBottom: "16px",
                  background: "#0f172a",
                  textAlign: "center",
                }}
              >
                <img
                  src={`${API_BASE}/storage/shap_summary.png?t=${Date.now()}`}
                  alt="SHAP Feature Importance"
                  style={{ width: "100%", height: "auto", display: "block" }}
                  onError={(e) => {
                    e.target.style.display = "none";
                  }}
                />
              </div>

              {/* Feature Importance Table */}
              {diagnosisData.shap?.feature_importance && (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Feature</th>
                        <th>Importance Weight</th>
                        <th>Impact Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(diagnosisData.shap.feature_importance).map(([feat, score], idx) => (
                        <tr key={feat}>
                          <td><strong>{feat}</strong></td>
                          <td style={{ fontFamily: "JetBrains Mono" }}>{score}</td>
                          <td>
                            <span className={`badge ${idx < 3 ? "badge-critical" : "badge-info"}`}>
                              {idx < 3 ? "HIGH IMPACT" : "MODERATE"}
                            </span>
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
      )}
    </div>
  );
}
