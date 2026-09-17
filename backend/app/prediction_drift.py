import pandas as pd
import numpy as np
from typing import Dict, Any, Optional

from .adapters.registry import load_model_adapter
from .tasks.registry import get_task_adapter


def detect_prediction_drift(
    model_path: str,
    reference_path: str,
    current_path: str,
    target_column: Optional[str] = None,
    task_type: str = "classification"
) -> Dict[str, Any]:
    """
    Task-aware detection of distribution shift in model predictions between reference and current datasets.
    Delegates to the appropriate TaskAdapter (binary, multiclass, regression).
    """
    adapter = load_model_adapter(model_path)
    task_adp = get_task_adapter(task_type)

    reference = pd.read_csv(reference_path)
    current = pd.read_csv(current_path)

    if target_column and target_column in reference.columns:
        X_reference = reference.drop(columns=[target_column])
    else:
        X_reference = reference

    if target_column and target_column in current.columns:
        X_current = current.drop(columns=[target_column])
    else:
        X_current = current

    # Handle missing values if needed for simple estimators
    X_ref_clean = X_reference.copy()
    X_cur_clean = X_current.copy()
    for col in X_ref_clean.columns:
        if X_ref_clean[col].isnull().any():
            if pd.api.types.is_numeric_dtype(X_ref_clean[col]):
                X_ref_clean[col] = X_ref_clean[col].fillna(X_ref_clean[col].median())
            else:
                mode_val = X_ref_clean[col].mode()
                X_ref_clean[col] = X_ref_clean[col].fillna(mode_val.iloc[0] if len(mode_val) > 0 else "Unknown")
    for col in X_cur_clean.columns:
        if X_cur_clean[col].isnull().any():
            if pd.api.types.is_numeric_dtype(X_cur_clean[col]):
                X_cur_clean[col] = X_cur_clean[col].fillna(X_cur_clean[col].median())
            else:
                mode_val = X_cur_clean[col].mode()
                X_cur_clean[col] = X_cur_clean[col].fillna(mode_val.iloc[0] if len(mode_val) > 0 else "Unknown")

    # Generate predictions via model adapter
    ref_predictions = adapter.predict(X_ref_clean)
    cur_predictions = adapter.predict(X_cur_clean)

    ref_probs = None
    cur_probs = None
    try:
        ref_probs = adapter.predict_proba(X_ref_clean)
        cur_probs = adapter.predict_proba(X_cur_clean)
    except Exception:
        pass

    # Compute prediction drift using TaskAdapter
    drift_result = task_adp.compute_prediction_drift(
        ref_predictions=ref_predictions,
        cur_predictions=cur_predictions,
        ref_probabilities=ref_probs,
        cur_probabilities=cur_probs
    )

    return drift_result