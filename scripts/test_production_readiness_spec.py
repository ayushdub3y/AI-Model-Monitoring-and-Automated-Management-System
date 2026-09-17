"""
Comprehensive Acceptance & Regression Test Suite for Production Readiness Fix Spec
Verifies all 8 items across P0, P1, and P2 tiers.
"""

import sys
import os
import time
from pathlib import Path
import pandas as pd
import numpy as np
import joblib
from sklearn.neighbors import KNeighborsClassifier
from sklearn.ensemble import RandomForestClassifier
from fastapi.testclient import TestClient

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.main import app
from backend.app.database import init_db, create_monitoring_unit, get_monitoring_unit, list_monitoring_units
from backend.app.adapters.registry import load_model_adapter
from backend.app.adapters.sklearn_adapter import SklearnAdapter
from backend.app.compatibility import check_compatibility
from backend.app.shap_explainer import generate_shap_summary
from backend.app.rate_limiter import limiter
from backend.app.exceptions import CorruptModelError

client = TestClient(app)


def test_item_1_xgboost_booster():
    print("\n--- [P0 - Item 1] XGBoost Booster Support ---")
    import xgboost as xgb
    n = 100
    X = pd.DataFrame({
        "f1": np.random.uniform(0, 10, n),
        "f2": np.random.uniform(10, 20, n)
    })
    y = np.random.randint(0, 2, n)
    dtrain = xgb.DMatrix(X, label=y, feature_names=["f1", "f2"])
    booster = xgb.train({"objective": "binary:logistic"}, dtrain, num_boost_round=3)

    model_path = str(root_dir / "storage" / "models" / "temp_booster_item1.joblib")
    joblib.dump(booster, model_path)

    adapter = load_model_adapter(model_path)
    assert adapter.get_model_type() == "XGBoost"

    preds = adapter.predict(X)
    assert len(preds) == n and set(np.unique(preds)).issubset({0, 1})

    probas = adapter.predict_proba(X)
    assert probas.shape == (n, 2)
    assert np.allclose(probas.sum(axis=1), 1.0)
    print("  [PASS] XGBoost Booster runs predict() and predict_proba() without DMatrix crash")


def test_item_2_promotion_mode_assisted_default():
    print("\n--- [P0 - Item 2] Promotion Mode Defaults to ASSISTED ---")
    init_db()

    # 1. Test database helper default
    unit_rec = create_monitoring_unit(name="Test Assisted Default Unit")
    assert unit_rec.promotion_mode == "ASSISTED", f"Expected ASSISTED, got {unit_rec.promotion_mode}"

    # 2. Test API endpoint default
    res = client.post("/api/units", json={"name": "API Created Unit"})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["unit"]["promotion_mode"] == "ASSISTED", f"Expected ASSISTED from API, got {data['unit']['promotion_mode']}"
    print("  [PASS] Newly created MonitoringUnits default to ASSISTED mode")


def test_item_3_error_path_sanitization():
    print("\n--- [P0 - Item 3] Client-Facing Error Path Sanitization ---")
    # Corrupt model artifact test
    corrupt_file = root_dir / "storage" / "models" / "corrupt_test_file.pkl"
    corrupt_file.parent.mkdir(parents=True, exist_ok=True)
    corrupt_file.write_bytes(b"NOT_A_VALID_PICKLE_BINARY_HEADER")

    try:
        load_model_adapter(str(corrupt_file))
        assert False, "Should have raised CorruptModelError"
    except CorruptModelError as e:
        msg = str(e)
        assert "corrupt_test_file.pkl" in msg, f"Filename should be present in message: {msg}"
        assert not ("storage/models" in msg or "storage\\models" in msg), f"Directory path leaked: {msg}"
        assert not (":\\" in msg or "/home/" in msg or "/mnt/" in msg), f"Root/Drive path leaked: {msg}"
        print(f"  [PASS] Error message cleanly sanitized: '{msg}'")


def test_item_4_dtype_mismatch_detection():
    print("\n--- [P1 - Item 4] Dtype Mismatch Detection ---")
    # Create baseline numeric dataset and model
    n = 50
    X = pd.DataFrame({
        "MonthlyCharges": np.random.uniform(20, 100, n),
        "tenure": np.random.randint(1, 50, n)
    })
    y = np.random.randint(0, 2, n)
    rf = RandomForestClassifier(n_estimators=5, random_state=42)
    rf.fit(X, y)

    model_path = str(root_dir / "storage" / "models" / "temp_rf_dtype_test.pkl")
    joblib.dump(rf, model_path)

    # Incompatible dataset with string in MonthlyCharges
    bad_df = X.copy()
    bad_df["MonthlyCharges"] = ["invalid_text_" + str(i) for i in range(n)]
    bad_df["Churn"] = y
    bad_csv = str(root_dir / "storage" / "datasets" / "temp_bad_dtype.csv")
    bad_df.to_csv(bad_csv, index=False)

    compat = check_compatibility(model_path=model_path, dataset_path=bad_csv, target_column="Churn")
    assert compat["compatible"] is False, "Dataset with string MonthlyCharges should be incompatible"
    assert len(compat["dtype_mismatches"]) > 0, "dtype_mismatches list must be populated"
    assert any("MonthlyCharges" in dm["column"] for dm in compat["dtype_mismatches"])
    assert any("Data type mismatch" in err for err in compat["errors"])
    print(f"  [PASS] Dtype mismatch correctly caught before predict: {compat['errors'][0]}")


def test_item_5_dead_code_absence():
    print("\n--- [P1 - Item 5] Dead Code Elimination ---")
    rec_file = root_dir / "backend" / "app" / "recommendations.py"
    assert not rec_file.exists(), "backend/app/recommendations.py must be deleted"

    # Verify no import shap or evidently in backend/app
    app_dir = root_dir / "backend" / "app"
    for py_file in app_dir.rglob("*.py"):
        content = py_file.read_text(encoding="utf-8")
        assert "from evidently" not in content and "import evidently" not in content, f"evidently found in {py_file.name}"
        assert "import shap" not in content, f"import shap found in {py_file.name}"

    assert (root_dir / "docs" / "DRIFT.md").exists(), "docs/DRIFT.md must exist"
    print("  [PASS] Zero dead code: recommendations.py deleted, evidently/shap imports eliminated, docs/DRIFT.md created")


def test_item_6_model_adapter_capabilities():
    print("\n--- [P1 - Item 6] ModelAdapter Capabilities & SHAP Transparency ---")
    n = 60
    X = pd.DataFrame({
        "f1": np.random.uniform(0, 10, n),
        "f2": np.random.uniform(10, 20, n)
    })
    y = np.random.randint(0, 2, n)

    # 1. KNeighborsClassifier (no feature importances)
    knn = KNeighborsClassifier(n_neighbors=3)
    knn.fit(X, y)
    knn_adapter = SklearnAdapter(knn)
    knn_caps = knn_adapter.capabilities()
    assert knn_caps["feature_importance"] is False
    assert knn_caps["predict_proba"] is True

    knn_path = str(root_dir / "storage" / "models" / "temp_knn_caps.pkl")
    joblib.dump(knn, knn_path)
    csv_path = str(root_dir / "storage" / "datasets" / "temp_knn_data.csv")
    df_temp = X.copy()
    df_temp["Churn"] = y
    df_temp.to_csv(csv_path, index=False)

    shap_res = generate_shap_summary(knn_path, csv_path, target_column="Churn")
    assert shap_res["status"] == "unavailable", f"Expected status 'unavailable', got {shap_res}"
    assert "unavailable" in shap_res["message"].lower()
    print("  [PASS] KNN adapter declares feature_importance=False, and shap_explainer honestly reports 'unavailable'")

    # 2. RandomForestClassifier (has feature importances)
    rf = RandomForestClassifier(n_estimators=5, random_state=42)
    rf.fit(X, y)
    rf_adapter = SklearnAdapter(rf)
    rf_caps = rf_adapter.capabilities()
    assert rf_caps["feature_importance"] is True
    assert rf_caps["predict_proba"] is True
    print("  [PASS] Random Forest adapter declares feature_importance=True")


def test_item_7_subprocess_timeout_cleanup():
    print("\n--- [P2 - Item 7] Subprocess Isolation Truth in Docs & Config ---")
    from backend.app import config
    assert not hasattr(config, "SUBPROCESS_TIMEOUT_SEC"), "SUBPROCESS_TIMEOUT_SEC must be removed from config.py"

    sec_doc = (root_dir / "docs" / "SECURITY.md").read_text(encoding="utf-8")
    assert "In-Process" in sec_doc or "in-process" in sec_doc
    print("  [PASS] Config and docs accurately reflect in-process execution without false subprocess isolation claims")


def test_item_8_rate_limiting():
    print("\n--- [P2 - Item 8] Sliding-Window Rate Limiting ---")
    limiter.reset()

    # Rapid fire requests to /api/intake
    limit = 20
    statuses = []
    for i in range(limit + 5):
        res = client.post("/api/intake", data={
            "model_path": "models/baseline_model.pkl",
            "dataset_path": "data/processed/test.csv",
            "target_column": "Churn",
            "model_name": f"Rate Limit Test {i}",
            "unit_id": 1
        })
        statuses.append(res.status_code)

    assert 429 in statuses, f"Expected HTTP 429 after {limit} requests, got statuses: {statuses}"
    rate_limited_count = statuses.count(429)
    assert rate_limited_count >= 5, f"Expected at least 5 rate-limited responses, got {rate_limited_count}"
    print(f"  [PASS] Rate limiter triggered HTTP 429 successfully (429 count: {rate_limited_count})")
    limiter.reset()


def run_all():
    print("=" * 70)
    print("RUNNING ALL PRODUCTION READINESS SPEC ACCEPTANCE TESTS")
    print("=" * 70)

    test_item_1_xgboost_booster()
    test_item_2_promotion_mode_assisted_default()
    test_item_3_error_path_sanitization()
    test_item_4_dtype_mismatch_detection()
    test_item_5_dead_code_absence()
    test_item_6_model_adapter_capabilities()
    test_item_7_subprocess_timeout_cleanup()
    test_item_8_rate_limiting()

    print("\n" + "=" * 70)
    print("ALL 8 PRODUCTION READINESS ITEMS FULLY VERIFIED AND PASSING! (8/8)")
    print("=" * 70)


if __name__ == "__main__":
    run_all()
