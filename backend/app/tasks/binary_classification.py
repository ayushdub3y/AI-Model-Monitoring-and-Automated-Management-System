from typing import Dict, Any, Optional
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    precision_recall_curve,
    auc as calc_auc,
    confusion_matrix
)
from .base import TaskAdapter


class BinaryClassificationTaskAdapter(TaskAdapter):
    """
    Task Adapter for Binary Classification tasks (e.g. Churn, Fraud, Conversion).
    """

    @property
    def task_type(self) -> str:
        return "classification"

    def compute_metrics(
        self,
        y_true: pd.Series,
        y_pred: np.ndarray,
        probabilities: Optional[np.ndarray] = None
    ) -> Dict[str, Any]:
        if len(y_true) == 0:
            return {
                "accuracy": None, "precision": None, "recall": None, "f1": None,
                "roc_auc": None, "pr_auc": None, "confusion_matrix": [], "sample_count": 0
            }

        acc = round(float(accuracy_score(y_true, y_pred)), 4)
        prec = round(float(precision_score(y_true, y_pred, zero_division=0)), 4)
        rec = round(float(recall_score(y_true, y_pred, zero_division=0)), 4)
        f1 = round(float(f1_score(y_true, y_pred, zero_division=0)), 4)

        roc_auc = None
        pr_auc = None

        # Extract 1D positive class probabilities if 2D
        pos_probs = None
        if probabilities is not None:
            if len(probabilities.shape) == 2 and probabilities.shape[1] >= 2:
                pos_probs = probabilities[:, 1]
            elif len(probabilities.shape) == 1:
                pos_probs = probabilities

        unique_classes = set(y_true.dropna())
        if len(unique_classes) > 1 and pos_probs is not None:
            try:
                roc_auc = round(float(roc_auc_score(y_true, pos_probs)), 4)
            except Exception:
                roc_auc = None
            try:
                p_curve, r_curve, _ = precision_recall_curve(y_true, pos_probs)
                pr_auc = round(float(calc_auc(r_curve, p_curve)), 4)
            except Exception:
                pr_auc = None

        try:
            cm = confusion_matrix(y_true, y_pred).tolist()
        except Exception:
            cm = []

        class_dist = pd.Series(y_true).value_counts(normalize=True).round(4).to_dict()

        return {
            "accuracy": acc,
            "precision": prec,
            "recall": rec,
            "f1": f1,
            "roc_auc": roc_auc,
            "pr_auc": pr_auc,
            "confusion_matrix": cm,
            "class_distribution": {str(k): float(v) for k, v in class_dist.items()},
            "sample_count": len(y_true)
        }

    def compute_prediction_distribution(
        self,
        predictions: np.ndarray,
        probabilities: Optional[np.ndarray] = None
    ) -> Dict[str, Any]:
        counts = pd.Series(predictions).value_counts()
        pcts = pd.Series(predictions).value_counts(normalize=True).mul(100).round(2)

        return {
            "counts": {str(k): int(v) for k, v in counts.items()},
            "percentages": {str(k): float(v) for k, v in pcts.items()},
            "total_predictions": len(predictions)
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
                "reference_percentages": {},
                "current_percentages": {},
                "stattest_name": "Kolmogorov-Smirnov / Proportion Test"
            }

        ref_dist = self.compute_prediction_distribution(ref_predictions)
        cur_dist = self.compute_prediction_distribution(cur_predictions)

        ref_pos_rate = float((ref_predictions == 1).mean()) if len(ref_predictions) > 0 else 0.0
        cur_pos_rate = float((cur_predictions == 1).mean()) if len(cur_predictions) > 0 else 0.0
        diff = abs(cur_pos_rate - ref_pos_rate)

        stat, p_value = stats.ks_2samp(ref_predictions, cur_predictions)
        drift_detected = bool(p_value < 0.05 or diff > 0.08)

        return {
            "drift_detected": drift_detected,
            "statistic": round(float(stat), 4),
            "p_value": round(float(p_value), 4),
            "reference_percentages": ref_dist["percentages"],
            "current_percentages": cur_dist["percentages"],
            "reference_distribution": ref_dist["counts"],
            "current_distribution": cur_dist["counts"],
            "positive_class_shift": round(float(diff), 4),
            "stattest_name": "Kolmogorov-Smirnov / Proportion Test"
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
            if cand is not None and base is not None and base > 0:
                return round(((cand - base) / base) * 100, 2)
            return None

        f1_diff = diff(candidate_metrics.get("f1"), baseline_metrics.get("f1"))
        acc_diff = diff(candidate_metrics.get("accuracy"), baseline_metrics.get("accuracy"))
        auc_diff = diff(candidate_metrics.get("roc_auc"), baseline_metrics.get("roc_auc"))

        return {
            "baseline": baseline_metrics,
            "candidate": candidate_metrics,
            "improvement": {
                "f1": f1_diff,
                "accuracy": acc_diff,
                "roc_auc": auc_diff
            },
            "percentage_changes": {
                "f1": pct_diff(candidate_metrics.get("f1"), baseline_metrics.get("f1")),
                "accuracy": pct_diff(candidate_metrics.get("accuracy"), baseline_metrics.get("accuracy")),
                "roc_auc": pct_diff(candidate_metrics.get("roc_auc"), baseline_metrics.get("roc_auc")),
            }
        }

    def decide_promotion(
        self,
        baseline_metrics: Dict[str, Any],
        candidate_metrics: Dict[str, Any],
        thresholds: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        min_f1_imp = (thresholds or {}).get("minimum_f1_improvement", 0.005)

        base_f1 = baseline_metrics.get("f1") or 0.0
        cand_f1 = candidate_metrics.get("f1") or 0.0
        f1_diff = round(cand_f1 - base_f1, 4)

        base_auc = baseline_metrics.get("roc_auc")
        cand_auc = candidate_metrics.get("roc_auc")

        if base_auc is not None and cand_auc is not None:
            roc_auc_diff = round(cand_auc - base_auc, 4)
            roc_auc_acceptable = roc_auc_diff >= -0.01
            base_composite = round(base_f1 * 0.6 + base_auc * 0.4, 4)
            cand_composite = round(cand_f1 * 0.6 + cand_auc * 0.4, 4)
        else:
            roc_auc_diff = None
            roc_auc_acceptable = True
            base_acc = baseline_metrics.get("accuracy") or 0.0
            cand_acc = candidate_metrics.get("accuracy") or 0.0
            base_composite = round(base_f1 * 0.6 + base_acc * 0.4, 4)
            cand_composite = round(cand_f1 * 0.6 + cand_acc * 0.4, 4)

        f1_improved = f1_diff >= min_f1_imp
        composite_improved = cand_composite > base_composite

        promote = (f1_improved and roc_auc_acceptable) or (composite_improved and f1_diff >= 0)

        if promote:
            decision = "PROMOTE"
            reason = (
                f"Candidate model outperformed baseline with F1 delta of {'+' if f1_diff >= 0 else ''}{f1_diff}"
                + (f" and ROC-AUC delta of {'+' if (roc_auc_diff or 0) >= 0 else ''}{roc_auc_diff}." if roc_auc_diff is not None else ".")
            )
        else:
            decision = "REJECT"
            reason = f"Candidate model did not surpass baseline (F1 diff: {f1_diff}). Original baseline retained."

        return {
            "decision": decision,
            "promoted": promote,
            "reason": reason,
            "primary_metric": "f1",
            "primary_improvement": f1_diff,
            "composite_score_baseline": base_composite,
            "composite_score_candidate": cand_composite,
            "winner": "Candidate (Refined)" if promote else "Baseline (Original)"
        }
