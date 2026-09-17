from pathlib import Path
import time
from datetime import datetime
from typing import Dict, Any, Optional

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
    get_current_active_model,
    get_version_history
)
from .database import (
    get_monitoring_unit,
    save_run,
    list_alerts
)


def run_full_pipeline(
    model_path: str = "models/baseline_model.pkl",
    reference_path: str = "data/processed/reference.csv",
    current_path: str = "data/processed/test.csv",
    train_path: Optional[str] = None,
    test_path: Optional[str] = None,
    target_column: Optional[str] = "Churn",
    model_name: str = "Baseline Churn Model",
    dataset_name: str = "Production Batch",
    force_refinement: bool = False,
    unit_id: int = 1,
    task_type: Optional[str] = None,
    baseline_id: Optional[int] = None,
    dataset_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Step 11 — End-to-End Orchestration Pipeline.
    Chains Steps 2 to 10 in a single autonomous flow scoped to a MonitoringUnit.
    Incorporates diagnosis-driven refinement, safety gates, and explainable decisions.
    """
    start_time = time.time()
    stages = []
    effective_unit_id = unit_id or 1
    unit = get_monitoring_unit(effective_unit_id)
    effective_task_type = task_type or (unit.task_type if unit else "classification")
    effective_target_col = target_column if target_column is not None else (unit.target_column if unit else "Churn")

    def log_stage(name: str, status: str, details: dict = None):
        stages.append({
            "stage": name,
            "status": status,
            "timestamp": datetime.utcnow().isoformat(),
            "details": details or {}
        })

    # ==========================================
    # Stage 1: Intake & Storage (Step 2)
    # ==========================================
    try:
        intake_res = intake_model(
            model_path=model_path,
            dataset_path=current_path,
            target_column=effective_target_col,
            model_name=model_name,
            dataset_name=dataset_name,
            unit_id=effective_unit_id
        )
        stored_model = intake_res["model_path"]
        stored_dataset = intake_res["dataset_path"]
        log_stage("Intake", "COMPLETED", {
            "model_type": intake_res["model_type"],
            "model_id": intake_res["model_id"],
            "dataset_id": intake_res["dataset_id"],
            "unit_id": effective_unit_id
        })
    except Exception as e:
        log_stage("Intake", "FAILED", {"error": str(e)})
        raise e

    # ==========================================
    # Stage 2: Profiling (Step 3)
    # ==========================================
    try:
        dataset_profile = profile_dataset(stored_dataset, target_column=effective_target_col)
        model_profile = profile_model(stored_model)
        log_stage("Profiling", "COMPLETED", {
            "rows": dataset_profile["rows"],
            "columns": dataset_profile["columns"],
            "model_type": model_profile["model_type"]
        })
    except Exception as e:
        log_stage("Profiling", "FAILED", {"error": str(e)})
        dataset_profile = {}
        model_profile = {}

    # ==========================================
    # Stage 3: Compatibility Check (Step 4)
    # ==========================================
    try:
        compat_res = check_compatibility(
            model_path=stored_model,
            dataset_path=stored_dataset,
            target_column=effective_target_col
        )
        log_stage("Compatibility", "COMPLETED" if compat_res["compatible"] else "WARNING", {
            "compatible": compat_res["compatible"],
            "errors": compat_res["errors"],
            "warnings": compat_res["warnings"]
        })
    except Exception as e:
        log_stage("Compatibility", "FAILED", {"error": str(e)})
        compat_res = {"compatible": False, "errors": [str(e)]}

    # ==========================================
    # Stage 4: Health & Drift Analysis (Step 5)
    # ==========================================
    try:
        health_report = generate_health_report(
            model_path=stored_model,
            reference_path=reference_path,
            current_path=stored_dataset,
            target_column=effective_target_col,
            model_id=intake_res["model_id"],
            dataset_id=dataset_id or intake_res["dataset_id"],
            unit_id=effective_unit_id,
            task_type=effective_task_type,
            baseline_id=baseline_id
        )
        log_stage("Health Analysis", "COMPLETED", {
            "status": health_report["status"],
            "health_score": health_report["health_score"],
            "drift_classification": health_report.get("drift_classification"),
            "drift_rate": health_report["data_drift"]["drift_rate"],
            "f1_score": health_report["performance"].get("f1") or health_report["performance"].get("r2")
        })
    except Exception as e:
        log_stage("Health Analysis", "FAILED", {"error": str(e)})
        raise e

    # ==========================================
    # Stage 5: Structured Diagnosis (Step 6)
    # ==========================================
    try:
        diagnosis_res = diagnose_health(
            health_report=health_report,
            model_path=stored_model,
            dataset_path=stored_dataset,
            target_column=effective_target_col,
            shap_output_path="storage/shap_summary.png"
        )
        log_stage("Diagnosis", "COMPLETED", {
            "issue_count": len(diagnosis_res["diagnoses"]),
            "critical_count": diagnosis_res.get("critical_count", 0),
            "warning_count": diagnosis_res.get("warning_count", 0)
        })
    except Exception as e:
        log_stage("Diagnosis", "FAILED", {"error": str(e)})
        diagnosis_res = {"diagnoses": [], "shap": None}

    # ==========================================
    # Stage 6: Diagnosis-Driven Refinement (Step 7-10)
    # ==========================================
    needs_refinement = (
        force_refinement
        or health_report["status"] in ("WARNING", "CRITICAL")
        or (health_report["data_drift"]["drift_detected"] and health_report.get("drift_classification") != "EXPECTED")
    )

    refinement_res = None
    explanation = "Pipeline complete."

    if needs_refinement:
        try:
            refinement_res = refine_model(
                train_path=train_path,
                test_path=test_path or stored_dataset,
                target_column=effective_target_col,
                output_dir="storage/models",
                apply_fixes=True,
                unit_id=effective_unit_id,
                health_report=health_report,
                diagnoses=diagnosis_res.get("diagnoses", [])
            )
            log_stage("Refinement & Selection", refinement_res.get("status", "COMPLETED"), {
                "promotion_mode": refinement_res.get("promotion_mode"),
                "candidate_count": len(refinement_res.get("candidates", [])),
                "promoted_candidate": bool(refinement_res.get("promoted_candidate"))
            })
            if refinement_res.get("promoted_candidate"):
                explanation = f"Model health required refinement ({health_report['status']}). Refinement evaluated {len(refinement_res.get('candidates', []))} candidates and auto-promoted candidate #{refinement_res['promoted_candidate']['candidate_id']} ({refinement_res['promoted_candidate']['strategy']})."
            elif refinement_res.get("staged_challenger"):
                explanation = f"Model health triggered refinement in ASSISTED mode. Candidate #{refinement_res['staged_challenger']['candidate_id']} passed safety gates and is staged as Challenger awaiting approval."
            else:
                explanation = f"Refinement evaluated {len(refinement_res.get('candidates', []))} candidates, but none passed all production safety gates. Original model retained as Champion."

        except Exception as e:
            log_stage("Refinement", "FAILED", {"error": str(e)})
            explanation = f"Refinement failed: {str(e)}. Original active Champion was preserved untouched."
    else:
        if health_report.get("drift_classification") == "EXPECTED":
            explanation = f"Refinement was skipped because observed feature drift matched the expected seasonal baseline, and performance remained within healthy bounds."
        else:
            explanation = f"Refinement was skipped because the model is fully healthy (Score: {health_report['health_score']}/100, Status: {health_report['status']})."
        log_stage("Refinement", "SKIPPED", {"reason": explanation})

    active_model = get_current_active_model(unit_id=effective_unit_id)
    version_history = get_version_history(unit_id=effective_unit_id)
    total_duration = round(time.time() - start_time, 2)

    return {
        "status": "success",
        "unit_id": effective_unit_id,
        "explanation": explanation,
        "pipeline_duration_sec": total_duration,
        "completed_at": datetime.utcnow().isoformat(),
        "stages": stages,
        "intake": intake_res,
        "dataset_profile": dataset_profile,
        "model_profile": model_profile,
        "compatibility": compat_res,
        "health_report": health_report,
        "diagnosis": diagnosis_res,
        "refinement": refinement_res,
        "active_model": active_model,
        "version_history": version_history
    }
