import React, { useState, useEffect } from "react";
import {
  Cpu,
  Database,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Trash2,
  Eye,
  Check,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Zap,
  Layers,
  ArrowRight,
  ShieldCheck,
  Clock,
  ChevronRight,
  Tag
} from "lucide-react";
import {
  fetchVersions,
  fetchReferenceBaselines,
  fetchDatasets,
  uploadChampionModel,
  createReferenceBaseline,
  uploadProductionDataset,
  setUnitCurrentDataset,
  deleteDataset
} from "../api";
import DatasetProfileModal from "./DatasetProfileModal";

export default function ModelSetupView({
  unit,
  onRefreshUnit,
  onOpenRunMonitoring
}) {
  const [loading, setLoading] = useState(true);
  const [versions, setVersions] = useState([]);
  const [baselines, setBaselines] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [toastMsg, setToastMsg] = useState(null);

  // Modals state
  const [showChampionModal, setShowChampionModal] = useState(false);
  const [showBaselineModal, setShowBaselineModal] = useState(false);
  const [showDatasetModal, setShowDatasetModal] = useState(false);
  const [viewingProfileDataset, setViewingProfileDataset] = useState(null);

  // Form states for Champion upload
  const [championFile, setChampionFile] = useState(null);
  const [championVersion, setChampionVersion] = useState("v1.0.0");
  const [championName, setChampionName] = useState("");
  const [championFramework, setChampionFramework] = useState("xgboost");
  const [isUploadingChampion, setIsUploadingChampion] = useState(false);

  // Form states for Baseline upload
  const [baselineFile, setBaselineFile] = useState(null);
  const [baselineName, setBaselineName] = useState("");
  const [baselineDescription, setBaselineDescription] = useState("");
  const [baselineTargetCol, setBaselineTargetCol] = useState(unit?.target_column || "Churn");
  const [baselineIsDefault, setBaselineIsDefault] = useState(false);
  const [selectedDriftFeatures, setSelectedDriftFeatures] = useState([]);
  const [customDriftFeature, setCustomDriftFeature] = useState("");
  const [isUploadingBaseline, setIsUploadingBaseline] = useState(false);

  // Form states for Production Dataset upload
  const [datasetFile, setDatasetFile] = useState(null);
  const [datasetName, setDatasetName] = useState("");
  const [datasetDescription, setDatasetDescription] = useState("");
  const [datasetSetAsCurrent, setDatasetSetAsCurrent] = useState(true);
  const [isUploadingDataset, setIsUploadingDataset] = useState(false);

  // Production dataset filtering
  const [datasetFilter, setDatasetFilter] = useState("ALL");
  const [datasetSearch, setDatasetSearch] = useState("");

  function showToast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  }

  async function loadData() {
    if (!unit?.id) return;
    setLoading(true);
    try {
      const [vers, base, dsets] = await Promise.all([
        fetchVersions(unit.id).catch(() => []),
        fetchReferenceBaselines(unit.id).catch(() => []),
        fetchDatasets(unit.id).catch(() => []),
      ]);
      setVersions(vers || []);
      setBaselines(base || []);
      setDatasets(dsets || []);

      // Suggest next version
      if (vers && vers.length > 0) {
        setChampionVersion(`v${vers.length + 1}.0.0`);
      }
    } catch (err) {
      console.error("Failed to load setup data:", err);
      showToast(`Error loading data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [unit?.id]);

  const activeChampion =
    versions.find((v) => v.is_active === 1 || v.is_active === true) ||
    versions[0] ||
    null;

  // Features detected on the active champion
  const detectedFeatures = Array.isArray(activeChampion?.feature_names)
    ? activeChampion.feature_names
    : [];

  // --- CHAMPION UPLOAD HANDLER ---
  async function handleChampionSubmit(e) {
    e.preventDefault();
    if (!championFile) {
      showToast("Please select a model artifact file (.pkl, .joblib, .pt, etc.)");
      return;
    }
    setIsUploadingChampion(true);
    try {
      const formData = new FormData();
      formData.append("file", championFile);
      formData.append("version", championVersion || "v1.0.0");
      formData.append("name", championName || `${unit.name} Champion`);
      formData.append("model_type", championFramework);

      const res = await uploadChampionModel(unit.id, formData);
      showToast(res.message || "Champion model uploaded successfully!");
      setShowChampionModal(false);
      setChampionFile(null);
      await loadData();
      if (onRefreshUnit) onRefreshUnit();
    } catch (err) {
      showToast(`Failed to upload champion: ${err.message}`);
    } finally {
      setIsUploadingChampion(false);
    }
  }

  // --- REFERENCE BASELINE UPLOAD HANDLER ---
  async function handleBaselineSubmit(e) {
    e.preventDefault();
    if (!baselineFile) {
      showToast("Please select a reference baseline CSV file");
      return;
    }
    setIsUploadingBaseline(true);
    try {
      const formData = new FormData();
      formData.append("file", baselineFile);
      formData.append("name", baselineName || "Reference Baseline");
      formData.append("description", baselineDescription || "");
      formData.append("target_column", baselineTargetCol || unit.target_column || "Churn");
      formData.append("is_default", baselineIsDefault ? "true" : "false");
      formData.append("expected_drift_features", JSON.stringify(selectedDriftFeatures));

      const res = await createReferenceBaseline(unit.id, formData);
      showToast(res.message || "Reference baseline registered successfully!");
      setShowBaselineModal(false);
      setBaselineFile(null);
      setBaselineName("");
      setBaselineDescription("");
      setSelectedDriftFeatures([]);
      await loadData();
      if (onRefreshUnit) onRefreshUnit();
    } catch (err) {
      showToast(`Failed to add baseline: ${err.message}`);
    } finally {
      setIsUploadingBaseline(false);
    }
  }

  // --- PRODUCTION DATASET UPLOAD HANDLER ---
  async function handleDatasetSubmit(e) {
    e.preventDefault();
    if (!datasetFile) {
      showToast("Please select a production dataset CSV file");
      return;
    }
    setIsUploadingDataset(true);
    try {
      const formData = new FormData();
      formData.append("file", datasetFile);
      formData.append("name", datasetName || datasetFile.name.replace(".csv", ""));
      formData.append("description", datasetDescription || "Production Telemetry Batch");
      formData.append("target_column", unit.target_column || "Churn");
      formData.append("set_as_current", datasetSetAsCurrent ? "true" : "false");

      const res = await uploadProductionDataset(unit.id, formData);
      showToast(res.message || "Production dataset uploaded to library!");
      setShowDatasetModal(false);
      setDatasetFile(null);
      setDatasetName("");
      setDatasetDescription("");
      await loadData();
      if (onRefreshUnit) onRefreshUnit();
    } catch (err) {
      showToast(`Failed to upload dataset: ${err.message}`);
    } finally {
      setIsUploadingDataset(false);
    }
  }

  // --- SET CURRENT DATASET HANDLER ---
  async function handleSetAsCurrent(datasetId) {
    try {
      const res = await setUnitCurrentDataset(unit.id, datasetId);
      showToast(res.message || "Dataset set as current monitoring batch!");
      await loadData();
      if (onRefreshUnit) onRefreshUnit();
    } catch (err) {
      showToast(`Failed to set current dataset: ${err.message}`);
    }
  }

  // --- DELETE DATASET HANDLER ---
  async function handleDeleteDataset(dataset) {
    if (!window.confirm(`Are you sure you want to delete dataset '${dataset.name}' from the library?`)) {
      return;
    }
    try {
      const res = await deleteDataset(dataset.id);
      showToast(res.message || "Dataset removed from library.");
      await loadData();
      if (onRefreshUnit) onRefreshUnit();
    } catch (err) {
      showToast(`Failed to delete dataset: ${err.message}`);
    }
  }

  // Filtered dataset library
  const filteredDatasets = datasets.filter((d) => {
    if (datasetFilter !== "ALL" && d.status !== datasetFilter) return false;
    if (datasetSearch.trim()) {
      const q = datasetSearch.toLowerCase();
      const matchName = d.name && d.name.toLowerCase().includes(q);
      const matchDesc = d.description && d.description.toLowerCase().includes(q);
      return matchName || matchDesc;
    }
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }} className="fade-in">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 1300,
            background: "rgba(15, 23, 42, 0.95)",
            border: "1px solid var(--primary)",
            padding: "12px 20px",
            borderRadius: "10px",
            color: "#fff",
            fontWeight: 600,
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
          }}
        >
          {toastMsg}
        </div>
      )}

      {/* Header Banner */}
      <div
        className="glass-card"
        style={{
          padding: "24px",
          background: "linear-gradient(135deg, rgba(28, 31, 42, 0.9) 0%, rgba(38, 42, 53, 0.8) 100%)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <span
              style={{
                padding: "3px 10px",
                backgroundColor: "rgba(192, 193, 255, 0.15)",
                color: "var(--primary)",
                borderRadius: "20px",
                fontSize: "0.75rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <Layers size={13} /> Data & Model Onboarding
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--on-surface-variant)" }}>
              Monitoring Unit #{unit.id}
            </span>
          </div>
          <h2 style={{ margin: 0, fontSize: "1.45rem", fontWeight: 800, color: "#fff" }}>
            Model Setup & Data Sources
          </h2>
          <p style={{ margin: "4px 0 0 0", fontSize: "0.88rem", color: "var(--on-surface-variant)", maxWidth: "650px" }}>
            Maintain the Champion artifact, baseline ground-truth distributions, and production telemetry datasets with complete version traceability.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={loadData}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle)",
              backgroundColor: "var(--surface-container-high)",
              color: "var(--on-surface-variant)",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            title="Refresh Setup Data"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <button
            onClick={onOpenRunMonitoring}
            style={{
              padding: "10px 18px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "var(--primary)",
              color: "var(--on-primary)",
              fontWeight: 700,
              fontSize: "0.88rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 4px 14px rgba(192, 193, 255, 0.25)",
            }}
          >
            <Zap size={16} />
            <span>⚡ Run Monitoring Pipeline</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* AREA 1: CHAMPION MODEL */}
      {/* ========================================================================= */}
      <div
        className="glass-card"
        style={{
          padding: "24px",
          backgroundColor: "var(--surface-container)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "14px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                backgroundColor: "rgba(192, 193, 255, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--primary)",
              }}
            >
              <Cpu size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "#fff" }}>
                  1. Champion Model Artifact
                </h3>
                <span
                  style={{
                    padding: "2px 8px",
                    backgroundColor: activeChampion ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                    color: activeChampion ? "#10b981" : "#fbbf24",
                    borderRadius: "12px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                  }}
                >
                  {activeChampion ? "Active Champion" : "No Model Uploaded"}
                </span>
              </div>
              <p style={{ margin: "2px 0 0 0", fontSize: "0.82rem", color: "var(--on-surface-variant)" }}>
                Active production model serving inferences and undergoing health & drift benchmarking.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setChampionName(`${unit.name} Champion`);
              setShowChampionModal(true);
            }}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid var(--primary)",
              backgroundColor: "rgba(192, 193, 255, 0.1)",
              color: "var(--primary)",
              fontWeight: 600,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <UploadCloud size={16} />
            <span>Upload / Replace Champion</span>
          </button>
        </div>

        {activeChampion ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "16px",
              padding: "16px",
              backgroundColor: "var(--surface-container-low)",
              border: "1px solid rgba(70, 69, 84, 0.3)",
              borderRadius: "10px",
            }}
          >
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Active Version & Framework
              </div>
              <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#fff", marginTop: "4px" }}>
                {activeChampion.version || "v1.0.0"}
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--primary)", marginTop: "2px", fontWeight: 600 }}>
                {activeChampion.model_type || "Classification Model"}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--outline)", marginTop: "6px" }}>
                Registered: {activeChampion.created_at || "Production"}
              </div>
            </div>

            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--on-surface-variant)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Target & Policy
              </div>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff", marginTop: "6px" }}>
                Target Column: <code style={{ color: "var(--primary)" }}>{unit.target_column || "Churn"}</code>
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--on-surface-variant)", marginTop: "4px" }}>
                Promotion Policy: <strong>{unit.promotion_mode}</strong> (Safety Gated)
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--outline)", marginTop: "6px" }}>
                File: {activeChampion.model_path || "Artifact stored in system storage"}
              </div>
            </div>

            <div style={{ gridColumn: "1 / -1", borderTop: "1px solid rgba(70, 69, 84, 0.2)", paddingTop: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--on-surface-variant)", textTransform: "uppercase" }}>
                  Detected Model Input Features ({detectedFeatures.length})
                </span>
                <span style={{ fontSize: "0.72rem", color: "var(--outline)" }}>
                  Extracted automatically from artifact adapter
                </span>
              </div>

              {detectedFeatures.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {detectedFeatures.map((feat, idx) => (
                    <span
                      key={idx}
                      style={{
                        padding: "3px 8px",
                        backgroundColor: "var(--surface-container-high)",
                        border: "1px solid rgba(70, 69, 84, 0.4)",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontFamily: "monospace",
                        color: "var(--on-surface)",
                      }}
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: "0.82rem", color: "var(--outline)", fontStyle: "italic" }}>
                  Feature list will display upon adapter inspection.
                </span>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: "32px",
              textAlign: "center",
              backgroundColor: "var(--surface-container-low)",
              border: "1px dashed var(--border-subtle)",
              borderRadius: "10px",
            }}
          >
            <Cpu size={36} style={{ margin: "0 auto 12px auto", color: "var(--outline)" }} />
            <h4 style={{ margin: 0, fontSize: "1rem", color: "var(--on-surface)" }}>
              No Champion Model Uploaded Yet
            </h4>
            <p style={{ margin: "4px 0 16px 0", fontSize: "0.85rem", color: "var(--on-surface-variant)" }}>
              Upload a serialized model artifact (.pkl, .joblib, etc.) to establish the champion version.
            </p>
            <button
              onClick={() => {
                setChampionName(`${unit.name} Champion`);
                setShowChampionModal(true);
              }}
              style={{
                padding: "8px 18px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "var(--primary)",
                color: "var(--on-primary)",
                fontWeight: 700,
                fontSize: "0.85rem",
              }}
            >
              Upload Champion Model
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* AREA 2: REFERENCE BASELINES */}
      {/* ========================================================================= */}
      <div
        className="glass-card"
        style={{
          padding: "24px",
          backgroundColor: "var(--surface-container)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "14px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                backgroundColor: "rgba(56, 189, 248, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#38bdf8",
              }}
            >
              <Database size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "#fff" }}>
                  2. Reference Baselines
                </h3>
                <span
                  style={{
                    padding: "2px 8px",
                    backgroundColor: "rgba(56, 189, 248, 0.2)",
                    color: "#38bdf8",
                    borderRadius: "12px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                  }}
                >
                  {baselines.length} Registered
                </span>
              </div>
              <p style={{ margin: "2px 0 0 0", fontSize: "0.82rem", color: "var(--on-surface-variant)" }}>
                Ground truth training / validation distributions for statistical drift detection and performance benchmarking.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setBaselineName(`${unit.name} Baseline`);
              setBaselineIsDefault(baselines.length === 0);
              setShowBaselineModal(true);
            }}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid #38bdf8",
              backgroundColor: "rgba(56, 189, 248, 0.1)",
              color: "#38bdf8",
              fontWeight: 600,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Plus size={16} />
            <span>Add Reference Baseline</span>
          </button>
        </div>

        {baselines.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {baselines.map((b) => {
              const driftFeats = Array.isArray(b.expected_drift_features)
                ? b.expected_drift_features
                : [];
              return (
                <div
                  key={b.id}
                  style={{
                    padding: "16px",
                    backgroundColor: "var(--surface-container-low)",
                    border: b.is_default ? "1px solid rgba(56, 189, 248, 0.5)" : "1px solid var(--border-subtle)",
                    borderRadius: "10px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "14px",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "1rem", fontWeight: 700, color: "#fff" }}>
                        {b.name}
                      </span>
                      {b.is_default && (
                        <span
                          style={{
                            padding: "2px 8px",
                            backgroundColor: "rgba(56, 189, 248, 0.2)",
                            color: "#38bdf8",
                            borderRadius: "12px",
                            fontSize: "0.7rem",
                            fontWeight: 800,
                            letterSpacing: "0.04em",
                          }}
                        >
                          ★ DEFAULT BASELINE
                        </span>
                      )}
                      <span
                        style={{
                          padding: "2px 6px",
                          backgroundColor: "var(--surface-container-high)",
                          color: "var(--outline)",
                          borderRadius: "4px",
                          fontSize: "0.7rem",
                          fontFamily: "monospace",
                        }}
                      >
                        ID: {b.id}
                      </span>
                    </div>

                    <div style={{ fontSize: "0.82rem", color: "var(--on-surface-variant)" }}>
                      {b.description || "Reference baseline distribution"}
                    </div>

                    <div style={{ display: "flex", gap: "16px", fontSize: "0.78rem", color: "var(--outline)", marginTop: "4px" }}>
                      <span><strong>Rows:</strong> {b.row_count ? b.row_count.toLocaleString() : "N/A"}</span>
                      <span><strong>Columns:</strong> {b.column_count ?? "N/A"}</span>
                      <span><strong>Target:</strong> <code style={{ color: "var(--primary)" }}>{b.target_column || "Churn"}</code></span>
                      <span><strong>Created:</strong> {b.created_at || "Preserved"}</span>
                    </div>

                    {driftFeats.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                        <span style={{ fontSize: "0.72rem", color: "var(--outline)", textTransform: "uppercase" }}>
                          Watched Features:
                        </span>
                        {driftFeats.map((df, i) => (
                          <span
                            key={i}
                            style={{
                              padding: "1px 6px",
                              backgroundColor: "rgba(255, 180, 171, 0.15)",
                              color: "var(--error)",
                              borderRadius: "4px",
                              fontSize: "0.7rem",
                              fontFamily: "monospace",
                            }}
                          >
                            {df}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      onClick={() => setViewingProfileDataset({ name: b.name, file_path: b.file_path, status: "READY" })}
                      style={{
                        padding: "6px 12px",
                        backgroundColor: "var(--surface-container-high)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "6px",
                        color: "var(--on-surface)",
                        fontSize: "0.8rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <Eye size={14} />
                      <span>View Profile</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              backgroundColor: "var(--surface-container-low)",
              border: "1px dashed var(--border-subtle)",
              borderRadius: "10px",
            }}
          >
            <Database size={32} style={{ margin: "0 auto 8px auto", color: "var(--outline)" }} />
            <div style={{ fontSize: "0.9rem", color: "var(--on-surface)" }}>No Reference Baselines Registered</div>
            <p style={{ margin: "4px 0 12px 0", fontSize: "0.8rem", color: "var(--on-surface-variant)" }}>
              Upload your baseline training dataset CSV to enable continuous data drift calculations.
            </p>
            <button
              onClick={() => {
                setBaselineName(`${unit.name} Baseline`);
                setBaselineIsDefault(true);
                setShowBaselineModal(true);
              }}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "#38bdf8",
                color: "#000",
                fontWeight: 700,
                fontSize: "0.82rem",
              }}
            >
              Add First Baseline
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* AREA 3: PRODUCTION DATASET LIBRARY */}
      {/* ========================================================================= */}
      <div
        className="glass-card"
        style={{
          padding: "24px",
          backgroundColor: "var(--surface-container)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "14px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#10b981",
              }}
            >
              <Layers size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "#fff" }}>
                  3. Production Dataset Library
                </h3>
                <span
                  style={{
                    padding: "2px 8px",
                    backgroundColor: "rgba(16, 185, 129, 0.2)",
                    color: "#10b981",
                    borderRadius: "12px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                  }}
                >
                  {datasets.length} Batches in Library
                </span>
              </div>
              <p style={{ margin: "2px 0 0 0", fontSize: "0.82rem", color: "var(--on-surface-variant)" }}>
                Persistent library of production telemetry batches. Switch the active monitoring dataset or test stress scenarios without re-uploading.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              setDatasetName(`Production Batch ${datasets.length + 1}`);
              setShowDatasetModal(true);
            }}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid #10b981",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              color: "#10b981",
              fontWeight: 600,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Plus size={16} />
            <span>Add Production Dataset</span>
          </button>
        </div>

        {/* Filter / Search Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "16px",
            padding: "10px 14px",
            backgroundColor: "var(--surface-container-low)",
            borderRadius: "8px",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ display: "flex", gap: "6px" }}>
            {["ALL", "CURRENT", "READY", "USED"].map((f) => (
              <button
                key={f}
                onClick={() => setDatasetFilter(f)}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: datasetFilter === f ? "var(--primary)" : "transparent",
                  color: datasetFilter === f ? "var(--on-primary)" : "var(--on-surface-variant)",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                }}
              >
                {f}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1", maxWidth: "280px" }}>
            <Search size={14} style={{ color: "var(--outline)" }} />
            <input
              type="text"
              placeholder="Search batches by name or tag..."
              value={datasetSearch}
              onChange={(e) => setDatasetSearch(e.target.value)}
              style={{
                width: "100%",
                backgroundColor: "transparent",
                border: "none",
                color: "var(--on-surface)",
                fontSize: "0.82rem",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Datasets Table */}
        {filteredDatasets.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(70, 69, 84, 0.3)", textAlign: "left", color: "var(--outline)" }}>
                  <th style={{ padding: "10px 12px", fontSize: "0.75rem", textTransform: "uppercase" }}>Dataset / Scenario</th>
                  <th style={{ padding: "10px 12px", fontSize: "0.75rem", textTransform: "uppercase" }}>Shape</th>
                  <th style={{ padding: "10px 12px", fontSize: "0.75rem", textTransform: "uppercase" }}>Status</th>
                  <th style={{ padding: "10px 12px", fontSize: "0.75rem", textTransform: "uppercase" }}>Created</th>
                  <th style={{ padding: "10px 12px", fontSize: "0.75rem", textTransform: "uppercase", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDatasets.map((d) => {
                  const isCurrent = d.status === "CURRENT";
                  return (
                    <tr
                      key={d.id}
                      style={{
                        borderBottom: "1px solid rgba(70, 69, 84, 0.2)",
                        backgroundColor: isCurrent ? "rgba(56, 189, 248, 0.05)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "12px" }}>
                        <div style={{ fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                          {d.name}
                          {isCurrent && (
                            <span
                              style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                backgroundColor: "#38bdf8",
                                boxShadow: "0 0 8px #38bdf8",
                              }}
                              title="Active current dataset"
                            />
                          )}
                        </div>
                        {d.description && (
                          <div style={{ fontSize: "0.78rem", color: "var(--on-surface-variant)", marginTop: "2px" }}>
                            {d.description}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: "12px", color: "var(--on-surface-variant)", fontFamily: "monospace", fontSize: "0.8rem" }}>
                        {d.row_count ? `${d.row_count.toLocaleString()} rows` : "N/A"}
                        {d.column_count ? ` × ${d.column_count} cols` : ""}
                      </td>

                      <td style={{ padding: "12px" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "12px",
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            backgroundColor:
                              d.status === "CURRENT"
                                ? "rgba(56, 189, 248, 0.2)"
                                : d.status === "USED"
                                ? "rgba(192, 193, 255, 0.18)"
                                : d.status === "ERROR"
                                ? "rgba(239, 68, 68, 0.2)"
                                : "rgba(16, 185, 129, 0.2)",
                            color:
                              d.status === "CURRENT"
                                ? "#38bdf8"
                                : d.status === "USED"
                                ? "var(--primary)"
                                : d.status === "ERROR"
                                ? "#f87171"
                                : "#10b981",
                          }}
                        >
                          {d.status || "READY"}
                        </span>
                      </td>

                      <td style={{ padding: "12px", fontSize: "0.78rem", color: "var(--outline)" }}>
                        {d.created_at || "Recent"}
                      </td>

                      <td style={{ padding: "12px", textAlign: "right" }}>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                          {!isCurrent && (
                            <button
                              onClick={() => handleSetAsCurrent(d.id)}
                              style={{
                                padding: "4px 10px",
                                borderRadius: "6px",
                                border: "1px solid rgba(56, 189, 248, 0.4)",
                                backgroundColor: "rgba(56, 189, 248, 0.1)",
                                color: "#38bdf8",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                              }}
                              title="Set this dataset as the active Current dataset for monitoring"
                            >
                              Use for Monitoring
                            </button>
                          )}

                          <button
                            onClick={() => setViewingProfileDataset(d)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              border: "1px solid var(--border-subtle)",
                              backgroundColor: "var(--surface-container-high)",
                              color: "var(--on-surface)",
                              fontSize: "0.75rem",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                            title="View statistical summary and distribution profile"
                          >
                            <Eye size={13} />
                            <span>Profile</span>
                          </button>

                          <button
                            onClick={() => handleDeleteDataset(d)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              backgroundColor: "transparent",
                              color: "var(--error)",
                              fontSize: "0.75rem",
                            }}
                            title="Delete dataset record"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              backgroundColor: "var(--surface-container-low)",
              border: "1px dashed var(--border-subtle)",
              borderRadius: "10px",
            }}
          >
            <Layers size={32} style={{ margin: "0 auto 8px auto", color: "var(--outline)" }} />
            <div style={{ fontSize: "0.9rem", color: "var(--on-surface)" }}>No Datasets Match Filter</div>
            <p style={{ margin: "4px 0 12px 0", fontSize: "0.8rem", color: "var(--on-surface-variant)" }}>
              Upload your production telemetry CSV files to build a reusable dataset library.
            </p>
            <button
              onClick={() => setShowDatasetModal(true)}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "#10b981",
                color: "#fff",
                fontWeight: 700,
                fontSize: "0.82rem",
              }}
            >
              Add Production Dataset
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: UPLOAD CHAMPION MODEL */}
      {/* ========================================================================= */}
      {showChampionModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1400,
            backgroundColor: "rgba(10, 14, 24, 0.8)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "520px",
              backgroundColor: "var(--surface-container)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "14px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                backgroundColor: "var(--surface-container-high)",
                borderBottom: "1px solid rgba(70, 69, 84, 0.3)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Cpu size={18} style={{ color: "var(--primary)" }} />
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#fff" }}>
                  Upload / Replace Champion Model
                </h3>
              </div>
              <button
                onClick={() => setShowChampionModal(false)}
                style={{ background: "none", border: "none", color: "var(--outline)", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleChampionSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--on-surface-variant)", textTransform: "uppercase", marginBottom: "6px" }}>
                  Model Artifact File (.pkl, .joblib, .pt, .onnx)
                </label>
                <div
                  style={{
                    border: "2px dashed var(--border-subtle)",
                    borderRadius: "8px",
                    padding: "20px",
                    textAlign: "center",
                    backgroundColor: "var(--surface-container-lowest)",
                    cursor: "pointer",
                  }}
                  onClick={() => document.getElementById("champion-file-input").click()}
                >
                  <UploadCloud size={28} style={{ margin: "0 auto 8px auto", color: "var(--primary)" }} />
                  <div style={{ fontSize: "0.85rem", color: "var(--on-surface)", fontWeight: 600 }}>
                    {championFile ? championFile.name : "Click to select model file or drop here"}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--outline)", marginTop: "4px" }}>
                    {championFile ? `${(championFile.size / 1024).toFixed(1)} KB` : "Supports Scikit-Learn, XGBoost, LightGBM, ONNX, PyTorch"}
                  </div>
                  <input
                    id="champion-file-input"
                    type="file"
                    style={{ display: "none" }}
                    accept=".pkl,.joblib,.pt,.onnx,.bin,.h5"
                    onChange={(e) => {
                      if (e.target.files?.[0]) setChampionFile(e.target.files[0]);
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--on-surface-variant)", textTransform: "uppercase", marginBottom: "4px" }}>
                    Version Label
                  </label>
                  <input
                    type="text"
                    required
                    value={championVersion}
                    onChange={(e) => setChampionVersion(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      backgroundColor: "var(--surface-container-lowest)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "6px",
                      color: "var(--on-surface)",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--on-surface-variant)", textTransform: "uppercase", marginBottom: "4px" }}>
                    Model Framework
                  </label>
                  <select
                    value={championFramework}
                    onChange={(e) => setChampionFramework(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      backgroundColor: "var(--surface-container-lowest)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "6px",
                      color: "var(--on-surface)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="xgboost">XGBoost</option>
                    <option value="sklearn">Scikit-Learn</option>
                    <option value="lightgbm">LightGBM</option>
                    <option value="pytorch">PyTorch</option>
                    <option value="onnx">ONNX</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--on-surface-variant)", textTransform: "uppercase", marginBottom: "4px" }}>
                  Model Name / Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. XGBoost Churn Classifier"
                  value={championName}
                  onChange={(e) => setChampionName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    backgroundColor: "var(--surface-container-lowest)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "6px",
                    color: "var(--on-surface)",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setShowChampionModal(false)}
                  disabled={isUploadingChampion}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "transparent",
                    color: "var(--on-surface-variant)",
                    fontSize: "0.82rem",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploadingChampion || !championFile}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: isUploadingChampion || !championFile ? "var(--outline-variant)" : "var(--primary)",
                    color: isUploadingChampion || !championFile ? "var(--outline)" : "var(--on-primary)",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                  }}
                >
                  {isUploadingChampion ? "Uploading & Inspecting..." : "Upload Champion"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ADD REFERENCE BASELINE */}
      {/* ========================================================================= */}
      {showBaselineModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1400,
            backgroundColor: "rgba(10, 14, 24, 0.8)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "560px",
              backgroundColor: "var(--surface-container)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "14px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                backgroundColor: "var(--surface-container-high)",
                borderBottom: "1px solid rgba(70, 69, 84, 0.3)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Database size={18} style={{ color: "#38bdf8" }} />
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#fff" }}>
                  Add Reference Baseline
                </h3>
              </div>
              <button
                onClick={() => setShowBaselineModal(false)}
                style={{ background: "none", border: "none", color: "var(--outline)", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleBaselineSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--on-surface-variant)", textTransform: "uppercase", marginBottom: "6px" }}>
                  Baseline CSV File
                </label>
                <div
                  style={{
                    border: "2px dashed var(--border-subtle)",
                    borderRadius: "8px",
                    padding: "18px",
                    textAlign: "center",
                    backgroundColor: "var(--surface-container-lowest)",
                    cursor: "pointer",
                  }}
                  onClick={() => document.getElementById("baseline-file-input").click()}
                >
                  <UploadCloud size={24} style={{ margin: "0 auto 6px auto", color: "#38bdf8" }} />
                  <div style={{ fontSize: "0.85rem", color: "var(--on-surface)", fontWeight: 600 }}>
                    {baselineFile ? baselineFile.name : "Click to select CSV baseline file"}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--outline)", marginTop: "2px" }}>
                    {baselineFile ? `${(baselineFile.size / 1024).toFixed(1)} KB` : "CSV file containing ground truth features & target"}
                  </div>
                  <input
                    id="baseline-file-input"
                    type="file"
                    style={{ display: "none" }}
                    accept=".csv"
                    onChange={(e) => {
                      if (e.target.files?.[0]) setBaselineFile(e.target.files[0]);
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--on-surface-variant)", textTransform: "uppercase", marginBottom: "4px" }}>
                    Baseline Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Retail Baseline 2026-Q1"
                    value={baselineName}
                    onChange={(e) => setBaselineName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      backgroundColor: "var(--surface-container-lowest)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "6px",
                      color: "var(--on-surface)",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--on-surface-variant)", textTransform: "uppercase", marginBottom: "4px" }}>
                    Target Column
                  </label>
                  <input
                    type="text"
                    required
                    value={baselineTargetCol}
                    onChange={(e) => setBaselineTargetCol(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      backgroundColor: "var(--surface-container-lowest)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "6px",
                      color: "var(--on-surface)",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--on-surface-variant)", textTransform: "uppercase", marginBottom: "4px" }}>
                  Description / Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Verified nominal training baseline"
                  value={baselineDescription}
                  onChange={(e) => setBaselineDescription(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    backgroundColor: "var(--surface-container-lowest)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "6px",
                    color: "var(--on-surface)",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              {/* Expected Drift Features */}
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--on-surface-variant)", textTransform: "uppercase", marginBottom: "4px" }}>
                  Expected / Watched Drift Features (Optional)
                </label>
                {detectedFeatures.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                    {detectedFeatures.map((f) => {
                      const isSel = selectedDriftFeatures.includes(f);
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => {
                            if (isSel) {
                              setSelectedDriftFeatures(selectedDriftFeatures.filter((x) => x !== f));
                            } else {
                              setSelectedDriftFeatures([...selectedDriftFeatures, f]);
                            }
                          }}
                          style={{
                            padding: "3px 8px",
                            borderRadius: "4px",
                            border: isSel ? "1px solid #38bdf8" : "1px solid var(--border-subtle)",
                            backgroundColor: isSel ? "rgba(56, 189, 248, 0.2)" : "var(--surface-container-lowest)",
                            color: isSel ? "#38bdf8" : "var(--on-surface-variant)",
                            fontSize: "0.72rem",
                            cursor: "pointer",
                          }}
                        >
                          {isSel ? "✓ " : "+ "}
                          {f}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Default baseline toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <input
                  id="baseline-default-check"
                  type="checkbox"
                  checked={baselineIsDefault}
                  onChange={(e) => setBaselineIsDefault(e.target.checked)}
                  style={{ cursor: "pointer", accentColor: "#38bdf8" }}
                />
                <label htmlFor="baseline-default-check" style={{ fontSize: "0.82rem", color: "var(--on-surface)", cursor: "pointer" }}>
                  Set as Default Reference Baseline for this unit
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setShowBaselineModal(false)}
                  disabled={isUploadingBaseline}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "transparent",
                    color: "var(--on-surface-variant)",
                    fontSize: "0.82rem",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploadingBaseline || !baselineFile}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: isUploadingBaseline || !baselineFile ? "var(--outline-variant)" : "#38bdf8",
                    color: isUploadingBaseline || !baselineFile ? "var(--outline)" : "#000",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                  }}
                >
                  {isUploadingBaseline ? "Registering..." : "Add Baseline"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ADD PRODUCTION DATASET */}
      {/* ========================================================================= */}
      {showDatasetModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1400,
            backgroundColor: "rgba(10, 14, 24, 0.8)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "520px",
              backgroundColor: "var(--surface-container)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "14px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                backgroundColor: "var(--surface-container-high)",
                borderBottom: "1px solid rgba(70, 69, 84, 0.3)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Layers size={18} style={{ color: "#10b981" }} />
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#fff" }}>
                  Add Production Dataset
                </h3>
              </div>
              <button
                onClick={() => setShowDatasetModal(false)}
                style={{ background: "none", border: "none", color: "var(--outline)", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDatasetSubmit} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--on-surface-variant)", textTransform: "uppercase", marginBottom: "6px" }}>
                  Production Telemetry CSV File
                </label>
                <div
                  style={{
                    border: "2px dashed var(--border-subtle)",
                    borderRadius: "8px",
                    padding: "18px",
                    textAlign: "center",
                    backgroundColor: "var(--surface-container-lowest)",
                    cursor: "pointer",
                  }}
                  onClick={() => document.getElementById("dataset-file-input").click()}
                >
                  <UploadCloud size={24} style={{ margin: "0 auto 6px auto", color: "#10b981" }} />
                  <div style={{ fontSize: "0.85rem", color: "var(--on-surface)", fontWeight: 600 }}>
                    {datasetFile ? datasetFile.name : "Click to select CSV telemetry file"}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--outline)", marginTop: "2px" }}>
                    {datasetFile ? `${(datasetFile.size / 1024).toFixed(1)} KB` : "CSV file containing live inferences / production batches"}
                  </div>
                  <input
                    id="dataset-file-input"
                    type="file"
                    style={{ display: "none" }}
                    accept=".csv"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        const file = e.target.files[0];
                        setDatasetFile(file);
                        if (!datasetName) setDatasetName(file.name.replace(".csv", ""));
                      }
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--on-surface-variant)", textTransform: "uppercase", marginBottom: "4px" }}>
                  Dataset / Batch Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Batch 2026-03-A"
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    backgroundColor: "var(--surface-container-lowest)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "6px",
                    color: "var(--on-surface)",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--on-surface-variant)", textTransform: "uppercase", marginBottom: "4px" }}>
                  Scenario Description / Tag
                </label>
                <input
                  type="text"
                  placeholder="e.g. Weekend Shift, Extreme Outliers, Nominal Traffic"
                  value={datasetDescription}
                  onChange={(e) => setDatasetDescription(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    backgroundColor: "var(--surface-container-lowest)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "6px",
                    color: "var(--on-surface)",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <input
                  id="dataset-current-check"
                  type="checkbox"
                  checked={datasetSetAsCurrent}
                  onChange={(e) => setDatasetSetAsCurrent(e.target.checked)}
                  style={{ cursor: "pointer", accentColor: "#10b981" }}
                />
                <label htmlFor="dataset-current-check" style={{ fontSize: "0.82rem", color: "var(--on-surface)", cursor: "pointer" }}>
                  Set as Current Dataset immediately for this Monitoring Unit
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setShowDatasetModal(false)}
                  disabled={isUploadingDataset}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "transparent",
                    color: "var(--on-surface-variant)",
                    fontSize: "0.82rem",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploadingDataset || !datasetFile}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: isUploadingDataset || !datasetFile ? "var(--outline-variant)" : "#10b981",
                    color: isUploadingDataset || !datasetFile ? "var(--outline)" : "#fff",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                  }}
                >
                  {isUploadingDataset ? "Uploading..." : "Save to Library"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: DATASET PROFILE MODAL */}
      {/* ========================================================================= */}
      {viewingProfileDataset && (
        <DatasetProfileModal
          dataset={viewingProfileDataset}
          targetColumn={unit.target_column || "Churn"}
          onClose={() => setViewingProfileDataset(null)}
        />
      )}
    </div>
  );
}
