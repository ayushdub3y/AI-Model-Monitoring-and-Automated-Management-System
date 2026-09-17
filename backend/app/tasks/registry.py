from typing import Dict, Type, Optional
from .base import TaskAdapter
from .binary_classification import BinaryClassificationTaskAdapter
from .multiclass_classification import MulticlassClassificationTaskAdapter
from .regression import RegressionTaskAdapter


class TaskRegistry:
    """
    Registry and factory for Task Adapters.
    """

    def __init__(self):
        self._adapters: Dict[str, Type[TaskAdapter]] = {
            "classification": BinaryClassificationTaskAdapter,
            "binary_classification": BinaryClassificationTaskAdapter,
            "multiclass": MulticlassClassificationTaskAdapter,
            "multiclass_classification": MulticlassClassificationTaskAdapter,
            "regression": RegressionTaskAdapter
        }

    def register(self, task_type: str, adapter_cls: Type[TaskAdapter]) -> None:
        self._adapters[task_type.lower()] = adapter_cls

    def get_adapter(self, task_type: Optional[str] = None) -> TaskAdapter:
        key = (task_type or "classification").lower()
        adapter_cls = self._adapters.get(key, BinaryClassificationTaskAdapter)
        return adapter_cls()


task_registry = TaskRegistry()


def get_task_adapter(task_type: Optional[str] = "classification") -> TaskAdapter:
    """Convenience getter for task adapter instance."""
    return task_registry.get_adapter(task_type)
