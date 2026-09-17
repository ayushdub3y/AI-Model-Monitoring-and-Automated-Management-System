from typing import Dict, Any, Optional
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    median_absolute_error
)
from .base import TaskAdapter


class RegressionTaskAdapter(TaskAdapter):
    """
    Task Adapter for Continuous Numerical Regression tasks (e.g. Price, Demand, Duration).
    """

    @property
    def task_type(self) -> str:
        return "regression"

    def compute_metrics(
        self,
        y_true: pd.Series,
        y_pred: np.ndarray,
        probabilities: Optional[np.ndarray] = None
    ) -> Dict[str, Any]:
        if len(y_true) == 0:
            return {
                "mae": None, "mse": None, "rmse": None, "r2": None, "medae": None,
                "residuals": {}, "sample_count": 0
            }

        y_true_arr = np.asarray(y_true, dtype=float)
        y_pred_arr = np.asarray(y_pred, dtype=float)

        mae = round(float(mean_absolute_error(y_true_arr, y_pred_arr)), 4)
        mse = round(float(mean_squared_error(y_true_arr, y_pred_arr)), 4)
        rmse = round(float(np.sqrt(mse)), 4)
        r2 = round(float(r2_score(y_true_arr, y_pred_arr)), 4)
        medae = round(float(median_absolute_error(y_true_arr, y_pred_arr)), 4)

        # Residual analysis (y_true - y_pred)
        residuals = y_true_arr - y_pred_arr
        res_mean = round(float(np.mean(residuals)), 4)
        res_std = round(float(np.std(residuals)), 4)
        res_min = round(float(np.min(residuals)), 4)
        res_max = round(float(np.max(residuals)), 4)
        res_q25 = round(float(np.percentile(residuals, 25)), 4)
        res_median = round(float(np.median(residuals)), 4)
        res_q75 = round(float(np.percentile(residuals, 75)), 4)

        return {
            "mae": mae,
            "mse": mse,
            "rmse": rmse,
            "r2": r2,
            "medae": medae,
            "residuals": {
                "mean": res_mean,
                "std": res_std,
                "min": res_min,
                "max": res_max,
                "q25": res_q25,
                "median": res_median,
                "q75": res_q75
            },
            "sample_count": len(y_true)
        }

    def compute_prediction_distribution(
        self,
        predictions: np.ndarray,
        probabilities: Optional[np.ndarray] = None
    ) -> Dict[str, Any]:
        preds_arr = np.asarray(predictions, dtype=float)
        if len(preds_arr) == 0:
            return {"summary": {}, "total_predictions": 0}

        return {
            "summary": {
                "mean": round(float(np.mean(preds_arr)), 4),
                "std": round(float(np.std(preds_arr)), 4),
                "min": round(float(np.min(preds_arr)), 4),
                "q25": round(float(np.percentile(preds_arr, 25)), 4),
                "median": round(float(np.median(preds_arr)), 4),
                "q75": round(float(np.percentile(preds_arr, 75)), 4),
                "max": round(float(np.max(preds_arr)), 4)
            },
            "total_predictions": len(preds_arr)
        }

    def compute_prediction_drift(
        self,
        ref_predictions: np.ndarray,
        cur_predictions: np.ndarray,
        ref_probabilities: Optional[np.ndarray] = None,
        cur_probabilities: Optional[np.ndarray] = None
    ) -> Dict[str, Any]:
        if len(ref_predictions) == 0 or len(cur_predictions) == 0:
            return {
                "drift_detected": False,
                "statistic": None,
                "p_value": None,
                "reference_summary": {},
                "current_summary": {},
                "stattest_name": "Kolmogorov-Smirnov (KS-test)"
            }

        ref_preds = np.asarray(ref_predictions, dtype=float)
        cur_preds = np.asarray(cur_predictions, dtype=float)

        ref_dist = self.compute_prediction_distribution(ref_preds)
        cur_dist = self.compute_prediction_distribution(cur_preds)

        stat, p_value = stats.ks_2samp(ref_preds, cur_preds)
        drift_detected = bool(p_value < 0.05)

        mean_shift = round(float(cur_dist["summary"]["mean"] - ref_dist["summary"]["mean"]), 4)

        return {
            "drift_detected": drift_detected,
            "statistic": round(float(stat), 4),
            "p_value": round(float(p_value), 4),
            "reference_summary": ref_dist["summary"],
            "current_summary": cur_dist["summary"],
            "mean_shift": mean_shift,
            "stattest_name": "Kolmogorov-Smirnov (KS-test)"
        }

    def compare_metrics(
        self,
        baseline_metrics: Dict[str, Any],
        candidate_metrics: Dict[str, Any]
    ) -> Dict[str, Any]:
        def diff(cand, base):
            if cand is not None and base is not None:
                return round(cand - base, 4)
            return None

        def pct_diff(cand, base):
            if cand is not None and base is not None and base != 0:
                return round(((cand - base) / abs(base)) * 100, 2)
            return None

        # For errors (MAE, RMSE), lower is better (negative delta is improvement)
        mae_diff = diff(candidate_metrics.get("mae"), baseline_metrics.get("mae"))
        rmse_diff = diff(candidate_metrics.get("rmse"), baseline_metrics.get("rmse"))
        r2_diff = diff(candidate_metrics.get("r2"), baseline_metrics.get("r2"))

        return {
            "baseline": baseline_metrics,
            "candidate": candidate_metrics,
            "improvement": {
                "mae": mae_diff,
                "rmse": rmse_diff,
                "r2": r2_diff
            },
            "percentage_changes": {
                "mae": pct_diff(candidate_metrics.get("mae"), baseline_metrics.get("mae")),
                "rmse": pct_diff(candidate_metrics.get("rmse"), baseline_metrics.get("rmse")),
                "r2": pct_diff(candidate_metrics.get("r2"), baseline_metrics.get("r2")),
            }
        }

    def decide_promotion(
        self,
        baseline_metrics: Dict[str, Any],
        candidate_metrics: Dict[str, Any],
        thresholds: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        base_rmse = baseline_metrics.get("rmse") or float("inf")
        cand_rmse = candidate_metrics.get("rmse") or float("inf")
        rmse_diff = round(cand_rmse - base_rmse, 4)

        base_mae = baseline_metrics.get("mae") or float("inf")
        cand_mae = candidate_metrics.get("mae") or float("inf")
        mae_diff = round(cand_mae - base_mae, 4)

        base_r2 = baseline_metrics.get("r2") if baseline_metrics.get("r2") is not None else -1.0
        cand_r2 = candidate_metrics.get("r2") if candidate_metrics.get("r2") is not None else -1.0
        r2_diff = round(cand_r2 - base_r2, 4)

        # In regression: candidate wins if RMSE is lower or MAE is lower with non-regressed R2
        promote = (rmse_diff < 0 and r2_diff >= -0.01) or (mae_diff < 0 and r2_diff > 0)

        if promote:
            decision = "PROMOTE"
            reason = f"Candidate regression model outperformed baseline (RMSE reduced by {abs(rmse_diff):.4f}, R² change: {'+' if r2_diff >= 0 else ''}{r2_diff:.4f})."
        else:
            decision = "REJECT"
            reason = f"Candidate regression model did not outperform baseline (RMSE delta: {rmse_diff:+.4f}, R² delta: {r2_diff:+.4f}). Original model retained."

        return {
            "decision": decision,
            "promoted": promote,
            "reason": reason,
            "primary_metric": "rmse",
            "rmse_reduction": round(-rmse_diff, 4),
            "mae_reduction": round(-mae_diff, 4),
            "r2_improvement": r2_diff,
            "winner": "Candidate (Refined)" if promote else "Baseline (Original)"
        }
