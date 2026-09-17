from typing import Dict, Any, List, Optional
from pathlib import Path
import hashlib
import numpy as np
import pandas as pd

from .adapters.registry import load_model_adapter


def calculate_file_sha256(file_path: str) -> str:
    sha = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            sha.update(chunk)
    return sha.hexdigest()


class SafetyGateEvaluator:
    """
    Evaluates candidate model artifacts against strict production readiness safety gates.
    """

    @classmethod
    def evaluate_candidate(
        cls,
        candidate_model_path: str,
        test_dataset_path: str,
        baseline_metrics: Dict[str, Any],
        candidate_metrics: Dict[str, Any],
        target_column: Optional[str] = "Churn",
        task_type: str = "classification",
        expected_sha256: Optional[str] = None,
        thresholds: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        thresholds = thresholds or {}
        gates_passed = {}
        failed_reasons = []

        # Gate 1: Artifact Integrity
        p = Path(candidate_model_path)
        if not p.exists() or p.stat().st_size == 0:
            gates_passed["artifact_integrity"] = False
            failed_reasons.append("Artifact file does not exist or is 0 bytes.")
        else:
            if expected_sha256:
                actual_sha = calculate_file_sha256(str(p))
                if actual_sha != expected_sha256:
                    gates_passed["artifact_integrity"] = False
                    failed_reasons.append("Artifact SHA-256 checksum mismatch.")
                else:
                    gates_passed["artifact_integrity"] = True
            else:
                gates_passed["artifact_integrity"] = True

        # Gate 2: Model Reload & Deserialization
        adapter = None
        if gates_passed.get("artifact_integrity", False):
            try:
                adapter = load_model_adapter(str(p))
                gates_passed["model_reload"] = True
            except Exception as e:
                gates_passed["model_reload"] = False
                failed_reasons.append(f"Model failed to reload: {str(e)}")
        else:
            gates_passed["model_reload"] = False

        # Gate 3 & 4: Compatibility & Dry-Run Prediction
        if adapter is not None and Path(test_dataset_path).exists():
            try:
                df = pd.read_csv(test_dataset_path)
                if target_column and target_column in df.columns:
                    X = df.drop(columns=[target_column])
                else:
                    X = df

                sample_X = X.head(min(5, len(X)))
                preds = adapter.predict(sample_X)
                if len(preds) != len(sample_X) or np.isnan(np.asarray(preds, dtype=float)).any():
                    gates_passed["dry_run_prediction"] = False
                    failed_reasons.append("Dry-run prediction generated NaN or invalid output length.")
                else:
                    gates_passed["dry_run_prediction"] = True
                gates_passed["compatibility"] = True
            except Exception as e:
                gates_passed["compatibility"] = False
                gates_passed["dry_run_prediction"] = False
                failed_reasons.append(f"Dry-run prediction failed on test data: {str(e)}")
        else:
            gates_passed["compatibility"] = False
            gates_passed["dry_run_prediction"] = False

        # Gate 5: Absolute Performance Floor
        if task_type == "regression":
            cand_r2 = candidate_metrics.get("r2")
            floor_r2 = thresholds.get("absolute_r2_floor", 0.0)
            if cand_r2 is not None and cand_r2 < floor_r2:
                gates_passed["absolute_performance_floor"] = False
                failed_reasons.append(f"Candidate R² ({cand_r2:.4f}) is below absolute floor ({floor_r2:.4f}).")
            else:
                gates_passed["absolute_performance_floor"] = True
        else:
            cand_f1 = candidate_metrics.get("f1") or candidate_metrics.get("weighted_f1")
            floor_f1 = thresholds.get("absolute_f1_floor", 0.50)
            if cand_f1 is not None and cand_f1 < floor_f1:
                gates_passed["absolute_performance_floor"] = False
                failed_reasons.append(f"Candidate F1 ({cand_f1:.4f}) is below absolute floor ({floor_f1:.4f}).")
            else:
                gates_passed["absolute_performance_floor"] = True

        # Gate 6: Minimum Relative Improvement
        if task_type == "regression":
            base_rmse = baseline_metrics.get("rmse") or float("inf")
            cand_rmse = candidate_metrics.get("rmse") or float("inf")
            min_imp = thresholds.get("minimum_rmse_reduction", 0.0)
            if (base_rmse - cand_rmse) < min_imp:
                gates_passed["minimum_relative_improvement"] = False
                failed_reasons.append(f"RMSE reduction ({base_rmse - cand_rmse:.4f}) does not meet minimum requirement ({min_imp:.4f}).")
            else:
                gates_passed["minimum_relative_improvement"] = True
        else:
            base_f1 = baseline_metrics.get("f1") or baseline_metrics.get("weighted_f1") or 0.0
            cand_f1 = candidate_metrics.get("f1") or candidate_metrics.get("weighted_f1") or 0.0
            min_f1_imp = thresholds.get("minimum_f1_improvement", 0.005)
            if (cand_f1 - base_f1) < min_f1_imp:
                gates_passed["minimum_relative_improvement"] = False
                failed_reasons.append(f"F1 improvement ({cand_f1 - base_f1:+.4f}) is below required delta ({min_f1_imp:+.4f}).")
            else:
                gates_passed["minimum_relative_improvement"] = True

        # Gate 7: Secondary Metric Regression Tolerance
        if task_type == "classification":
            base_auc = baseline_metrics.get("roc_auc")
            cand_auc = candidate_metrics.get("roc_auc")
            if base_auc is not None and cand_auc is not None:
                auc_diff = cand_auc - base_auc
                if auc_diff < -0.02:  # Regressed more than 2%
                    gates_passed["secondary_metric_regression_tolerance"] = False
                    failed_reasons.append(f"ROC-AUC regressed by {auc_diff:.4f} (tolerance is -0.02).")
                else:
                    gates_passed["secondary_metric_regression_tolerance"] = True
            else:
                gates_passed["secondary_metric_regression_tolerance"] = True
        else:
            gates_passed["secondary_metric_regression_tolerance"] = True

        all_passed = all(gates_passed.values())

        return {
            "all_passed": all_passed,
            "gates": gates_passed,
            "failed_reasons": failed_reasons,
            "passed_count": sum(1 for v in gates_passed.values() if v),
            "total_gates": len(gates_passed)
        }


def evaluate_safety_gates(
    candidate_model_path: str,
    test_dataset_path: str,
    baseline_metrics: Dict[str, Any],
    candidate_metrics: Dict[str, Any],
    target_column: Optional[str] = "Churn",
    task_type: str = "classification",
    expected_sha256: Optional[str] = None,
    thresholds: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    return SafetyGateEvaluator.evaluate_candidate(
        candidate_model_path=candidate_model_path,
        test_dataset_path=test_dataset_path,
        baseline_metrics=baseline_metrics,
        candidate_metrics=candidate_metrics,
        target_column=target_column,
        task_type=task_type,
        expected_sha256=expected_sha256,
        thresholds=thresholds
    )
