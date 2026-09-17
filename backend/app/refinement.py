import time
from pathlib import Path
import json
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.model_selection import RandomizedSearchCV
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.impute import SimpleImputer
import joblib

from .adapters.registry import load_model_adapter
from .tasks.registry import get_task_adapter
from .artifact_storage import store_artifact
from .diagnosis import diagnose_health
from .strategy_selector import StrategySelector
from .safety_gates import evaluate_safety_gates
from .database import (
    get_monitoring_unit,
    get_active_version,
    create_refinement_job,
    update_refinement_job,
    save_candidate,
    update_candidate_state,
    record_audit_event,
    save_version,
    activate_version,
    list_datasets,
    list_reference_baselines
)
from .exceptions import IncompatibleDataError, ModelHealthException


def load_dataset(file_path: str) -> pd.DataFrame:
    p = Path(file_path)
    if not p.exists():
        raise IncompatibleDataError(f"Dataset '{p.name}' does not exist.")
    return pd.read_csv(p)


def build_pipeline_estimator(estimator, X_sample: pd.DataFrame) -> Pipeline:
    categorical_cols = X_sample.select_dtypes(include=["object", "category"]).columns.tolist()
    numeric_cols = X_sample.select_dtypes(include=[np.number]).columns.tolist()

    transformers = []
    if numeric_cols:
        transformers.append(("num", SimpleImputer(strategy="median"), numeric_cols))
    if categorical_cols:
        cat_transformer = Pipeline(steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore"))
        ])
        transformers.append(("cat", cat_transformer, categorical_cols))

    if transformers:
        preprocessor = ColumnTransformer(transformers=transformers, remainder="passthrough")
        return Pipeline(steps=[("preprocessor", preprocessor), ("estimator", estimator)])
    return Pipeline(steps=[("estimator", estimator)])


def refine_model(
    train_path: Optional[str] = "data/processed/train.csv",
    test_path: Optional[str] = "data/processed/test.csv",
    target_column: Optional[str] = None,
    output_dir: str = "storage/models",
    apply_fixes: bool = True,
    health_report: Optional[Dict[str, Any]] = None,
    diagnoses: Optional[List[Dict[str, Any]]] = None,
    unit_id: Optional[int] = 1,
    run_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Diagnosis-driven candidate refinement with strict safety gates,
    multi-model unit scoping, and explicit lifecycle management.
    """
    effective_unit_id = unit_id or 1
    unit = get_monitoring_unit(effective_unit_id)
    task_type = unit.task_type if unit else "classification"
    effective_target_col = target_column if target_column is not None else (unit.target_column if unit else "Churn")
    promotion_mode = unit.promotion_mode if unit else "ASSISTED"

    thresholds = {}
    if unit and unit.thresholds_json:
        try:
            thresholds = json.loads(unit.thresholds_json)
        except Exception:
            pass

    # Resolve active baseline/champion version
    active_champ = get_active_version(effective_unit_id)
    parent_version_id = active_champ.id if active_champ else None
    baseline_model_path = active_champ.file_path if active_champ else "models/baseline_model.pkl"

    # Resolve training and test datasets for this unit
    train_file = train_path
    test_file = test_path

    if not train_file or not Path(train_file).exists():
        baselines = list_reference_baselines(effective_unit_id)
        if baselines and Path(baselines[0]["file_path"]).exists():
            train_file = baselines[0]["file_path"]
        else:
            datasets = list_datasets(effective_unit_id)
            if datasets and Path(datasets[0]["file_path"]).exists():
                train_file = datasets[0]["file_path"]
            else:
                train_file = "data/processed/train.csv"

    if not test_file or not Path(test_file).exists():
        test_file = "data/processed/test.csv"

    # 1. Resolve Diagnoses
    effective_diagnoses = diagnoses or []
    if not effective_diagnoses and health_report:
        diag_res = diagnose_health(
            health_report=health_report,
            model_path=baseline_model_path,
            dataset_path=test_file,
            target_column=effective_target_col
        )
        effective_diagnoses = diag_res.get("diagnoses", [])

    trigger_reason = f"Refinement evaluation for Unit {effective_unit_id}"
    if effective_diagnoses:
        trigger_reason = "; ".join(d.get("issue", "") for d in effective_diagnoses[:2])

    # 2. Check Promotion Mode (MANUAL Mode check)
    if promotion_mode == "MANUAL":
        job = create_refinement_job(
            unit_id=effective_unit_id,
            trigger_reason=trigger_reason,
            diagnoses=effective_diagnoses,
            run_id=run_id,
            status="SKIPPED"
        )
        explanation = f"Refinement was skipped because MonitoringUnit '{unit.name if unit else effective_unit_id}' is configured in MANUAL mode (monitoring and recommendations only)."
        update_refinement_job(job.id, status="SKIPPED", explanation=explanation)
        record_audit_event(
            unit_id=effective_unit_id,
            event_type="REFINEMENT_SKIPPED",
            details={"mode": "MANUAL", "job_id": job.id, "reason": explanation}
        )
        return {
            "status": "SKIPPED",
            "mode": "MANUAL",
            "explanation": explanation,
            "candidates": []
        }

    # 3. Strategy Selection
    selected_strategies = StrategySelector.select_strategies(effective_diagnoses)
    if not selected_strategies and not apply_fixes:
        job = create_refinement_job(
            unit_id=effective_unit_id,
            trigger_reason=trigger_reason,
            diagnoses=effective_diagnoses,
            run_id=run_id,
            status="SKIPPED"
        )
        explanation = "Refinement was skipped because no actionable diagnoses required model retraining or hyperparameter tuning."
        update_refinement_job(job.id, status="SKIPPED", explanation=explanation)
        record_audit_event(
            unit_id=effective_unit_id,
            event_type="REFINEMENT_SKIPPED",
            details={"job_id": job.id, "reason": explanation}
        )
        return {
            "status": "SKIPPED",
            "explanation": explanation,
            "candidates": []
        }

    if not selected_strategies and apply_fixes:
        selected_strategies = ["DATA_REFRESH"]

    # 4. Create Refinement Job
    job = create_refinement_job(
        unit_id=effective_unit_id,
        trigger_reason=trigger_reason,
        diagnoses=effective_diagnoses,
        run_id=run_id,
        status="RUNNING"
    )
    record_audit_event(
        unit_id=effective_unit_id,
        event_type="REFINEMENT_TRIGGERED",
        details={"job_id": job.id, "strategies": selected_strategies, "diagnoses_count": len(effective_diagnoses)}
    )

    try:
        df_train = load_dataset(train_file)
        df_test = load_dataset(test_file)

        if effective_target_col not in df_train.columns or effective_target_col not in df_test.columns:
            raise IncompatibleDataError(f"Target column '{effective_target_col}' missing in train or test dataset.")

        X_train = df_train.drop(columns=[effective_target_col])
        y_train = df_train[effective_target_col]
        X_test = df_test.drop(columns=[effective_target_col])
        y_test = df_test[effective_target_col]

        task_adp = get_task_adapter(task_type)

        # Evaluate current baseline
        baseline_metrics = {}
        if Path(baseline_model_path).exists():
            try:
                base_adp = load_model_adapter(baseline_model_path)
                base_preds = base_adp.predict(X_test)
                base_probs = None
                try:
                    base_probs = base_adp.predict_proba(X_test)
                except Exception:
                    pass
                baseline_metrics = task_adp.compute_metrics(y_test, base_preds, base_probs)
            except Exception:
                pass

        candidates_results = []
        best_candidate = None
        best_candidate_rec = None

        # 5. Execute Selected Strategies
        for strategy in selected_strategies:
            start_time = time.time()
            config_desc = {}

            if task_type == "regression":
                if strategy == "HYPERPARAMETER_SEARCH":
                    raw_est = RandomForestRegressor(random_state=42)
                    pipeline = build_pipeline_estimator(raw_est, X_train)
                    param_dist = {
                        "estimator__n_estimators": [15, 30, 50],
                        "estimator__max_depth": [5, 10, 15],
                        "estimator__min_samples_split": [2, 5]
                    }
                    search = RandomizedSearchCV(
                        pipeline,
                        param_distributions=param_dist,
                        n_iter=3,
                        cv=2,
                        random_state=42,
                        scoring="neg_mean_squared_error"
                    )
                    search.fit(X_train, y_train)
                    candidate_pipeline = search.best_estimator_
                    config_desc = {"search": "RandomizedSearchCV", "best_params": search.best_params_}
                else:
                    raw_est = RandomForestRegressor(n_estimators=30, max_depth=10, random_state=42)
                    candidate_pipeline = build_pipeline_estimator(raw_est, X_train)
                    candidate_pipeline.fit(X_train, y_train)
                    config_desc = {"estimator": "RandomForestRegressor", "n_estimators": 30}
            else:
                # Classification / Multiclass
                if strategy == "CLASS_BALANCING":
                    raw_est = RandomForestClassifier(n_estimators=30, class_weight="balanced", random_state=42)
                    candidate_pipeline = build_pipeline_estimator(raw_est, X_train)
                    candidate_pipeline.fit(X_train, y_train)
                    config_desc = {"estimator": "RandomForestClassifier", "class_weight": "balanced"}
                elif strategy == "HYPERPARAMETER_SEARCH":
                    raw_est = RandomForestClassifier(random_state=42)
                    pipeline = build_pipeline_estimator(raw_est, X_train)
                    param_dist = {
                        "estimator__n_estimators": [15, 30, 50],
                        "estimator__max_depth": [5, 10, 15],
                        "estimator__min_samples_split": [2, 5]
                    }
                    search = RandomizedSearchCV(
                        pipeline,
                        param_distributions=param_dist,
                        n_iter=3,
                        cv=2,
                        random_state=42,
                        scoring="f1" if task_type == "classification" else "f1_weighted"
                    )
                    search.fit(X_train, y_train)
                    candidate_pipeline = search.best_estimator_
                    config_desc = {"search": "RandomizedSearchCV", "best_params": search.best_params_}
                else:
                    # DATA_REFRESH / Retraining
                    raw_est = RandomForestClassifier(n_estimators=30, max_depth=10, random_state=42)
                    candidate_pipeline = build_pipeline_estimator(raw_est, X_train)
                    candidate_pipeline.fit(X_train, y_train)
                    config_desc = {"estimator": "RandomForestClassifier", "n_estimators": 30}

            exec_time = round(time.time() - start_time, 2)

            # Save candidate model to temp artifact and content-addressed storage
            temp_cand_name = f"candidate_{strategy.lower()}_{int(time.time())}.pkl"
            temp_path = Path("storage/models") / temp_cand_name
            temp_path.parent.mkdir(parents=True, exist_ok=True)
            joblib.dump(candidate_pipeline, temp_path)

            with open(temp_path, "rb") as f:
                cand_bytes = f.read()
            stored_cand_path, cand_sha, _ = store_artifact(
                cand_bytes,
                category="models",
                original_filename=temp_cand_name
            )

            # Evaluate Candidate Performance on raw test dataframe
            cand_preds = candidate_pipeline.predict(X_test)
            cand_probs = None
            if hasattr(candidate_pipeline, "predict_proba"):
                try:
                    cand_probs = candidate_pipeline.predict_proba(X_test)
                except Exception:
                    pass
            cand_metrics = task_adp.compute_metrics(y_test, cand_preds, cand_probs)

            # Evaluate Safety Gates
            safety_eval = evaluate_safety_gates(
                candidate_model_path=str(stored_cand_path),
                test_dataset_path=test_file,
                baseline_metrics=baseline_metrics,
                candidate_metrics=cand_metrics,
                target_column=effective_target_col,
                task_type=task_type,
                expected_sha256=cand_sha,
                thresholds=thresholds
            )

            if safety_eval["all_passed"]:
                lifecycle_state = "PROMOTED" if promotion_mode == "AUTO" else "CHALLENGER"
                rejection_reason = None
            else:
                lifecycle_state = "REJECTED"
                rejection_reason = "; ".join(safety_eval["failed_reasons"])

            # Persist Candidate Record
            cand_rec = save_candidate(
                unit_id=effective_unit_id,
                job_id=job.id,
                parent_version_id=parent_version_id,
                triggering_run_id=run_id,
                strategy=strategy,
                configuration=config_desc,
                model_file_path=str(stored_cand_path),
                sha256=cand_sha,
                metrics=cand_metrics,
                execution_time_sec=exec_time,
                lifecycle_state=lifecycle_state
            )

            cand_summary = {
                "candidate_id": cand_rec.id,
                "strategy": strategy,
                "model_path": str(stored_cand_path),
                "sha256": cand_sha,
                "metrics": cand_metrics,
                "safety_gates": safety_eval,
                "lifecycle_state": lifecycle_state,
                "rejection_reason": rejection_reason,
                "execution_time_sec": exec_time
            }
            candidates_results.append(cand_summary)

            if safety_eval["all_passed"] and best_candidate is None:
                best_candidate = cand_summary
                best_candidate_rec = cand_rec

        # 6. Finalize Promotion & Audit Events
        if best_candidate and promotion_mode == "AUTO":
            # Auto-promote candidate
            new_v_label = f"v{int(time.time())}"
            version_rec = save_version(
                model_id=1,
                version=new_v_label,
                name=f"Refined {best_candidate['strategy']} Model",
                file_path=best_candidate["model_path"],
                is_active=True,
                accuracy=best_candidate["metrics"].get("accuracy"),
                f1_score=best_candidate["metrics"].get("f1") or best_candidate["metrics"].get("weighted_f1") or best_candidate["metrics"].get("r2"),
                roc_auc=best_candidate["metrics"].get("roc_auc") or best_candidate["metrics"].get("rmse"),
                description=f"Auto-promoted {best_candidate['strategy']} candidate (Job #{job.id})",
                unit_id=effective_unit_id
            )
            update_candidate_state(best_candidate_rec.id, "CHAMPION")
            update_refinement_job(job.id, status="COMPLETED", explanation=f"Candidate #{best_candidate_rec.id} ({best_candidate['strategy']}) passed all safety gates and was promoted to Champion ({new_v_label}).")
            record_audit_event(
                unit_id=effective_unit_id,
                event_type="CANDIDATE_PROMOTED",
                details={
                    "candidate_id": best_candidate_rec.id,
                    "strategy": best_candidate["strategy"],
                    "version": new_v_label,
                    "job_id": job.id,
                    "metrics": best_candidate["metrics"]
                }
            )
        elif best_candidate and promotion_mode == "ASSISTED":
            update_refinement_job(job.id, status="COMPLETED", explanation=f"Candidate #{best_candidate_rec.id} passed all safety gates and is staged as CHALLENGER awaiting human approval.")
            record_audit_event(
                unit_id=effective_unit_id,
                event_type="CANDIDATE_EVALUATED",
                details={"candidate_id": best_candidate_rec.id, "mode": "ASSISTED", "status": "Awaiting Approval"}
            )
        else:
            # All rejected
            for c in candidates_results:
                record_audit_event(
                    unit_id=effective_unit_id,
                    event_type="CANDIDATE_REJECTED",
                    details={"candidate_id": c["candidate_id"], "strategy": c["strategy"], "reasons": c["rejection_reason"]}
                )
            update_refinement_job(job.id, status="COMPLETED", explanation="All candidate models were rejected by safety gates. Existing Champion was preserved untouched.")

        first_cand = candidates_results[0] if candidates_results else None
        top_cand = best_candidate or first_cand

        return {
            "status": "COMPLETED",
            "job_id": job.id,
            "promotion_mode": promotion_mode,
            "promoted_candidate": best_candidate if promotion_mode == "AUTO" else None,
            "staged_challenger": best_candidate if promotion_mode == "ASSISTED" else None,
            "candidates": candidates_results,
            # Backward-compatibility aliases
            "best_candidate_name": top_cand["strategy"] if top_cand else "No Candidate",
            "candidate_model_path": top_cand["model_path"] if top_cand else baseline_model_path,
            "best_metrics": top_cand["metrics"] if top_cand else {},
            "data_fixes_applied": [c["strategy"] for c in candidates_results]
        }

    except Exception as e:
        update_refinement_job(job.id, status="FAILED", explanation=str(e))
        record_audit_event(
            unit_id=effective_unit_id,
            event_type="REFINEMENT_FAILED",
            details={"job_id": job.id, "error": str(e)}
        )
        raise ModelHealthException(f"Refinement execution failed: {str(e)}")
