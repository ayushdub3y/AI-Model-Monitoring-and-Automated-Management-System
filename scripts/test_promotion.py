import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.evaluation import evaluate_model
from backend.app.promotion import decide_promotion

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

decision = decide_promotion(
    baseline_eval,
    candidate_eval
)

print("Promotion decision:")
print(decision)