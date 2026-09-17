import React, { useState, useEffect } from "react";
import {
  Wrench,
  Zap,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Award,
  ArrowRight,
  RefreshCw,
  Sliders,
  Sparkles
} from "lucide-react";
import { refineCandidateModel, evaluateModels } from "../api";

export default function RefinementView({ onNavigateTab, onRefreshSummary }) {
  const [loading, setLoading] = useState(false);
  const [applyFixes, setApplyFixes] = useState(true);
  const [refinementData, setRefinementData] = useState(null);
  const [evaluationData, setEvaluationData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  async function handleRunRefinement() {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Refine model
      const refRes = await refineCandidateModel(
        "data/processed/train.csv",
        "data/processed/test.csv",
        "Churn",
        applyFixes
      );
      setRefinementData(refRes);

      // 2. Evaluate baseline vs candidate on test set
      const evalRes = await evaluateModels(
        "models/baseline_model.pkl",
        refRes.candidate_model_path,
        "data/processed/test.csv",
        "Churn"
      );
      setEvaluationData(evalRes);
      if (onRefreshSummary) onRefreshSummary();
    } catch (err) {
      setErrorMsg(err.message || "Failed to refine model");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    handleRunRefinement();
  }, []);

  const promo = evaluationData?.promotion;
  const comp = evaluationData?.comparison;

  return (
    <div className="fade-in">
      {/* Top Header & Trigger Card */}
      <div className="card" style={{ marginBottom: "20px" }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <Wrench size={18} color="var(--accent-primary)" />
              Refinement Engine: Retrain, Tune & Data Remediation
            </h2>
            <p className="card-subtitle">
              Applies automated data cleaning, explores multiple candidate algorithms, tunes hyperparameters, and evaluates on held-out test data
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", cursor: "pointer", color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={applyFixes}
                onChange={(e) => setApplyFixes(e.target.checked)}
              />
              Apply Automated Data Fixes
            </label>

            <button
              className="btn btn-primary btn-sm"
              onClick={handleRunRefinement}
              disabled={loading}
            >
              <Zap size={14} />
              {loading ? "Refining & Tuning Models..." : "Run Model Refinement"}
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

      {refinementData && evaluationData && (
        <>
          {/* Winner Banner */}
          {promo && (
            <div
              className={`banner ${promo.promoted ? "banner-success" : "banner-warning"}`}
              style={{ padding: "18px 22px", borderRadius: "var(--radius-lg)", marginBottom: "24px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1 }}>
                <Award size={28} color={promo.promoted ? "var(--status-healthy)" : "var(--status-warning)"} />
                <div>
                  <div style={{ fontSize: "1.05rem", fontWeight: 800 }}>
                    {promo.promoted
                      ? `Winner: ${refinementData.best_candidate_name} (PROMOTED)`
                      : "Baseline Model Retained"}
                  </div>
                  <div style={{ fontSize: "0.85rem", opacity: 0.9, marginTop: "2px" }}>
                    {promo.reason}
                  </div>
                </div>
              </div>

              <button className="btn btn-primary btn-sm" onClick={() => onNavigateTab("versions")}>
                View Version Timeline <ArrowRight size={14} />
              </button>
            </div>
          )}

          {/* Side-by-Side Evaluation Comparison */}
          <div className="card" style={{ marginBottom: "24px" }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">
                  <TrendingUp size={18} color="var(--status-healthy)" />
                  Held-out Test Evaluation: Baseline vs Refined Model
                </h3>
                <p className="card-subtitle">Direct head-to-head metric comparison evaluated on the exact same test partition</p>
              </div>
              <span className="badge badge-info">Held-out Test (1,055 Samples)</span>
            </div>

            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Original Baseline</th>
                    <th>Refined Candidate</th>
                    <th>Absolute Delta</th>
                    <th>Relative Gain</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>F1 Score (Primary Target)</strong></td>
                    <td style={{ fontFamily: "JetBrains Mono" }}>{evaluationData.baseline?.f1}</td>
                    <td style={{ fontFamily: "JetBrains Mono", color: "var(--status-healthy)", fontWeight: 700 }}>
                      {evaluationData.candidate?.f1}
                    </td>
                    <td style={{ fontFamily: "JetBrains Mono", color: comp?.improvement?.f1 >= 0 ? "var(--status-healthy)" : "var(--status-critical)" }}>
                      {comp?.improvement?.f1 >= 0 ? `+${comp.improvement.f1}` : comp?.improvement?.f1}
                    </td>
                    <td>
                      <span className="badge badge-healthy">
                        +{comp?.percentage_changes?.f1}%
                      </span>
                    </td>
                  </tr>

                  <tr>
                    <td><strong>ROC-AUC (Discriminative Power)</strong></td>
                    <td style={{ fontFamily: "JetBrains Mono" }}>{evaluationData.baseline?.roc_auc}</td>
                    <td style={{ fontFamily: "JetBrains Mono", color: "var(--status-healthy)", fontWeight: 700 }}>
                      {evaluationData.candidate?.roc_auc}
                    </td>
                    <td style={{ fontFamily: "JetBrains Mono", color: comp?.improvement?.roc_auc >= 0 ? "var(--status-healthy)" : "var(--status-critical)" }}>
                      {comp?.improvement?.roc_auc >= 0 ? `+${comp.improvement.roc_auc}` : comp?.improvement?.roc_auc}
                    </td>
                    <td>
                      <span className="badge badge-healthy">
                        +{comp?.percentage_changes?.roc_auc}%
                      </span>
                    </td>
                  </tr>

                  <tr>
                    <td><strong>Accuracy</strong></td>
                    <td style={{ fontFamily: "JetBrains Mono" }}>{evaluationData.baseline?.accuracy}</td>
                    <td style={{ fontFamily: "JetBrains Mono" }}>{evaluationData.candidate?.accuracy}</td>
                    <td style={{ fontFamily: "JetBrains Mono" }}>
                      {comp?.improvement?.accuracy >= 0 ? `+${comp.improvement.accuracy}` : comp?.improvement.accuracy}
                    </td>
                    <td>
                      <span className="badge badge-neutral">
                        {comp?.percentage_changes?.accuracy >= 0 ? `+${comp.percentage_changes.accuracy}%` : `${comp.percentage_changes.accuracy}%`}
                      </span>
                    </td>
                  </tr>

                  <tr>
                    <td><strong>Precision / Recall</strong></td>
                    <td style={{ fontFamily: "JetBrains Mono" }}>
                      {evaluationData.baseline?.precision} / {evaluationData.baseline?.recall}
                    </td>
                    <td style={{ fontFamily: "JetBrains Mono", color: "var(--status-healthy)" }}>
                      {evaluationData.candidate?.precision} / {evaluationData.candidate?.recall}
                    </td>
                    <td colSpan={2}>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        Balanced positive class sensitivity
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Candidate Models & Applied Fixes Grid */}
          <div className="grid-2">
            {/* Candidate Search Matrix */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <Sliders size={18} color="var(--accent-secondary)" />
                  Candidate Algorithm Search Matrix
                </h3>
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Algorithm & Hyperparameters</th>
                      <th>F1</th>
                      <th>ROC-AUC</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refinementData.all_candidates?.map((cand, idx) => (
                      <tr key={idx} style={{ background: cand.is_selected ? "rgba(99, 102, 241, 0.12)" : "transparent" }}>
                        <td>
                          <strong>{cand.name}</strong>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                            Trained in {cand.training_time_sec}s
                          </div>
                        </td>
                        <td style={{ fontFamily: "JetBrains Mono" }}>{cand.metrics.f1}</td>
                        <td style={{ fontFamily: "JetBrains Mono" }}>{cand.metrics.roc_auc}</td>
                        <td>
                          {cand.is_selected ? (
                            <span className="badge badge-healthy">BEST CANDIDATE</span>
                          ) : (
                            <span className="badge badge-neutral">Evaluated</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Data Fixes Applied Card */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <Sparkles size={18} color="var(--status-info)" />
                  Data Fixes & Remediation Applied
                </h3>
                <span className="badge badge-info">{refinementData.data_fixes_applied?.length || 0} Fixes</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {refinementData.data_fixes_applied?.map((fix, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "12px 14px",
                      background: "rgba(15, 23, 42, 0.6)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <CheckCircle2 size={16} color="var(--status-healthy)" />
                    <span style={{ fontSize: "0.88rem", color: "#e2e8f0" }}>{fix}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
