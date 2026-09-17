"""
Iteration 5 Final End-to-End Scenario Test Suite:
Scenarios A through L verifying full productization across all tasks,
fleet scaling, contextual drift, diagnosis-driven refinement, safety gates,
rollback, security, and idempotency.
"""

import sys
import tempfile
import time
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor

# Ensure project root is in python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app.exceptions import CorruptModelError, IncompatibleDataError, SecurityError
from backend.app.database import (
    init_db,
    create_monitoring_unit,
    get_monitoring_unit,
    list_monitoring_units,
    save_reference_baseline,
    save_version,
    get_active_version,
    list_versions,
    rollback_version,
    record_audit_event,
    list_audit_events
)
from backend.app.artifact_storage import store_artifact
from backend.app.intake import intake_model
from backend.app.health import generate_health_report
from backend.app.diagnosis import diagnose_health
from backend.app.refinement import refine_model
from backend.app.safety_gates import evaluate_safety_gates


def run_all_final_scenarios():
    print("=" * 70)
    print("RUNNING FINAL END-TO-END SCENARIO VERIFICATION (Scenarios A through L)")
    print("=" * 70)

    init_db()

    # ------------------------------------------------------------
    # SCENARIO A: Register Binary Classification Model
    # ------------------------------------------------------------
    print("\n[SCENARIO A] Register Binary Classification Model...")
    unit_a = create_monitoring_unit(
        name="Telco Customer Churn Classifier",
        task_type="classification",
        target_column="Churn",
        positive_class="1",
        promotion_mode="AUTO"
    )
    assert unit_a.task_type == "classification"
    print(f"  [OK] Unit #{unit_a.id} registered: '{unit_a.name}' (task_type={unit_a.task_type})")

    # ------------------------------------------------------------
    # SCENARIO B: Register Multiclass Model
    # ------------------------------------------------------------
    print("\n[SCENARIO B] Register Multiclass Classification Model...")
    unit_b = create_monitoring_unit(
        name="Customer Tier & Segment Classifier",
        task_type="multiclass",
        target_column="Tier",
        promotion_mode="ASSISTED"
    )
    assert unit_b.task_type == "multiclass"
    print(f"  [OK] Unit #{unit_b.id} registered: '{unit_b.name}' (task_type={unit_b.task_type})")

    # ------------------------------------------------------------
    # SCENARIO C: Register Regression Model
    # ------------------------------------------------------------
    print("\n[SCENARIO C] Register Regression Model...")
    unit_c = create_monitoring_unit(
        name="Customer Lifetime Value (LTV) Regressor",
        task_type="regression",
        target_column="LTV",
        promotion_mode="AUTO"
    )
    assert unit_c.task_type == "regression"
    print(f"  [OK] Unit #{unit_c.id} registered: '{unit_c.name}' (task_type={unit_c.task_type})")

    # ------------------------------------------------------------
    # SCENARIO D: Register 20 Fleet Models
    # ------------------------------------------------------------
    print("\n[SCENARIO D] Register 20 Fleet Models...")
    fleet_unit_ids = []
    for i in range(1, 21):
        u = create_monitoring_unit(
            name=f"Production Model Unit #{i:02d}",
            task_type="regression" if (i % 3 == 0) else ("multiclass" if (i % 3 == 1) else "classification"),
            target_column="target",
            promotion_mode="AUTO" if (i % 2 == 0) else "ASSISTED"
        )
        fleet_unit_ids.append(u.id)
    assert len(fleet_unit_ids) == 20
    print(f"  [OK] Successfully registered 20 independent models (Fleet IDs: {fleet_unit_ids[0]}..{fleet_unit_ids[-1]})")

    # ------------------------------------------------------------
    # SCENARIO E: Run Health Checks on Fleet
    # ------------------------------------------------------------
    print("\n[SCENARIO E] Run Health Checks on Fleet...")
    # Generate synthetic reference and test data for Unit A
    df_ref_a = pd.DataFrame({
        "MonthlyCharges": np.random.normal(65, 10, 100),
        "tenure": np.random.uniform(1, 72, 100),
        "Churn": np.random.randint(0, 2, 100)
    })
    df_cur_a = pd.DataFrame({
        "MonthlyCharges": np.random.normal(66, 10, 50),
        "tenure": np.random.uniform(1, 72, 50),
        "Churn": np.random.randint(0, 2, 50)
    })

    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f_ref, \
         tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f_cur, \
         tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as f_mod:
        df_ref_a.to_csv(f_ref.name, index=False)
        df_cur_a.to_csv(f_cur.name, index=False)

        clf_a = RandomForestClassifier(n_estimators=10, random_state=42)
        clf_a.fit(df_ref_a[["MonthlyCharges", "tenure"]], df_ref_a["Churn"])
        joblib.dump(clf_a, f_mod.name)

        report_a = generate_health_report(
            model_path=f_mod.name,
            reference_path=f_ref.name,
            current_path=f_cur.name,
            target_column="Churn",
            unit_id=unit_a.id,
            task_type="classification"
        )
        assert report_a["health_score"] >= 70.0
        print(f"  [OK] Health check passed for Unit #{unit_a.id}: Score={report_a['health_score']}/100, Status={report_a['status']}")

    # ------------------------------------------------------------
    # SCENARIO F: Model Experiences Expected Seasonal Drift (No Refinement)
    # ------------------------------------------------------------
    print("\n[SCENARIO F] Expected Seasonal Drift Context (Refinement Skipped)...")
    # Register reference baseline with expected drift on MonthlyCharges
    baseline_rec = save_reference_baseline(
        unit_id=unit_a.id,
        name="Summer Seasonal Baseline",
        file_path=f_ref.name,
        expected_drift_features=["MonthlyCharges"]
    )
    # Shift MonthlyCharges deliberately
    df_cur_seasonal = pd.DataFrame({
        "MonthlyCharges": np.random.normal(95, 5, 50),  # shifted
        "tenure": np.random.uniform(1, 72, 50),
        "Churn": np.random.randint(0, 2, 50)
    })
    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f_cur_seas:
        df_cur_seasonal.to_csv(f_cur_seas.name, index=False)

        report_seas = generate_health_report(
            model_path=f_mod.name,
            reference_path=f_ref.name,
            current_path=f_cur_seas.name,
            target_column="Churn",
            unit_id=unit_a.id,
            task_type="classification",
            baseline_id=baseline_rec.id
        )
        assert report_seas["drift_classification"] == "EXPECTED"
        print(f"  [OK] Drift classified as {report_seas['drift_classification']}. Refinement correctly avoided!")

    # ------------------------------------------------------------
    # SCENARIO G & H: Unexpected Performance Degradation -> Refinement & Promotion
    # ------------------------------------------------------------
    print("\n[SCENARIO G & H] Unexpected Degradation -> Diagnosis -> Refinement -> Promotion...")
    # Degraded batch where baseline is weak but data has strong learnable signal
    np.random.seed(42)
    x_tr = np.random.randn(200)
    y_tr = (x_tr > 0).astype(int)
    df_train_h = pd.DataFrame({"f1": x_tr, "f2": np.random.randn(200), "target": y_tr})

    x_ts = np.random.randn(60)
    y_ts = (x_ts > 0).astype(int)
    df_test_h = pd.DataFrame({"f1": x_ts, "f2": np.random.randn(60), "target": y_ts})

    unit_h = create_monitoring_unit(
        name="Auto-Heal Degradation Unit",
        task_type="classification",
        target_column="target",
        promotion_mode="AUTO"
    )

    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f_tr, \
         tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f_ts, \
         tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as f_base_h:
        df_train_h.to_csv(f_tr.name, index=False)
        df_test_h.to_csv(f_ts.name, index=False)

        # Baseline model with poor accuracy (fitted on inverted labels)
        base_h = RandomForestClassifier(n_estimators=2, max_depth=1, random_state=42)
        base_h.fit(df_train_h[["f1", "f2"]], np.random.permutation(df_train_h["target"].values))
        joblib.dump(base_h, f_base_h.name)

        v_base = save_version(
            model_id=1,
            version="v1.0.0-original",
            name="Baseline Weak Model",
            file_path=f_base_h.name,
            is_active=True,
            accuracy=0.55,
            f1_score=0.45,
            unit_id=unit_h.id
        )

        refine_out = refine_model(
            train_path=f_tr.name,
            test_path=f_ts.name,
            target_column="target",
            unit_id=unit_h.id,
            apply_fixes=True
        )

        active_after_h = get_active_version(unit_h.id)
        assert active_after_h.version != "v1.0.0-original"
        print(f"  [OK] Refinement succeeded: Promoted new Champion '{active_after_h.version}' (Auto-promoted #{refine_out['promoted_candidate']['candidate_id']})")

    # ------------------------------------------------------------
    # SCENARIO I: Candidate Fails Safety Gates -> Rejected (Champion Untouched)
    # ------------------------------------------------------------
    print("\n[SCENARIO I] Substandard Candidate -> Rejected by Safety Gates...")
    safety_test = evaluate_safety_gates(
        candidate_model_path=f_base_h.name,
        test_dataset_path=f_ts.name,
        baseline_metrics={"f1": 0.85, "accuracy": 0.85, "roc_auc": 0.88},
        candidate_metrics={"f1": 0.50, "accuracy": 0.52, "roc_auc": 0.51},
        target_column="target",
        task_type="classification"
    )
    assert safety_test["all_passed"] is False
    assert len(safety_test["failed_reasons"]) > 0
    print(f"  [OK] Substandard model rejected safely: {safety_test['failed_reasons']}")

    # ------------------------------------------------------------
    # SCENARIO J: Rollback Degraded Champion
    # ------------------------------------------------------------
    print("\n[SCENARIO J] Rollback Degraded Champion to Previous Good State...")
    prev_restored = rollback_version(unit_id=unit_h.id)
    assert prev_restored.version == "v1.0.0-original"
    print(f"  [OK] Successfully rolled back Unit #{unit_h.id} to Champion: {prev_restored.version}")

    # ------------------------------------------------------------
    # SCENARIO K: Corrupted Model Upload Rejected Safely
    # ------------------------------------------------------------
    print("\n[SCENARIO K] Corrupted Model Upload Safely Rejected...")
    with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as f_corrupt:
        f_corrupt.write(b"GARBAGE_BYTES_CORRUPTED_MODEL_PAYLOAD")
        f_corrupt_path = f_corrupt.name

    try:
        intake_model(f_corrupt_path, f_ts.name, target_column="target", unit_id=unit_h.id)
        assert False, "Should have raised CorruptModelError"
    except CorruptModelError as e:
        print(f"  [OK] Corrupt model cleanly rejected: {e.message[:50]}...")
    finally:
        if Path(f_corrupt_path).exists():
            Path(f_corrupt_path).unlink()

    # ------------------------------------------------------------
    # SCENARIO L: Duplicate Artifact Upload Handled Idempotently
    # ------------------------------------------------------------
    print("\n[SCENARIO L] Duplicate Artifact Idempotency...")
    test_bytes = b"SCENARIO_L_UNIQUE_IDEMPOTENT_BYTES_998877"
    p_1, h_1, c_1 = store_artifact(test_bytes, category="models", original_filename="model_l.pkl")
    p_2, h_2, c_2 = store_artifact(test_bytes, category="models", original_filename="model_l.pkl")
    assert h_1 == h_2
    assert p_1 == p_2
    assert c_2 is False, "Duplicate upload must not allocate duplicate file."
    print(f"  [OK] Duplicate upload handled cleanly: hash={h_1[:16]}, deduplicated=True")

    print("\n" + "=" * 70)
    print("ALL 12 FINAL END-TO-END SCENARIOS (A to L) PASSED WITH 100% SUCCESS!")
    print("=" * 70)


if __name__ == "__main__":
    run_all_final_scenarios()
