import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.evaluation import evaluate_model, compare_models

baseline_eval = evaluate_model(
    "models/baseline_model.pkl",
    "data/processed/test.csv",
    "Churn"
)

candidate_eval = evaluate_model(
    "models/baseline_model.pkl",
    "data/processed/test.csv",
    "Churn"
)

comparison = compare_models(
    baseline_eval,
    candidate_eval
)

print("Evaluation comparison:")
print(comparison)