import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.adapters.sklearn_adapter import SklearnAdapter

adapter = SklearnAdapter()
adapter.load("models/baseline_model.pkl")

print("Model Type:", adapter.get_model_type())
print("Feature Count:", len(adapter.get_feature_names()))
print("Features:", adapter.get_feature_names()[:5])