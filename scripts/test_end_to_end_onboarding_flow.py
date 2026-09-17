import os
import sys
import io
import json
import tempfile
import pandas as pd
import numpy as np
from fastapi.testclient import TestClient

# Ensure repo root is on python path
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, repo_root)

from backend.app.main import app

client = TestClient(app)

def test_full_onboarding_lifecycle():
    print("=== STARTING FULL ONBOARDING LIFECYCLE TEST ===")

    # 1. REGISTER NEW MONITORING UNIT
    unit_payload = {
        "name": "E-Commerce Churn Predictor",
        "task_type": "classification",
        "target_column": "Churn",
        "promotion_mode": "AUTO",
        "owner_label": "Lifecycle Growth Team"
    }
    create_res = client.post("/api/units", json=unit_payload)
    assert create_res.status_code == 200, f"Unit creation failed: {create_res.text}"
    unit_data = create_res.json()["unit"]
    unit_id = unit_data["id"]
    print(f"[PASS] 1. Registered Monitoring Unit #{unit_id}: {unit_data['name']}")

    # 2. UPLOAD CHAMPION MODEL VIA MULTIPART
    # Use baseline model from models/baseline_model.pkl
    baseline_model_path = os.path.join(repo_root, "models", "baseline_model.pkl")
    assert os.path.exists(baseline_model_path), "baseline_model.pkl must exist"

    with open(baseline_model_path, "rb") as mf:
        upload_champion_res = client.post(
            f"/api/units/{unit_id}/champion",
            data={
                "version": "v1.0.0",
                "name": "Initial XGBoost Champion",
                "model_type": "xgboost"
            },
            files={
                "file": ("baseline_model.pkl", mf, "application/octet-stream")
            }
        )
    assert upload_champion_res.status_code == 200, f"Champion upload failed: {upload_champion_res.text}"
    champ_json = upload_champion_res.json()
    assert "version" in champ_json
    assert champ_json["version"]["is_active"] == 1
    assert len(champ_json["model"]["feature_names"]) > 0
    print(f"[PASS] 2. Uploaded Champion Model artifact (Version {champ_json['version']['version']}, Model Type: {champ_json['model']['model_type']}, {len(champ_json['model']['feature_names'])} detected features)")

    # 3. UPLOAD REFERENCE BASELINE VIA MULTIPART CSV
    ref_csv_path = os.path.join(repo_root, "data", "processed", "reference.csv")
    assert os.path.exists(ref_csv_path), "reference.csv must exist"

    with open(ref_csv_path, "rb") as rf:
        baseline_res = client.post(
            f"/api/units/{unit_id}/baselines",
            data={
                "name": "2026 Q1 Reference Distribution",
                "description": "Gold standard reference baseline dataset",
                "target_column": "Churn",
                "is_default": "true",
                "expected_drift_features": json.dumps(["Contract", "MonthlyCharges", "tenure"])
            },
            files={
                "file": ("reference.csv", rf, "text/csv")
            }
        )
    assert baseline_res.status_code == 200, f"Baseline upload failed: {baseline_res.text}"
    base_json = baseline_res.json()
    baseline_id = base_json["baseline"]["id"]
    assert base_json["baseline"]["is_default"] == 1
    assert base_json["baseline"]["row_count"] > 0
    print(f"[PASS] 3. Registered Reference Baseline #{baseline_id}: {base_json['baseline']['name']} ({base_json['baseline']['row_count']} rows, Default: True)")

    # 4. ADD MULTIPLE PRODUCTION DATASETS (BATCH A & B)
    drifted_csv_path = os.path.join(repo_root, "data", "processed", "drifted_batch.csv")
    test_csv_path = os.path.join(repo_root, "data", "processed", "test.csv")

    # Batch A (Drifted) - marked as current
    with open(drifted_csv_path, "rb") as df:
        batch_a_res = client.post(
            f"/api/units/{unit_id}/datasets",
            data={
                "name": "Telemetry Batch 2026-03-A (Drifted)",
                "description": "Live production telemetry with contract pricing drift",
                "target_column": "Churn",
                "set_as_current": "true"
            },
            files={
                "file": ("batch_a.csv", df, "text/csv")
            }
        )
    assert batch_a_res.status_code == 200, f"Batch A upload failed: {batch_a_res.text}"
    batch_a_id = batch_a_res.json()["dataset"]["id"]

    # Batch B (Clean) - not marked current
    with open(test_csv_path, "rb") as tf:
        batch_b_res = client.post(
            f"/api/units/{unit_id}/datasets",
            data={
                "name": "Telemetry Batch 2026-03-B (Clean)",
                "description": "Nominal verification batch",
                "target_column": "Churn",
                "set_as_current": "false"
            },
            files={
                "file": ("batch_b.csv", tf, "text/csv")
            }
        )
    assert batch_b_res.status_code == 200, f"Batch B upload failed: {batch_b_res.text}"
    batch_b_id = batch_b_res.json()["dataset"]["id"]

    # Verify dataset library
    dsets_res = client.get(f"/api/datasets?unit_id={unit_id}")
    assert dsets_res.status_code == 200
    dsets = dsets_res.json()
    assert len(dsets) >= 2
    d_map = {d["id"]: d for d in dsets}
    assert d_map[batch_a_id]["status"] == "CURRENT"
    assert d_map[batch_b_id]["status"] == "READY"
    print(f"[PASS] 4. Persistent Dataset Library has {len(dsets)} datasets. Batch A status: {d_map[batch_a_id]['status']}, Batch B status: {d_map[batch_b_id]['status']}")

    # 5. TEST DATASET PROFILING
    prof_res = client.post("/api/profile/dataset", data={
        "file_path": d_map[batch_a_id]["file_path"],
        "target_column": "Churn"
    })
    assert prof_res.status_code == 200
    prof = prof_res.json()
    assert prof["rows"] > 0
    assert prof["columns"] > 0
    assert "dtypes" in prof
    print(f"[PASS] 5. Profiled Dataset '{d_map[batch_a_id]['name']}' ({prof['rows']} rows, {prof['columns']} columns)")

    # 6. SWITCH CURRENT DATASET TO BATCH B
    switch_res = client.post(f"/api/units/{unit_id}/current-dataset/{batch_b_id}")
    assert switch_res.status_code == 200
    dsets_switched = client.get(f"/api/datasets?unit_id={unit_id}").json()
    switched_map = {d["id"]: d for d in dsets_switched}
    assert switched_map[batch_b_id]["status"] == "CURRENT"
    assert switched_map[batch_a_id]["status"] == "READY"
    print(f"[PASS] 6. Switched Current Dataset to Batch B (Batch B status: {switched_map[batch_b_id]['status']}, Batch A status: {switched_map[batch_a_id]['status']})")

    # Switch back to Batch A for monitoring run
    client.post(f"/api/units/{unit_id}/current-dataset/{batch_a_id}")

    # 7. RUN MONITORING PIPELINE WITH EXPLICIT BASELINE AND DATASET
    run_res = client.post("/api/pipeline/run", json={
        "unit_id": unit_id,
        "baseline_id": baseline_id,
        "dataset_id": batch_a_id,
        "force_refinement": True,
        "target_column": "Churn"
    })
    assert run_res.status_code == 200, f"Pipeline run failed: {run_res.text}"
    run_data = run_res.json()
    assert run_data["status"].lower() == "success"
    assert "health_report" in run_data
    print(f"[PASS] 7. Executed Pipeline Run against Baseline #{baseline_id} and Dataset #{batch_a_id} (Health: {run_data['health_report'].get('status')})")

    # Verify that Batch A is now marked as USED (or CURRENT since it is still current)
    dsets_after_run = client.get(f"/api/datasets?unit_id={unit_id}").json()
    after_map = {d["id"]: d for d in dsets_after_run}
    assert after_map[batch_a_id]["status"] == "CURRENT"

    # 8. ADD A THIRD PRODUCTION DATASET LATER (REPEATED MONITORING WITHOUT RE-REGISTRATION)
    with open(test_csv_path, "rb") as tf2:
        batch_c_res = client.post(
            f"/api/units/{unit_id}/datasets",
            data={
                "name": "Telemetry Batch 2026-04-C (Next Month)",
                "description": "Next monitoring cycle telemetry batch",
                "target_column": "Churn",
                "set_as_current": "true"
            },
            files={
                "file": ("batch_c.csv", tf2, "text/csv")
            }
        )
    assert batch_c_res.status_code == 200
    batch_c_id = batch_c_res.json()["dataset"]["id"]

    # Run monitoring on Batch C
    run_c_res = client.post("/api/pipeline/run", json={
        "unit_id": unit_id,
        "baseline_id": baseline_id,
        "dataset_id": batch_c_id,
        "force_refinement": False,
        "target_column": "Churn"
    })
    assert run_c_res.status_code == 200
    print(f"[PASS] 8. Added Third Dataset #{batch_c_id} later and executed second monitoring run successfully (No re-registration required)")

    # 9. DELETE DATASET AND VERIFY REMOVAL
    del_res = client.delete(f"/api/datasets/{batch_b_id}")
    assert del_res.status_code == 200
    dsets_final = client.get(f"/api/datasets?unit_id={unit_id}").json()
    final_ids = [d["id"] for d in dsets_final]
    assert batch_b_id not in final_ids
    print(f"[PASS] 9. Deleted Dataset #{batch_b_id} from library, remaining datasets: {len(dsets_final)}")

    print("\n=== ALL 9 ONBOARDING ARCHITECTURE TESTS PASSED SUCCESSFULLY! ===")

if __name__ == "__main__":
    test_full_onboarding_lifecycle()
