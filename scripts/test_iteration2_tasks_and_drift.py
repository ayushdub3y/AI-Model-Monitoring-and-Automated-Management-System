import sys
import os
import shutil
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression
import joblib

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.database import (
    init_db,
    create_monitoring_unit,
    get_monitoring_unit,
    save_reference_baseline,
    list_reference_baselines,
    get_reference_baseline,
    update_monitoring_unit_thresholds
)
from backend.app.tasks.registry import get_task_adapter
from backend.app.health import generate_health_report, evaluate_model, classify_drift
from backend.app.schema_checker import check_schema_compatibility
from backend.app.evaluation import compare_models
from backend.app.promotion import decide_promotion

TEST_DIR = Path("storage/test_iteration2_scratch")
if TEST_DIR.exists():
    shutil.rmtree(TEST_DIR)
TEST_DIR.mkdir(parents=True, exist_ok=True)

init_db()


def run_iteration2_tests():
    print("=" * 60)
    print("RUNNING ITERATION 2 TEST SUITE (Task-Aware Monitoring & Context-Aware Drift)")
    print("=" * 60)

    # -------------------------------------------------------------
    # Test 1: Binary Classification Task Adapter
    # -------------------------------------------------------------
    print("\n[TEST 1] Binary Classification Task Adapter...")
    y_true_bin = pd.Series([1, 0, 1, 1, 0, 1, 0, 0, 1, 0])
    y_pred_bin = np.array([1, 0, 1, 0, 0, 1, 0, 0, 1, 1])
    probs_bin = np.array([[0.1, 0.9], [0.8, 0.2], [0.2, 0.8], [0.6, 0.4], [0.9, 0.1],
                          [0.1, 0.9], [0.7, 0.3], [0.85, 0.15], [0.25, 0.75], [0.4, 0.6]])

    bin_adapter = get_task_adapter("classification")
    bin_metrics = bin_adapter.compute_metrics(y_true_bin, y_pred_bin, probs_bin)

    assert "accuracy" in bin_metrics
    assert "precision" in bin_metrics
    assert "recall" in bin_metrics
    assert "f1" in bin_metrics
    assert "roc_auc" in bin_metrics
    assert "pr_auc" in bin_metrics
    assert "confusion_matrix" in bin_metrics
    assert "class_distribution" in bin_metrics
    print(f"  [OK] Binary Metrics: F1={bin_metrics['f1']}, ROC-AUC={bin_metrics['roc_auc']}, PR-AUC={bin_metrics['pr_auc']}")

    # -------------------------------------------------------------
    # Test 2: Multiclass Classification Task Adapter
    # -------------------------------------------------------------
    print("\n[TEST 2] Multiclass Classification Task Adapter...")
    y_true_multi = pd.Series(["A", "B", "C", "A", "B", "C", "A", "C", "B", "A"])
    y_pred_multi = np.array(["A", "B", "C", "A", "C", "C", "A", "B", "B", "A"])
    probs_multi = np.random.dirichlet(np.ones(3), size=len(y_true_multi))

    multi_adapter = get_task_adapter("multiclass")
    multi_metrics = multi_adapter.compute_metrics(y_true_multi, y_pred_multi, probs_multi)

    assert "macro_f1" in multi_metrics
    assert "weighted_f1" in multi_metrics
    assert "micro_f1" in multi_metrics
    assert "per_class" in multi_metrics
    assert "A" in multi_metrics["per_class"]
    assert "B" in multi_metrics["per_class"]
    assert "C" in multi_metrics["per_class"]
    print(f"  [OK] Multiclass Metrics: Macro F1={multi_metrics['macro_f1']}, Weighted F1={multi_metrics['weighted_f1']}")
    print(f"       Per-class metrics: {multi_metrics['per_class']}")

    # -------------------------------------------------------------
    # Test 3: Regression Task Adapter
    # -------------------------------------------------------------
    print("\n[TEST 3] Regression Task Adapter...")
    y_true_reg = pd.Series([100.5, 200.0, 150.2, 300.8, 250.0, 180.3, 220.1])
    y_pred_reg = np.array([105.0, 195.0, 152.0, 290.0, 255.0, 175.0, 225.0])

    reg_adapter = get_task_adapter("regression")
    reg_metrics = reg_adapter.compute_metrics(y_true_reg, y_pred_reg)

    assert "mae" in reg_metrics
    assert "mse" in reg_metrics
    assert "rmse" in reg_metrics
    assert "r2" in reg_metrics
    assert "residuals" in reg_metrics
    assert "median" in reg_metrics["residuals"]
    print(f"  [OK] Regression Metrics: MAE={reg_metrics['mae']}, RMSE={reg_metrics['rmse']}, R2={reg_metrics['r2']}")
    print(f"       Residual summary: mean={reg_metrics['residuals']['mean']}, std={reg_metrics['residuals']['std']}")

    # -------------------------------------------------------------
    # Create Real Sample Models & Datasets for Integration Testing
    # -------------------------------------------------------------
    print("\n[SETUP] Training lightweight models and saving test fixtures...")
    np.random.seed(42)

    # 1. Regression model & data
    X_reg_df = pd.DataFrame(np.random.randn(200, 4), columns=["sqft", "bedrooms", "age", "location_score"])
    y_reg = 50 * X_reg_df["sqft"] + 20 * X_reg_df["bedrooms"] - 5 * X_reg_df["age"] + np.random.randn(200) * 10
    reg_model = RandomForestRegressor(n_estimators=10, random_state=42)
    reg_model.fit(X_reg_df, y_reg)

    reg_model_path = TEST_DIR / "housing_reg_model.pkl"
    joblib.dump(reg_model, reg_model_path)

    ref_reg_df = X_reg_df.copy()
    ref_reg_df["price"] = y_reg
    ref_reg_path = TEST_DIR / "housing_ref.csv"
    ref_reg_df.to_csv(ref_reg_path, index=False)

    cur_reg_df = ref_reg_df.sample(50, random_state=42).copy()
    cur_reg_path = TEST_DIR / "housing_cur.csv"
    cur_reg_df.to_csv(cur_reg_path, index=False)

    # 2. Multiclass model & data
    X_multi_df = pd.DataFrame(np.random.randn(200, 4), columns=["feat1", "feat2", "feat3", "feat4"])
    y_multi = np.random.choice(["Tier1", "Tier2", "Tier3"], size=200)
    multi_model = RandomForestClassifier(n_estimators=10, random_state=42)
    multi_model.fit(X_multi_df, y_multi)

    multi_model_path = TEST_DIR / "tier_multi_model.pkl"
    joblib.dump(multi_model, multi_model_path)

    ref_multi_df = X_multi_df.copy()
    ref_multi_df["tier"] = y_multi
    ref_multi_path = TEST_DIR / "tier_ref.csv"
    ref_multi_df.to_csv(ref_multi_path, index=False)

    cur_multi_df = ref_multi_df.sample(50, random_state=42).copy()
    cur_multi_path = TEST_DIR / "tier_cur.csv"
    cur_multi_df.to_csv(cur_multi_path, index=False)

    # -------------------------------------------------------------
    # Test 4: Regression Monitoring Unit & Health Report
    # -------------------------------------------------------------
    print("\n[TEST 4] End-to-End Regression Monitoring Unit...")
    unit_reg = create_monitoring_unit(
        name="Housing Price Predictor",
        task_type="regression",
        target_column="price"
    )

    reg_report = generate_health_report(
        model_path=str(reg_model_path),
        reference_path=str(ref_reg_path),
        current_path=str(cur_reg_path),
        target_column="price",
        unit_id=unit_reg.id
    )

    assert reg_report["task_type"] == "regression"
    assert "rmse" in reg_report["performance"]
    assert "r2" in reg_report["performance"]
    assert "schema_health" in reg_report
    assert "components" in reg_report
    print(f"  [OK] Regression Health: status={reg_report['status']}, score={reg_report['health_score']}, RMSE={reg_report['performance']['rmse']}")

    # -------------------------------------------------------------
    # Test 5: Multiclass Monitoring Unit & Health Report
    # -------------------------------------------------------------
    print("\n[TEST 5] End-to-End Multiclass Monitoring Unit...")
    unit_multi = create_monitoring_unit(
        name="Customer Tier Classifier",
        task_type="multiclass",
        target_column="tier"
    )

    multi_report = generate_health_report(
        model_path=str(multi_model_path),
        reference_path=str(ref_multi_path),
        current_path=str(cur_multi_path),
        target_column="tier",
        unit_id=unit_multi.id
    )

    assert multi_report["task_type"] == "multiclass"
    assert "macro_f1" in multi_report["performance"]
    assert "per_class" in multi_report["performance"]
    print(f"  [OK] Multiclass Health: status={multi_report['status']}, score={multi_report['health_score']}, Macro F1={multi_report['performance']['macro_f1']}")

    # -------------------------------------------------------------
    # Test 6: Unlabeled Monitoring (Ground truth missing)
    # -------------------------------------------------------------
    print("\n[TEST 6] Unlabeled Monitoring (Labels Missing)...")
    unlabeled_df = cur_reg_df.drop(columns=["price"])
    unlabeled_path = TEST_DIR / "housing_unlabeled.csv"
    unlabeled_df.to_csv(unlabeled_path, index=False)

    unlabeled_report = generate_health_report(
        model_path=str(reg_model_path),
        reference_path=str(ref_reg_path),
        current_path=str(unlabeled_path),
        target_column="price",
        unit_id=unit_reg.id
    )

    assert unlabeled_report["labels_status"] == "UNAVAILABLE"
    assert unlabeled_report["performance"]["labels_available"] is False
    assert unlabeled_report["components"]["performance"]["status"] == "UNKNOWN"
    # Feature drift & schema health still ran!
    assert "data_drift" in unlabeled_report
    assert "schema_health" in unlabeled_report
    print(f"  [OK] Unlabeled monitoring completed cleanly: labels_status={unlabeled_report['labels_status']}, overall status={unlabeled_report['status']}")

    # -------------------------------------------------------------
    # Test 7: Delayed Labels (Ground truth null)
    # -------------------------------------------------------------
    print("\n[TEST 7] Delayed Labels (Target column present but null)...")
    delayed_df = cur_reg_df.copy()
    delayed_df["price"] = np.nan
    delayed_path = TEST_DIR / "housing_delayed.csv"
    delayed_df.to_csv(delayed_path, index=False)

    delayed_report = generate_health_report(
        model_path=str(reg_model_path),
        reference_path=str(ref_reg_path),
        current_path=str(delayed_path),
        target_column="price",
        unit_id=unit_reg.id
    )

    assert delayed_report["labels_status"] == "DELAYED"
    assert delayed_report["components"]["performance"]["status"] == "UNKNOWN"
    print(f"  [OK] Delayed labels handled: labels_status={delayed_report['labels_status']}")

    # -------------------------------------------------------------
    # Test 8: Schema & Dtype Checker
    # -------------------------------------------------------------
    print("\n[TEST 8] Schema & Dtype Mismatch Checks...")
    corrupt_schema_df = cur_reg_df.copy()
    corrupt_schema_df = corrupt_schema_df.drop(columns=["age"])  # Missing column
    corrupt_schema_df["extra_feature"] = 123  # Extra column
    corrupt_schema_df["bedrooms"] = corrupt_schema_df["bedrooms"].astype(str) + "_bad_type"  # Numeric -> string

    schema_check = check_schema_compatibility(ref_reg_df, corrupt_schema_df, target_column="price")
    assert schema_check["healthy"] is False
    assert schema_check["status"] == "CRITICAL"
    assert "age" in schema_check["missing_columns"]
    assert "extra_feature" in schema_check["extra_columns"]
    assert "bedrooms" in schema_check["dtype_mismatches"]
    print(f"  [OK] Schema check detected: missing={schema_check['missing_columns']}, extra={schema_check['extra_columns']}, type mismatches={schema_check['dtype_mismatches'].keys()}")

    # -------------------------------------------------------------
    # Test 9: Prediction Drift on Shifted Data
    # -------------------------------------------------------------
    print("\n[TEST 9] Prediction Drift on Shifted Feature Distribution...")
    drifted_housing_df = ref_reg_df.copy()
    drifted_housing_df["sqft"] = drifted_housing_df["sqft"] + 15.0  # Massive shift
    drifted_housing_path = TEST_DIR / "housing_drifted.csv"
    drifted_housing_df.to_csv(drifted_housing_path, index=False)

    drifted_report = generate_health_report(
        model_path=str(reg_model_path),
        reference_path=str(ref_reg_path),
        current_path=str(drifted_housing_path),
        target_column="price",
        unit_id=unit_reg.id
    )

    assert drifted_report["prediction_drift"]["drift_detected"] is True
    assert drifted_report["data_drift"]["drift_detected"] is True
    print(f"  [OK] Drift detected: feature drift rate={drifted_report['data_drift']['drift_rate']}, prediction drift stat={drifted_report['prediction_drift']['statistic']}")

    # -------------------------------------------------------------
    # Test 10: Expected vs Unexpected Drift with Baselines
    # -------------------------------------------------------------
    print("\n[TEST 10] Context-Aware Expected vs Unexpected Drift...")
    # Baseline with expected drift in 'sqft'
    seasonal_baseline = save_reference_baseline(
        unit_id=unit_reg.id,
        name="Summer Housing Baseline",
        file_path=str(ref_reg_path),
        description="Baseline for high-summer seasonal shifts",
        expected_drift_features=["sqft"],
        is_default=True
    )

    # 10a. Shift in 'sqft' only (should be classified as EXPECTED)
    exp_report = generate_health_report(
        model_path=str(reg_model_path),
        reference_path=str(ref_reg_path),
        current_path=str(drifted_housing_path),
        target_column="price",
        unit_id=unit_reg.id,
        baseline_id=seasonal_baseline.id
    )

    assert exp_report["drift_classification"] == "EXPECTED"
    assert exp_report["components"]["drift"]["status"] == "HEALTHY"  # Expected drift does not trigger false alarm
    print(f"  [OK] Whitelisted shift correctly classified as EXPECTED (drift component status: {exp_report['components']['drift']['status']})")

    # 10b. Shift in unexpected feature 'location_score'
    unexp_df = ref_reg_df.copy()
    unexp_df["location_score"] = unexp_df["location_score"] + 20.0
    unexp_path = TEST_DIR / "housing_unexp.csv"
    unexp_df.to_csv(unexp_path, index=False)

    unexp_report = generate_health_report(
        model_path=str(reg_model_path),
        reference_path=str(ref_reg_path),
        current_path=str(unexp_path),
        target_column="price",
        unit_id=unit_reg.id,
        baseline_id=seasonal_baseline.id
    )

    assert unexp_report["drift_classification"] == "UNEXPECTED"
    print(f"  [OK] Un-whitelisted shift correctly classified as UNEXPECTED (drift status: {unexp_report['components']['drift']['status']})")

    # -------------------------------------------------------------
    # Test 11: Multiple Named Baselines for the Same Unit
    # -------------------------------------------------------------
    print("\n[TEST 11] Multiple Named Baselines on One Unit...")
    winter_baseline = save_reference_baseline(
        unit_id=unit_reg.id,
        name="Winter Housing Baseline",
        file_path=str(ref_reg_path),
        description="Winter holiday baseline",
        expected_drift_features=["bedrooms", "age"],
        is_default=False
    )

    all_baselines = list_reference_baselines(unit_id=unit_reg.id)
    assert len(all_baselines) >= 2
    b_names = [b["name"] for b in all_baselines]
    assert "Summer Housing Baseline" in b_names
    assert "Winter Housing Baseline" in b_names
    print(f"  [OK] Found {len(all_baselines)} distinct baselines: {b_names}")

    # -------------------------------------------------------------
    # Test 12: Configurable Thresholds per Unit
    # -------------------------------------------------------------
    print("\n[TEST 12] Configurable Thresholds per Monitoring Unit...")
    custom_thresholds = {
        "r2_critical": 0.80,  # Very strict
        "drift_rate_critical": 0.05
    }
    update_monitoring_unit_thresholds(unit_reg.id, custom_thresholds)
    unit_updated = get_monitoring_unit(unit_reg.id)
    import json
    parsed_th = json.loads(unit_updated.thresholds_json)
    assert parsed_th["r2_critical"] == 0.80
    print(f"  [OK] Unit thresholds successfully updated and persisted: {parsed_th}")

    print("\n" + "=" * 60)
    print("ALL 12 ITERATION 2 REQUIREMENTS VERIFIED AND PASSED!")
    print("=" * 60)


if __name__ == "__main__":
    run_iteration2_tests()
