from typing import Dict, Any, Optional, List


def determine_health_status(
    evaluation: Optional[Dict[str, Any]],
    drift_result: Optional[Dict[str, Any]],
    prediction_drift_result: Optional[Dict[str, Any]],
    quality_result: Optional[Dict[str, Any]] = None,
    schema_result: Optional[Dict[str, Any]] = None,
    drift_classification: str = "UNCLASSIFIED",
    thresholds: Optional[Dict[str, Any]] = None,
    task_type: str = "classification"
) -> Dict[str, Any]:
    """
    Computes decomposed model health across 5 independent sub-systems:
    1. Performance Health
    2. Data Health
    3. Drift Health (context-aware: EXPECTED vs UNEXPECTED)
    4. Prediction Health
    5. Schema Health
    """
    thresholds = thresholds or {}
    evaluation = evaluation or {}
    drift_result = drift_result or {}
    prediction_drift_result = prediction_drift_result or {}
    quality_result = quality_result or {}
    schema_result = schema_result or {}

    reasons = []

    # ==========================================
    # 1. Performance Health Sub-system
    # ==========================================
    labels_available = evaluation.get("labels_available", True)
    f1 = evaluation.get("f1")
    roc_auc = evaluation.get("roc_auc")
    accuracy = evaluation.get("accuracy")
    rmse = evaluation.get("rmse")
    mae = evaluation.get("mae")
    r2 = evaluation.get("r2")

    perf_reasons = []
    perf_score = 100.0
    perf_status = "HEALTHY"

    if not labels_available or (f1 is None and accuracy is None and rmse is None):
        perf_status = "UNKNOWN"
        perf_score = None
        perf_reasons.append("Performance evaluation skipped (ground-truth labels are delayed/unavailable).")
    else:
        if task_type == "regression":
            r2_crit = thresholds.get("r2_critical", 0.0)
            r2_warn = thresholds.get("r2_warning", 0.5)
            if r2 is not None:
                if r2 < r2_crit:
                    perf_reasons.append(f"R² is critically low ({r2:.4f} < {r2_crit}).")
                    perf_score -= 30.0
                elif r2 < r2_warn:
                    perf_reasons.append(f"R² is sub-optimal ({r2:.4f} < {r2_warn}).")
                    perf_score -= 15.0
            if mae is not None and mae > thresholds.get("mae_warning", 1000.0):
                perf_reasons.append(f"MAE elevated ({mae:.4f}).")
                perf_score -= 15.0
        else:
            # Classification / Multiclass
            f1_crit = thresholds.get("f1_critical", 0.50)
            f1_warn = thresholds.get("f1_warning", 0.65)
            if f1 is not None:
                if f1 < f1_crit:
                    perf_reasons.append(f"F1 score critically below threshold ({f1:.4f} < {f1_crit}).")
                    perf_score -= 25.0
                elif f1 < f1_warn:
                    perf_reasons.append(f"F1 score below benchmark ({f1:.4f} < {f1_warn}).")
                    perf_score -= 10.0

            if roc_auc is not None:
                auc_crit = thresholds.get("roc_auc_critical", 0.70)
                auc_warn = thresholds.get("roc_auc_warning", 0.80)
                if roc_auc < auc_crit:
                    perf_reasons.append(f"ROC-AUC critically below threshold ({roc_auc:.4f} < {auc_crit}).")
                    perf_score -= 25.0
                elif roc_auc < auc_warn:
                    perf_reasons.append(f"ROC-AUC below optimal threshold ({roc_auc:.4f} < {auc_warn}).")
                    perf_score -= 10.0

        perf_score = max(0.0, min(100.0, round(perf_score, 1)))
        if perf_score < 60.0 or (f1 is not None and f1 < 0.50) or (r2 is not None and r2 < 0.0):
            perf_status = "CRITICAL"
        elif perf_score < 85.0:
            perf_status = "WARNING"
        else:
            perf_status = "HEALTHY"

    # ==========================================
    # 2. Data Health Sub-system
    # ==========================================
    data_reasons = []
    data_score = 100.0
    data_status = "HEALTHY"

    if quality_result:
        if not quality_result.get("healthy", True):
            issues = quality_result.get("issues", [])
            data_reasons.append(f"Detected {len(issues)} data quality anomalies.")
            data_score -= min(30.0, len(issues) * 10.0)
            data_status = "WARNING" if len(issues) < 3 else "CRITICAL"

    data_score = max(0.0, min(100.0, round(data_score, 1)))

    # ==========================================
    # 3. Drift Health Sub-system (Context-Aware)
    # ==========================================
    drift_reasons = []
    drift_score = 100.0
    drift_status = "HEALTHY"

    drift_rate = drift_result.get("drift_rate", 0.0)
    drifted_count = drift_result.get("drifted_feature_count", 0)

    if drift_rate > 0:
        if drift_classification == "EXPECTED":
            drift_reasons.append(
                f"Observed feature drift ({drifted_count} features, {round(drift_rate * 100, 1)}%) matches expected contextual/seasonal baseline."
            )
            drift_status = "HEALTHY"  # Expected drift is classified as healthy monitoring
        else:
            if drift_rate >= thresholds.get("drift_rate_critical", 0.30):
                drift_reasons.append(f"High feature drift detected: {drifted_count} features ({round(drift_rate * 100, 1)}%) shifted.")
                drift_score -= 35.0
                drift_status = "CRITICAL"
            elif drift_rate >= thresholds.get("drift_rate_warning", 0.10):
                drift_reasons.append(f"Moderate feature drift detected: {drifted_count} features ({round(drift_rate * 100, 1)}%) shifted.")
                drift_score -= 15.0
                drift_status = "WARNING"

    drift_score = max(0.0, min(100.0, round(drift_score, 1)))

    # ==========================================
    # 4. Prediction Health Sub-system
    # ==========================================
    pred_reasons = []
    pred_score = 100.0
    pred_status = "HEALTHY"

    if prediction_drift_result.get("drift_detected", False):
        pred_reasons.append("Model output prediction distribution has shifted from baseline.")
        pred_score -= 20.0
        pred_status = "WARNING"

    pred_score = max(0.0, min(100.0, round(pred_score, 1)))

    # ==========================================
    # 5. Schema Health Sub-system
    # ==========================================
    schema_reasons = []
    schema_score = 100.0
    schema_status = "HEALTHY"

    if schema_result:
        schema_score = schema_result.get("schema_score", 100.0)
        schema_status = schema_result.get("status", "HEALTHY")
        for iss in schema_result.get("issues", []):
            schema_reasons.append(iss.get("message", "Schema mismatch detected."))

    # ==========================================
    # Overall Composite Synthesis
    # ==========================================
    all_reasons = perf_reasons + data_reasons + drift_reasons + pred_reasons + schema_reasons

    # Check if there is insufficient evidence to determine anything
    has_any_evidence = (
        perf_status != "UNKNOWN"
        or drift_result.get("total_features", 0) > 0
        or "drift_detected" in prediction_drift_result
        or bool(quality_result)
    )

    if not has_any_evidence:
        return {
            "status": "UNKNOWN",
            "health_score": None,
            "reasons": ["Insufficient data or telemetry to evaluate health."],
            "components": {
                "performance": {"status": "UNKNOWN", "score": None, "reasons": perf_reasons},
                "data": {"status": "UNKNOWN", "score": None, "reasons": data_reasons},
                "drift": {"status": "UNKNOWN", "score": None, "reasons": drift_reasons, "classification": drift_classification},
                "prediction": {"status": "UNKNOWN", "score": None, "reasons": pred_reasons},
                "schema": {"status": "UNKNOWN", "score": None, "reasons": schema_reasons}
            }
        }

    # Weight available component scores
    weights = []
    scores = []

    if perf_score is not None:
        scores.append(perf_score)
        weights.append(0.35)
    if drift_score is not None:
        scores.append(drift_score)
        weights.append(0.25)
    if pred_score is not None:
        scores.append(pred_score)
        weights.append(0.15)
    if data_score is not None:
        scores.append(data_score)
        weights.append(0.15)
    if schema_score is not None:
        scores.append(schema_score)
        weights.append(0.10)

    if weights:
        total_w = sum(weights)
        norm_weights = [w / total_w for w in weights]
        overall_score = sum(s * w for s, w in zip(scores, norm_weights))
        overall_score = max(0.0, min(100.0, round(overall_score, 1)))
    else:
        overall_score = None

    # Overall Status determination
    statuses = [perf_status, data_status, drift_status, pred_status, schema_status]
    if "CRITICAL" in statuses or (overall_score is not None and overall_score < 60.0):
        overall_status = "CRITICAL"
    elif "WARNING" in statuses or (overall_score is not None and overall_score < 85.0):
        overall_status = "WARNING"
    elif all(s in ("HEALTHY", "UNKNOWN") for s in statuses) and any(s == "HEALTHY" for s in statuses):
        overall_status = "HEALTHY"
    else:
        overall_status = "UNKNOWN"

    return {
        "status": overall_status,
        "health_score": overall_score,
        "reasons": all_reasons if all_reasons else ["All telemetry, data, and model signals are within optimal boundaries."],
        "drift_classification": drift_classification,
        "components": {
            "performance": {"status": perf_status, "score": perf_score, "reasons": perf_reasons},
            "data": {"status": data_status, "score": data_score, "reasons": data_reasons},
            "drift": {"status": drift_status, "score": drift_score, "reasons": drift_reasons, "classification": drift_classification},
            "prediction": {"status": pred_status, "score": pred_score, "reasons": pred_reasons},
            "schema": {"status": schema_status, "score": schema_score, "reasons": schema_reasons}
        }
    }