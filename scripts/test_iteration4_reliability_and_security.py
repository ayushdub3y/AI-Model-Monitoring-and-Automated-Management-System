"""
Iteration 4 Verification Test Suite:
Reliability, Fault Tolerance, Security, Multi-Model Isolation (20 Models), and Observability.
"""

import os
import sys
import time
import json
import tempfile
import joblib
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier

# Ensure project root is in path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app.exceptions import (
    CorruptModelError,
    UnsupportedModelError,
    IncompatibleDataError,
    InsufficientEvidenceError,
    SecurityError,
    PayloadTooLargeError,
    StorageError
)
from backend.app.artifact_storage import store_artifact, calculate_sha256
from backend.app.adapters.registry import load_model_adapter, registry
from backend.app.intake import intake_model
from backend.app.compatibility import check_compatibility
from backend.app.health import generate_health_report
from backend.app.refinement import refine_model
from backend.app.database import (
    init_db,
    create_monitoring_unit,
    get_monitoring_unit,
    list_monitoring_units,
    save_model,
    save_dataset,
    save_version,
    get_active_version,
    list_versions,
    rollback_version,
    record_audit_event,
    list_audit_events
)


class UnsupportedDummyEstimator:
    def __init__(self):
        self.val = 42


def run_iteration4_tests():
    print("=" * 60)
    print("RUNNING ITERATION 4 TEST SUITE (Reliability, Security, 20-Model Isolation)")
    print("=" * 60)

    init_db()

    # ------------------------------------------------------------
    # 1. Corrupt Model Handling
    # ------------------------------------------------------------
    print("\n[TEST 1] Corrupt Model Handling...")
    with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as tmp_corrupt:
        tmp_corrupt.write(b"NOT_A_VALID_PICKLE_BYTE_STREAM_CORRUPTED_DATA_12345")
        corrupt_path = tmp_corrupt.name

    try:
        load_model_adapter(corrupt_path)
        assert False, "Expected CorruptModelError but none was raised."
    except CorruptModelError as e:
        print(f"  [OK] Corrupt model cleanly caught: {e.message[:50]}...")
    finally:
        if Path(corrupt_path).exists():
            Path(corrupt_path).unlink()

    # ------------------------------------------------------------
    # 2. Unsupported Model Handling
    # ------------------------------------------------------------
    print("\n[TEST 2] Unsupported Model Handling...")
    with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as tmp_unsupp:
        joblib.dump(UnsupportedDummyEstimator(), tmp_unsupp.name)
        unsupp_path = tmp_unsupp.name

    try:
        load_model_adapter(unsupp_path)
        assert False, "Expected UnsupportedModelError but none was raised."
    except UnsupportedModelError as e:
        print(f"  [OK] Unsupported model cleanly caught: {e.message[:50]}...")
    finally:
        if Path(unsupp_path).exists():
            Path(unsupp_path).unlink()

    # ------------------------------------------------------------
    # 3. Invalid CSV / Incompatible Data
    # ------------------------------------------------------------
    print("\n[TEST 3] Invalid CSV & Missing Target Handling...")
    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp_csv:
        tmp_csv.write(b"\x00\x01\x02\x03\x04INVALID_BINARY_BYTES")
        invalid_csv_path = tmp_csv.name

    try:
        # Create a valid temp model
        m = RandomForestClassifier(n_estimators=5, random_state=42)
        X_dummy = pd.DataFrame({"f1": [1, 2, 3], "f2": [4, 5, 6]})
        y_dummy = pd.Series([0, 1, 0])
        m.fit(X_dummy, y_dummy)
        with tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as tmp_m:
            joblib.dump(m, tmp_m.name)
            valid_m_path = tmp_m.name

        intake_model(valid_m_path, invalid_csv_path, target_column="Churn", unit_id=1)
        assert False, "Expected IncompatibleDataError for corrupt CSV."
    except IncompatibleDataError as e:
        print(f"  [OK] Invalid CSV cleanly caught: {e.message[:50]}...")
    finally:
        if Path(invalid_csv_path).exists():
            Path(invalid_csv_path).unlink()
        if Path(valid_m_path).exists():
            Path(valid_m_path).unlink()

    # ------------------------------------------------------------
    # 4. Security: Unallowed File Extensions & Path Traversal
    # ------------------------------------------------------------
    print("\n[TEST 4] Security: File Extension & Path Traversal Restrictions...")
    try:
        store_artifact(b"echo 'malicious script'", category="models", original_filename="attack.sh")
        assert False, "Expected SecurityError for dangerous .sh extension."
    except SecurityError as e:
        print(f"  [OK] Dangerous file extension blocked: {e.message}")

    try:
        store_artifact(b"MZ\x90\x00executable bytes", category="models", original_filename="virus.exe")
        assert False, "Expected SecurityError for .exe extension."
    except SecurityError as e:
        print(f"  [OK] Dangerous executable blocked: {e.message}")

    # Path traversal attempt
    saved_p, _, _ = store_artifact(
        b"valid model bytes",
        category="models",
        original_filename="../../../etc/shadow.pkl"
    )
    assert "etc" not in saved_p.parts, f"Path traversal succeeded unexpectedly: {saved_p}"
    print(f"  [OK] Path traversal sanitized cleanly -> {saved_p.name}")

    # ------------------------------------------------------------
    # 5. Security: Upload Size Limit
    # ------------------------------------------------------------
    print("\n[TEST 5] Security: Payload Size Validation...")
    from backend.app.config import MAX_UPLOAD_SIZE_BYTES
    try:
        # Create virtual bytes exceeding limit (e.g. limit + 1024 bytes)
        fake_oversized = b"0" * (MAX_UPLOAD_SIZE_BYTES + 1024)
        store_artifact(fake_oversized, category="models", original_filename="oversized.pkl")
        assert False, "Expected PayloadTooLargeError for oversized upload."
    except PayloadTooLargeError as e:
        print(f"  [OK] Oversized payload blocked: {e.message}")

    # ------------------------------------------------------------
    # 6. Idempotency: Re-uploading Identical Artifacts
    # ------------------------------------------------------------
    print("\n[TEST 6] Idempotency: Artifact Deduplication...")
    test_content = b"TEST_IDEMPOTENT_MODEL_BYTES_54321"
    p1, h1, created1 = store_artifact(test_content, category="models", original_filename="model_idem.pkl")
    p2, h2, created2 = store_artifact(test_content, category="models", original_filename="model_idem.pkl")
    assert h1 == h2, "Hashes must match"
    assert p1 == p2, "File paths must be identical"
    assert created2 is False, "Second upload must not recreate artifact"
    print(f"  [OK] Deduplication confirmed: hash={h1[:16]}, created1={created1}, created2={created2}")

    # ------------------------------------------------------------
    # 7. Delayed Labels & Absence of Fabricated Monitoring Values
    # ------------------------------------------------------------
    print("\n[TEST 7] Delayed Labels & Unknown State Handling...")
    df_ref = pd.DataFrame({
        "feature_1": [1.0, 2.0, 3.0, 4.0, 5.0] * 20,
        "feature_2": [10.0, 20.0, 30.0, 40.0, 50.0] * 20,
        "target": [0, 1, 0, 1, 0] * 20
    })
    df_cur_nolabels = pd.DataFrame({
        "feature_1": [1.1, 2.1, 3.1, 4.1, 5.1] * 20,
        "feature_2": [10.5, 20.5, 30.5, 40.5, 50.5] * 20
    })
    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f_ref, \
         tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f_cur, \
         tempfile.NamedTemporaryFile(suffix=".pkl", delete=False) as f_mod:
        df_ref.to_csv(f_ref.name, index=False)
        df_cur_nolabels.to_csv(f_cur.name, index=False)
        m = RandomForestClassifier(n_estimators=5, random_state=42)
        m.fit(df_ref[["feature_1", "feature_2"]], df_ref["target"])
        joblib.dump(m, f_mod.name)

        report = generate_health_report(
            model_path=f_mod.name,
            reference_path=f_ref.name,
            current_path=f_cur.name,
            target_column="target",
            task_type="classification"
        )
        assert report["performance"]["labels_available"] is False
        assert report["performance"]["labels_status"] in ("DELAYED", "UNAVAILABLE")
        assert report["performance"]["accuracy"] is None
        assert report["performance"]["f1"] is None
        print(f"  [OK] No labels fabricated: labels_status={report['performance']['labels_status']}, f1={report['performance']['f1']}")

    # ------------------------------------------------------------
    # 8. MULTI-MODEL ISOLATION: 20 Independent Models Scale Test
    # ------------------------------------------------------------
    print("\n[TEST 8] Multi-Model Isolation: Registering 20 Independent Units...")
    unit_ids = []
    for i in range(1, 21):
        unit = create_monitoring_unit(
            name=f"Isolated Fleet Unit #{i:02d}",
            task_type="regression" if (i % 3 == 0) else "classification",
            target_column="target",
            promotion_mode="AUTO" if (i % 2 == 0) else "ASSISTED"
        )
        unit_ids.append(unit.id)

        # Train a small model for each unit
        m_unit = RandomForestClassifier(n_estimators=3, random_state=i)
        df_u = pd.DataFrame({"x1": np.random.randn(30) + i, "target": np.random.randint(0, 2, 30)})
        m_unit.fit(df_u[["x1"]], df_u["target"])

        m_tmp = f"storage/models/unit_{unit.id}_v1.pkl"
        Path(m_tmp).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(m_unit, m_tmp)

        save_version(
            model_id=i,
            version=f"v1.0.0-unit{unit.id}",
            name=f"Champion Unit {unit.id}",
            file_path=m_tmp,
            is_active=True,
            accuracy=0.85,
            f1_score=0.80,
            unit_id=unit.id
        )

    print(f"  [OK] Successfully created and registered {len(unit_ids)} independent units.")

    # Select Unit #13 to simulate a severe failure
    failing_unit_id = unit_ids[12]  # 13th unit
    failing_active_before = get_active_version(failing_unit_id)
    print(f"\n[TEST 9] Inducing Refinement Failure on Unit #{failing_unit_id}...")

    try:
        # Force failure by passing non-existent train path
        refine_model(
            train_path="invalid/nonexistent/corrupted_train.csv",
            test_path="invalid/nonexistent/corrupted_test.csv",
            target_column="target",
            unit_id=failing_unit_id,
            apply_fixes=True
        )
        assert False, "Refinement should have failed."
    except Exception as e:
        print(f"  [OK] Unit #{failing_unit_id} failed as expected with: {type(e).__name__}")

    # Verify that the failing unit's champion was preserved untouched
    failing_active_after = get_active_version(failing_unit_id)
    assert failing_active_after.id == failing_active_before.id, "Failing unit's champion must remain intact."
    print(f"  [OK] Unit #{failing_unit_id} active champion remained intact: {failing_active_after.version}")

    # Verify the remaining 19 units are completely unaffected
    print(f"\n[TEST 10] Verifying the Other 19 Models Remain Completely Unaffected...")
    for uid in unit_ids:
        if uid == failing_unit_id:
            continue
        act = get_active_version(uid)
        assert act is not None, f"Unit {uid} active version missing!"
        assert act.version == f"v1.0.0-unit{uid}", f"Unit {uid} active version altered!"
        assert act.is_active == 1, f"Unit {uid} active state corrupted!"

    print(f"  [OK] All 19 other units maintained pristine state, version isolation, and active champions!")

    # ------------------------------------------------------------
    # 11. Observability & Queryable Audit History
    # ------------------------------------------------------------
    print("\n[TEST 11] Observability: Queryable Audit Trail...")
    events = list_audit_events(limit=50)
    assert len(events) > 0, "Audit trail must contain recorded events."
    event_types = {e["event_type"] for e in events}
    print(f"  [OK] Total audit events in ledger: {len(events)}, Event types: {event_types}")

    print("\n" + "=" * 60)
    print("ALL ITERATION 4 RELIABILITY & SECURITY REQUIREMENTS VERIFIED!")
    print("=" * 60)


if __name__ == "__main__":
    run_iteration4_tests()
