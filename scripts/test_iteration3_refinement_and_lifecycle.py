import sys
import os
import shutil
from pathlib import Path
import json
import time
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.dummy import DummyClassifier
import joblib

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.database import (
    init_db,
    create_monitoring_unit,
    get_monitoring_unit,
    update_monitoring_unit_thresholds,
    list_candidates,
    get_candidate,
    list_audit_events,
    list_versions,
    get_active_version,
    save_version,
    activate_version,
    rollback_version,
    record_audit_event
)
from backend.app.diagnosis import diagnose_health
from backend.app.strategy_selector import StrategySelector
from backend.app.safety_gates import evaluate_safety_gates
from backend.app.refinement import refine_model
from backend.app.main import promote_candidate_endpoint, rollback_unit_endpoint

TEST_DIR = Path("storage/test_iteration3_scratch")
if TEST_DIR.exists():
    shutil.rmtree(TEST_DIR)
TEST_DIR.mkdir(parents=True, exist_ok=True)

init_db()


def run_iteration3_tests():
    print("=" * 60)
    print("RUNNING ITERATION 3 TEST SUITE (Diagnosis-Driven Refinement & Safe Lifecycle)")
    print("=" * 60)

    # -------------------------------------------------------------
    # Test 1 & 2: Diagnosis Triggers Correct Strategy & Omits Irrelevant
    # -------------------------------------------------------------
    print("\n[TEST 1 & 2] StrategySelector Diagnosis Targeting...")
    # 1a. Pure Drift diagnosis
    drift_diagnoses = [{
        "issue": "Unexpected Feature Drift",
        "category": "DRIFT",
        "severity": "CRITICAL",
        "recommended_action": "DATA_REFRESH"
    }]
    drift_strategies = StrategySelector.select_strategies(drift_diagnoses)
    assert drift_strategies == ["DATA_REFRESH"], f"Expected ['DATA_REFRESH'], got {drift_strategies}"
    print(f"  [OK] Drift-only diagnosis selected: {drift_strategies} (omitted hyperparameter search and class balance)")

    # 1b. Performance & Imbalance diagnoses
    perf_diagnoses = [
        {"issue": "Low F1 Score", "category": "PERFORMANCE", "severity": "WARNING", "recommended_action": "HYPERPARAMETER_SEARCH"},
        {"issue": "Class Imbalance", "category": "DATA_QUALITY", "severity": "WARNING", "recommended_action": "CLASS_BALANCING"}
    ]
    perf_strategies = StrategySelector.select_strategies(perf_diagnoses)
    assert "HYPERPARAMETER_SEARCH" in perf_strategies
    assert "CLASS_BALANCING" in perf_strategies
    assert "DATA_REFRESH" not in perf_strategies
    print(f"  [OK] Performance + Imbalance diagnoses selected: {perf_strategies}")

    # 1c. Expected drift diagnosis (No action required)
    exp_diagnoses = [{"issue": "Expected Drift", "category": "DRIFT", "severity": "INFO", "recommended_action": "NO_ACTION_REQUIRED"}]
    exp_strategies = StrategySelector.select_strategies(exp_diagnoses)
    assert exp_strategies == []
    print(f"  [OK] Expected drift diagnosis produced no actionable strategies: {exp_strategies}")

    # -------------------------------------------------------------
    # Setup Real Unit and Datasets with Clear Signal
    # -------------------------------------------------------------
    print("\n[SETUP] Creating Unit and Synthetic Data Fixtures...")
    np.random.seed(42)
    X_df = pd.DataFrame(np.random.randn(200, 4), columns=["f1", "f2", "f3", "f4"])
    y_series = pd.Series((X_df["f1"] + X_df["f2"] > 0).astype(int), name="Churn")
    df_data = pd.concat([X_df, y_series], axis=1)

    train_path = TEST_DIR / "unit3_train.csv"
    test_path = TEST_DIR / "unit3_test.csv"
    df_data.iloc[:140].to_csv(train_path, index=False)
    df_data.iloc[140:].to_csv(test_path, index=False)

    base_model = RandomForestClassifier(n_estimators=10, random_state=42)
    base_model.fit(X_df.iloc[:140], y_series.iloc[:140])
    base_model_path = TEST_DIR / "base_model.pkl"
    joblib.dump(base_model, base_model_path)

    unit = create_monitoring_unit(
        name="Auto-Maintenance Fraud Unit",
        task_type="classification",
        target_column="Churn",
        promotion_mode="AUTO"
    )

    initial_version = save_version(
        model_id=1,
        version="v1.0.0-initial",
        name="Initial Base Model",
        file_path=str(base_model_path),
        is_active=True,
        f1_score=0.60,
        accuracy=0.75,
        unit_id=unit.id
    )

    # -------------------------------------------------------------
    # Test 3: Candidate Persistence in Database
    # -------------------------------------------------------------
    print("\n[TEST 3] Candidate Persistence & Lifecycle...")
    ref_res = refine_model(
        train_path=str(train_path),
        test_path=str(test_path),
        target_column="Churn",
        apply_fixes=True,
        unit_id=unit.id,
        diagnoses=[{"issue": "Feature Drift Detected", "category": "DRIFT", "severity": "CRITICAL", "recommended_action": "DATA_REFRESH"}]
    )

    assert ref_res["status"] == "COMPLETED"
    assert len(ref_res["candidates"]) > 0
    persisted_cands = list_candidates(unit_id=unit.id)
    assert len(persisted_cands) >= 1
    c0 = persisted_cands[0]
    assert c0["strategy"] == "DATA_REFRESH"
    assert c0["sha256"] is not None
    assert c0["metrics"] is not None
    assert c0["lifecycle_state"] in ("PROMOTED", "CHAMPION", "CHALLENGER", "REJECTED")
    print(f"  [OK] Candidate #{c0['id']} persisted: state={c0['lifecycle_state']}, SHA256={c0['sha256'][:12]}...")

    # -------------------------------------------------------------
    # Test 4: Candidate Rejection & Safety Gates
    # -------------------------------------------------------------
    print("\n[TEST 4 & 5] Safety Gate Rejection of Substandard Models...")
    fake_baseline_metrics = {"f1": 0.95, "accuracy": 0.95, "roc_auc": 0.98}
    fake_cand_metrics = {"f1": 0.50, "accuracy": 0.60, "roc_auc": 0.55}

    gate_eval = evaluate_safety_gates(
        candidate_model_path=str(base_model_path),
        test_dataset_path=str(test_path),
        baseline_metrics=fake_baseline_metrics,
        candidate_metrics=fake_cand_metrics,
        target_column="Churn",
        task_type="classification"
    )

    assert gate_eval["all_passed"] is False
    assert gate_eval["gates"]["minimum_relative_improvement"] is False
    assert len(gate_eval["failed_reasons"]) > 0
    print(f"  [OK] Substandard candidate rejected cleanly by safety gates: {gate_eval['failed_reasons']}")

    # -------------------------------------------------------------
    # Test 6: Absolute Floor Gate Rejection
    # -------------------------------------------------------------
    print("\n[TEST 6] Absolute Performance Floor Gate...")
    floor_gate_eval = evaluate_safety_gates(
        candidate_model_path=str(base_model_path),
        test_dataset_path=str(test_path),
        baseline_metrics={"f1": 0.20},
        candidate_metrics={"f1": 0.30},  # Below 0.50 absolute floor
        target_column="Churn",
        task_type="classification",
        thresholds={"absolute_f1_floor": 0.50}
    )
    assert floor_gate_eval["gates"]["absolute_performance_floor"] is False
    print(f"  [OK] Candidate with F1=0.30 rejected by absolute floor gate ({floor_gate_eval['failed_reasons']})")

    # -------------------------------------------------------------
    # Test 7: ASSISTED Mode & Explicit Promotion
    # -------------------------------------------------------------
    print("\n[TEST 7] ASSISTED Mode & Explicit Human Promotion Endpoint...")
    unit_assisted = create_monitoring_unit(
        name="Assisted Risk Unit",
        task_type="classification",
        target_column="Churn",
        promotion_mode="ASSISTED"
    )

    # Train a weak dummy baseline model so candidate easily surpasses it
    weak_model = DummyClassifier(strategy="constant", constant=0)
    weak_model.fit(X_df.iloc[:140], y_series.iloc[:140])
    weak_model_path = TEST_DIR / "weak_model.pkl"
    joblib.dump(weak_model, weak_model_path)

    init_v_assisted = save_version(
        model_id=1,
        version="v1.0.0-assisted",
        name="Weak Base Assisted Model",
        file_path=str(weak_model_path),
        is_active=True,
        f1_score=0.0,
        unit_id=unit_assisted.id
    )

    assisted_ref = refine_model(
        train_path=str(train_path),
        test_path=str(test_path),
        target_column="Churn",
        apply_fixes=True,
        unit_id=unit_assisted.id,
        diagnoses=[{"issue": "Low F1 Score", "category": "PERFORMANCE", "severity": "CRITICAL", "recommended_action": "HYPERPARAMETER_SEARCH"}]
    )

    assert assisted_ref["promotion_mode"] == "ASSISTED"
    challenger = assisted_ref.get("staged_challenger")
    assert challenger is not None
    assert challenger["lifecycle_state"] == "CHALLENGER"
    # Verify champion was NOT modified automatically
    active_now = get_active_version(unit_assisted.id)
    assert active_now.id == init_v_assisted.id

    # Now promote explicitly via endpoint
    promo_res = promote_candidate_endpoint(unit_id=unit_assisted.id, candidate_id=challenger["candidate_id"])
    assert promo_res["status"] == "success"
    active_after_promo = get_active_version(unit_assisted.id)
    assert active_after_promo.id != init_v_assisted.id
    print(f"  [OK] ASSISTED challenger #{challenger['candidate_id']} promoted via human endpoint to {active_after_promo.version}")

    # -------------------------------------------------------------
    # Test 8: MANUAL Mode (Recommendation Only)
    # -------------------------------------------------------------
    print("\n[TEST 8] MANUAL Mode...")
    unit_manual = create_monitoring_unit(
        name="Manual Audit Unit",
        task_type="classification",
        target_column="Churn",
        promotion_mode="MANUAL"
    )
    manual_ref = refine_model(
        train_path=str(train_path),
        test_path=str(test_path),
        target_column="Churn",
        unit_id=unit_manual.id,
        diagnoses=[{"issue": "Critical Drift", "category": "DRIFT", "severity": "CRITICAL", "recommended_action": "DATA_REFRESH"}]
    )
    assert manual_ref["status"] == "SKIPPED"
    assert "MANUAL mode" in manual_ref["explanation"]
    print(f"  [OK] MANUAL mode skipped training: {manual_ref['explanation']}")

    # -------------------------------------------------------------
    # Test 9: Rollback Endpoint
    # -------------------------------------------------------------
    print("\n[TEST 9] Rollback Endpoint...")
    active_before_rb = get_active_version(unit_assisted.id)
    rb_res = rollback_unit_endpoint(unit_id=unit_assisted.id)
    assert rb_res["status"] == "success"
    active_after_rb = get_active_version(unit_assisted.id)
    assert active_after_rb.id == init_v_assisted.id
    print(f"  [OK] Successfully rolled back from {active_before_rb.version} to {active_after_rb.version}")

    # -------------------------------------------------------------
    # Test 10 & 11: Failed Refinement Leaves Champion Untouched
    # -------------------------------------------------------------
    print("\n[TEST 10 & 11] Error Resilience (Failed Refinement Leaves Champion Untouched)...")
    champ_before = get_active_version(unit.id)
    try:
        refine_model(
            train_path="non_existent_corrupted_file.csv",
            test_path=str(test_path),
            unit_id=unit.id,
            diagnoses=[{"issue": "Drift", "category": "DRIFT", "severity": "CRITICAL", "recommended_action": "DATA_REFRESH"}]
        )
    except Exception:
        pass
    champ_after = get_active_version(unit.id)
    assert champ_before.id == champ_after.id
    print(f"  [OK] Active champion remained intact after execution error (Version: {champ_after.version})")

    # -------------------------------------------------------------
    # Test 12: Complete Audit Trail
    # -------------------------------------------------------------
    print("\n[TEST 12] Complete Audit Trail Verification...")
    audits = list_audit_events(unit_id=unit_assisted.id)
    event_types = [a["event_type"] for a in audits]
    assert "REFINEMENT_TRIGGERED" in event_types
    assert "CANDIDATE_EVALUATED" in event_types
    assert "CANDIDATE_PROMOTED" in event_types
    assert "ROLLBACK" in event_types
    print(f"  [OK] Recorded {len(audits)} audit trail events: {set(event_types)}")

    print("\n" + "=" * 60)
    print("ALL ITERATION 3 REQUIREMENTS VERIFIED AND PASSED!")
    print("=" * 60)


if __name__ == "__main__":
    run_iteration3_tests()
