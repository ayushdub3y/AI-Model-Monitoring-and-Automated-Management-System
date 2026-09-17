import pandas as pd
from typing import Dict, Any, Optional

from .adapters.registry import load_model_adapter
from .tasks.registry import get_task_adapter
from .exceptions import IncompatibleDataError


def evaluate_model(
    model_path: str,
    test_path: str,
    target_column: str = "Churn",
    task_type: str = "classification"
) -> Dict[str, Any]:
    """
    Evaluates a model on test dataset using ModelAdapter and TaskAdapter.
    """
    adapter = load_model_adapter(model_path)
    task_adp = get_task_adapter(task_type)

    try:
        df = pd.read_csv(test_path)
    except Exception as e:
        raise IncompatibleDataError(f"Failed to read evaluation dataset: {str(e)}")

    if target_column not in df.columns:
        raise IncompatibleDataError(f"Target column '{target_column}' missing in evaluation dataset.")

    X_test = df.drop(columns=[target_column])
    y_test = df[target_column]

    predictions = adapter.predict(X_test)
    probabilities = None
    try:
        probabilities = adapter.predict_proba(X_test)
    except Exception:
        pass

    metrics = task_adp.compute_metrics(
        y_true=y_test,
        y_pred=predictions,
        probabilities=probabilities
    )
    return metrics


def compare_models(
    baseline_metrics: Dict[str, Any],
    candidate_metrics: Dict[str, Any],
    task_type: str = "classification"
) -> Dict[str, Any]:
    """
    Compares baseline and candidate metrics side-by-side using TaskAdapter.
    """
    task_adp = get_task_adapter(task_type)
    return task_adp.compare_metrics(baseline_metrics, candidate_metrics)