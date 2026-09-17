from typing import Dict, Any, Optional
from .tasks.registry import get_task_adapter


def decide_promotion(
    baseline_metrics: Dict[str, Any],
    candidate_metrics: Dict[str, Any],
    minimum_f1_improvement: float = 0.005,
    allow_equal_roc_auc: bool = True,
    task_type: str = "classification",
    thresholds: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Decides whether a candidate model should be promoted over the baseline.
    Delegates to TaskAdapter for task-specific promotion rules (classification, multiclass, regression).
    """
    task_adp = get_task_adapter(task_type)
    merged_thresholds = thresholds or {}
    if "minimum_f1_improvement" not in merged_thresholds:
        merged_thresholds["minimum_f1_improvement"] = minimum_f1_improvement
    merged_thresholds["allow_equal_roc_auc"] = allow_equal_roc_auc

    return task_adp.decide_promotion(
        baseline_metrics=baseline_metrics,
        candidate_metrics=candidate_metrics,
        thresholds=merged_thresholds
    )