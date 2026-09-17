from typing import Dict, Any, List, Optional
import pandas as pd


def extract_schema_summary(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Extracts column names, data types, null counts, and inferred kinds for a DataFrame.
    """
    columns_info = {}
    for col in df.columns:
        dtype_str = str(df[col].dtype)
        is_numeric = pd.api.types.is_numeric_dtype(df[col])
        null_count = int(df[col].isnull().sum())
        columns_info[col] = {
            "dtype": dtype_str,
            "is_numeric": is_numeric,
            "null_pct": round(float(null_count / max(1, len(df))), 4)
        }

    return {
        "column_count": len(df.columns),
        "columns": columns_info
    }


def check_schema_compatibility(
    reference_df_or_path: Any,
    current_df_or_path: Any,
    target_column: Optional[str] = None
) -> Dict[str, Any]:
    """
    Validates schema and data type compatibility between reference and current datasets.
    """
    if isinstance(reference_df_or_path, (str, bytes)) or hasattr(reference_df_or_path, "read"):
        ref_df = pd.read_csv(reference_df_or_path)
    else:
        ref_df = reference_df_or_path

    if isinstance(current_df_or_path, (str, bytes)) or hasattr(current_df_or_path, "read"):
        cur_df = pd.read_csv(current_df_or_path)
    else:
        cur_df = current_df_or_path

    if target_column:
        if target_column in ref_df.columns:
            ref_df = ref_df.drop(columns=[target_column])
        if target_column in cur_df.columns:
            cur_df = cur_df.drop(columns=[target_column])

    ref_schema = extract_schema_summary(ref_df)["columns"]
    cur_schema = extract_schema_summary(cur_df)["columns"]

    issues = []
    dtype_mismatches = {}
    score = 100.0

    # 1. Missing columns in current
    missing_cols = [c for c in ref_schema if c not in cur_schema]
    if missing_cols:
        score -= min(50.0, len(missing_cols) * 20.0)
        issues.append({
            "type": "MISSING_COLUMNS",
            "severity": "CRITICAL",
            "columns": missing_cols,
            "message": f"Missing {len(missing_cols)} expected column(s): {', '.join(missing_cols[:5])}"
        })

    # 2. Extra unexpected columns
    extra_cols = [c for c in cur_schema if c not in ref_schema]
    if extra_cols:
        score -= min(15.0, len(extra_cols) * 5.0)
        issues.append({
            "type": "EXTRA_COLUMNS",
            "severity": "WARNING",
            "columns": extra_cols,
            "message": f"Found {len(extra_cols)} unexpected extra column(s): {', '.join(extra_cols[:5])}"
        })

    # 3. Dtype mismatches
    for col in ref_schema:
        if col in cur_schema:
            ref_dtype = ref_schema[col]["dtype"]
            cur_dtype = cur_schema[col]["dtype"]
            ref_is_num = ref_schema[col]["is_numeric"]
            cur_is_num = cur_schema[col]["is_numeric"]

            if ref_is_num != cur_is_num:
                score -= 15.0
                dtype_mismatches[col] = {"expected": ref_dtype, "actual": cur_dtype}
                issues.append({
                    "type": "DTYPE_KIND_MISMATCH",
                    "severity": "CRITICAL",
                    "column": col,
                    "message": f"Column '{col}' changed from numeric ({ref_dtype}) to non-numeric ({cur_dtype})"
                })
            elif ref_dtype != cur_dtype:
                dtype_mismatches[col] = {"expected": ref_dtype, "actual": cur_dtype}

    score = max(0.0, min(100.0, round(score, 1)))

    if score < 60.0 or any(i["severity"] == "CRITICAL" for i in issues):
        status = "CRITICAL"
    elif score < 90.0 or len(issues) > 0:
        status = "WARNING"
    else:
        status = "HEALTHY"

    return {
        "status": status,
        "schema_score": score,
        "healthy": status == "HEALTHY",
        "missing_columns": missing_cols,
        "extra_columns": extra_cols,
        "dtype_mismatches": dtype_mismatches,
        "issues": issues,
        "expected_column_count": len(ref_schema),
        "actual_column_count": len(cur_schema)
    }
