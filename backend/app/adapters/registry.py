import joblib
from typing import Any, List, Type
from pathlib import Path

from .base import ModelAdapter
from .sklearn_adapter import SklearnAdapter
from .xgboost_adapter import XGBoostAdapter
from ..exceptions import CorruptModelError, UnsupportedModelError


class AdapterRegistry:
    """
    Registry for model adapters.
    Replaces hardcoded if/elif detector chains with an extensible registry.
    """

    def __init__(self):
        self._adapters: List[Type[ModelAdapter]] = []
        # Register defaults in order of specificity
        self.register(XGBoostAdapter)
        self.register(SklearnAdapter)

    def register(self, adapter_cls: Type[ModelAdapter]) -> None:
        """Register a new adapter class."""
        if adapter_cls not in self._adapters:
            self._adapters.insert(0, adapter_cls)

    def get_adapter_for_model(self, model: Any) -> ModelAdapter:
        """Finds matching adapter for an in-memory model object."""
        for adapter_cls in self._adapters:
            if adapter_cls.can_handle(model):
                return adapter_cls(model=model)

        raise UnsupportedModelError(
            f"Unsupported model family/type: {type(model).__name__} from module '{type(model).__module__}'"
        )

    def load_model_adapter(self, file_path: str) -> ModelAdapter:
        """
        Safely loads a model from disk into the appropriate ModelAdapter.
        Catches corrupted files and maps them to CorruptModelError.
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Model file not found: {path.name}")

        try:
            raw_model = joblib.load(str(path))
        except Exception as e:
            raise CorruptModelError(f"Corrupted or invalid model artifact '{path.name}': {str(e)}")

        adapter = self.get_adapter_for_model(raw_model)
        return adapter


# Global registry singleton
registry = AdapterRegistry()


def load_model_adapter(file_path: str) -> ModelAdapter:
    """Convenience function to load any supported model into its adapter."""
    return registry.load_model_adapter(file_path)


def detect_model_type(file_path: str) -> str:
    """Detects and returns the model family string using the registry."""
    adapter = load_model_adapter(file_path)
    return adapter.get_model_type()
