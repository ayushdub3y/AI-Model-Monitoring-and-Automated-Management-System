import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.prediction_drift import detect_prediction_drift

result = detect_prediction_drift(
    "models/baseline_model.pkl",
    "data/processed/reference.csv",
    "data/processed/test.csv",
    "Churn"
)

print("Prediction drift result:")
print(result)