import joblib
import numpy as np
import pandas as pd
from typing import Any, List, Dict
from .base import ModelAdapter
from ..exceptions import CorruptModelError


class SklearnAdapter(ModelAdapter):

    def __init__(self, model: Any = None):
        self.model = model

    @classmethod
    def can_handle(cls, model: Any) -> bool:
        if hasattr(model, "named_steps"):
            estimator = model.named_steps.get("estimator", model.named_steps.get("model", model))
            module_name = type(estimator).__module__
        else:
            module_name = type(model).__module__

        if module_name.startswith("sklearn"):
            return True
        if hasattr(model, "predict") and not module_name.startswith("xgboost"):
            return True
        return False

    def load(self, file_path_or_model: Any) -> Any:
        if isinstance(file_path_or_model, (str, bytes)) or hasattr(file_path_or_model, "read"):
            try:
                self.model = joblib.load(file_path_or_model)
            except Exception as e:
                raise CorruptModelError(f"Failed to deserialize scikit-learn model: {str(e)}")
        else:
            self.model = file_path_or_model
        return self.model

    def predict(self, data: pd.DataFrame) -> np.ndarray:
        if self.model is None:
            raise ValueError("Model has not been loaded.")
        return np.asarray(self.model.predict(data))

    def predict_proba(self, data: pd.DataFrame) -> np.ndarray:
        if self.model is None:
            raise ValueError("Model has not been loaded.")
        if hasattr(self.model, "predict_proba"):
            return np.asarray(self.model.predict_proba(data))
        # Fallback for models without predict_proba (e.g. SVM without probability=True)
        preds = self.predict(data)
        return np.column_stack([1 - preds, preds])

    def get_feature_names(self) -> List[str]:
        if self.model is None:
            return []
        if hasattr(self.model, "feature_names_in_"):
            return self.model.feature_names_in_.tolist()
        if hasattr(self.model, "named_steps"):
            # Check pipeline preprocessor
            preprocessor = self.model.named_steps.get("preprocessor")
            if preprocessor and hasattr(preprocessor, "feature_names_in_"):
                return preprocessor.feature_names_in_.tolist()
        return []

    def get_model_type(self) -> str:
        return "scikit-learn"

    def get_underlying_model(self) -> Any:
        return self.model

    def capabilities(self) -> Dict[str, Any]:
        if self.model is None:
            return {"predict_proba": False, "feature_importance": False, "task_types": ["classification", "regression"]}

        estimator = self.model
        if hasattr(self.model, "named_steps"):
            estimator = self.model.named_steps.get("estimator", self.model.named_steps.get("model", self.model))

        has_proba = hasattr(self.model, "predict_proba") or hasattr(estimator, "predict_proba")
        has_importance = hasattr(estimator, "feature_importances_") or hasattr(estimator, "coef_")

        estimator_type = getattr(estimator, "_estimator_type", None)
        if estimator_type == "classifier":
            task_types = ["classification"]
        elif estimator_type == "regressor":
            task_types = ["regression"]
        else:
            task_types = ["classification", "regression"]

        return {
            "predict_proba": bool(has_proba),
            "feature_importance": bool(has_importance),
            "task_types": task_types
        }