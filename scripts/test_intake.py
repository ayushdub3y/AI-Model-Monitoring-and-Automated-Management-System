import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.intake import intake_model

result = intake_model(
    "models/baseline_model.pkl",
    "data/processed/test.csv",
    "Churn"
)

print("Intake result:")
print(result)