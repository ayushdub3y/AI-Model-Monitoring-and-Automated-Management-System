from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from ..adapters.base import ModelAdapter


class TaskAdapter(ABC):
    """
    Abstract Base Class for Task Adapters.
    Encapsulates task-specific evaluation metrics, prediction distribution formatting,
    prediction drift computation, and performance comparison.
    """

    @property
    @abstractmethod
    def task_type(self) -> str:
        """Returns the task type string (e.g. 'classification', 'multiclass', 'regression')."""
        pass

    @abstractmethod
    def compute_metrics(
        self,
        y_true: pd.Series,
        y_pred: np.ndarray,
        probabilities: Optional[np.ndarray] = None
    ) -> Dict[str, Any]:
        """Computes task-specific performance metrics (e.g. F1/AUC for binary, MAE/RMSE/R2 for regression)."""
        pass

    @abstractmethod
    def compute_prediction_distribution(
        self,
        predictions: np.ndarray,
        probabilities: Optional[np.ndarray] = None
    ) -> Dict[str, Any]:
        """Summarizes prediction distribution (frequencies for discrete, percentiles/summary for continuous)."""
        pass

    @abstractmethod
    def compute_prediction_drift(
        self,
        ref_predictions: np.ndarray,
        cur_predictions: np.ndarray,
        ref_probabilities: Optional[np.ndarray] = None,
        cur_probabilities: Optional[np.ndarray] = None
    ) -> Dict[str, Any]:
        """Calculates prediction drift statistically based on task semantics."""
        pass

    @abstractmethod
    def compare_metrics(
        self,
        baseline_metrics: Dict[str, Any],
        candidate_metrics: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Computes improvements and percentage differences between baseline and candidate metrics."""
        pass

    @abstractmethod
    def decide_promotion(
        self,
        baseline_metrics: Dict[str, Any],
        candidate_metrics: Dict[str, Any],
        thresholds: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Evaluates whether candidate surpasses baseline according to task-specific safety rules."""
        pass
