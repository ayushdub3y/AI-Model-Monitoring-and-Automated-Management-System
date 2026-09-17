from typing import Dict, Any, List, Optional
from pathlib import Path
import numpy as np
import pandas as pd

from .adapters.registry import load_model_adapter


def diagnose_health(
    health_report: Dict[str, Any],
    model_path: Optional[str] = None,
    dataset_path: Optional[str] = None,
    target_column: Optional[str] = "Churn",
    shap_output_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Transforms health report metrics and drift statistics into structured Diagnosis objects.
    Each diagnosis contains:
    - issue: str
    - category: str (PERFORMANCE, DRIFT, DATA_QUALITY, SCHEMA, PREDICTION_DRIFT)
    - severity: str (CRITICAL, WARNING, INFO)
    - confidence: float (0.0 to 1.0)
    - evidence: dict
    - interpretation: str
    - explanation: str (alias for backward compatibility)
    - recommended_action: str
    """
    diagnoses: List[Dict[str, Any]] = []

    # 1. Performance Diagnoses
    perf = health_report.get("performance", {})
    task_type = health_report.get("task_type", "classification")

    if perf.get("labels_available", True):
        if task_type == "regression":
            r2 = perf.get("r2")
            rmse = perf.get("rmse")
            mae = perf.get("mae")
            if r2 is not None and r2 < 0.0:
                interp = f"The model's R² is {r2:.4f}, meaning it performs worse than a horizontal mean line."
                diagnoses.append({
                    "issue": "Model R² Explanatory Power Negative",
                    "category": "PERFORMANCE",
                    "severity": "CRITICAL",
                    "confidence": 0.95,
                    "evidence": {"r2": r2, "rmse": rmse, "mae": mae},
                    "interpretation": interp,
                    "explanation": interp,
                    "recommended_action": "HYPERPARAMETER_SEARCH"
                })
            elif r2 is not None and r2 < 0.50:
                interp = f"Model R² is sub-optimal ({r2:.4f}). Residual variance is high."
                diagnoses.append({
                    "issue": "Low Regression Explanatory Power",
                    "category": "PERFORMANCE",
                    "severity": "WARNING",
                    "confidence": 0.85,
                    "evidence": {"r2": r2, "rmse": rmse},
                    "interpretation": interp,
                    "explanation": interp,
                    "recommended_action": "HYPERPARAMETER_SEARCH"
                })
        else:
            # Classification / Multiclass
            f1 = perf.get("f1") or perf.get("weighted_f1")
            acc = perf.get("accuracy")
            auc = perf.get("roc_auc")
            if f1 is not None and f1 < 0.50:
                interp = f"F1 score dropped to {f1:.4f}. Model is failing to balance precision and recall."
                diagnoses.append({
                    "issue": "Critical Classification F1 Degradation",
                    "category": "PERFORMANCE",
                    "severity": "CRITICAL",
                    "confidence": 0.95,
                    "evidence": {"f1": f1, "accuracy": acc, "roc_auc": auc},
                    "interpretation": interp,
                    "explanation": interp,
                    "recommended_action": "HYPERPARAMETER_SEARCH"
                })
            elif f1 is not None and f1 < 0.70:
                interp = f"Model F1 score is {f1:.4f}, indicating moderate performance decay."
                diagnoses.append({
                    "issue": "Sub-optimal F1 Score",
                    "category": "PERFORMANCE",
                    "severity": "WARNING",
                    "confidence": 0.80,
                    "evidence": {"f1": f1, "accuracy": acc},
                    "interpretation": interp,
                    "explanation": interp,
                    "recommended_action": "HYPERPARAMETER_SEARCH"
                })

            # Check class imbalance in true labels if available
            class_dist = perf.get("class_distribution", {})
            if class_dist:
                min_class_pct = min(class_dist.values()) if class_dist else 0.5
                if min_class_pct < 0.15:
                    interp = f"Minority class represents only {round(min_class_pct * 100, 1)}% of samples."
                    diagnoses.append({
                        "issue": "Severe Target Class Imbalance",
                        "category": "DATA_QUALITY",
                        "severity": "WARNING",
                        "confidence": 0.90,
                        "evidence": {"class_distribution": class_dist, "minority_proportion": min_class_pct},
                        "interpretation": interp,
                        "explanation": interp,
                        "recommended_action": "CLASS_BALANCING"
                    })

    # 2. Data Drift Diagnoses
    drift_data = health_report.get("data_drift", {})
    drift_class = health_report.get("drift_classification", "UNCLASSIFIED")

    if drift_data.get("drift_detected", False):
        drifted_features = drift_data.get("drifted_features", [])
        drift_rate = drift_data.get("drift_rate", 0.0)

        if drift_class == "EXPECTED":
            interp = f"Feature shift in {', '.join(drifted_features[:3])} matches approved seasonal baseline."
            diagnoses.append({
                "issue": "Expected Contextual Drift",
                "category": "DRIFT",
                "severity": "INFO",
                "confidence": 0.90,
                "evidence": {"drifted_features": drifted_features, "drift_rate": drift_rate, "classification": "EXPECTED"},
                "interpretation": interp,
                "explanation": interp,
                "recommended_action": "NO_ACTION_REQUIRED"
            })
        else:
            severity = "CRITICAL" if drift_rate >= 0.30 else "WARNING"
            interp = f"Statistical distribution shift observed across {len(drifted_features)} features ({round(drift_rate * 100, 1)}% of feature set)."
            diagnoses.append({
                "issue": "Unexpected Feature Drift",
                "category": "DRIFT",
                "severity": severity,
                "confidence": 0.90,
                "evidence": {"drifted_features": drifted_features, "drift_rate": drift_rate, "classification": "UNEXPECTED"},
                "interpretation": interp,
                "explanation": interp,
                "recommended_action": "DATA_REFRESH"
            })

    # 3. Prediction Drift Diagnoses
    pred_drift = health_report.get("prediction_drift", {})
    if pred_drift.get("drift_detected", False):
        interp = "Model prediction distribution has drifted significantly away from training baseline."
        diagnoses.append({
            "issue": "Model Output Distribution Shift",
            "category": "PREDICTION_DRIFT",
            "severity": "WARNING",
            "confidence": 0.85,
            "evidence": {
                "statistic": pred_drift.get("statistic"),
                "p_value": pred_drift.get("p_value"),
                "positive_class_shift": pred_drift.get("positive_class_shift") or pred_drift.get("mean_shift")
            },
            "interpretation": interp,
            "explanation": interp,
            "recommended_action": "CALIBRATION"
        })

    # 4. Schema Health Diagnoses
    schema = health_report.get("schema_health", {})
    if not schema.get("healthy", True):
        for iss in schema.get("issues", []):
            interp = iss.get("message", "Schema incompatibility detected between reference and current data.")
            diagnoses.append({
                "issue": f"Schema Anomaly: {iss.get('type')}",
                "category": "SCHEMA",
                "severity": iss.get("severity", "CRITICAL"),
                "confidence": 1.0,
                "evidence": iss,
                "interpretation": interp,
                "explanation": interp,
                "recommended_action": "SCHEMA_ALIGNMENT"
            })

    # 5. Data Quality Diagnoses
    dq = health_report.get("data_quality", {})
    if not dq.get("healthy", True):
        for iss in dq.get("issues", []):
            iss_str = str(iss).lower()
            if "missing" in iss_str or "null" in iss_str:
                rec = "DATA_IMPUTATION"
            elif "constant" in iss_str or "variance" in iss_str:
                rec = "FEATURE_PRUNING"
            else:
                rec = "DATA_CLEANING"

            interp = f"Dataset hygiene issue detected: {iss}."
            diagnoses.append({
                "issue": f"Data Quality Anomaly: {iss}",
                "category": "DATA_QUALITY",
                "severity": "WARNING",
                "confidence": 0.95,
                "evidence": {"issue_description": iss},
                "interpretation": interp,
                "explanation": interp,
                "recommended_action": rec
            })

    # Feature Importance (Optional SHAP / Tree importance)
    feature_importance_summary = None
    shap_data = None
    if model_path and Path(model_path).exists() and dataset_path and Path(dataset_path).exists():
        try:
            adapter = load_model_adapter(model_path)
            underlying = adapter.get_underlying_model()
            df = pd.read_csv(dataset_path)
            if target_column and target_column in df.columns:
                X = df.drop(columns=[target_column])
            else:
                X = df

            # Get feature names
            fn = adapter.get_feature_names()
            if hasattr(underlying, "feature_importances_") and fn:
                imps = underlying.feature_importances_
                if len(imps) == len(fn):
                    sorted_idx = np.argsort(imps)[::-1]
                    top_f = {fn[i]: round(float(imps[i]), 4) for i in sorted_idx[:10]}
                    feature_importance_summary = {
                        "method": "Gini / Split Feature Importance",
                        "top_features": top_f
                    }
                    shap_data = {
                        "feature_importance": top_f,
                        "chart_path": shap_output_path if (shap_output_path and Path(shap_output_path).exists()) else None
                    }
        except Exception:
            feature_importance_summary = None
            shap_data = None

    return {
        "diagnoses": diagnoses,
        "diagnosis_count": len(diagnoses),
        "critical_count": sum(1 for d in diagnoses if d["severity"] == "CRITICAL"),
        "warning_count": sum(1 for d in diagnoses if d["severity"] == "WARNING"),
        "feature_importance": feature_importance_summary,
        "shap": shap_data
    }


def diagnose_data_quality(quality_result: Dict[str, Any]) -> List[str]:
    """Backward-compatible helper returning plain-text summaries."""
    if not quality_result:
        return ["Data quality checks passed cleanly."]
    return quality_result.get("issues", ["Data quality checks passed cleanly."])