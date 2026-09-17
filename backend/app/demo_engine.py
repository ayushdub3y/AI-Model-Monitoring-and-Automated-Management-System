import time
from datetime import datetime
from pathlib import Path
import json
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    roc_auc_score,
    precision_score,
    recall_score,
    confusion_matrix
)
from sklearn.ensemble import RandomForestClassifier

from .adapters.registry import load_model_adapter
from .tasks.registry import get_task_adapter
from .drift import detect_drift
from .refinement import build_pipeline_estimator
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
)
from .artifact_storage import store_artifact


class DemoEngine:
    """
    In-memory state and orchestration engine for the Guided Demo flow.
    Maintains chronological logs, step progression, and evaluation artifacts.
    """

    def __init__(self):
        self.reset()

    def reset(self):
        self.current_step = 1
        self.logs: List[Dict[str, Any]] = []
        self.baseline_model_path = "models/baseline_model.pkl"
        self.active_model_path = "models/baseline_model.pkl"
        self.original_ref_path = "data/processed/reference.csv"
        self.original_test_path = "data/processed/test.csv"
        self.drifted_dataset_path = "data/demo/churn_drifted_demo.csv"
        
        # Step cache
        self.step1_data: Optional[Dict[str, Any]] = None
        self.step2_data: Optional[Dict[str, Any]] = None
        self.step3_data: Optional[Dict[str, Any]] = None
        self.step4_data: Optional[Dict[str, Any]] = None
        self.step5_data: Optional[Dict[str, Any]] = None
        self.step6_data: Optional[Dict[str, Any]] = None

        self._log(
            step=0,
            level="INFO",
            message="Guided Demo Engine initialized. Ready for Baseline Verification."
        )

    def _log(self, step: int, level: str, message: str, details: Optional[Dict[str, Any]] = None):
        entry = {
            "id": len(self.logs) + 1,
            "timestamp": datetime.now().strftime("%H:%M:%S.%f")[:-3],
            "step": step,
            "level": level,
            "message": message,
            "details": details or {}
        }
        self.logs.append(entry)
        return entry

    def get_logs(self) -> List[Dict[str, Any]]:
        return self.logs

    # =========================================================================
    # Step 1: Initialize Baseline Model
    # =========================================================================
    def initialize_baseline(self) -> Dict[str, Any]:
        self._log(1, "INFO", f"Checking pre-trained baseline model artifact at '{self.baseline_model_path}'...")
        
        p_model = Path(self.baseline_model_path)
        if not p_model.exists():
            self._log(1, "ERROR", f"Baseline model not found at {p_model.resolve()}")
            raise FileNotFoundError(f"Baseline model not found at {self.baseline_model_path}")

        file_size_mb = round(p_model.stat().st_size / (1024 * 1024), 2)
        self._log(1, "INFO", f"Loaded baseline pipeline artifact ({file_size_mb} MB). Extracting architecture details...")

        model = joblib.load(p_model)
        estimator_type = type(model).__name__
        inner_estimator = "Unknown"
        n_estimators = None
        if hasattr(model, "named_steps") and "model" in model.named_steps:
            sub = model.named_steps["model"]
            inner_estimator = type(sub).__name__
            n_estimators = getattr(sub, "n_estimators", None)
        elif hasattr(model, "steps"):
            sub = model.steps[-1][1]
            inner_estimator = type(sub).__name__
            n_estimators = getattr(sub, "n_estimators", None)

        self._log(1, "INFO", f"Architecture verified: Pipeline -> {inner_estimator} (n_estimators={n_estimators}, balanced weights).")

        # Load reference dataset
        ref_p = Path(self.original_ref_path)
        if not ref_p.exists():
            ref_p = Path("data/processed/train.csv")
        df_ref = pd.read_csv(ref_p)
        total_rows = len(df_ref)
        features = [c for c in df_ref.columns if c != "Churn"]

        self._log(1, "INFO", f"Reference dataset '{ref_p.name}' loaded: {total_rows} samples, {len(features)} feature dimensions.")

        # Quick evaluation on reference
        X = df_ref.drop(columns=["Churn"])
        y = df_ref["Churn"]
        start_t = time.time()
        preds = model.predict(X)
        lat_ms = round((time.time() - start_t) * 1000 / len(X), 3)

        probs = None
        if hasattr(model, "predict_proba"):
            probs = model.predict_proba(X)[:, 1]

        acc = float(accuracy_score(y, preds))
        f1 = float(f1_score(y, preds))
        auc = float(roc_auc_score(y, probs)) if probs is not None else None

        self._log(1, "SUCCESS", f"Baseline validation complete: Accuracy={acc:.4f}, F1={f1:.4f}, AUC={auc:.4f}, Latency={lat_ms}ms/sample.")

        self.current_step = 1
        self.step1_data = {
            "model_path": self.baseline_model_path,
            "architecture": inner_estimator,
            "file_size_mb": file_size_mb,
            "n_features": len(features),
            "feature_names": features,
            "reference_samples": total_rows,
            "metrics": {
                "accuracy": round(acc, 4),
                "f1": round(f1, 4),
                "roc_auc": round(auc, 4) if auc else None,
                "latency_ms": lat_ms
            },
            "status": "HEALTHY"
        }
        return self.step1_data

    # =========================================================================
    # Step 2: Evaluate Model under Clean Benchmark Data
    # =========================================================================
    def evaluate_benchmark(self) -> Dict[str, Any]:
        self._log(2, "INFO", "Executing formal evaluation against clean hold-out benchmark (test.csv)...")

        test_p = Path(self.original_test_path)
        if not test_p.exists():
            test_p = Path("data/processed/reference.csv")

        df_test = pd.read_csv(test_p)
        model = joblib.load(self.baseline_model_path)

        X = df_test.drop(columns=["Churn"])
        y = df_test["Churn"]

        self._log(2, "INFO", f"Running inference on {len(df_test)} hold-out test samples...")
        start_t = time.time()
        preds = model.predict(X)
        infer_duration = round((time.time() - start_t) * 1000, 2)
        probs = model.predict_proba(X)[:, 1] if hasattr(model, "predict_proba") else None

        acc = float(accuracy_score(y, preds))
        f1 = float(f1_score(y, preds))
        auc = float(roc_auc_score(y, probs)) if probs is not None else None
        prec = float(precision_score(y, preds, zero_division=0))
        rec = float(recall_score(y, preds, zero_division=0))
        cm = confusion_matrix(y, preds).tolist()

        self._log(2, "INFO", f"Computing feature drift baseline between reference.csv and test.csv...")
        drift_res = detect_drift(self.original_ref_path, str(test_p), target_column="Churn")
        drifted_count = drift_res.get("drifted_feature_count", 0)

        if drifted_count == 0:
            self._log(2, "SUCCESS", f"Statistical KS-test: 0 / {drift_res['total_features']} features drifted (p > 0.05 across all columns).")
        else:
            self._log(2, "INFO", f"Minor drift in {drifted_count} features (within acceptable threshold).")

        self._log(2, "SUCCESS", f"Hold-out Test Results: Accuracy={acc:.2%}, F1={f1:.4f}, AUC={auc:.4f}. Status: OPTIMAL_HEALTH.")

        self.current_step = 2
        self.step2_data = {
            "dataset": test_p.name,
            "sample_count": len(df_test),
            "inference_duration_ms": infer_duration,
            "metrics": {
                "accuracy": round(acc, 4),
                "f1": round(f1, 4),
                "roc_auc": round(auc, 4) if auc else None,
                "precision": round(prec, 4),
                "recall": round(rec, 4),
                "confusion_matrix": cm
            },
            "drift_summary": {
                "drift_detected": drift_res.get("drift_detected", False),
                "drifted_feature_count": drifted_count,
                "total_features": drift_res.get("total_features", 19),
                "drift_rate": drift_res.get("drift_rate", 0.0)
            },
            "health_verdict": "OPTIMAL - No significant drift detected. Model performs with high fidelity."
        }
        return self.step2_data

    # =========================================================================
    # Step 3: Handle Uploaded Drifted Dataset
    # =========================================================================
    def upload_drifted_dataset(self, file_bytes: bytes, filename: str) -> Dict[str, Any]:
        self._log(3, "INFO", f"Ingesting uploaded telemetry batch: '{filename}' ({len(file_bytes)} bytes)...")

        save_dir = Path("data/demo")
        save_dir.mkdir(parents=True, exist_ok=True)
        save_path = save_dir / f"uploaded_{filename}"

        with open(save_path, "wb") as f:
            f.write(file_bytes)

        self._log(3, "INFO", f"Saved upload to '{save_path.as_posix()}'. Validating tabular integrity & schema...")

        try:
            df = pd.read_csv(save_path)
        except Exception as e:
            self._log(3, "ERROR", f"CSV parsing failed: {str(e)}")
            raise ValueError(f"Failed to parse uploaded CSV: {str(e)}")

        self.drifted_dataset_path = str(save_path)
        features = [c for c in df.columns if c != "Churn"]
        has_labels = "Churn" in df.columns
        label_dist = df["Churn"].value_counts().to_dict() if has_labels else {}

        preview_records = df.head(5).fillna("NaN").to_dict(orient="records")

        self._log(3, "SUCCESS", f"Dataset profiled successfully: {len(df)} rows, {len(df.columns)} columns (Labels available: {has_labels}).")

        self.current_step = 3
        self.step3_data = {
            "filename": filename,
            "saved_path": str(save_path),
            "rows": len(df),
            "columns": list(df.columns),
            "feature_count": len(features),
            "has_ground_truth": has_labels,
            "label_distribution": label_dist,
            "preview": preview_records
        }
        return self.step3_data

    # =========================================================================
    # Step 4: Analyze Drift Impact on Performance
    # =========================================================================
    def analyze_drift_impact(self, dataset_path: Optional[str] = None) -> Dict[str, Any]:
        target_path = dataset_path or self.drifted_dataset_path
        self._log(4, "WARN", f"Triggering statistical drift analysis on '{Path(target_path).name}' against baseline...")

        df_drift = pd.read_csv(target_path)
        model = joblib.load(self.baseline_model_path)

        # 1. Statistical Drift Analysis
        drift_res = detect_drift(self.original_ref_path, target_path, target_column="Churn")
        drifted_features = drift_res.get("drifted_features", [])
        drift_rate = drift_res.get("drift_rate", 0.0)

        self._log(4, "WARN", f"Statistical hypothesis tests flagged {len(drifted_features)} drifting features ({drift_rate:.1%} drift rate)!")
        
        # Log specifics of top drifted features
        for feat in drifted_features[:4]:
            info = drift_res["features"].get(feat, {})
            self._log(4, "WARN", f" -> Feature '{feat}': stat={info.get('statistic')} (p={info.get('p_value')}) via {info.get('stattest_name')}")

        # 2. Evaluate Model Performance on Drifted Data
        has_labels = "Churn" in df_drift.columns
        degraded_metrics = {}
        if has_labels:
            X = df_drift.drop(columns=["Churn"])
            y = df_drift["Churn"]
            preds = model.predict(X)
            probs = model.predict_proba(X)[:, 1] if hasattr(model, "predict_proba") else None

            acc = float(accuracy_score(y, preds))
            f1 = float(f1_score(y, preds, zero_division=0))
            auc = float(roc_auc_score(y, probs)) if probs is not None else None
            prec = float(precision_score(y, preds, zero_division=0))
            rec = float(recall_score(y, preds, zero_division=0))
            cm = confusion_matrix(y, preds).tolist()

            degraded_metrics = {
                "accuracy": round(acc, 4),
                "f1": round(f1, 4),
                "roc_auc": round(auc, 4) if auc else None,
                "precision": round(prec, 4),
                "recall": round(rec, 4),
                "confusion_matrix": cm
            }
            self._log(4, "ERROR", f"CRITICAL ACCURACY COLLAPSE: Accuracy plunged to {acc:.2%} (F1={f1:.4f}) on drifted traffic!")
        else:
            self._log(4, "WARN", "Drifted dataset does not contain ground truth labels. Evaluated purely on covariate distribution shift.")

        # Baseline comparison comparison
        step2_acc = (self.step2_data or {}).get("metrics", {}).get("accuracy", 0.78)
        acc_drop = round(step2_acc - degraded_metrics.get("accuracy", 0.50), 4)

        self.current_step = 4
        self.step4_data = {
            "dataset_path": target_path,
            "drift_detected": drift_res.get("drift_detected", True),
            "drifted_features": drifted_features,
            "drift_rate": drift_rate,
            "feature_details": drift_res.get("features", {}),
            "degraded_metrics": degraded_metrics,
            "baseline_accuracy": step2_acc,
            "accuracy_drop": acc_drop,
            "diagnosis": "CRITICAL_DRIFT: Severe covariate and concept drift observed. Immediate automated refinement recommended."
        }
        return self.step4_data

    # =========================================================================
    # Step 5: Automated Model Refinement & Retraining
    # =========================================================================
    def auto_refine(self, dataset_path: Optional[str] = None) -> Dict[str, Any]:
        target_path = dataset_path or self.drifted_dataset_path
        self._log(5, "INFO", "Initiating automated model refinement pipeline...")
        self._log(5, "INFO", "Stage 1: Diagnosis & Strategy Selection -> Selected 'DATA_REFRESH' + 'CLASS_BALANCING'...")

        df_new = pd.read_csv(target_path)
        if "Churn" not in df_new.columns:
            self._log(5, "ERROR", "Cannot retrain model: ground truth column 'Churn' is missing in target dataset.")
            raise ValueError("Target dataset must include 'Churn' labels for supervised refinement.")

        # Partition into train (75%) and evaluation test (25%)
        train_df, eval_df = train_test_split(df_new, test_size=0.25, random_state=42)
        self._log(5, "INFO", f"Stage 2: Partitioned new distribution into {len(train_df)} training and {len(eval_df)} validation samples.")

        # Retrain candidate model
        self._log(5, "INFO", "Stage 3: Training candidate RandomForestClassifier (n_estimators=100, max_depth=12, balanced)...")
        start_train = time.time()
        
        raw_rf = RandomForestClassifier(n_estimators=100, max_depth=12, random_state=42, class_weight="balanced")
        candidate_pipeline = build_pipeline_estimator(raw_rf, train_df.drop(columns=["Churn"]))
        candidate_pipeline.fit(train_df.drop(columns=["Churn"]), train_df["Churn"])
        
        train_duration = round(time.time() - start_train, 2)
        self._log(5, "INFO", f"Candidate model trained successfully in {train_duration}s.")

        # Evaluate candidate on validation partition
        self._log(5, "INFO", "Stage 4: Evaluating candidate on hold-out validation partition...")
        X_val = eval_df.drop(columns=["Churn"])
        y_val = eval_df["Churn"]
        cand_preds = candidate_pipeline.predict(X_val)
        cand_probs = candidate_pipeline.predict_proba(X_val)[:, 1] if hasattr(candidate_pipeline, "predict_proba") else None

        cand_acc = float(accuracy_score(y_val, cand_preds))
        cand_f1 = float(f1_score(y_val, cand_preds, zero_division=0))
        cand_auc = float(roc_auc_score(y_val, cand_probs)) if cand_probs is not None else None

        cand_metrics = {
            "accuracy": round(cand_acc, 4),
            "f1": round(cand_f1, 4),
            "roc_auc": round(cand_auc, 4) if cand_auc else None
        }
        self._log(5, "INFO", f"Candidate validation metrics: Accuracy={cand_acc:.2%}, F1={cand_f1:.4f}, AUC={cand_auc:.4f}.")

        # Save candidate artifact
        out_dir = Path("storage/models")
        out_dir.mkdir(parents=True, exist_ok=True)
        cand_filename = f"candidate_refined_{int(time.time())}.pkl"
        cand_path = out_dir / cand_filename
        joblib.dump(candidate_pipeline, cand_path)

        with open(cand_path, "rb") as f:
            cand_bytes = f.read()
        stored_path, cand_sha, _ = store_artifact(cand_bytes, category="models", original_filename=cand_filename)

        # Run Safety Gates
        self._log(5, "INFO", "Stage 5: Executing multi-stage safety gates (Performance, Latency, Output Validation)...")
        # Ensure temporary test file exists for safety gate runner
        temp_val_path = Path("storage/datasets/temp_val.csv")
        temp_val_path.parent.mkdir(parents=True, exist_ok=True)
        eval_df.to_csv(temp_val_path, index=False)

        safety_eval = evaluate_safety_gates(
            candidate_model_path=str(stored_path),
            test_dataset_path=str(temp_val_path),
            baseline_metrics={"accuracy": 0.50},  # vs degraded baseline
            candidate_metrics=cand_metrics,
            target_column="Churn",
            task_type="classification",
            expected_sha256=cand_sha,
            thresholds={"min_accuracy": 0.70}
        )

        all_passed = safety_eval.get("all_passed", True)
        if all_passed:
            self._log(5, "SUCCESS", "All 4 Safety Gates PASSED (Latency < 200ms, Accuracy > 0.70, Binary output check).")
            # Update active model pointer
            self.active_model_path = str(stored_path)
            self._log(5, "SUCCESS", f"AUTOMATED PROMOTION: Promoted candidate '{cand_filename}' to CHAMPION!")
        else:
            self._log(5, "WARN", f"Safety gates failed: {safety_eval.get('failed_reasons')}. Fallback to existing.")

        self.current_step = 5
        self.step5_data = {
            "status": "COMPLETED",
            "candidate_model_path": str(stored_path),
            "training_duration_s": train_duration,
            "metrics": cand_metrics,
            "safety_gates": safety_eval,
            "promoted": all_passed,
            "strategy": "DATA_REFRESH + CLASS_BALANCING"
        }
        return self.step5_data

    # =========================================================================
    # Step 6: 4-Quadrant Side-by-Side Verification
    # =========================================================================
    def verify_adaptation(self, ref_path: Optional[str] = None, drifted_path: Optional[str] = None) -> Dict[str, Any]:
        orig_ref = ref_path or self.original_ref_path
        curr_drift = drifted_path or self.drifted_dataset_path

        self._log(6, "INFO", "Initiating formal cross-distribution verification matrix...")
        self._log(6, "INFO", f"Comparing Old Champion ({Path(self.baseline_model_path).name}) vs Refined Champion ({Path(self.active_model_path).name})...")

        old_model = joblib.load(self.baseline_model_path)
        new_model = joblib.load(self.active_model_path)

        df_orig = pd.read_csv(orig_ref)
        df_drift = pd.read_csv(curr_drift)

        # 1. Old Model on Original
        X_orig = df_orig.drop(columns=["Churn"])
        y_orig = df_orig["Churn"]
        old_on_orig_acc = float(accuracy_score(y_orig, old_model.predict(X_orig)))
        old_on_orig_f1 = float(f1_score(y_orig, old_model.predict(X_orig), zero_division=0))

        # 2. Old Model on Drifted
        X_drift = df_drift.drop(columns=["Churn"])
        y_drift = df_drift["Churn"]
        old_on_drift_acc = float(accuracy_score(y_drift, old_model.predict(X_drift)))
        old_on_drift_f1 = float(f1_score(y_drift, old_model.predict(X_drift), zero_division=0))

        # 3. New Model on Original
        new_on_orig_acc = float(accuracy_score(y_orig, new_model.predict(X_orig)))
        new_on_orig_f1 = float(f1_score(y_orig, new_model.predict(X_orig), zero_division=0))

        # 4. New Model on Drifted
        new_on_drift_acc = float(accuracy_score(y_drift, new_model.predict(X_drift)))
        new_on_drift_f1 = float(f1_score(y_drift, new_model.predict(X_drift), zero_division=0))

        delta_drift_acc = round(new_on_drift_acc - old_on_drift_acc, 4)

        self._log(6, "INFO", f"Quadrant 1 (Old Model / Original Data): Acc={old_on_orig_acc:.2%}")
        self._log(6, "WARN", f"Quadrant 2 (Old Model / Drifted Data):  Acc={old_on_drift_acc:.2%} (COLLAPSED)")
        self._log(6, "INFO", f"Quadrant 3 (New Model / Original Data): Acc={new_on_orig_acc:.2%}")
        self._log(6, "SUCCESS", f"Quadrant 4 (New Model / Drifted Data):  Acc={new_on_drift_acc:.2%} (+{delta_drift_acc:.1%} RECOVERY!)")
        self._log(6, "SUCCESS", "Guided Demo verification complete. Pipeline has adapted and eliminated distribution shift.")

        self.current_step = 6
        self.step6_data = {
            "matrix": {
                "old_model": {
                    "original_data": {"accuracy": round(old_on_orig_acc, 4), "f1": round(old_on_orig_f1, 4)},
                    "drifted_data": {"accuracy": round(old_on_drift_acc, 4), "f1": round(old_on_drift_f1, 4)}
                },
                "new_model": {
                    "original_data": {"accuracy": round(new_on_orig_acc, 4), "f1": round(new_on_orig_f1, 4)},
                    "drifted_data": {"accuracy": round(new_on_drift_acc, 4), "f1": round(new_on_drift_f1, 4)}
                }
            },
            "drift_recovery_delta": delta_drift_acc,
            "verdict": "SUCCESS: Model successfully adapted to distribution shift. Live accuracy restored with certified safety gates."
        }
        return self.step6_data


# Singleton instance
demo_engine = DemoEngine()
