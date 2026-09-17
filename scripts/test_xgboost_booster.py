"""
Regression Test: Raw XGBoost Booster Support in XGBoostAdapter
Verifies that raw xgboost.Booster models (from xgb.train()) can be loaded,
evaluated, monitored, diagnosed, and refined without TypeError or DMatrix issues.
"""

import sys
from pathlib import Path
import pandas as pd
import numpy as np
import xgboost as xgb
import joblib

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.adapters.registry import load_model_adapter, detect_model_type
from backend.app.compatibility import check_compatibility
from backend.app.health import generate_health_report
from backend.app.diagnosis import diagnose_health
from backend.app.evaluation import evaluate_model
from backend.app.database import init_db, create_monitoring_unit


def test_raw_xgboost_booster():
    print("=" * 60)
    print("Testing XGBoost Booster Regression Test")
    print("=" * 60)

    init_db()

    # 1. Create synthetic binary classification dataset
    np.random.seed(42)
    n_samples = 200
    features = ["MonthlyCharges", "tenure", "TotalCharges"]
    X = pd.DataFrame({
        "MonthlyCharges": np.random.uniform(20.0, 120.0, n_samples),
        "tenure": np.random.randint(1, 72, n_samples),
        "TotalCharges": np.random.uniform(50.0, 5000.0, n_samples)
    })
    y = np.random.randint(0, 2, n_samples)

    storage_dir = root_dir / "storage" / "models"
    storage_dir.mkdir(parents=True, exist_ok=True)
    booster_model_path = str(storage_dir / "test_raw_booster.joblib")

    data_dir = root_dir / "storage" / "datasets"
    data_dir.mkdir(parents=True, exist_ok=True)
    test_csv_path = str(data_dir / "test_booster_data.csv")

    df_full = X.copy()
    df_full["Churn"] = y
    df_full.to_csv(test_csv_path, index=False)

    # 2. Train raw Booster using xgb.train
    dtrain = xgb.DMatrix(X, label=y, feature_names=features)
    params = {
        "objective": "binary:logistic",
        "eval_metric": "logloss",
        "max_depth": 3,
        "eta": 0.1
    }
    booster = xgb.train(params, dtrain, num_boost_round=5)

    # 3. Save with joblib
    joblib.dump(booster, booster_model_path)
    print("  [OK] Saved raw xgb.Booster to", booster_model_path)

    # 4. Load via ModelAdapter
    adapter = load_model_adapter(booster_model_path)
    assert adapter.get_model_type() == "XGBoost", f"Expected XGBoost, got {adapter.get_model_type()}"
    print("  [OK] ModelAdapter loaded raw booster as:", adapter.get_model_type())

    # 5. Check adapter.capabilities()
    caps = adapter.capabilities()
    assert caps["predict_proba"] is True
    assert caps["feature_importance"] is True
    print("  [OK] Capabilities:", caps)

    # 6. Test predict() and predict_proba() on DataFrame directly
    preds = adapter.predict(X)
    assert isinstance(preds, np.ndarray), "predict must return np.ndarray"
    assert len(preds) == n_samples, f"Expected {n_samples} preds, got {len(preds)}"
    assert set(np.unique(preds)).issubset({0, 1}), f"Predictions must be binary 0 or 1, got {np.unique(preds)}"

    probas = adapter.predict_proba(X)
    assert isinstance(probas, np.ndarray), "predict_proba must return np.ndarray"
    assert probas.shape == (n_samples, 2), f"Expected shape ({n_samples}, 2), got {probas.shape}"
    assert np.allclose(probas.sum(axis=1), 1.0), "Probabilities must sum to 1.0"
    print("  [OK] Direct DataFrame predict() and predict_proba() succeeded without DMatrix error")

    # 7. Check feature names
    extracted_features = adapter.get_feature_names()
    assert extracted_features == features, f"Expected {features}, got {extracted_features}"
    print("  [OK] Feature names extracted correctly:", extracted_features)

    # 8. Test compatibility check
    compat_res = check_compatibility(
        model_path=booster_model_path,
        dataset_path=test_csv_path,
        target_column="Churn"
    )
    assert compat_res["compatible"] is True, f"Compatibility check failed: {compat_res}"
    assert compat_res["prediction_test"] is True
    print("  [OK] Compatibility check passed for raw Booster")

    # 9. Test health analysis
    health_res = generate_health_report(
        model_path=booster_model_path,
        reference_path=test_csv_path,
        current_path=test_csv_path,
        target_column="Churn"
    )
    assert health_res["status"] in ["HEALTHY", "WARNING", "CRITICAL"]
    assert "performance" in health_res
    print("  [OK] Health analysis completed with status:", health_res["status"])

    # 10. Test diagnosis
    diag_res = diagnose_health(
        health_report=health_res,
        model_path=booster_model_path,
        dataset_path=test_csv_path,
        target_column="Churn"
    )
    assert "diagnoses" in diag_res
    print("  [OK] Diagnosis engine ran successfully on Booster")

    # 11. Test evaluation
    eval_res = evaluate_model(
        model_path=booster_model_path,
        test_path=test_csv_path,
        target_column="Churn"
    )
    assert "accuracy" in eval_res and "f1" in eval_res
    print("  [OK] Evaluation engine evaluated Booster: F1 =", eval_res.get("f1"))

    print("\n>>> ALL XGBOOST BOOSTER REGRESSION TESTS PASSED! <<<")


if __name__ == "__main__":
    test_raw_xgboost_booster()
