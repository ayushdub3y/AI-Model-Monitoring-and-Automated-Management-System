from typing import Dict, Any
from .adapters.registry import load_model_adapter


def profile_model(file_path: str) -> Dict[str, Any]:
    """
    Profiles a model using the ModelAdapter abstraction.
    """
    adapter = load_model_adapter(file_path)
    model = adapter.get_underlying_model()

    profile = {
        "model_family": adapter.get_model_type(),
        "model_type": type(model).__name__,
        "model_module": type(model).__module__,
        "is_pipeline": hasattr(model, "steps") or hasattr(model, "named_steps"),
        "params": {},
        "feature_names": adapter.get_feature_names()
    }

    if hasattr(model, "steps"):
        profile["pipeline_steps"] = [name for name, _ in model.steps]

    if hasattr(model, "named_steps"):
        profile["named_steps"] = list(model.named_steps.keys())
        estimator = model.named_steps.get("model")
        if estimator is not None:
            profile["estimator_type"] = type(estimator).__name__
            profile["estimator_module"] = type(estimator).__module__
            if hasattr(estimator, "get_params"):
                raw_params = estimator.get_params()
                profile["params"] = {
                    k: str(v) if not isinstance(v, (int, float, bool, str, type(None))) else v
                    for k, v in raw_params.items()
                }
    elif hasattr(model, "get_params"):
        raw_params = model.get_params()
        profile["params"] = {
            k: str(v) if not isinstance(v, (int, float, bool, str, type(None))) else v
            for k, v in raw_params.items()
        }

    return profile