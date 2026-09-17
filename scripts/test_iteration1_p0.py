import sys
import tempfile
import joblib
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.database import (
    init_db,
    create_monitoring_unit,
    get_monitoring_unit,
    list_monitoring_units,
    get_active_version,
    list_versions
)
from backend.app.intake import intake_model
from backend.app.versioning import register_model_version, deploy_version, get_current_active_model
from backend.app.adapters.registry import load_model_adapter, detect_model_type
from backend.app.health_status import determine_health_status
from backend.app.exceptions import CorruptModelError, UnsupportedModelError


def test_iteration1_requirements():
    print("=" * 70)
    print("ITERATION 1 — MULTI-MODEL FOUNDATION & P0 CORRECTNESS VERIFICATION")
    print("=" * 70)

    # 1. Initialize DB and verify default unit
    init_db()
    default_unit = get_monitoring_unit(1)
    assert default_unit is not None, "Default Unit (ID 1) must exist after init_db"
    print("\n[OK] Test 1: Database initialized with default Unit 1 backfilled.")

    # 2. Register 2 completely independent Monitoring Units
    unit_a = create_monitoring_unit(name="Churn Prevention Unit (EU)", target_column="Churn")
    unit_b = create_monitoring_unit(name="Fraud Detection Unit (US)", target_column="is_fraud")
    assert unit_a.id != unit_b.id, "Unit IDs must be distinct"
    print(f"[OK] Test 2: Created Unit A (ID: {unit_a.id}) and Unit B (ID: {unit_b.id}).")

    # 3. Test Multi-Model Version Isolation
    # Register active versions for both units
    dummy_model_path = Path("models/baseline_model.pkl")

    v_a1 = register_model_version(
        model_id=1,
        version_tag="v1.0.0-unitA",
        name="Unit A Baseline",
        source_model_path=str(dummy_model_path),
        make_active=True,
        unit_id=unit_a.id
    )
    v_b1 = register_model_version(
        model_id=2,
        version_tag="v1.0.0-unitB",
        name="Unit B Baseline",
        source_model_path=str(dummy_model_path),
        make_active=True,
        unit_id=unit_b.id
    )

    active_a_initial = get_current_active_model(unit_id=unit_a.id)
    active_b_initial = get_current_active_model(unit_id=unit_b.id)

    assert active_a_initial["version"] == "v1.0.0-unitA", "Unit A initial active version mismatch"
    assert active_b_initial["version"] == "v1.0.0-unitB", "Unit B initial active version mismatch"
    print(f"[OK] Test 3a: Both units have independent active models: Unit A -> {active_a_initial['version']}, Unit B -> {active_b_initial['version']}")

    # Promote a new version for Unit A
    v_a2 = register_model_version(
        model_id=1,
        version_tag="v2.0.0-unitA-challenger",
        name="Unit A Challenger",
        source_model_path=str(dummy_model_path),
        make_active=True,
        unit_id=unit_a.id
    )

    active_a_after = get_current_active_model(unit_id=unit_a.id)
    active_b_after = get_current_active_model(unit_id=unit_b.id)

    assert active_a_after["version"] == "v2.0.0-unitA-challenger", "Unit A should now have v2.0.0 active"
    assert active_b_after["version"] == "v1.0.0-unitB", "Unit B active model MUST NOT be deactivated by Unit A promotion!"
    print(f"[OK] Test 3b: Promotion on Unit A did NOT affect Unit B! (Unit A: {active_a_after['version']}, Unit B: {active_b_after['version']})")

    # 4. Test Content-Addressed Artifact Storage & Filename Collision Prevention
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)

        # Create model 1: LogisticRegression with C=0.1
        model1 = LogisticRegression(C=0.1, random_state=42)
        X_dummy = pd.DataFrame({"feat1": [1, 2, 3, 4], "feat2": [10, 20, 30, 40]})
        y_dummy = pd.Series([0, 1, 0, 1])
        model1.fit(X_dummy, y_dummy)

        # Create model 2: RandomForestClassifier with n_estimators=50
        model2 = RandomForestClassifier(n_estimators=50, random_state=42)
        model2.fit(X_dummy, y_dummy)

        # Create dataset CSV
        dataset_csv = tmp_path / "data.csv"
        df_dummy = pd.DataFrame({"feat1": [1, 2, 3, 4], "feat2": [10, 20, 30, 40], "Churn": [0, 1, 0, 1]})
        df_dummy.to_csv(dataset_csv, index=False)

        # Both saved with the SAME filename "model.pkl" in different temp locations
        file1 = tmp_path / "sub1" / "model.pkl"
        file1.parent.mkdir(parents=True)
        joblib.dump(model1, file1)

        file2 = tmp_path / "sub2" / "model.pkl"
        file2.parent.mkdir(parents=True)
        joblib.dump(model2, file2)

        # Intake model 1 into Unit A
        res1 = intake_model(
            model_path=str(file1),
            dataset_path=str(dataset_csv),
            model_name="Model 1 (Logistic)",
            unit_id=unit_a.id
        )

        # Intake model 2 with IDENTICAL filename into Unit B
        res2 = intake_model(
            model_path=str(file2),
            dataset_path=str(dataset_csv),
            model_name="Model 2 (RandomForest)",
            unit_id=unit_b.id
        )

        # Verify that both physical files exist and are distinct
        path1 = Path(res1["model_path"])
        path2 = Path(res2["model_path"])
        assert path1.exists(), "Model 1 file must exist"
        assert path2.exists(), "Model 2 file must exist"
        assert path1 != path2, f"Files must have distinct paths, got {path1} and {path2}"

        # Verify that loading model 1 still returns LogisticRegression (not overwritten by model 2)
        loaded_adapter1 = load_model_adapter(str(path1))
        loaded_adapter2 = load_model_adapter(str(path2))

        assert isinstance(loaded_adapter1.get_underlying_model(), LogisticRegression), "Model 1 was corrupted/overwritten!"
        assert isinstance(loaded_adapter2.get_underlying_model(), RandomForestClassifier), "Model 2 was corrupted/overwritten!"
        print("[OK] Test 4: Uploading 2 different models with identical filenames ('model.pkl') preserved BOTH artifacts without collision.")

        # 5. Test Upload Idempotency
        # Re-intake model 1 into Unit A
        res1_dup = intake_model(
            model_path=str(file1),
            dataset_path=str(dataset_csv),
            model_name="Model 1 (Duplicate Upload)",
            unit_id=unit_a.id
        )
        assert res1_dup["model_id"] == res1["model_id"], "Duplicate upload should return existing model_id (idempotent)"
        assert res1_dup["model_path"] == res1["model_path"], "Duplicate upload should point to existing artifact"
        print(f"[OK] Test 5: Identical artifact upload is idempotent (reused model ID {res1['model_id']}).")

        # 6. Test Corrupt Model Handling with Typed Error
        corrupt_file = tmp_path / "corrupt_model.pkl"
        with open(corrupt_file, "wb") as f:
            f.write(b"NOT_A_VALID_PICKLE_STREAM_1234567890")

        corrupt_caught = False
        try:
            load_model_adapter(str(corrupt_file))
        except CorruptModelError as e:
            corrupt_caught = True
            print(f"[OK] Test 6: Corrupt model safely caught as CorruptModelError: {e.message[:60]}...")
        assert corrupt_caught, "Corrupt model should raise CorruptModelError"

        # 7. Test Unsupported Object Handling
        unsupported_file = tmp_path / "unsupported.pkl"
        joblib.dump({"some": "plain dictionary"}, unsupported_file)

        unsupported_caught = False
        try:
            load_model_adapter(str(unsupported_file))
        except UnsupportedModelError as e:
            unsupported_caught = True
            print(f"[OK] Test 7: Unsupported object safely caught as UnsupportedModelError: {e.message[:60]}...")
        assert unsupported_caught, "Unsupported model should raise UnsupportedModelError"

    # 8. Test UNKNOWN Health Status on Insufficient Evidence
    empty_eval = {"accuracy": None, "f1": None, "roc_auc": None}
    empty_drift = {"total_features": 0, "drift_detected": False}
    empty_pred_drift = {}

    unknown_status = determine_health_status(empty_eval, empty_drift, empty_pred_drift)
    assert unknown_status["status"] == "UNKNOWN", f"Expected UNKNOWN status, got {unknown_status['status']}"
    assert unknown_status["health_score"] is None, f"Expected None health_score, got {unknown_status['health_score']}"
    print(f"[OK] Test 8: Insufficient telemetry produced UNKNOWN status without fabricating metrics.")

    print("\n" + "=" * 70)
    print("ALL ITERATION 1 (P0) CORRECTNESS TESTS PASSED SUCCESSFULLY!")
    print("=" * 70)


if __name__ == "__main__":
    test_iteration1_requirements()
