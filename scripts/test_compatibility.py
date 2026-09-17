import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.compatibility import check_compatibility

dataset_path = "storage/datasets/test.csv" if Path("storage/datasets/test.csv").exists() else "data/processed/test.csv"

result = check_compatibility(
    "models/baseline_model.pkl",
    dataset_path,
    target_column="Churn"
)

print("Compatibility result:")
print(result)