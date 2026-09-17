from abc import ABC, abstractmethod
from typing import Any, List, Optional, Dict
import pandas as pd
import numpy as np


class ModelAdapter(ABC):
    """
    Abstract Base Class for all model adapters.
    Every supported model framework (scikit-learn, XGBoost, etc.) implements this interface.
    """

    @classmethod
    @abstractmethod
    def can_handle(cls, model: Any) -> bool:
        """Returns True if this adapter knows how to wrap the loaded model object."""
        pass

    @abstractmethod
    def load(self, file_path_or_model: Any) -> Any:
        """Loads or attaches the model object."""
        pass

    @abstractmethod
    def predict(self, data: pd.DataFrame) -> np.ndarray:
        """Generates raw class or regression predictions."""
        pass

    @abstractmethod
    def predict_proba(self, data: pd.DataFrame) -> np.ndarray:
        """Generates class probability predictions where applicable."""
        pass

    @abstractmethod
    def get_feature_names(self) -> List[str]:
        """Extracts expected input feature names if available in model metadata."""
        pass

    @abstractmethod
    def get_model_type(self) -> str:
        """Returns the human-readable model family/type name."""
        pass

    @abstractmethod
    def get_underlying_model(self) -> Any:
        """Returns the unwrapped core model/estimator object."""
        pass

    @abstractmethod
    def capabilities(self) -> Dict[str, Any]:
        """
        Returns a dictionary of adapter and model capabilities,
        e.g. {"predict_proba": bool, "feature_importance": bool, "task_types": list[str]}
        """
        pass