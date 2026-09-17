import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.drift import detect_drift

result = detect_drift(
    "data/processed/reference.csv",
    "data/processed/test.csv",
    "Churn"
)

print("Drift detection result:")
print(result)