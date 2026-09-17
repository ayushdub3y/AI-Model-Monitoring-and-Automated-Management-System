from typing import List, Dict, Any, Set


class StrategySelector:
    """
    Selects targeted refinement strategies based on structured Diagnoses.
    Prevents blind execution of arbitrary models.
    """

    SUPPORTED_STRATEGIES = {
        "DATA_REFRESH": "Retrain on recent/current data to adapt to statistical distribution shifts.",
        "HYPERPARAMETER_SEARCH": "Perform bounded RandomizedSearchCV to recover optimal model complexity.",
        "CLASS_BALANCING": "Apply class weights or balanced sampling to counter severe label skew.",
        "DATA_IMPUTATION": "Introduce robust median/mode imputation pipelines for missing data.",
        "FEATURE_PRUNING": "Prune low-variance or uninformative shifted features.",
        "CALIBRATION": "Calibrate output probability thresholds."
    }

    @classmethod
    def select_strategies(cls, diagnoses: List[Dict[str, Any]]) -> List[str]:
        """
        Inspects structured diagnosis list and returns appropriate, non-redundant refinement strategies.
        """
        selected: Set[str] = set()

        for diag in diagnoses:
            action = diag.get("recommended_action")
            category = diag.get("category")
            severity = diag.get("severity")

            if action == "NO_ACTION_REQUIRED":
                continue

            if action in cls.SUPPORTED_STRATEGIES:
                selected.add(action)
            elif category == "DRIFT" and severity in ("CRITICAL", "WARNING"):
                selected.add("DATA_REFRESH")
            elif category == "PERFORMANCE":
                selected.add("HYPERPARAMETER_SEARCH")
            elif category == "DATA_QUALITY":
                iss = str(diag.get("issue", "")).lower()
                if "imbalance" in iss:
                    selected.add("CLASS_BALANCING")
                elif "missing" in iss or "null" in iss:
                    selected.add("DATA_IMPUTATION")
                elif "variance" in iss or "constant" in iss:
                    selected.add("FEATURE_PRUNING")

        # Order strategies logically (data hygiene -> class balance -> data refresh -> tuning)
        order = ["DATA_IMPUTATION", "FEATURE_PRUNING", "CLASS_BALANCING", "DATA_REFRESH", "HYPERPARAMETER_SEARCH", "CALIBRATION"]
        ordered_selection = [s for s in order if s in selected]

        return ordered_selection


def select_refinement_strategies(diagnoses: List[Dict[str, Any]]) -> List[str]:
    """Convenience functional interface for StrategySelector."""
    return StrategySelector.select_strategies(diagnoses)
