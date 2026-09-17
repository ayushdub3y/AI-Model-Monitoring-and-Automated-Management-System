from pathlib import Path
import pandas as pd
import numpy as np
from typing import Dict, Any, Optional, List

from .adapters.registry import load_model_adapter
from .exceptions import CorruptModelError, IncompatibleDataError


def _infer_expected_feature_types(adapter) -> Dict[str, str]:
    """
    Infers expected feature types (e.g. 'numeric', 'categorical') from model pipeline steps if available.
    """
    expected_types = {}
    model = adapter.get_underlying_model()
    if model is None:
        return expected_types

    # Check for pipeline preprocessor
    if hasattr(model, "named_steps"):
        preprocessor = model.named_steps.get("preprocessor")
        transformers_list = None
        if preprocessor and hasattr(preprocessor, "transformers_"):
            transformers_list = preprocessor.transformers_
        elif preprocessor and hasattr(preprocessor, "transformers"):
            transformers_list = preprocessor.transformers

        if transformers_list:
            for transformer_tuple in transformers_list:
                if len(transformer_tuple) >= 3:
                    name, trans, cols = transformer_tuple[:3]
                    if cols is not None and hasattr(cols, "__iter__"):
                        is_numeric = "num" in str(name).lower() or any(
                            t_name in str(type(trans)).lower()
                            for t_name in ["standardscaler", "minmaxscaler", "robustscaler", "imputer"]
                            if "categorical" not in str(type(trans)).lower()
                        )
                        dtype_label = "numeric" if is_numeric else "categorical"
                        for c in cols:
                            if isinstance(c, str):
                                expected_types[c] = dtype_label
    return expected_types


def check_compatibility(
    model_path: str,
    dataset_path: str,
    target_column: Optional[str] = None,
    feature_mapping: Optional[Dict[str, str]] = None
) -> Dict[str, Any]:
    """
    Checks schema compatibility and runs a dry-run inference test using ModelAdapter.
    Validates feature presence, column naming, and data type compatibility.
    """
    adapter = load_model_adapter(model_path)
    try:
        df = pd.read_csv(dataset_path)
    except Exception as e:
        raise IncompatibleDataError(f"Failed to read dataset '{Path(dataset_path).name}': {str(e)}")

    # Apply manual feature mapping if provided
    if feature_mapping and isinstance(feature_mapping, dict):
        df = df.rename(columns=feature_mapping)

    # Remove target from model input
    if target_column and target_column in df.columns:
        X = df.drop(columns=[target_column])
    else:
        X = df

    # Get model feature names from adapter
    model_features = adapter.get_feature_names()

    result = {
        "compatible": True,
        "feature_count_match": None,
        "feature_names_match": None,
        "expected_features": model_features or [],
        "found_features": list(X.columns),
        "missing_features": [],
        "extra_features": [],
        "dtype_mismatches": [],
        "prediction_test": None,
        "errors": [],
        "warnings": []
    }

    if model_features and len(model_features) > 0:
        expected_set = set(model_features)
        found_set = set(X.columns)

        missing = list(expected_set - found_set)
        extra = list(found_set - expected_set)

        result["missing_features"] = missing
        result["extra_features"] = extra
        result["feature_count_match"] = len(X.columns) == len(model_features)

        if missing:
            result["compatible"] = False
            result["errors"].append(
                f"Missing {len(missing)} expected feature(s): {', '.join(missing[:5])}"
            )

        if extra:
            result["warnings"].append(
                f"Dataset contains {len(extra)} extra feature(s) not in model schema: {', '.join(extra[:5])}"
            )

        result["feature_names_match"] = list(X.columns) == model_features
        if not result["feature_names_match"] and not missing:
            result["warnings"].append(
                "Feature ordering differs from model training order, but all required features are present."
            )

    # Validate data type (dtype) compatibility
    expected_types = _infer_expected_feature_types(adapter)
    dtype_mismatches = []
    underlying = adapter.get_underlying_model()

    for col in X.columns:
        if not model_features or col in model_features:
            col_series = X[col].dropna()
            if len(col_series) == 0:
                continue

            is_num = pd.api.types.is_numeric_dtype(col_series)
            exp_type = expected_types.get(col)

            if exp_type == "numeric" and not is_num:
                coerced = pd.to_numeric(col_series.head(50), errors="coerce")
                if coerced.isna().any():
                    dtype_mismatches.append({
                        "column": col,
                        "expected_type": "numeric",
                        "found_type": str(X[col].dtype),
                        "reason": f"Column '{col}' expected numeric values, but found non-coercible string values."
                    })
            elif exp_type is None and not is_num:
                # If model is an estimator without preprocessor expecting numeric values
                has_cat_preprocessor = (
                    hasattr(underlying, "named_steps") and
                    underlying.named_steps.get("preprocessor") is not None
                )
                if not has_cat_preprocessor:
                    coerced = pd.to_numeric(col_series.head(50), errors="coerce")
                    if coerced.isna().any():
                        dtype_mismatches.append({
                            "column": col,
                            "expected_type": "numeric",
                            "found_type": str(X[col].dtype),
                            "reason": f"Column '{col}' expected numeric values for direct inference, but found string data."
                        })

    result["dtype_mismatches"] = dtype_mismatches
    if dtype_mismatches:
        result["compatible"] = False
        for dm in dtype_mismatches:
            result["errors"].append(
                f"Data type mismatch in column '{dm['column']}': expected {dm['expected_type']}, got {dm['found_type']} ({dm['reason']})"
            )

    # Dry-run prediction test using adapter (only if no missing features or dtype mismatches)
    if result["compatible"]:
        try:
            sample_X = X.head(min(10, len(X)))
            adapter.predict(sample_X)
            result["prediction_test"] = True
        except Exception as error:
            result["prediction_test"] = False
            result["compatible"] = False
            result["errors"].append(f"Prediction test failed: {str(error)}")
    else:
        result["prediction_test"] = False

    return result