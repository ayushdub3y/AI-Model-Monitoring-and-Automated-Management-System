import os
import sys
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)

def test_onboarding_and_dataset_architecture():
    # 1. Create a dedicated testing monitoring unit
    unit_res = client.post("/api/units", json={
        "name": "E2E Onboarding Test Unit",
        "task_type": "classification",
        "target_column": "Churn",
        "promotion_mode": "AUTO"
    })
    assert unit_res.status_code == 200, unit_res.text
    unit_data = unit_res.json()["unit"]
    unit_id = unit_data["id"]
    print(f"\n1. Created Monitoring Unit #{unit_id}: {unit_data['name']}")

    # 2. Upload Champion Model artifact via multipart
    model_file_path = Path("models/baseline_model.pkl")
    assert model_file_path.exists(), "models/baseline_model.pkl must exist"
    with open(model_file_path, "rb") as f:
        champ_res = client.post(
            f"/api/units/{unit_id}/champion",
            files={"model_file": ("test_champion.pkl", f, "application/octet-stream")},
            data={"name": "Test Champion Model", "version": "v1.0.0-test"}
        )
    assert champ_res.status_code == 200, champ_res.text
    champ_data = champ_res.json()
    assert champ_data["status"] == "success"
    assert "model_type" in champ_data["model"]
    assert len(champ_data["model"]["feature_names"]) > 0
    assert champ_data["version"]["version"] == "v1.0.0-test"
    print(f"2. Champion Uploaded: {champ_data['model']['model_type']} with {len(champ_data['model']['feature_names'])} features.")

    # 3. Upload Reference Baseline CSV via multipart POST /api/units/{unit_id}/baselines
    ref_file_path = Path("data/processed/reference.csv")
    assert ref_file_path.exists(), "data/processed/reference.csv must exist"
    with open(ref_file_path, "rb") as f:
        base_res = client.post(
            f"/api/units/{unit_id}/baselines",
            files={"file": ("reference_baseline.csv", f, "text/csv")},
            data={
                "name": "Retail Reference Baseline",
                "description": "Historical clean reference distribution",
                "expected_drift_features": "MonthlyCharges, tenure",
                "is_default": "true"
            }
        )
    assert base_res.status_code == 200, base_res.text
    base_data = base_res.json()["baseline"]
    assert base_data["is_default"] is True
    assert base_data["row_count"] > 0
    assert base_data["column_count"] > 0
    print(f"3. Reference Baseline Uploaded: {base_data['name']} ({base_data['row_count']} rows, status: {base_data['status']})")

    # Verify list baselines
    list_base_res = client.get(f"/api/units/{unit_id}/baselines")
    assert list_base_res.status_code == 200
    baselines_list = list_base_res.json()
    assert any(b["id"] == base_data["id"] for b in baselines_list)
    print(f"   Registered baselines count: {len(baselines_list)}")

    # 4. Upload Production Dataset 1 (Batch 001 · Clean)
    test_file_path = Path("data/processed/test.csv")
    assert test_file_path.exists()
    with open(test_file_path, "rb") as f:
        d1_res = client.post(
            f"/api/units/{unit_id}/datasets",
            files={"file": ("batch_001_clean.csv", f, "text/csv")},
            data={
                "name": "Batch 001 · Clean",
                "description": "Standard clean production evaluation batch",
                "set_as_current": "true"
            }
        )
    assert d1_res.status_code == 200, d1_res.text
    d1_data = d1_res.json()["dataset"]
    d1_id = d1_data["id"]
    assert d1_data["row_count"] > 0
    print(f"4. Production Dataset 1 Uploaded: #{d1_id} '{d1_data['name']}' (Status: {d1_data['status']})")

    # 5. Upload Production Dataset 2 (Batch 002 · Drift Scenario)
    drift_file_path = Path("data/processed/drifted_batch.csv")
    assert drift_file_path.exists()
    with open(drift_file_path, "rb") as f:
        d2_res = client.post(
            f"/api/units/{unit_id}/datasets",
            files={"file": ("batch_002_drift.csv", f, "text/csv")},
            data={
                "name": "Batch 002 · Drift Scenario",
                "description": "Production batch under seasonal promotion shift",
                "set_as_current": "false"
            }
        )
    assert d2_res.status_code == 200, d2_res.text
    d2_data = d2_res.json()["dataset"]
    d2_id = d2_data["id"]
    print(f"5. Production Dataset 2 Uploaded: #{d2_id} '{d2_data['name']}'")

    # 6. Verify library listing and statuses
    datasets_res = client.get(f"/api/datasets?unit_id={unit_id}")
    assert datasets_res.status_code == 200
    datasets = datasets_res.json()
    assert len(datasets) >= 2
    d1_check = next(d for d in datasets if d["id"] == d1_id)
    d2_check = next(d for d in datasets if d["id"] == d2_id)
    assert d1_check["status"] == "CURRENT"
    assert d2_check["status"] == "READY"
    print(f"6. Dataset Library contains {len(datasets)} datasets. Statuses: d1={d1_check['status']}, d2={d2_check['status']}.")

    # 7. Switch Current Dataset to Batch 002
    set_curr_res = client.post(f"/api/units/{unit_id}/current-dataset/{d2_id}")
    assert set_curr_res.status_code == 200
    datasets_after = client.get(f"/api/datasets?unit_id={unit_id}").json()
    d1_after = next(d for d in datasets_after if d["id"] == d1_id)
    d2_after = next(d for d in datasets_after if d["id"] == d2_id)
    assert d2_after["status"] == "CURRENT"
    print(f"7. Switched Current: d2 is now {d2_after['status']}.")

    # 8. Execute Monitoring Run using selected Baseline and selected Current Dataset
    pipe_res = client.post("/api/pipeline/run", json={
        "unit_id": unit_id,
        "model_path": champ_data["model"]["file_path"],
        "reference_path": base_data["file_path"],
        "current_path": d2_data["file_path"],
        "baseline_id": base_data["id"],
        "dataset_id": d2_id,
        "dataset_name": d2_data["name"]
    })
    assert pipe_res.status_code == 200, pipe_res.text
    pipe_data = pipe_res.json()
    assert pipe_data["status"] == "success"
    print(f"8. Monitoring Pipeline executed! Duration: {pipe_data['pipeline_duration_sec']}s, Health: {pipe_data['health_report']['status']}.")

    # Verify d2 is now marked CURRENT or USED
    datasets_post_run = client.get(f"/api/datasets?unit_id={unit_id}").json()
    d2_post = next(d for d in datasets_post_run if d["id"] == d2_id)
    assert d2_post["status"] in ("CURRENT", "USED")
    print(f"   d2 post-run status: {d2_post['status']}")

    # 9. Profile dataset endpoint test
    prof_res = client.post("/api/profile/dataset", json={
        "dataset_path": d2_data["file_path"],
        "target_column": "Churn"
    })
    assert prof_res.status_code == 200
    prof_data = prof_res.json()
    assert prof_data["rows"] > 0
    print(f"9. Profile Dataset verified: {prof_data['rows']} rows, {prof_data['columns']} columns.")

    # 10. Delete dataset test
    del_res = client.delete(f"/api/datasets/{d1_id}")
    assert del_res.status_code == 200
    remaining_datasets = client.get(f"/api/datasets?unit_id={unit_id}").json()
    assert not any(d["id"] == d1_id for d in remaining_datasets)
    print(f"10. Dataset #{d1_id} deleted successfully. Remaining: {len(remaining_datasets)}.")

    print("\n[PASS] ALL ONBOARDING & DATASET TESTS PASSED!")

if __name__ == "__main__":
    test_onboarding_and_dataset_architecture()
