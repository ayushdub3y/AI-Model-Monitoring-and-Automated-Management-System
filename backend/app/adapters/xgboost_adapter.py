import joblib
import numpy as np
import pandas as pd
from typing import Any, List, Dict
from .base import ModelAdapter
from ..exceptions import CorruptModelError


class XGBoostAdapter(ModelAdapter):

    def __init__(self, model: Any = None):
        self.model = model

    @classmethod
    def can_handle(cls, model: Any) -> bool:
        if hasattr(model, "named_steps"):
            estimator = model.named_steps.get("model", model)
            module_name = type(estimator).__module__
        else:
            module_name = type(model).__module__

        return module_name.startswith("xgboost")

    def load(self, file_path_or_model: Any) -> Any:
        if isinstance(file_path_or_model, (str, bytes)) or hasattr(file_path_or_model, "read"):
            try:
                self.model = joblib.load(file_path_or_model)
            except Exception as e:
                raise CorruptModelError(f"Failed to deserialize XGBoost model: {str(e)}")
        else:
            self.model = file_path_or_model
        return self.model

    def _is_booster(self) -> bool:
        if self.model is None:
            return False
        model_type_name = type(self.model).__name__
        return model_type_name == "Booster" or (
            not hasattr(self.model, "predict_proba")
            and hasattr(self.model, "predict")
            and (hasattr(self.model, "feature_names") or hasattr(self.model, "get_dump"))
        )

    def _predict_raw(self, data: pd.DataFrame) -> np.ndarray:
        if self._is_booster():
            import xgboost as xgb
            dmat = xgb.DMatrix(data)
            return self.model.predict(dmat)
        return self.model.predict(data)

    def predict(self, data: pd.DataFrame) -> np.ndarray:
        if self.model is None:
            raise ValueError("Model has not been loaded.")
        preds = self._predict_raw(data)
        preds = np.asarray(preds)
        # Raw booster predict might return continuous probabilities for binary classification
        if np.issubdtype(preds.dtype, np.floating) and len(preds.shape) == 1:
            if (preds >= 0.0).all() and (preds <= 1.0).all() and not ((preds == 0.0) | (preds == 1.0)).all():
                return (preds >= 0.5).astype(int)
        elif len(preds.shape) == 2:
            return np.argmax(preds, axis=1)
        return preds

    def predict_proba(self, data: pd.DataFrame) -> np.ndarray:
        if self.model is None:
            raise ValueError("Model has not been loaded.")
        if hasattr(self.model, "predict_proba"):
            return np.asarray(self.model.predict_proba(data))
        # Raw booster fallback
        if self._is_booster() or hasattr(self.model, "predict"):
            raw_preds = self._predict_raw(data)
            if len(raw_preds.shape) == 1:
                return np.column_stack([1 - raw_preds, raw_preds])
            return raw_preds
        preds = self.predict(data)
        return np.column_stack([1 - preds, preds])

    def get_feature_names(self) -> List[str]:
        if self.model is None:
            return []
        if hasattr(self.model, "feature_names_in_"):
            return self.model.feature_names_in_.tolist()
        if hasattr(self.model, "feature_names") and self.model.feature_names is not None:
            return list(self.model.feature_names)
        if hasattr(self.model, "named_steps"):
            preprocessor = self.model.named_steps.get("preprocessor")
            if preprocessor and hasattr(preprocessor, "feature_names_in_"):
                return preprocessor.feature_names_in_.tolist()
        return []

    def get_model_type(self) -> str:
        return "XGBoost"

    def get_underlying_model(self) -> Any:
        return self.model

    def capabilities(self) -> Dict[str, Any]:
        return {
            "predict_proba": True,
            "feature_importance": True,
            "task_types": ["classification", "regression"]
        }