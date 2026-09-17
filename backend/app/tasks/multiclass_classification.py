from typing import Dict, Any, Optional
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report
)
from .base import TaskAdapter


class MulticlassClassificationTaskAdapter(TaskAdapter):
    """
    Task Adapter for Multiclass Classification tasks (e.g. 3+ categories/labels).
    """

    @property
    def task_type(self) -> str:
        return "multiclass"

    def compute_metrics(
        self,
        y_true: pd.Series,
        y_pred: np.ndarray,
        probabilities: Optional[np.ndarray] = None
    ) -> Dict[str, Any]:
        if len(y_true) == 0:
            return {
                "accuracy": None, "macro_f1": None, "weighted_f1": None, "micro_f1": None,
                "macro_precision": None, "weighted_precision": None,
                "macro_recall": None, "weighted_recall": None,
                "per_class": {}, "confusion_matrix": [], "sample_count": 0
            }

        acc = round(float(accuracy_score(y_true, y_pred)), 4)
        macro_f1 = round(float(f1_score(y_true, y_pred, average="macro", zero_division=0)), 4)
        weighted_f1 = round(float(f1_score(y_true, y_pred, average="weighted", zero_division=0)), 4)
        micro_f1 = round(float(f1_score(y_true, y_pred, average="micro", zero_division=0)), 4)

        macro_prec = round(float(precision_score(y_true, y_pred, average="macro", zero_division=0)), 4)
        weighted_prec = round(float(precision_score(y_true, y_pred, average="weighted", zero_division=0)), 4)

        macro_rec = round(float(recall_score(y_true, y_pred, average="macro", zero_division=0)), 4)
        weighted_rec = round(float(recall_score(y_true, y_pred, average="weighted", zero_division=0)), 4)

        # Per-class metrics
        unique_labels = sorted(list(set(y_true).union(set(y_pred))))
        per_class_prec = precision_score(y_true, y_pred, labels=unique_labels, average=None, zero_division=0)
        per_class_rec = recall_score(y_true, y_pred, labels=unique_labels, average=None, zero_division=0)
        per_class_f1 = f1_score(y_true, y_pred, labels=unique_labels, average=None, zero_division=0)

        per_class = {}
        for idx, lbl in enumerate(unique_labels):
            per_class[str(lbl)] = {
                "precision": round(float(per_class_prec[idx]), 4),
                "recall": round(float(per_class_rec[idx]), 4),
                "f1": round(float(per_class_f1[idx]), 4),
                "support": int((y_true == lbl).sum())
            }

        try:
            cm = confusion_matrix(y_true, y_pred, labels=unique_labels).tolist()
        except Exception:
            cm = []

        class_dist = pd.Series(y_true).value_counts(normalize=True).round(4).to_dict()

        return {
            "accuracy": acc,
            "f1": weighted_f1,  # Primary F1 representation
            "macro_f1": macro_f1,
            "weighted_f1": weighted_f1,
            "micro_f1": micro_f1,
            "macro_precision": macro_prec,
            "weighted_precision": weighted_prec,
            "macro_recall": macro_rec,
            "weighted_recall": weighted_rec,
            "per_class": per_class,
            "confusion_matrix": cm,
            "class_distribution": {str(k): float(v) for k, v in class_dist.items()},
            "labels": [str(l) for l in unique_labels],
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
                "stattest_name": "Total Variation Distance / Chi-Square"
            }

        ref_dist = self.compute_prediction_distribution(ref_predictions)
        cur_dist = self.compute_prediction_distribution(cur_predictions)

        all_cats = list(set(ref_dist["counts"].keys()).union(set(cur_dist["counts"].keys())))
        ref_p = np.array([ref_dist["percentages"].get(c, 0.0) / 100.0 for c in all_cats])
        cur_p = np.array([cur_dist["percentages"].get(c, 0.0) / 100.0 for c in all_cats])

        tvd = 0.5 * float(np.sum(np.abs(ref_p - cur_p)))
        p_value = max(0.0001, 1.0 - tvd * 2.0)
        drift_detected = bool(tvd > 0.10)

        # Per-class shift
        class_shifts = {
            c: round(float(abs(cur_dist["percentages"].get(c, 0.0) - ref_dist["percentages"].get(c, 0.0))), 2)
            for c in all_cats
        }

        return {
            "drift_detected": drift_detected,
            "statistic": round(float(tvd), 4),
            "p_value": round(float(p_value), 4),
            "reference_percentages": ref_dist["percentages"],
            "current_percentages": cur_dist["percentages"],
            "reference_distribution": ref_dist["counts"],
            "current_distribution": cur_dist["counts"],
            "per_class_shift_pct": class_shifts,
            "stattest_name": "Total Variation Distance / Chi-Square"
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

        w_f1_diff = diff(candidate_metrics.get("weighted_f1") or candidate_metrics.get("f1"), baseline_metrics.get("weighted_f1") or baseline_metrics.get("f1"))
        m_f1_diff = diff(candidate_metrics.get("macro_f1"), baseline_metrics.get("macro_f1"))
        acc_diff = diff(candidate_metrics.get("accuracy"), baseline_metrics.get("accuracy"))

        return {
            "baseline": baseline_metrics,
            "candidate": candidate_metrics,
            "improvement": {
                "weighted_f1": w_f1_diff,
                "macro_f1": m_f1_diff,
                "accuracy": acc_diff
            },
            "percentage_changes": {
                "weighted_f1": pct_diff(candidate_metrics.get("weighted_f1"), baseline_metrics.get("weighted_f1")),
                "macro_f1": pct_diff(candidate_metrics.get("macro_f1"), baseline_metrics.get("macro_f1")),
                "accuracy": pct_diff(candidate_metrics.get("accuracy"), baseline_metrics.get("accuracy")),
            }
        }

    def decide_promotion(
        self,
        baseline_metrics: Dict[str, Any],
        candidate_metrics: Dict[str, Any],
        thresholds: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        min_f1_imp = (thresholds or {}).get("minimum_f1_improvement", 0.005)

        base_f1 = baseline_metrics.get("weighted_f1") or baseline_metrics.get("f1") or 0.0
        cand_f1 = candidate_metrics.get("weighted_f1") or candidate_metrics.get("f1") or 0.0
        f1_diff = round(cand_f1 - base_f1, 4)

        base_acc = baseline_metrics.get("accuracy") or 0.0
        cand_acc = candidate_metrics.get("accuracy") or 0.0
        acc_diff = round(cand_acc - base_acc, 4)

        base_macro = baseline_metrics.get("macro_f1") or base_f1
        cand_macro = candidate_metrics.get("macro_f1") or cand_f1
        macro_diff = round(cand_macro - base_macro, 4)

        promote = (f1_diff >= min_f1_imp and macro_diff >= -0.02) or (f1_diff >= 0 and macro_diff >= min_f1_imp)

        if promote:
            decision = "PROMOTE"
            reason = f"Candidate multiclass model surpassed baseline (Weighted F1 delta: {'+' if f1_diff >= 0 else ''}{f1_diff}, Macro F1 delta: {'+' if macro_diff >= 0 else ''}{macro_diff})."
        else:
            decision = "REJECT"
            reason = f"Candidate multiclass model did not outperform baseline (Weighted F1 delta: {f1_diff}). Original model retained."

        return {
            "decision": decision,
            "promoted": promote,
            "reason": reason,
            "primary_metric": "weighted_f1",
            "primary_improvement": f1_diff,
            "macro_f1_improvement": macro_diff,
            "accuracy_change": acc_diff,
            "winner": "Candidate (Refined)" if promote else "Baseline (Original)"
        }
