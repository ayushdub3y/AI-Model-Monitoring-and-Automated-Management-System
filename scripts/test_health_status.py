import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.health import evaluate_model
from backend.app.drift import detect_drift
from backend.app.prediction_drift import detect_prediction_drift
from backend.app.data_quality import check_data_quality
from backend.app.health_status import determine_health_status


evaluation = evaluate_model(
    "models/baseline_model.pkl",
    "data/processed/test.csv",
    "Churn"
)

drift_result = detect_drift(
    "data/processed/reference.csv",
    "data/processed/test.csv",
    "Churn"
)

prediction_drift_result = detect_prediction_drift(
    "models/baseline_model.pkl",
    "data/processed/reference.csv",
    "data/processed/test.csv",
    "Churn"
)

data_quality_result = check_data_quality(
    "data/processed/test.csv"
)

status = determine_health_status(
    evaluation,
    drift_result,
    prediction_drift_result,
    data_quality_result
)

print("Health Status Decision:")
print(status)