import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.health import generate_health_report
from backend.app.diagnosis import (
    diagnose_health,
    diagnose_data_quality
)
from backend.app.data_quality import check_data_quality

dataset_path = "storage/datasets/test.csv" if Path("storage/datasets/test.csv").exists() else "data/processed/test.csv"

health_report = generate_health_report(
    "models/baseline_model.pkl",
    "data/processed/reference.csv",
    dataset_path,
    "Churn"
)

diagnosis_result = diagnose_health(
    health_report,
    model_path="models/baseline_model.pkl",
    dataset_path=dataset_path,
    target_column="Churn",
    shap_output_path="storage/shap_summary.png",
)

print("Health diagnoses:")
for d in diagnosis_result["diagnoses"]:
    print(f"  [{d['severity']}] {d['issue']}")
    print(f"    {d['explanation']}")

print()

if diagnosis_result["shap"]:
    print("SHAP feature importance (top features):")
    for feature, importance in diagnosis_result["shap"]["feature_importance"].items():
        print(f"  {feature}: {importance}")
    if diagnosis_result["shap"]["chart_path"]:
        print(f"\nSHAP chart saved to: {diagnosis_result['shap']['chart_path']}")
else:
    print("SHAP: not computed (no issues or unsupported model)")


expected_columns = [
    "gender",
    "SeniorCitizen",
    "Partner",
    "Dependents",
    "tenure",
    "PhoneService",
    "MultipleLines",
    "InternetService",
    "OnlineSecurity",
    "OnlineBackup",
    "DeviceProtection",
    "TechSupport",
    "StreamingTV",
    "StreamingMovies",
    "Contract",
    "PaperlessBilling",
    "PaymentMethod",
    "MonthlyCharges",
    "TotalCharges",
    "Churn"
]

data_quality = check_data_quality(
    dataset_path,
    expected_columns
)

quality_diagnoses = diagnose_data_quality(
    data_quality
)

print("\nData quality diagnosis:")
print(quality_diagnoses)