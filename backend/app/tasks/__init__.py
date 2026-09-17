from .base import TaskAdapter
from .binary_classification import BinaryClassificationTaskAdapter
from .multiclass_classification import MulticlassClassificationTaskAdapter
from .regression import RegressionTaskAdapter
from .registry import TaskRegistry, task_registry, get_task_adapter

__all__ = [
    "TaskAdapter",
    "BinaryClassificationTaskAdapter",
    "MulticlassClassificationTaskAdapter",
    "RegressionTaskAdapter",
    "TaskRegistry",
    "task_registry",
    "get_task_adapter",
]
