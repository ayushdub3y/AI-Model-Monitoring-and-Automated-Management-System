const API_BASE = import.meta.env.VITE_API_BASE || (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:8000` : "http://127.0.0.1:8000");

// System Health & Dashboard
export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}

export async function fetchDashboardSummary(unitId = null) {
  const url = unitId ? `${API_BASE}/api/dashboard/summary?unit_id=${unitId}` : `${API_BASE}/api/dashboard/summary`;
  const res = await fetch(url);
  return res.json();
}

// Monitoring Units
export async function fetchMonitoringUnits() {
  const res = await fetch(`${API_BASE}/api/units`);
  return res.json();
}

export async function createMonitoringUnit(unitData) {
  const res = await fetch(`${API_BASE}/api/units`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(unitData),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Failed to create unit" }));
    throw new Error(error.detail || "Failed to create unit");
  }
  return res.json();
}

export async function updateUnitThresholds(unitId, thresholds) {
  const res = await fetch(`${API_BASE}/api/units/${unitId}/thresholds`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thresholds }),
  });
  return res.json();
}

// Champion Model Management
export async function uploadChampionModel(unitId, fileOrFormData, name = null, version = null) {
  let body = fileOrFormData;
  if (!(fileOrFormData instanceof FormData)) {
    const formData = new FormData();
    formData.append("file", fileOrFormData);
    if (name) formData.append("name", name);
    if (version) formData.append("version", version);
    body = formData;
  }

  const res = await fetch(`${API_BASE}/api/units/${unitId}/champion`, {
    method: "POST",
    body: body,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Failed to upload champion model" }));
    throw new Error(error.detail || error.message || "Failed to upload champion model");
  }
  return res.json();
}

// Baselines
export async function fetchReferenceBaselines(unitId) {
  const res = await fetch(`${API_BASE}/api/units/${unitId}/baselines`);
  return res.json();
}

export async function createReferenceBaseline(unitId, dataOrFormData) {
  const isFormData = dataOrFormData instanceof FormData;
  const res = await fetch(`${API_BASE}/api/units/${unitId}/baselines`, {
    method: "POST",
    headers: isFormData ? {} : { "Content-Type": "application/json" },
    body: isFormData ? dataOrFormData : JSON.stringify(dataOrFormData),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Failed to create baseline" }));
    throw new Error(error.detail || error.message || "Failed to create baseline");
  }
  return res.json();
}

// Production Datasets Library
export async function fetchDatasets(unitId = null) {
  const url = unitId ? `${API_BASE}/api/datasets?unit_id=${unitId}` : `${API_BASE}/api/datasets`;
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Failed to fetch datasets" }));
    throw new Error(error.detail || "Failed to fetch datasets");
  }
  return res.json();
}

export async function uploadProductionDataset(unitId, formData) {
  const res = await fetch(`${API_BASE}/api/units/${unitId}/datasets`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Failed to upload production dataset" }));
    throw new Error(error.detail || error.message || "Failed to upload production dataset");
  }
  return res.json();
}

export async function setUnitCurrentDataset(unitId, datasetId) {
  const res = await fetch(`${API_BASE}/api/units/${unitId}/current-dataset/${datasetId}`, {
    method: "POST",
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Failed to set current dataset" }));
    throw new Error(error.detail || "Failed to set current dataset");
  }
  return res.json();
}

export async function deleteDataset(datasetId) {
  const res = await fetch(`${API_BASE}/api/datasets/${datasetId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Failed to delete dataset" }));
    throw new Error(error.detail || "Failed to delete dataset");
  }
  return res.json();
}

// Pipeline
export async function runFullPipeline(options = {}) {
  const res = await fetch(`${API_BASE}/api/pipeline/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Pipeline run failed" }));
    throw new Error(error.detail || "Pipeline run failed");
  }
  return res.json();
}

// Intake
export async function uploadIntake(formData) {
  const res = await fetch(`${API_BASE}/api/intake`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Intake upload failed" }));
    throw new Error(error.detail || "Intake upload failed");
  }
  return res.json();
}

export async function loadSampleData() {
  const res = await fetch(`${API_BASE}/api/demo/load-samples`, {
    method: "POST",
  });
  return res.json();
}

// Profiling & Compatibility
export async function profileDataset(datasetPath, targetColumn = "Churn") {
  const res = await fetch(`${API_BASE}/api/profile/dataset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset_path: datasetPath, target_column: targetColumn }),
  });
  return res.json();
}

export async function profileModel(modelPath) {
  const res = await fetch(`${API_BASE}/api/profile/model`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_path: modelPath }),
  });
  return res.json();
}

export async function checkCompatibility(modelPath, datasetPath, targetColumn = "Churn", featureMapping = null) {
  const res = await fetch(`${API_BASE}/api/compatibility`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model_path: modelPath,
      dataset_path: datasetPath,
      target_column: targetColumn,
      feature_mapping: featureMapping,
    }),
  });
  return res.json();
}

// Health & Diagnosis
export async function analyzeHealth(modelPath, referencePath, currentPath, targetColumn = "Churn", unitId = 1, taskType = null, baselineId = null) {
  const res = await fetch(`${API_BASE}/api/health/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model_path: modelPath,
      reference_path: referencePath,
      current_path: currentPath,
      target_column: targetColumn,
      unit_id: unitId,
      task_type: taskType,
      baseline_id: baselineId,
    }),
  });
  return res.json();
}

export async function getDiagnosis(healthReport, modelPath, datasetPath, targetColumn = "Churn") {
  const res = await fetch(`${API_BASE}/api/diagnosis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      health_report: healthReport,
      model_path: modelPath,
      dataset_path: datasetPath,
      target_column: targetColumn,
    }),
  });
  return res.json();
}

// Refinement, Candidates & Safety Gates
export async function refineCandidateModel(trainPath = "data/processed/train.csv", testPath = "data/processed/test.csv", targetColumn = "Churn", applyFixes = true, unitId = 1) {
  const res = await fetch(`${API_BASE}/api/refine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      train_path: trainPath,
      test_path: testPath,
      target_column: targetColumn,
      apply_fixes: applyFixes,
      unit_id: unitId
    }),
  });
  return res.json();
}

export async function evaluateModels(baselineModelPath, candidateModelPath, testPath = "data/processed/test.csv", targetColumn = "Churn") {
  const res = await fetch(`${API_BASE}/api/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseline_model_path: baselineModelPath,
      candidate_model_path: candidateModelPath,
      test_path: testPath,
      target_column: targetColumn,
    }),
  });
  return res.json();
}

export async function fetchUnitCandidates(unitId) {
  const res = await fetch(`${API_BASE}/api/units/${unitId}/candidates`);
  return res.json();
}

export async function promoteCandidate(unitId, candidateId) {
  const res = await fetch(`${API_BASE}/api/units/${unitId}/candidates/${candidateId}/promote`, {
    method: "POST",
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Promotion failed" }));
    throw new Error(error.detail || "Promotion failed");
  }
  return res.json();
}

export async function rollbackUnit(unitId) {
  const res = await fetch(`${API_BASE}/api/units/${unitId}/rollback`, {
    method: "POST",
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Rollback failed" }));
    throw new Error(error.detail || "Rollback failed");
  }
  return res.json();
}

export async function fetchUnitAuditEvents(unitId) {
  const res = await fetch(`${API_BASE}/api/units/${unitId}/audit-events`);
  return res.json();
}

// Versions
export async function fetchVersions(unitId = null) {
  const url = unitId ? `${API_BASE}/api/versions?unit_id=${unitId}` : `${API_BASE}/api/versions`;
  const res = await fetch(url);
  return res.json();
}

export async function fetchActiveVersion(unitId = 1) {
  const res = await fetch(`${API_BASE}/api/versions/active?unit_id=${unitId}`);
  return res.json();
}

export async function activateVersion(versionId) {
  const res = await fetch(`${API_BASE}/api/versions/${versionId}/activate`, {
    method: "POST",
  });
  return res.json();
}

// Alerts & Inference
export async function fetchAlerts(unitId = null) {
  const url = unitId ? `${API_BASE}/api/alerts?unit_id=${unitId}` : `${API_BASE}/api/alerts`;
  const res = await fetch(url);
  return res.json();
}

export async function runInference(features, unitId = 1) {
  const res = await fetch(`${API_BASE}/api/inference/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ features, unit_id: unitId }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Inference failed" }));
    throw new Error(error.detail || "Inference failed");
  }
  return res.json();
}

// Guided Demo Mode APIs
export async function demoInitialize() {
  const res = await fetch(`${API_BASE}/api/demo/initialize`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Demo initialization failed" }));
    throw new Error(err.detail || "Demo initialization failed");
  }
  return res.json();
}

export async function demoEvaluateBenchmark() {
  const res = await fetch(`${API_BASE}/api/demo/evaluate`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Benchmark evaluation failed" }));
    throw new Error(err.detail || "Benchmark evaluation failed");
  }
  return res.json();
}

export async function demoUploadDrifted(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/demo/upload-drifted`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Dataset upload failed" }));
    throw new Error(err.detail || "Dataset upload failed");
  }
  return res.json();
}

export async function demoUseSampleDrifted() {
  const res = await fetch(`${API_BASE}/api/demo/use-sample-drifted`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to load sample drifted data" }));
    throw new Error(err.detail || "Failed to load sample drifted data");
  }
  return res.json();
}

export async function demoAnalyzeDrift(datasetPath = null) {
  const res = await fetch(`${API_BASE}/api/demo/analyze-drift`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset_path: datasetPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Drift analysis failed" }));
    throw new Error(err.detail || "Drift analysis failed");
  }
  return res.json();
}

export async function demoAutoRefine(datasetPath = null) {
  const res = await fetch(`${API_BASE}/api/demo/auto-refine`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset_path: datasetPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Auto refinement failed" }));
    throw new Error(err.detail || "Auto refinement failed");
  }
  return res.json();
}

export async function demoVerify(refPath = null, driftedPath = null) {
  const res = await fetch(`${API_BASE}/api/demo/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref_path: refPath, drifted_path: driftedPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Verification failed" }));
    throw new Error(err.detail || "Verification failed");
  }
  return res.json();
}

export async function demoGetLogs() {
  const res = await fetch(`${API_BASE}/api/demo/logs`);
  return res.json();
}

export async function demoReset() {
  const res = await fetch(`${API_BASE}/api/demo/reset`, { method: "POST" });
  return res.json();
}

export { API_BASE };

