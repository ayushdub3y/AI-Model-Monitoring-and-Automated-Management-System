import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.model_profiler import profile_model

profile = profile_model("models/baseline_model.pkl")

print("Model profile:")
print(profile)