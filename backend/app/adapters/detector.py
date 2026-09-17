"""
Backward-compatible detector module.
Delegates to the extensible AdapterRegistry.
"""
from .registry import detect_model_type, load_model_adapter, registry

__all__ = ["detect_model_type", "load_model_adapter", "registry"]