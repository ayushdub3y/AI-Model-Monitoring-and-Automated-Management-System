from pathlib import Path
import shutil
import json
import time
import pandas as pd
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Body, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .database import (
    init_db,
    list_models,
    list_datasets,
    list_runs,
    list_versions,
    list_alerts,
    get_active_version,
    activate_version,
    create_monitoring_unit,
    get_monitoring_unit,
    list_monitoring_units,
    set_unit_current_dataset,
    delete_dataset
)
from .adapters.registry import load_model_adapter
from .artifact_storage import store_artifact
from .intake import intake_model
from .profiler import profile_dataset
from .model_profiler import profile_model
from .compatibility import check_compatibility
from .health import generate_health_report
from .diagnosis import diagnose_health
from .refinement import refine_model
from .evaluation import evaluate_model, compare_models
from .promotion import decide_promotion
from .versioning import (
    register_model_version,
    deploy_version,
    get_current_active_model,
    get_version_history
)
from .pipeline import run_full_pipeline
from .demo_engine import demo_engine
from .config import ALLOWED_ORIGINS
from .security import verify_api_token
from .rate_limiter import rate_limit_intake, rate_limit_refine
from .exceptions import (
    ModelHealthException,
    CorruptModelError,
    UnsupportedModelError,
    IncompatibleDataError,
    InsufficientEvidenceError,
    EntityNotFoundError,
    StorageError,
    SecurityError,
    PayloadTooLargeError,
    AuthenticationError,
    DatabaseError
)

# Initialize storage and DB
init_db()

STORAGE_DIR = Path("storage").resolve()
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = STORAGE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR = STORAGE_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
DATASETS_DIR = STORAGE_DIR / "datasets"
DATASETS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="AI Model Health & Refinement System API",
    description="Autonomous model monitoring, plain-English diagnosis, automated refinement, and multi-model version registry API.",
    version="1.1.0"
)

# Enable Restricted CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static storage for SHAP plots and artifacts
app.mount("/storage", StaticFiles(directory=str(STORAGE_DIR)), name="storage")


# ==========================================
# Exception Handlers (Safe Error Responses)
# ==========================================

@app.exception_handler(AuthenticationError)
async def auth_error_handler(request: Request, exc: AuthenticationError):
    return JSONResponse(
        status_code=401,
        content={"error_type": "AuthenticationError", "message": exc.message, "detail": exc.details}
    )


@app.exception_handler(SecurityError)
async def security_error_handler(request: Request, exc: SecurityError):
    return JSONResponse(
        status_code=403,
        content={"error_type": "SecurityError", "message": exc.message, "detail": exc.details}
    )


@app.exception_handler(PayloadTooLargeError)
async def payload_too_large_handler(request: Request, exc: PayloadTooLargeError):
    return JSONResponse(
        status_code=413,
        content={"error_type": "PayloadTooLargeError", "message": exc.message, "detail": exc.details}
    )


@app.exception_handler(CorruptModelError)
async def corrupt_model_handler(request: Request, exc: CorruptModelError):
    return JSONResponse(
        status_code=400,
        content={"error_type": "CorruptModelError", "message": exc.message, "detail": exc.details}
    )


@app.exception_handler(UnsupportedModelError)
async def unsupported_model_handler(request: Request, exc: UnsupportedModelError):
    return JSONResponse(
        status_code=400,
        content={"error_type": "UnsupportedModelError", "message": exc.message, "detail": exc.details}
    )


@app.exception_handler(IncompatibleDataError)
async def incompatible_data_handler(request: Request, exc: IncompatibleDataError):
    return JSONResponse(
        status_code=400,
        content={"error_type": "IncompatibleDataError", "message": exc.message, "detail": exc.details}
    )


@app.exception_handler(InsufficientEvidenceError)
async def insufficient_evidence_handler(request: Request, exc: InsufficientEvidenceError):
    return JSONResponse(
        status_code=422,
        content={"error_type": "InsufficientEvidenceError", "message": exc.message, "detail": exc.details}
    )


@app.exception_handler(EntityNotFoundError)
async def not_found_handler(request: Request, exc: EntityNotFoundError):
    return JSONResponse(
        status_code=404,
        content={"error_type": "EntityNotFoundError", "message": exc.message, "detail": exc.details}
    )


@app.exception_handler(StorageError)
async def storage_error_handler(request: Request, exc: StorageError):
    return JSONResponse(
        status_code=500,
        content={"error_type": "StorageError", "message": exc.message, "detail": exc.details}
    )


@app.exception_handler(DatabaseError)
async def database_error_handler(request: Request, exc: DatabaseError):
    return JSONResponse(
        status_code=500,
        content={"error_type": "DatabaseError", "message": exc.message, "detail": exc.details}
    )


@app.exception_handler(ModelHealthException)
async def generic_domain_error_handler(request: Request, exc: ModelHealthException):
    return JSONResponse(
        status_code=400,
        content={"error_type": "ModelHealthException", "message": exc.message, "detail": exc.details}
    )


# ==========================================
# Pydantic Request Models
# ==========================================

class UnitCreateRequest(BaseModel):
    name: str
    task_type: Optional[str] = "classification"
    owner_label: Optional[str] = "default"
    target_column: Optional[str] = "Churn"
    positive_class: Optional[str] = "1"
    promotion_mode: Optional[str] = "ASSISTED"
    thresholds: Optional[Dict[str, Any]] = None


class BaselineCreateRequest(BaseModel):
    name: str
    file_path: str
    description: Optional[str] = None
    expected_drift_features: Optional[List[str]] = None
    is_default: Optional[bool] = False


class ThresholdsUpdateRequest(BaseModel):
    thresholds: Dict[str, Any]


class CompatibilityRequest(BaseModel):
    model_path: str
    dataset_path: str
    target_column: Optional[str] = "Churn"
    feature_mapping: Optional[Dict[str, str]] = None


class HealthAnalysisRequest(BaseModel):
    model_path: str
    reference_path: str
    current_path: str
    target_column: Optional[str] = "Churn"
    model_id: Optional[int] = 1
    dataset_id: Optional[int] = 1
    unit_id: Optional[int] = 1
    task_type: Optional[str] = None
    baseline_id: Optional[int] = None
    expected_drift_features: Optional[List[str]] = None


class DiagnosisRequest(BaseModel):
    health_report: Dict[str, Any]
    model_path: Optional[str] = None
    dataset_path: Optional[str] = None
    target_column: Optional[str] = "Churn"


class RefinementRequest(BaseModel):
    train_path: Optional[str] = "data/processed/train.csv"
    test_path: Optional[str] = "data/processed/test.csv"
    target_column: Optional[str] = "Churn"
    apply_fixes: Optional[bool] = True


class EvaluationRequest(BaseModel):
    baseline_model_path: str
    candidate_model_path: str
    test_path: Optional[str] = "data/processed/test.csv"
    target_column: Optional[str] = "Churn"
    task_type: Optional[str] = "classification"


class PipelineRunRequest(BaseModel):
    model_path: Optional[str] = None
    reference_path: Optional[str] = None
    current_path: Optional[str] = None
    train_path: Optional[str] = "data/processed/train.csv"
    test_path: Optional[str] = "data/processed/test.csv"
    target_column: Optional[str] = "Churn"
    force_refinement: Optional[bool] = False
    model_name: Optional[str] = "Baseline Churn Model"
    dataset_name: Optional[str] = "Drifted Batch"
    unit_id: Optional[int] = 1
    task_type: Optional[str] = None
    baseline_id: Optional[int] = None
    dataset_id: Optional[int] = None


class InferenceRequest(BaseModel):
    features: Dict[str, Any]
    unit_id: Optional[int] = 1


# ==========================================
# Core Monitoring Unit & Baseline Endpoints
# ==========================================

@app.get("/api/units")
def get_monitoring_units():
    return list_monitoring_units()


@app.post("/api/units")
def create_unit_endpoint(req: UnitCreateRequest):
    unit = create_monitoring_unit(
        name=req.name,
        task_type=req.task_type or "classification",
        owner_label=req.owner_label or "default",
        target_column=req.target_column or "Churn",
        positive_class=req.positive_class or "1",
        promotion_mode=req.promotion_mode or "ASSISTED",
        thresholds=req.thresholds
    )
    return {
        "status": "success",
        "unit": {
            "id": unit.id,
            "name": unit.name,
            "task_type": unit.task_type,
            "owner_label": unit.owner_label,
            "target_column": unit.target_column,
            "positive_class": unit.positive_class,
            "promotion_mode": unit.promotion_mode,
            "thresholds": json.loads(unit.thresholds_json) if unit.thresholds_json else {}
        }
    }


@app.get("/api/units/{unit_id}")
def get_unit_endpoint(unit_id: int):
    unit = get_monitoring_unit(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail=f"Monitoring unit {unit_id} not found.")
    active_version = get_current_active_model(unit_id=unit_id)
    return {
        "id": unit.id,
        "name": unit.name,
        "task_type": unit.task_type,
        "owner_label": unit.owner_label,
        "target_column": unit.target_column,
        "positive_class": unit.positive_class,
        "promotion_mode": unit.promotion_mode,
        "thresholds": json.loads(unit.thresholds_json) if unit.thresholds_json else {},
        "current_dataset_id": getattr(unit, "current_dataset_id", None),
        "active_model": active_version
    }


@app.post("/api/units/{unit_id}/champion")
async def upload_unit_champion_endpoint(
    unit_id: int,
    file: Optional[UploadFile] = File(None),
    model_file: Optional[UploadFile] = File(None),
    name: Optional[str] = Form(None),
    version: Optional[str] = Form(None),
    model_type: Optional[str] = Form(None)
):
    from .database import save_model, save_version, record_audit_event
    unit = get_monitoring_unit(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail=f"Monitoring unit {unit_id} not found.")

    upload = file or model_file
    if not upload:
        raise HTTPException(status_code=400, detail="Missing model artifact file in upload (field 'file' or 'model_file').")

    content = await upload.read()
    stored_path, sha256_hash, _ = store_artifact(content, category="models", original_filename=upload.filename)

    adapter = load_model_adapter(str(stored_path))
    detected_model_type = adapter.get_model_type() or model_type or "Model"
    feature_names = adapter.get_feature_names()

    model_name = name or Path(upload.filename).stem
    saved_model = save_model(
        name=model_name,
        model_type=detected_model_type,
        file_path=str(stored_path),
        feature_names=feature_names,
        unit_id=unit_id,
        sha256=sha256_hash
    )

    ver_str = version or f"v{int(time.time())}"
    version_rec = save_version(
        model_id=saved_model.id,
        version=ver_str,
        name=f"Champion ({model_name})",
        file_path=str(stored_path),
        is_active=True,
        description=f"Active champion uploaded: {upload.filename}",
        unit_id=unit_id
    )

    record_audit_event(
        unit_id=unit_id,
        event_type="CHAMPION_UPLOADED",
        actor="USER",
        details={
            "model_id": saved_model.id,
            "version": ver_str,
            "filename": upload.filename,
            "model_type": detected_model_type,
            "feature_count": len(feature_names),
            "sha256": sha256_hash
        }
    )

    return {
        "status": "success",
        "message": f"Champion model '{model_name}' ({ver_str}) uploaded and activated successfully.",
        "model": {
            "id": saved_model.id,
            "name": saved_model.name,
            "model_type": model_type,
            "feature_names": feature_names,
            "file_path": str(stored_path),
            "sha256": sha256_hash
        },
        "version": {
            "id": version_rec.id,
            "version": version_rec.version,
            "name": version_rec.name,
            "file_path": version_rec.file_path,
            "is_active": True
        }
    }


@app.put("/api/units/{unit_id}/thresholds")
def update_unit_thresholds_endpoint(unit_id: int, req: ThresholdsUpdateRequest):
    from .database import update_monitoring_unit_thresholds
    unit = update_monitoring_unit_thresholds(unit_id, req.thresholds)
    if not unit:
        raise HTTPException(status_code=404, detail=f"Monitoring unit {unit_id} not found.")
    return {
        "status": "success",
        "unit_id": unit.id,
        "thresholds": json.loads(unit.thresholds_json) if unit.thresholds_json else {}
    }


@app.get("/api/units/{unit_id}/baselines")
def get_unit_baselines_endpoint(unit_id: int):
    from .database import list_reference_baselines
    return list_reference_baselines(unit_id=unit_id)


@app.post("/api/units/{unit_id}/baselines")
async def create_unit_baseline_endpoint(unit_id: int, request: Request):
    from .database import save_reference_baseline, record_audit_event
    content_type = request.headers.get("content-type", "")

    if "multipart/form-data" in content_type:
        form = await request.form()
        file = form.get("file")
        if not file or not hasattr(file, "read"):
            raise HTTPException(status_code=400, detail="Missing CSV file in multipart upload.")

        content = await file.read()
        stored_path, sha256_hash, _ = store_artifact(content, category="datasets", original_filename=file.filename)

        name = form.get("name") or Path(file.filename).stem
        description = form.get("description")
        is_default = form.get("is_default") in [True, "true", "True", "1", 1]

        drift_raw = form.get("expected_drift_features")
        expected_drift = None
        if drift_raw:
            try:
                expected_drift = json.loads(drift_raw)
            except Exception:
                expected_drift = [f.strip() for f in str(drift_raw).split(",") if f.strip()]

        row_count = None
        column_count = None
        target_col = None
        try:
            df = pd.read_csv(stored_path)
            row_count = len(df)
            column_count = len(df.columns)
            unit = get_monitoring_unit(unit_id)
            if unit and unit.target_column in df.columns:
                target_col = unit.target_column
        except Exception as e:
            raise IncompatibleDataError(f"Failed to parse baseline CSV: {str(e)}")

        record = save_reference_baseline(
            unit_id=unit_id,
            name=str(name),
            file_path=str(stored_path),
            description=str(description) if description else None,
            expected_drift_features=expected_drift,
            is_default=bool(is_default),
            sha256=sha256_hash,
            row_count=row_count,
            column_count=column_count,
            target_column=target_col,
            status="DEFAULT" if is_default else "READY"
        )
    else:
        # JSON request for backwards compatibility
        body = await request.json()
        name = body.get("name")
        file_path = body.get("file_path")
        if not name or not file_path:
            raise HTTPException(status_code=400, detail="Name and file_path are required.")
        description = body.get("description")
        expected_drift = body.get("expected_drift_features")
        is_default = bool(body.get("is_default", False))

        record = save_reference_baseline(
            unit_id=unit_id,
            name=name,
            file_path=file_path,
            description=description,
            expected_drift_features=expected_drift,
            is_default=is_default
        )

    return {
        "status": "success",
        "baseline": {
            "id": record.id,
            "unit_id": record.unit_id,
            "name": record.name,
            "description": record.description,
            "file_path": record.file_path,
            "sha256": record.sha256,
            "expected_drift_features": json.loads(record.expected_drift_features) if record.expected_drift_features else [],
            "is_default": bool(record.is_default),
            "row_count": getattr(record, "row_count", None),
            "column_count": getattr(record, "column_count", None),
            "target_column": getattr(record, "target_column", None),
            "status": "DEFAULT" if bool(record.is_default) else (getattr(record, "status", None) or "READY"),
            "created_at": record.created_at.isoformat() if record.created_at else None
        }
    }


@app.get("/api/units/{unit_id}/candidates")
def get_unit_candidates_endpoint(unit_id: int):
    from .database import list_candidates
    return list_candidates(unit_id=unit_id)


@app.get("/api/units/{unit_id}/refinement-jobs")
def get_unit_refinement_jobs_endpoint(unit_id: int):
    from .database import list_refinement_jobs
    return list_refinement_jobs(unit_id=unit_id)


@app.get("/api/units/{unit_id}/audit-events")
def get_unit_audit_events_endpoint(unit_id: int):
    from .database import list_audit_events
    return list_audit_events(unit_id=unit_id)


@app.post("/api/units/{unit_id}/candidates/{candidate_id}/promote")
def promote_candidate_endpoint(unit_id: int, candidate_id: int):
    from .database import get_candidate, update_candidate_state, save_version, record_audit_event
    import time
    cand = get_candidate(candidate_id)
    if not cand:
        raise HTTPException(status_code=404, detail=f"Candidate with ID {candidate_id} not found.")
    if cand.unit_id != unit_id:
        raise HTTPException(status_code=400, detail=f"Candidate {candidate_id} does not belong to unit {unit_id}.")
    if cand.lifecycle_state == "REJECTED":
        raise HTTPException(status_code=400, detail=f"Cannot promote rejected candidate: {cand.rejection_reason}")

    new_v = f"v{int(time.time())}"
    metrics = json.loads(cand.metrics_json) if cand.metrics_json else {}

    version_rec = save_version(
        model_id=1,
        version=new_v,
        name=f"Promoted {cand.strategy} Candidate",
        file_path=cand.model_file_path,
        is_active=True,
        accuracy=metrics.get("accuracy"),
        f1_score=metrics.get("f1") or metrics.get("weighted_f1") or metrics.get("r2"),
        roc_auc=metrics.get("roc_auc") or metrics.get("rmse"),
        description=f"Human-promoted {cand.strategy} candidate #{cand.id}",
        unit_id=unit_id
    )
    update_candidate_state(cand.id, "CHAMPION")
    record_audit_event(
        unit_id=unit_id,
        event_type="CANDIDATE_PROMOTED",
        actor="USER",
        details={"candidate_id": cand.id, "strategy": cand.strategy, "version": new_v}
    )

    return {
        "status": "success",
        "message": f"Candidate #{cand.id} successfully promoted to active Champion ({new_v}).",
        "version": {
            "id": version_rec.id,
            "version": version_rec.version,
            "file_path": version_rec.file_path,
            "is_active": True
        }
    }


@app.post("/api/units/{unit_id}/rollback")
def rollback_unit_endpoint(unit_id: int):
    from .database import rollback_version, record_audit_event
    try:
        prev = rollback_version(unit_id=unit_id)
        record_audit_event(
            unit_id=unit_id,
            event_type="ROLLBACK",
            actor="USER",
            details={"restored_version_id": prev.id, "restored_version": prev.version}
        )
        return {
            "status": "success",
            "message": f"Successfully rolled back unit {unit_id} to version {prev.version}.",
            "active_version": {
                "id": prev.id,
                "version": prev.version,
                "file_path": prev.file_path,
                "is_active": True
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==========================================
# Core System Endpoints
# ==========================================

@app.get("/health")
def health_check():
    active = get_current_active_model(unit_id=1)
    return {
        "status": "healthy",
        "system": "AI Model Health & Refinement Engine",
        "active_model": active
    }


@app.get("/api/dashboard/summary")
def get_dashboard_summary(unit_id: Optional[int] = None):
    units = list_monitoring_units()
    models = list_models(unit_id=unit_id)
    datasets = list_datasets(unit_id=unit_id)
    runs = list_runs(unit_id=unit_id, limit=5)
    alerts = list_alerts(unit_id=unit_id, limit=5)
    versions = list_versions(unit_id=unit_id)
    active_version = get_current_active_model(unit_id=unit_id or 1)

    latest_run = runs[0] if runs else None
    current_health_status = latest_run["health_status"] if latest_run else "HEALTHY"
    current_f1 = latest_run["f1_score"] if latest_run else (active_version.get("f1_score") if active_version else 0.82)
    current_roc_auc = latest_run["roc_auc"] if latest_run else (active_version.get("roc_auc") if active_version else 0.85)
    current_accuracy = latest_run["accuracy"] if latest_run else (active_version.get("accuracy") if active_version else 0.80)

    return {
        "status": "online",
        "active_model": active_version,
        "health_status": current_health_status,
        "metrics": {
            "accuracy": current_accuracy,
            "f1_score": current_f1,
            "roc_auc": current_roc_auc
        },
        "stats": {
            "units_count": len(units),
            "models_count": len(models),
            "datasets_count": len(datasets),
            "versions_count": len(versions),
            "alerts_count": len(alerts),
            "total_runs": len(runs)
        },
        "recent_alerts": alerts,
        "recent_runs": runs
    }


# ==========================================
# Step 2: Intake Endpoints
# ==========================================

@app.post("/api/intake", dependencies=[Depends(rate_limit_intake)])
async def intake(
    model_file: Optional[UploadFile] = File(None),
    dataset_file: Optional[UploadFile] = File(None),
    model_path: Optional[str] = Form(None),
    dataset_path: Optional[str] = Form(None),
    target_column: str = Form("Churn"),
    model_name: Optional[str] = Form(None),
    dataset_name: Optional[str] = Form(None),
    unit_id: Optional[int] = Form(1)
):
    try:
        # Handle file uploads if present
        if model_file is not None:
            content = await model_file.read()
            stored_m, _, _ = store_artifact(content, category="models", original_filename=model_file.filename)
            model_path_to_use = str(stored_m)
            model_name_to_use = model_name or model_file.filename
        elif model_path:
            model_path_to_use = model_path
            model_name_to_use = model_name or Path(model_path).stem
        else:
            model_path_to_use = "models/baseline_model.pkl"
            model_name_to_use = model_name or "Baseline Model"

        if dataset_file is not None:
            d_content = await dataset_file.read()
            stored_d, _, _ = store_artifact(d_content, category="datasets", original_filename=dataset_file.filename)
            dataset_path_to_use = str(stored_d)
            dataset_name_to_use = dataset_name or dataset_file.filename
        elif dataset_path:
            dataset_path_to_use = dataset_path
            dataset_name_to_use = dataset_name or Path(dataset_path).stem
        else:
            dataset_path_to_use = "data/processed/test.csv"
            dataset_name_to_use = dataset_name or "Test Batch"

        result = intake_model(
            model_path=model_path_to_use,
            dataset_path=dataset_path_to_use,
            target_column=target_column,
            model_name=model_name_to_use,
            dataset_name=dataset_name_to_use,
            unit_id=unit_id or 1
        )
        return result

    except ModelHealthException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/models")
def get_models(unit_id: Optional[int] = None):
    return list_models(unit_id=unit_id)


@app.get("/api/datasets")
def get_datasets(unit_id: Optional[int] = None):
    return list_datasets(unit_id=unit_id)


@app.post("/api/units/{unit_id}/datasets")
async def upload_unit_dataset_endpoint(
    unit_id: int,
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    target_column: Optional[str] = Form(None),
    set_as_current: Optional[bool] = Form(False)
):
    from .database import save_dataset, set_unit_current_dataset, get_monitoring_unit
    unit = get_monitoring_unit(unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail=f"Monitoring unit {unit_id} not found.")

    content = await file.read()
    stored_path, sha256_hash, _ = store_artifact(content, category="datasets", original_filename=file.filename)

    effective_target = target_column or unit.target_column or "Churn"
    try:
        df = pd.read_csv(stored_path)
        row_count = len(df)
        column_count = len(df.columns)
    except Exception as e:
        raise IncompatibleDataError(f"Failed to parse uploaded dataset CSV: {str(e)}")

    dataset_name = name or Path(file.filename).stem
    record = save_dataset(
        name=dataset_name,
        file_path=str(stored_path),
        row_count=row_count,
        column_count=column_count,
        target_column=effective_target,
        unit_id=unit_id,
        sha256=sha256_hash,
        description=description,
        status="CURRENT" if set_as_current else "READY"
    )

    if set_as_current:
        set_unit_current_dataset(unit_id, record.id)

    return {
        "status": "success",
        "message": f"Dataset '{dataset_name}' stored in unit #{unit_id} library.",
        "dataset": {
            "id": record.id,
            "unit_id": record.unit_id,
            "name": record.name,
            "description": record.description,
            "file_path": record.file_path,
            "sha256": record.sha256,
            "row_count": record.row_count,
            "column_count": record.column_count,
            "target_column": record.target_column,
            "status": "CURRENT" if set_as_current else "READY",
            "created_at": record.created_at.isoformat() if record.created_at else None
        }
    }


@app.post("/api/units/{unit_id}/current-dataset/{dataset_id}")
def set_unit_current_dataset_endpoint(unit_id: int, dataset_id: int):
    from .database import set_unit_current_dataset
    unit = set_unit_current_dataset(unit_id, dataset_id)
    if not unit:
        raise HTTPException(status_code=404, detail=f"Monitoring unit {unit_id} not found.")
    return {
        "status": "success",
        "message": f"Dataset #{dataset_id} marked as CURRENT dataset for Unit #{unit_id}.",
        "unit_id": unit_id,
        "current_dataset_id": dataset_id
    }


@app.delete("/api/datasets/{dataset_id}")
def delete_dataset_endpoint(dataset_id: int):
    from .database import delete_dataset
    success = delete_dataset(dataset_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Dataset with ID {dataset_id} not found.")
    return {
        "status": "success",
        "message": f"Dataset #{dataset_id} removed from library."
    }


# ==========================================
# Step 3 & 4: Profiling & Compatibility
# ==========================================

@app.post("/api/profile/dataset")
async def profile_dataset_endpoint(request: Request):
    try:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            data = await request.json()
        else:
            form = await request.form()
            data = dict(form)
        d_path = data.get("dataset_path") or data.get("file_path")
        if not d_path:
            raise HTTPException(status_code=400, detail="Missing dataset_path or file_path in request.")
        t_col = data.get("target_column") or "Churn"
        return profile_dataset(d_path, target_column=t_col)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/profile/model")
def profile_model_endpoint(model_path: str = Body(..., embed=True)):
    try:
        return profile_model(model_path)
    except ModelHealthException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/compatibility")
def check_compatibility_endpoint(req: CompatibilityRequest):
    try:
        return check_compatibility(
            model_path=req.model_path,
            dataset_path=req.dataset_path,
            target_column=req.target_column,
            feature_mapping=req.feature_mapping
        )
    except ModelHealthException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==========================================
# Step 5 & 6: Health & Diagnosis
# ==========================================

@app.post("/api/health/analyze")
def analyze_health_endpoint(req: HealthAnalysisRequest):
    try:
        return generate_health_report(
            model_path=req.model_path,
            reference_path=req.reference_path,
            current_path=req.current_path,
            target_column=req.target_column or "Churn",
            model_id=req.model_id,
            dataset_id=req.dataset_id,
            unit_id=req.unit_id or 1,
            task_type=req.task_type,
            baseline_id=req.baseline_id,
            expected_drift_features=req.expected_drift_features
        )
    except ModelHealthException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/diagnosis")
def diagnose_endpoint(req: DiagnosisRequest):
    try:
        return diagnose_health(
            health_report=req.health_report,
            model_path=req.model_path,
            dataset_path=req.dataset_path,
            target_column=req.target_column,
            shap_output_path="storage/shap_summary.png"
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==========================================
# Step 7 & 8: Refinement Engine
# ==========================================

@app.post("/api/refine", dependencies=[Depends(rate_limit_refine)])
def refine_model_endpoint(req: RefinementRequest):
    try:
        return refine_model(
            train_path=req.train_path,
            test_path=req.test_path,
            target_column=req.target_column,
            output_dir="storage/models",
            apply_fixes=req.apply_fixes
        )
    except ModelHealthException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==========================================
# Step 9: Evaluation & Promotion
# ==========================================

@app.post("/api/evaluate")
def evaluate_models_endpoint(req: EvaluationRequest):
    try:
        task_type = req.task_type or "classification"
        base_eval = evaluate_model(req.baseline_model_path, req.test_path, req.target_column, task_type=task_type)
        cand_eval = evaluate_model(req.candidate_model_path, req.test_path, req.target_column, task_type=task_type)
        comparison = compare_models(base_eval, cand_eval, task_type=task_type)
        promotion = decide_promotion(base_eval, cand_eval, task_type=task_type)

        return {
            "baseline": base_eval,
            "candidate": cand_eval,
            "comparison": comparison,
            "promotion": promotion
        }
    except ModelHealthException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==========================================
# Step 10: Versioning & Deployment Manager
# ==========================================

@app.get("/api/versions")
def get_versions_endpoint(unit_id: Optional[int] = None):
    return get_version_history(unit_id=unit_id)


@app.get("/api/versions/active")
def get_active_version_endpoint(unit_id: Optional[int] = 1):
    active = get_current_active_model(unit_id=unit_id or 1)
    if not active:
        raise HTTPException(status_code=404, detail="No active model version found.")
    return active


@app.post("/api/versions/{version_id}/activate")
def activate_version_endpoint(version_id: int):
    try:
        return deploy_version(version_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/alerts")
def get_alerts_endpoint(unit_id: Optional[int] = None):
    return list_alerts(unit_id=unit_id)


# ==========================================
# Step 11: 1-Click End-to-End Pipeline
# ==========================================

@app.post("/api/pipeline/run")
def run_pipeline_endpoint(req: PipelineRunRequest):
    try:
        effective_unit_id = req.unit_id or 1
        active = get_current_active_model(unit_id=effective_unit_id)
        active_model_path = active["file_path"] if active and Path(active["file_path"]).exists() else "models/baseline_model.pkl"

        model_path_to_use = req.model_path or active_model_path
        model_name_to_use = req.model_name or (active.get("name") if active else "Baseline Churn Model")

        reference_path_to_use = req.reference_path
        baseline_id_to_use = req.baseline_id
        if not reference_path_to_use:
            from .database import get_reference_baseline
            b = get_reference_baseline(unit_id=effective_unit_id)
            if b and Path(b.file_path).exists():
                reference_path_to_use = b.file_path
                baseline_id_to_use = b.id
            else:
                reference_path_to_use = "data/processed/reference.csv"

        current_path_to_use = req.current_path
        dataset_name_to_use = req.dataset_name
        dataset_id_to_use = req.dataset_id
        if req.dataset_id and not current_path_to_use:
            from .database import list_datasets
            d_list = list_datasets(unit_id=effective_unit_id)
            matched_d = next((d for d in d_list if d["id"] == req.dataset_id), None)
            if matched_d and Path(matched_d["file_path"]).exists():
                current_path_to_use = matched_d["file_path"]
                dataset_name_to_use = dataset_name_to_use or matched_d["name"]
        if not current_path_to_use:
            from .database import get_monitoring_unit, list_datasets
            unit = get_monitoring_unit(effective_unit_id)
            if unit and unit.current_dataset_id:
                d_list = list_datasets(unit_id=effective_unit_id)
                curr_d = next((d for d in d_list if d["id"] == unit.current_dataset_id), None)
                if curr_d and Path(curr_d["file_path"]).exists():
                    current_path_to_use = curr_d["file_path"]
                    dataset_name_to_use = dataset_name_to_use or curr_d["name"]
                    dataset_id_to_use = dataset_id_to_use or curr_d["id"]
            if not current_path_to_use:
                current_path_to_use = "data/processed/drifted_batch.csv"

        return run_full_pipeline(
            model_path=model_path_to_use,
            reference_path=reference_path_to_use,
            current_path=current_path_to_use,
            train_path=req.train_path or "data/processed/train.csv",
            test_path=req.test_path or "data/processed/test.csv",
            target_column=req.target_column or "Churn",
            model_name=model_name_to_use,
            dataset_name=dataset_name_to_use or "Production Batch",
            force_refinement=req.force_refinement,
            unit_id=effective_unit_id,
            task_type=req.task_type,
            baseline_id=baseline_id_to_use,
            dataset_id=dataset_id_to_use
        )
    except ModelHealthException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# Live Inference Sandbox Endpoint
# ==========================================

@app.post("/api/inference/predict")
def predict_endpoint(req: InferenceRequest):
    try:
        effective_unit_id = req.unit_id or 1
        active = get_current_active_model(unit_id=effective_unit_id)
        if not active or not Path(active["file_path"]).exists():
            model_path = "models/baseline_model.pkl"
            active_info = {"version": "v1.0.0-fallback", "name": "Baseline Model"}
        else:
            model_path = active["file_path"]
            active_info = active

        adapter = load_model_adapter(model_path)
        input_df = pd.DataFrame([req.features])

        raw_pred = adapter.predict(input_df)[0]
        pred = int(raw_pred)

        try:
            probs = adapter.predict_proba(input_df)[0]
            churn_prob = round(float(probs[1]), 4)
            stay_prob = round(float(probs[0]), 4)
        except Exception:
            churn_prob = 1.0 if pred == 1 else 0.0
            stay_prob = 1.0 - churn_prob

        risk_tier = "HIGH" if churn_prob >= 0.7 else ("MEDIUM" if churn_prob >= 0.4 else "LOW")

        return {
            "prediction": pred,
            "prediction_label": "Will Churn" if pred == 1 else "Will Stay",
            "churn_probability": churn_prob,
            "stay_probability": stay_prob,
            "risk_tier": risk_tier,
            "active_model_version": active_info.get("version"),
            "active_model_name": active_info.get("name"),
            "unit_id": effective_unit_id
        }

    except ModelHealthException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Inference error: {str(e)}")


# ==========================================
# Demo Helpers
# ==========================================

@app.post("/api/demo/load-samples")
def load_sample_data():
    """
    Pre-populates storage with baseline model and reference datasets for instant demonstration.
    """
    try:
        intake_res = intake_model(
            model_path="models/baseline_model.pkl",
            dataset_path="data/processed/reference.csv",
            target_column="Churn",
            model_name="Telco Random Forest Baseline",
            dataset_name="Telco Reference Data (704 rows)",
            unit_id=1
        )
        return {
            "status": "success",
            "message": "Sample baseline model and reference dataset loaded successfully into registry.",
            "intake": intake_res
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# Guided Demo Endpoints
# ==========================================

@app.post("/api/demo/initialize")
def demo_initialize():
    try:
        return demo_engine.initialize_baseline()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/demo/evaluate")
def demo_evaluate():
    try:
        return demo_engine.evaluate_benchmark()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/demo/upload-drifted")
async def demo_upload_drifted(file: UploadFile = File(...)):
    try:
        content = await file.read()
        return demo_engine.upload_drifted_dataset(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/demo/use-sample-drifted")
def demo_use_sample_drifted():
    try:
        sample_path = Path("data/demo/churn_drifted_demo.csv")
        if not sample_path.exists():
            from scripts.generate_drifted_upload import generate_drifted_dataset
            generate_drifted_dataset(str(sample_path))
        with open(sample_path, "rb") as f:
            content = f.read()
        return demo_engine.upload_drifted_dataset(content, "churn_drifted_demo.csv")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/demo/analyze-drift")
def demo_analyze_drift(payload: Dict[str, Any] = Body(default={})):
    try:
        dataset_path = payload.get("dataset_path")
        return demo_engine.analyze_drift_impact(dataset_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/demo/auto-refine")
def demo_auto_refine(payload: Dict[str, Any] = Body(default={})):
    try:
        dataset_path = payload.get("dataset_path")
        return demo_engine.auto_refine(dataset_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/demo/verify")
def demo_verify(payload: Dict[str, Any] = Body(default={})):
    try:
        ref_path = payload.get("ref_path")
        drifted_path = payload.get("drifted_path")
        return demo_engine.verify_adaptation(ref_path, drifted_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/demo/logs")
def demo_get_logs():
    return {
        "status": "success",
        "current_step": demo_engine.current_step,
        "logs": demo_engine.get_logs()
    }


@app.post("/api/demo/reset")
def demo_reset():
    demo_engine.reset()
    return {"status": "success", "message": "Demo state reset successfully."}