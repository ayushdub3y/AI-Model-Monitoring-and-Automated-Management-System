import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.health import generate_health_report

dataset_path = "storage/datasets/test.csv" if Path("storage/datasets/test.csv").exists() else "data/processed/test.csv"

report = generate_health_report(
    "models/baseline_model.pkl",
    "data/processed/reference.csv",
    dataset_path,
    "Churn"
)

print("Unified health report:")
print(report)