import pandas as pd
from typing import Dict, Any, Optional, List

from .adapters.registry import load_model_adapter
from .tasks.registry import get_task_adapter
from .drift import detect_drift
from .prediction_drift import detect_prediction_drift
from .data_quality import check_data_quality
from .schema_checker import check_schema_compatibility
from .health_status import determine_health_status
from .database import (
    save_run,
    save_alert,
    get_monitoring_unit,
    get_reference_baseline
)
from .exceptions import IncompatibleDataError


def evaluate_model(
    model_path: str,
    dataset_path: str,
    target_column: Optional[str] = "Churn",
    task_type: str = "classification"
) -> Dict[str, Any]:
    """
    Evaluates model performance against a dataset using ModelAdapter and TaskAdapter.
    Detects when labels are delayed or unavailable without crashing.
    """
    adapter = load_model_adapter(model_path)
    task_adp = get_task_adapter(task_type)

    try:
        df = pd.read_csv(dataset_path)
    except Exception as e:
        raise IncompatibleDataError(f"Failed to read dataset '{Path(dataset_path).name}': {str(e)}")

    if not target_column or target_column not in df.columns:
        # Unlabeled dataset — performance cannot be evaluated
        return {
            "labels_available": False,
            "labels_status": "UNAVAILABLE",
            "accuracy": None,
            "f1": None,
            "roc_auc": None,
            "mae": None,
            "rmse": None,
            "r2": None,
            "sample_count": len(df)
        }

    y_series = df[target_column]
    if y_series.isnull().all() or len(df) == 0:
        return {
            "labels_available": False,
            "labels_status": "DELAYED",
            "accuracy": None,
            "f1": None,
            "roc_auc": None,
            "mae": None,
            "rmse": None,
            "r2": None,
            "sample_count": len(df)
        }

    X = df.drop(columns=[target_column])
    predictions = adapter.predict(X)

    probabilities = None
    try:
        probabilities = adapter.predict_proba(X)
    except Exception:
        pass

    metrics = task_adp.compute_metrics(
        y_true=y_series,
        y_pred=predictions,
        probabilities=probabilities
    )
    metrics["labels_available"] = True
    metrics["labels_status"] = "AVAILABLE"
    return metrics


def classify_drift(
    drift_result: Dict[str, Any],
    baseline_record: Optional[Any] = None,
    expected_drift_features: Optional[List[str]] = None
) -> str:
    """
    Classifies feature drift into EXPECTED, UNEXPECTED, or UNCLASSIFIED.
    """
    if not drift_result.get("drift_detected", False):
        return "UNCLASSIFIED"

    drifted_cols = set(drift_result.get("drifted_features", []))
    if not drifted_cols:
        return "UNCLASSIFIED"

    allowed_expected = set(expected_drift_features or [])
    if baseline_record and hasattr(baseline_record, "expected_drift_features") and baseline_record.expected_drift_features:
        import json
        try:
            allowed_expected.update(json.loads(baseline_record.expected_drift_features))
        except Exception:
            pass

    if allowed_expected and drifted_cols.issubset(allowed_expected):
        return "EXPECTED"

    return "UNEXPECTED"


def generate_health_report(
    model_path: str,
    reference_path: str,
    current_path: str,
    target_column: Optional[str] = "Churn",
    model_id: Optional[int] = None,
    dataset_id: Optional[int] = None,
    unit_id: int = 1,
    task_type: Optional[str] = None,
    baseline_id: Optional[int] = None,
    expected_drift_features: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Generates a full decomposed model health report:
    - Task-aware Performance Evaluation
    - Feature Drift & Context-aware Classification (EXPECTED vs UNEXPECTED)
    - Task-aware Prediction Drift
    - Data Quality Check
    - Automatic Schema / Dtype Validation
    - Decomposed Health Status
    """
    effective_unit_id = unit_id or 1
    unit = get_monitoring_unit(effective_unit_id)

    effective_task_type = task_type or (unit.task_type if unit else "classification")
    effective_target_col = target_column if target_column is not None else (unit.target_column if unit else "Churn")

    thresholds = {}
    if unit and unit.thresholds_json:
        import json
        try:
            thresholds = json.loads(unit.thresholds_json)
        except Exception:
            pass

    # 1. Baseline discovery
    baseline_record = get_reference_baseline(baseline_id=baseline_id, unit_id=effective_unit_id)

    # 2. Performance Evaluation (degrades gracefully if unlabeled)
    evaluation = evaluate_model(
        model_path,
        current_path,
        effective_target_col,
        task_type=effective_task_type
    )

    labels_status = evaluation.get("labels_status", "AVAILABLE")

    # 3. Feature Drift
    drift_result = detect_drift(
        reference_path,
        current_path,
        effective_target_col
    )

    # 4. Expected vs Unexpected Drift Classification
    drift_classification = classify_drift(
        drift_result=drift_result,
        baseline_record=baseline_record,
        expected_drift_features=expected_drift_features
    )

    # 5. Prediction Drift
    prediction_drift_result = detect_prediction_drift(
        model_path=model_path,
        reference_path=reference_path,
        current_path=current_path,
        target_column=effective_target_col,
        task_type=effective_task_type
    )

    # 6. Data Quality
    quality_result = check_data_quality(current_path)

    # 7. Schema & Dtype Compatibility
    schema_result = check_schema_compatibility(
        reference_df_or_path=reference_path,
        current_df_or_path=current_path,
        target_column=effective_target_col
    )

    # 8. Decomposed Health Status Synthesis
    health = determine_health_status(
        evaluation=evaluation,
        drift_result=drift_result,
        prediction_drift_result=prediction_drift_result,
        quality_result=quality_result,
        schema_result=schema_result,
        drift_classification=drift_classification,
        thresholds=thresholds,
        task_type=effective_task_type
    )

    report = {
        "status": health["status"],
        "health_score": health["health_score"],
        "unit_id": effective_unit_id,
        "task_type": effective_task_type,
        "labels_status": labels_status,
        "drift_classification": drift_classification,
        "performance": evaluation,
        "data_drift": {
            "drift_detected": drift_result["drift_detected"],
            "drift_classification": drift_classification,
            "drifted_features": drift_result["drifted_features"],
            "drifted_feature_count": drift_result["drifted_feature_count"],
            "total_features": drift_result["total_features"],
            "drift_rate": drift_result["drift_rate"],
            "features": drift_result.get("features", {})
        },
        "prediction_drift": prediction_drift_result,
        "data_quality": quality_result,
        "schema_health": schema_result,
        "components": health["components"],
        "reasons": health["reasons"]
    }

    # Save to SQLite database
    try:
        save_run(
            model_id=model_id or 1,
            dataset_id=dataset_id or 1,
            baseline_id=baseline_record.id if baseline_record else None,
            run_type="health_analysis",
            labels_status=labels_status,
            drift_classification=drift_classification,
            accuracy=evaluation.get("accuracy"),
            f1_score=evaluation.get("f1") or evaluation.get("weighted_f1") or evaluation.get("r2"),
            roc_auc=evaluation.get("roc_auc") or evaluation.get("rmse"),
            health_status=health["status"],
            drift_rate=drift_result.get("drift_rate"),
            health_components=health["components"],
            metrics_json=report,
            unit_id=effective_unit_id
        )

        if health["status"] in ("WARNING", "CRITICAL"):
            for reason in health["reasons"]:
                save_alert(
                    model_id=model_id or 1,
                    alert_type="HEALTH_DEGRADATION" if health["status"] == "CRITICAL" else "HEALTH_WARNING",
                    severity=health["status"],
                    message=reason,
                    unit_id=effective_unit_id
                )
    except Exception as db_err:
        print(f"Warning: Could not save run to database: {db_err}")

    return report