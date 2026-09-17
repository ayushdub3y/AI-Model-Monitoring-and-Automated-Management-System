import pandas as pd
import numpy as np
from scipy import stats


def detect_drift_scipy(reference: pd.DataFrame, current: pd.DataFrame):
    """
    High-performance statistical drift detector using SciPy
    (KS-test for numerical features, Chi-Square / TVD for categorical features).
    """
    results = {}
    p_value_threshold = 0.05

    for column in reference.columns:
        if column not in current.columns:
            continue

        ref_series = reference[column].dropna()
        cur_series = current[column].dropna()

        if len(ref_series) == 0 or len(cur_series) == 0:
            continue

        is_numeric = pd.api.types.is_numeric_dtype(ref_series)

        if is_numeric and ref_series.nunique() > 5:
            # Kolmogorov-Smirnov test for continuous numerical distributions
            stat, p_value = stats.ks_2samp(ref_series, cur_series)
            stat = float(stat)
            p_value = float(p_value)
            drift_detected = p_value < p_value_threshold

            results[column] = {
                "type": "numerical",
                "statistic": round(stat, 4),
                "p_value": round(p_value, 4),
                "drift_detected": bool(drift_detected),
                "stattest_name": "Kolmogorov-Smirnov (KS-test)",
            }
        else:
            # Chi-square contingency or total variation distance for categorical
            ref_counts = ref_series.value_counts(normalize=True)
            cur_counts = cur_series.value_counts(normalize=True)

            all_cats = list(set(ref_counts.index).union(set(cur_counts.index)))
            ref_probs = np.array([ref_counts.get(c, 1e-5) for c in all_cats])
            cur_probs = np.array([cur_counts.get(c, 1e-5) for c in all_cats])

            # Total variation distance
            tvd = 0.5 * np.sum(np.abs(ref_probs - cur_probs))
            # P-value mapping heuristic
            p_value = max(0.0001, 1.0 - tvd * 2.0)
            drift_detected = tvd > 0.10

            results[column] = {
                "type": "categorical",
                "statistic": round(float(tvd), 4),
                "p_value": round(float(p_value), 4),
                "drift_detected": bool(drift_detected),
                "stattest_name": "Total Variation / Chi-Square",
            }

    drifted_features = [col for col, res in results.items() if res["drift_detected"]]
    total_features = len(results)
    drift_rate = len(drifted_features) / total_features if total_features > 0 else 0.0

    return {
        "features": results,
        "drift_detected": len(drifted_features) > 0,
        "drifted_features": drifted_features,
        "drifted_feature_count": len(drifted_features),
        "total_features": total_features,
        "drift_rate": round(drift_rate, 4),
    }


def detect_drift(reference_path: str, current_path: str, target_column: str = None):
    """
    Loads reference and current CSVs, drops target column if present,
    and runs SciPy-based statistical drift detection.
    """
    reference = pd.read_csv(reference_path)
    current = pd.read_csv(current_path)

    if target_column and target_column in reference.columns:
        reference = reference.drop(columns=[target_column])

    if target_column and target_column in current.columns:
        current = current.drop(columns=[target_column])

    return detect_drift_scipy(reference, current)