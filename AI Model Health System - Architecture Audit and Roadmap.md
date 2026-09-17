# AI Model Health & Refinement System — Architectural Audit & Roadmap

*Prepared as the Part 28 deliverable: inspect → analyze → design → report. No implementation code is included in this document; it is the proposal to review before any coding begins.*

---

## How to read this document

- **Section B** is the ground-truth audit. Every claim in it was verified by reading the actual implementation (not inferred from filenames), and the highest-risk claims were verified by running the code. Where I ran a live test, I've marked it `[VERIFIED LIVE]`.
- **Sections D–V** describe the target system. They build strictly on what's already working — nothing here proposes throwing away the current codebase.
- **Part 29 prioritization (P0–P3)** is at the end, and is the actual order I'd implement in.

---

## A. Current Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React + Vite, hardcoded http://localhost:8000)           │
│  Navbar → 7 tabs, each an isolated form-driven view:                │
│  Pipeline | Intake | Health | Diagnosis | Refinement | Versions |   │
│  Inference                                                           │
│  — No tab lists or selects among registered models.                 │
│  — Every view has its own useState with a hardcoded default file    │
│    path (e.g. "models/baseline_model.pkl"). The user types paths.   │
└───────────────────────────────┬───────────────────────────────────┘
                                 │ fetch() — no auth, no model_id
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BACKEND — FastAPI monolith, single process (backend/app/main.py)   │
│  CORS: allow_origins=["*"]  |  No auth  |  No rate limiting          │
│                                                                       │
│  /api/intake ──────► intake.py ──► adapters/detector.py             │
│                                     adapters/sklearn_adapter.py      │
│                                     adapters/xgboost_adapter.py      │
│  /api/profile/* ───► profiler.py, model_profiler.py                 │
│  /api/compatibility ► compatibility.py                              │
│  /api/health/analyze ► health.py ──► drift.py                       │
│                                       prediction_drift.py            │
│                                       data_quality.py                │
│                                       health_status.py               │
│  /api/diagnosis ────► diagnosis.py ──► shap_explainer.py (optional) │
│  /api/refine ───────► refinement.py                                 │
│  /api/evaluate ─────► evaluation.py, promotion.py                   │
│  /api/versions/* ───► versioning.py ──► database.py                 │
│  /api/pipeline/run ─► pipeline.py  (chains ALL of the above)        │
│  /api/inference/predict ► loads active model directly, joblib       │
└───────────────────────────────┬───────────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STORAGE                                                              │
│  SQLite (model_health.db) — 5 tables: models, datasets, runs,       │
│    versions, alerts. `versions.is_active` is a SINGLE GLOBAL FLAG   │
│    — not scoped per model.                                          │
│  Filesystem: storage/models/, storage/datasets/,                    │
│    storage/models/versions/ — all keyed by ORIGINAL FILENAME,       │
│    no content hashing, no collision detection.                      │
└─────────────────────────────────────────────────────────────────────┘
```

**The one sentence that matters:** this is architecturally a **single-model system** wearing a monitoring-platform's clothing. Every table, every file path, every frontend view assumes there is exactly one model being watched at a time. That's not a criticism of code quality — the code that exists is generally clean and the happy path genuinely works — it's a statement about what has to change structurally to satisfy Part 4 of your brief (≥20 independent monitoring units).

---

## B. Current Implementation Audit

Legend: ✅ IMPLEMENTED CORRECTLY · 🟡 PARTIALLY IMPLEMENTED · ❌ INCORRECTLY IMPLEMENTED · ⬜ MISSING · 🧪 UNTESTED · 🔒 NOT GENERALIZED

### B.1 Intake & Model Adapters (Part 5)

| Requirement | Status | Evidence |
|---|---|---|
| Adapter interface (load/predict/predict_proba/feature names/type) | ✅ | `adapters/base.py` — clean ABC, both adapters implement it fully |
| sklearn adapter | ✅ | `sklearn_adapter.py` — handles Pipelines, raw estimators, missing `feature_names_in_` |
| XGBoost adapter | 🟡 | `xgboost_adapter.py` only handles sklearn-API `XGBClassifier`/`XGBRegressor` wrapped in joblib. A raw `xgboost.Booster` (the common case when someone trains via `xgb.train()`) has no `.predict_proba`, different `.predict()` semantics, and `detect_model_type` (`detector.py`) will misclassify or fail on it. Never tested against a real Booster. |
| Model type auto-detection | ✅ | `detector.py` correctly inspects `__module__` on Pipeline/estimator |
| Unsupported model → explicit rejection | ✅ `[VERIFIED LIVE]` | Fed a plain `dict` object saved via joblib; `detect_model_type` correctly raised `ValueError: Unsupported model type: <class 'dict'>` |
| Corrupted file → meaningful error | ❌ `[VERIFIED LIVE]` | Fed a non-pickle byte stream; got `IndexError: pop from empty list` from deep inside joblib's unpickler, which bubbles straight to the user via `HTTPException(400, str(e))`. This is a stack-trace leak, not a diagnosis — violates Part 30 rule 10. |
| Adapters used consistently by intake/compatibility/health/diagnosis | ❌ | Only `intake.py` and `model_profiler.py` go through the adapter layer. `compatibility.py`, `health.py`, `evaluation.py`, `shap_explainer.py`, and `main.py`'s inference endpoint all call `joblib.load()` directly and inspect `hasattr(model, "feature_names_in_")` themselves — the adapter abstraction exists but is bypassed by half the codebase, so adding a new model family (e.g. LightGBM) would require touching 6 files, not 1. |
| Extension points for LightGBM/CatBoost/ONNX/PyTorch/TF | ⬜ | No stubs, no registry pattern, no plugin loading. Adding a new library today means editing `detector.py`'s if/elif chain. |

### B.2 Dataset Profiling & Compatibility (Part 6)

| Requirement | Status | Evidence |
|---|---|---|
| Dataset stats: dtypes, missing %, unique counts, numeric summary | ✅ | `profiler.py` — solid, generic, not Telco-specific |
| Target/class distribution profiling | 🟡 | Only runs `if target_column and target_column in df.columns` — for regression targets it reports `value_counts()` as if categorical, which is meaningless for continuous targets |
| Model profiling (params, pipeline steps, feature names) | ✅ | `model_profiler.py` — reasonably thorough for sklearn-family models |
| Compatibility check (missing/extra features, dtype, dry-run predict) | ✅ `[VERIFIED LIVE]` | `compatibility.py` — ran the actual mismatch test from `test_end_to_end.py`; correctly caught missing `Contract`/`tenure` columns and correctly failed the dry-run prediction |
| Manual feature-mapping fallback | 🟡 | `feature_mapping` param exists in `check_compatibility()` and is wired through the API, but nothing in the frontend actually lets a user build a mapping — it's a backend-only capability today |
| dtype mismatch detection | ⬜ | Only checks feature *presence*, not dtype compatibility (e.g. a string column where the model expects numeric passes compatibility and fails later at predict time with a raw sklearn error) |
| Datetime/boolean feature awareness | ⬜ | `profiler.py` treats everything as either "numeric" or not; no dedicated boolean/datetime handling |

### B.3 Task-Aware Monitoring (Part 7)

| Requirement | Status | Evidence |
|---|---|---|
| Binary classification metrics (accuracy/F1/ROC-AUC/precision/recall/confusion matrix) | ✅ | `evaluation.py`, `health.py` — solid |
| Regression metrics (MAE/MSE/RMSE/R²/residuals) | ⬜ | Not implemented anywhere. `health.py`'s `evaluate_model()` hardcodes `f1_score`/`roc_auc_score`, which will raise or silently misbehave on a regression target |
| Multiclass metrics (macro/micro/weighted, per-class) | ⬜ | `f1_score(...)` is called without `average=`, which works for binary but raises `ValueError` on multiclass targets by default in scikit-learn |
| Recommendation/ranking metrics (P@K, NDCG, MAP) | ⬜ | No interface, no stub |
| Task type is ever explicitly recorded | ⬜ | Nowhere in the schema or code is there a `task_type` field. The system *assumes* binary classification with a positive class label `1` everywhere (`(predictions == 1).mean()` in `prediction_drift.py`, `probs[:, 1]` in `main.py`'s inference endpoint) |

### B.4 Drift System (Parts 8–9)

| Requirement | Status | Evidence |
|---|---|---|
| Feature/data drift detection | ✅ (fallback path) | `drift.py`'s scipy path (KS-test for numeric, total-variation-distance for categorical) is correct and runs cleanly |
| "Evidently for drift" (stated as core stack in your plan doc) | ❌ `[VERIFIED LIVE]` | Installed `evidently==0.7.21` fresh and ran `from evidently.report import Report` / `from evidently.metric_preset import DataDriftPreset` directly — both raise `ModuleNotFoundError`. The library's API changed since this code was written. The `try/except ImportError` in `drift.py` silently swallows this and falls back to scipy, with **zero warning surfaced anywhere** — not in logs, not in the API response, not in the UI. Anyone reading the health report today believes Evidently ran. It never does. |
| Prediction drift detection | ✅ | `prediction_drift.py` — KS-test + proportion-shift check, functional. Note: declares `EVIDENTLY_AVAILABLE` at import time but never references it in the function body — dead code, not just a broken fallback |
| Performance drift (requires labels) | 🟡 | `health.py` computes it, but... |
| Explicit LABELS_AVAILABLE / LABELS_DELAYED / LABELS_UNAVAILABLE states | ⬜ | `evaluate_model()` in `health.py` does `if target_column not in df.columns: raise ValueError(...)`. There is no unlabeled-data monitoring path at all — if you don't have labels yet (the normal production case), health analysis fails outright rather than degrading gracefully to drift-only monitoring. This directly contradicts Part 8. |
| Schema drift detection | 🟡 | `data_quality.py` catches unexpected/missing columns only when `expected_columns` is explicitly passed in, which nothing currently does automatically |
| Data quality drift (duplicates, constant columns) | ✅ | `data_quality.py` — clean, generic |
| **Expected vs. unexpected drift (seasonal/contextual baselines)** | ⬜ | **Completely absent — no code, no schema field, no data, no UI.** `scripts/generate_demo_data.py` only ever generates one fixed synthetic drift injection; there's no seasonal-baseline concept anywhere. This is flagged explicitly as a *core feature* in Part 9 of your brief and today it doesn't exist at all. |
| Concept drift vs. data drift distinction | 🟡 | The system never claims unlabeled concept drift (good — it doesn't overclaim), but it also never *detects* concept drift even when labels are available (e.g., comparing the reference-period residual/error pattern against the current-period one) — it only recomputes aggregate metrics, which is performance drift, not a relationship-change (X→y) analysis |

### B.5 Health Engine (Part 10)

| Requirement | Status | Evidence |
|---|---|---|
| Single overall health score + status | ✅ | `health_status.py` — deterministic, rule-based, reasonably transparent |
| Decomposed health (Performance/Data/Drift/Prediction/Schema) | ⬜ | Only one composite score exists. You cannot currently ask "is the *data* healthy but *performance* is fine" — it's one number with a list of reason-strings |
| UNKNOWN status when evidence is insufficient | ❌ | There is no UNKNOWN state in the codebase at all. `determine_health_status()` always returns HEALTHY/WARNING/CRITICAL, even when, e.g., a `roc_auc` fallback is silently set to `0.5` after an exception is swallowed (`health.py` line ~37: `try: roc_auc = roc_auc_score(...) except Exception: roc_auc = 0.5`) — a fabricated neutral value gets treated as real evidence and can flip health status. This is exactly the "false confidence over explicit uncertainty" failure mode Part 26 warns against. |
| Internally consistent severity | ❌ `[VERIFIED LIVE]` | In my end-to-end run, overall status came back **CRITICAL** (score 55/100) while every individual diagnosis item was labeled **WARNING** — the *combination* of several moderate issues additively crossed a CRITICAL score threshold, but no single diagnosis reflects that severity. A user reading the diagnosis list would reasonably be confused about why the top-line status says CRITICAL. |

### B.6 Diagnosis Engine (Part 11)

| Requirement | Status | Evidence |
|---|---|---|
| Raw metrics → structured, human-readable diagnosis objects | ✅ | `diagnosis.py` — each diagnosis has `issue`/`severity`/`affected_features`/`metric_value`/`explanation`/`recommended_action`. Good shape. |
| Distinguishes OBSERVATION / INTERPRETATION / RECOMMENDATION | 🟡 | The fields exist in spirit (`metric_value` = observation, `explanation` = interpretation, `recommended_action` = recommendation) but they're concatenated prose, not structurally separated or confidence-scored. No `confidence` field exists anywhere, despite your own example diagnosis format in Part 11 explicitly wanting one. |
| SHAP-based root cause explanation | ❌ | `shap_explainer.py` **never imports or calls the `shap` library at all** — it only ever uses `.feature_importances_` / `.coef_` on the raw estimator, then labels its own output `"method": "SHAP / Tree-based Importance"`. This is a misleading label on real functionality — the feature-importance chart itself works and is useful, but it is not SHAP and shouldn't claim to be, especially since SHAP would given proper per-prediction attribution rather than global importance. |
| Graceful degradation when SHAP unavailable | ✅ | The calling code (`diagnosis.py`) wraps the call in try/except and returns `shap: None` on failure — good defensive pattern, just pointed at non-SHAP code |
| `recommendations.py` module | ❌ | Fully dead code — not imported by `main.py` or `pipeline.py` anywhere. Even if wired up, its string-matching (`if issue == "Feature distribution drift"`) doesn't match the actual strings `diagnosis.py` produces (`"Input Feature Distribution Drift"`) or `data_quality.py`'s issue keys, so it would silently no-op even if connected. |

### B.7 Refinement Engine (Part 12)

| Requirement | Status | Evidence |
|---|---|---|
| Retraining on current data | ✅ | `refinement.py` — trains fresh pipelines from `train_path`/`test_path` |
| Hyperparameter tuning | ❌ | Your plan doc calls for "grid/random search over 2–3 hyperparameters." The actual code just hardcodes **one fixed hyperparameter set per algorithm** (RF at depth 12/250 trees, GBM at depth 5, XGBoost at depth 5) and calls that "Tuned" in the display name. No search loop exists — `GridSearchCV`/`RandomizedSearchCV` are never imported. |
| Data/feature fixes toolbox (imputation, class balancing, low-variance drop) | ✅ | `clean_and_prepare_data()` — genuinely does what it claims: drops constant columns, coerces mis-typed numeric strings, applies `class_weight="balanced"`/`scale_pos_weight` when imbalance is detected |
| Diagnosis → Strategy Selection → Candidate Generation (the actual causal chain your brief requires) | ❌ | The refinement engine **always trains the same fixed 2–3 candidates regardless of diagnosis**. There is no code path that reads `diagnosis_res["diagnoses"]` and selects a strategy — `pipeline.py` calls `refine_model()` unconditionally whenever `needs_refinement` is true, passing it nothing about *why*. This is the single most important structural gap relative to Part 12: the system currently does "detect problem → try everything," not "detect problem → diagnose → choose a targeted fix." |
| Every candidate has ID/parent/strategy/config/data/metrics/status | ❌ | Candidates are ephemeral in-memory dicts (`{"name", "pipeline", "metrics", "training_time_sec"}`) — never persisted to a table, no candidate ID, no parent-version linkage, no configuration snapshot. Only the *winning* candidate gets written to disk (always at the fixed path `storage/models/candidate_model.pkl` — see B.9). |
| Calibration where appropriate | ⬜ | Not implemented |

### B.8 Champion/Challenger & Promotion (Part 13)

| Requirement | Status | Evidence |
|---|---|---|
| Old-vs-new evaluation on held-out test set | ✅ `[VERIFIED LIVE]` | `evaluation.py`/`promotion.py` — ran cleanly, produced sensible F1/ROC-AUC deltas |
| Rule-based promote/reject decision | ✅ | `promotion.py` — a real, if simple, rule (F1 improvement ≥ 0.005 AND ROC-AUC doesn't regress by more than 0.01, or composite-score improvement) |
| Explicit CHAMPION/CHALLENGER/REJECTED/RETIRED/FAILED lifecycle states | ⬜ | No such enum or field exists. A version is either `is_active=1` or not — there's no distinction between "this challenger was evaluated and rejected" (worth keeping for audit) and "this was never even evaluated." Rejected candidates are simply discarded (the candidate file gets overwritten by the next refinement run). |
| Safety gates beyond the primary metric | 🟡 | The dry-run prediction check exists in `compatibility.py` (separate module, not invoked as part of promotion) and evaluation itself is a form of inference sanity check, but there's no explicit artifact-integrity check, no re-load-from-disk verification before promotion, no minimum-absolute-performance floor (only *relative* improvement is checked — a candidate could "win" by being less-bad while still being unacceptably poor in absolute terms) |
| AUTO / ASSISTED / MANUAL promotion modes | ❌ | Only AUTO exists, and it's not even configurable — `pipeline.py` promotes automatically whenever the rule in `promotion.py` says PROMOTE, with no human-approval step and no way to configure this behavior per model. This is precisely the "DRIFT → AUTOMATIC RETRAIN → AUTOMATIC DEPLOY" anti-pattern Part 2 explicitly tells you not to build, and it's what the pipeline does today. |

### B.9 Versioning, Rollback & Multi-Model Isolation (Parts 4, 13, 16, 17)

This is the most consequential part of the audit, so I've kept the evidence explicit.

| Requirement | Status | Evidence |
|---|---|---|
| Version history stored | ✅ | `VersionRecord` table, `list_versions()` |
| Original model preserved, never deleted | ✅ | Confirmed by code inspection — nothing calls `os.remove`/`unlink` on any registered model artifact anywhere in the backend |
| Rollback capability | 🟡 | `deploy_version(version_id)` works mechanically (`[VERIFIED LIVE]` in the smoke test), but it is *identical* to promotion — there's no separate "this was a rollback, triggered by degradation, from version X to version Y, because Z" audit record. It's just "set is_active=1 on this row," indistinguishable in the database from a normal promotion. |
| **Per-model version isolation (≥20 independent monitoring units)** | ❌ **Confirmed by direct code read, this is a structural design fact, not a bug**: `save_version()` in `database.py`, when `is_active=True`, runs `db.query(VersionRecord).update({VersionRecord.is_active: 0})` — an **unscoped UPDATE with no `WHERE model_id = ...` filter.** `activate_version()` does the same thing. There is exactly **one active-version slot in the entire system**, shared by every model ever registered. Promoting a candidate for "Model 7" would silently deactivate Models 1–6 and 8–20's active versions in the same call. |
| One model's failure doesn't crash the fleet | 🧪 UNTESTED — and moot | There's no fleet concept to test this against yet. `pipeline.py` does wrap most stages in try/except and logs partial failure via `stages[]`, which is a genuinely good pattern to build on — but since there's no per-model isolation, "the fleet" doesn't exist as a concept the system can reason about today. |
| Duplicate artifact detection (SHA-256 content identity) | ❌ **`[VERIFIED LIVE]`, reproduced actual data corruption**: I intook two *different* trained `RandomForestClassifier` models, both saved to a file named `model.pkl` (simulating two students independently uploading a same-named file — an entirely realistic scenario for the target university-student audience). Result: `intake.py`'s storage logic (`MODEL_STORAGE / model_filename`, i.e. keyed purely by original filename) silently overwrote the first model's bytes on disk with the second model's bytes. The database ended up with two `ModelRecord` rows (ids 3 and 4) both pointing at the same physical file. I then loaded the file via model-id-3's stored path and confirmed it returned model B's parameters, not model A's — **model A's identity was permanently and silently destroyed**, with no error, no warning, and no trace in the database that this happened. This is precisely the failure mode Part 18 names as a requirement to prevent, and it is fully reproducible today. |
| Refinement writes to a per-model-isolated path | ❌ | `refine_model()` in `refinement.py` always writes to the fixed path `storage/models/candidate_model.pkl`, regardless of which model triggered refinement. Two models "refining" back-to-back (or concurrently, once the app is multi-model) will overwrite each other's candidate artifact. Compounding this, `refine_model()`'s `train_path`/`test_path` are **not derived from the dataset that was actually intaken for a given model** — they default to the fixed global Telco `data/processed/train.csv`/`test.csv`. In a real multi-model scenario, refining "Model 2" (a different dataset entirely) would still train against Telco Churn data unless the caller remembers to override both paths correctly every time. |

### B.10 Fault Tolerance & Error Handling (Part 17)

| Requirement | Status | Evidence |
|---|---|---|
| Pipeline stages independently logged with status | ✅ | `pipeline.py`'s `log_stage()` pattern is genuinely good — every stage is wrapped in try/except and appended to a `stages[]` audit trail with timestamp and status |
| Corrupted model handled without crashing existing models | 🟡 | Handled for a *single* intake call (raises a clean-ish `HTTPException`), but see B.9 — there's no isolation boundary between models yet for this to meaningfully protect against cross-model impact |
| Meaningful errors instead of stack traces | ❌ `[VERIFIED LIVE]` | See the `IndexError: pop from empty list` finding in B.1 |
| Idempotent pipeline stages | 🟡 | Re-running intake with the same file is idempotent in the sense that it won't crash, but it creates a **new** `ModelRecord`/`DatasetRecord` row every time rather than recognizing "this is the same artifact I already have" — so "idempotent" in the sense of "no duplicate side effects" is not actually true |
| Database/storage failure handling | 🟡 | `health.py` wraps its `save_run`/`save_alert` calls in try/except and just `print()`s a warning on failure — better than crashing, but a failed DB write is silently invisible to the API caller; the health report still returns "success" even if it was never persisted |
| Prevent partial state corruption on refinement failure | 🟡 | If `refine_model()` raises inside `pipeline.py`'s refinement block, the exception is logged via `log_stage` and then **re-raised**, aborting the whole pipeline call. The champion is never touched before the candidate is validated (correct), but the caller gets a 500 with no partial results saved — an "all-or-nothing" failure mode rather than a documented partial-success state. |

### B.11 Security (Part 19)

| Requirement | Status | Evidence |
|---|---|---|
| Authentication/authorization | ⬜ | None. No login, no API keys, no session concept anywhere in `main.py`. |
| CORS restriction | ❌ | `allow_origins=["*"]`, `allow_credentials=True` — this combination is a known misconfiguration (browsers will reject credentialed wildcard-origin requests in practice, but the intent — "any origin can call this API" — is clearly not appropriate even for a prototype meant to be exposed to more than one grader/user). |
| Upload size limits | ⬜ | `UploadFile` is streamed to disk via `shutil.copyfileobj` with no size cap. |
| File type / extension validation | ⬜ | Any uploaded filename is accepted and joblib-loaded unconditionally — including non-`.pkl` extensions. |
| Path traversal prevention | 🟡 | Files are stored under `MODEL_STORAGE / model_file.filename` — `filename` comes directly from the client. FastAPI's `UploadFile.filename` is not automatically sanitized; a crafted filename like `../../etc/something` is a real (if narrow, since it's typically just the basename that survives multipart parsing in practice) risk surface that isn't explicitly guarded against in this code. |
| Untrusted pickle/joblib deserialization treated as unsafe | ❌ | Every model load path (`intake.py`, `compatibility.py`, `health.py`, `evaluation.py`, `main.py`'s inference endpoint, `shap_explainer.py`) calls `joblib.load()` directly and unconditionally on user-supplied files. `joblib.load`/`pickle.load` execute arbitrary code embedded in the file at deserialization time — this is a well-known, serious risk, and your brief explicitly flags it. Nothing in the current code acknowledges or mitigates this. |
| Safe error messages | ❌ | See B.1/B.10 — raw exception strings surface to the client |
| Audit logging | 🟡 | `pipeline.py`'s stage log is a good start, but it isn't persisted anywhere (it's returned in the API response and discarded), and no other endpoint (`/api/intake`, `/api/refine`, `/api/versions/{id}/activate`) logs *who* or *what* triggered the action |

### B.12 Frontend (Part 23)

| Requirement | Status | Evidence |
|---|---|---|
| Intake / Health / Diagnosis / Refinement / Version History screens | ✅ | All exist as functional React components (`IntakeView`, `HealthView`, `DiagnosisView`, `RefinementView`, `VersionsView`) — genuinely built, not stubs (2,457 total lines across components) |
| Fleet Dashboard | ⬜ | `App.jsx`'s dashboard summary (`/api/dashboard/summary`) reports counts (`models_count`, `datasets_count`, etc.) but there is no per-model breakdown anywhere — no list of "20 models with their individual health status" |
| Model Registry / Model Detail pages | ⬜ | `[VERIFIED]` — grepped every component for `model_id` usage: **zero matches** across all 8 components. `IntakeView` doesn't even call the existing `GET /api/models` endpoint to show what's registered. Every view operates on a hardcoded default file path the user can hand-edit in a text box, not a selection from a registry. |
| Champion/Challenger view | ⬜ | Not a distinct concept anywhere in the UI — `RefinementView` shows old-vs-new metrics from the most recent refinement call only |
| Alerts view | 🟡 | `VersionsView` fetches and displays `/api/alerts`, but there's no dedicated Alerts screen/tab, and no acknowledge/resolve workflow |
| Monitoring Runs history view | ⬜ | `RunRecord` exists in the DB and is queryable via `list_runs()`, but no frontend view lists historical runs |
| Inference Sandbox | ✅ | `InferenceView.jsx` (385 lines) — a genuinely built, reasonably thorough live-prediction UI |
| API base URL configurable | ❌ | `api.js` hardcodes `const API_BASE = "http://localhost:8000"` — no environment variable, will not work in any deployed environment without an edit |

### B.13 Testing (Part 24)

| Requirement | Status | Evidence |
|---|---|---|
| Per-module test scripts exist | 🟡 | 19 scripts under `scripts/test_*.py`. They're plain `assert`-based scripts run via `python scripts/test_x.py`, not `pytest`-discoverable tests (no `test_` function naming inside most, no fixtures, no CI wiring visible). Useful as smoke checks, not a real test suite. |
| `test_retraining.py` | ❌ `[VERIFIED]` | Imports `backend.app.retraining.train_candidate_model` — but `backend/app/retraining.py` line 1 is `from .refinement import refine_model, train_candidate_model if "train_candidate_model" in locals() else None`, which is **not valid Python** (confirmed via `ast.parse` — `SyntaxError: invalid syntax`). This module cannot be imported at all; its test cannot run; nothing in the running app imports it either, so this is dead, broken code sitting in the tree. |
| End-to-end test | ✅ `[VERIFIED LIVE]` | `scripts/test_end_to_end.py` — I ran this myself in a clean venv against the pinned `requirements.txt` versions (after fixing its encoding — see B.14) plus `evidently`/`shap`/`matplotlib` installed. It passes cleanly and exercises all 11 steps end-to-end on the Telco happy path. |
| Multi-model isolation tests (≥20 units) | ⬜ | None exist — there is no fleet concept to test yet (see B.9) |
| Drift scenario tests (seasonal/expected, delayed labels, concept drift) | ⬜ | None exist — matches the missing feature in B.4 |
| Failure-path tests (corrupt model, bad CSV, duplicate upload, DB failure) | ⬜ | None exist in the shipped test scripts; all my failure-path evidence above came from tests I wrote during this audit, not from the existing suite |

### B.14 Dependencies & Environment (supporting evidence for several items above)

| Item | Status | Evidence |
|---|---|---|
| `backend/requirements.txt` encoding | ❌ `[VERIFIED]` | `file` reports `Unicode text, UTF-16, little-endian text, with CRLF line terminators`. A plain `pip install -r backend/requirements.txt` fails on most standard tooling that expects UTF-8; I had to explicitly re-decode it as `utf-16` to install successfully. |
| `evidently`, `shap`, `matplotlib` missing from requirements | ❌ `[VERIFIED]` | None of the three appear in the pinned list despite being imported in `drift.py`, `shap_explainer.py` (unconditionally for `matplotlib`), and `prediction_drift.py`. A fresh clone following only `requirements.txt` will run, but silently lose drift-library and root-cause-chart functionality with no warning. |
| Core pipeline runs cleanly on pinned versions once deps are complete | ✅ `[VERIFIED LIVE]` | Confirmed via the full smoke-test run described above |

---

## C. Gap Analysis — Summary by Brief Section

| Part | Topic | Overall State |
|---|---|---|
| 4 | ≥20 independent monitoring units | **Not implemented.** Single global active-version slot; this is the #1 structural blocker. |
| 5 | Model adapter architecture | Solid foundation, inconsistently applied. Real work is *unifying* call sites, not rebuilding. |
| 6 | Dataset generalization | Mostly solid; missing dtype-compatibility and task-aware target profiling. |
| 7 | Task-aware monitoring | Binary-classification-only in practice; regression/multiclass/ranking are unimplemented, and the assumption is baked in deeply (`probs[:,1]`, unguarded `f1_score`). |
| 8 | Drift system, label-availability states | Feature/prediction drift real (via scipy fallback); Evidently claim is false; no unlabeled-monitoring path. |
| 9 | Expected vs. unexpected drift | **Entirely missing** — no code, no data, no schema field. |
| 10 | Health engine, UNKNOWN status | Single composite score only; no UNKNOWN state; internal severity inconsistency observed live. |
| 11 | Diagnosis engine | Good shape, real value; SHAP claim is false (unlabeled feature-importance); confidence field missing. |
| 12 | Refinement as candidate generation | Diagnosis→Strategy link **missing** — always trains the same fixed candidates regardless of what's wrong; "tuning" is fixed hyperparameters, not search. |
| 13 | Champion/Challenger lifecycle | Promotion logic real; lifecycle *states* (CHAMPION/CHALLENGER/REJECTED/RETIRED/FAILED) don't exist; only AUTO mode exists. |
| 14 | Safe deployment + rollback, AUTO/ASSISTED/MANUAL | Rollback mechanically works but isn't distinguished from promotion in the audit trail; no ASSISTED/MANUAL modes. |
| 15 | Continuous monitoring runs, immutability | Runs are persisted (`RunRecord`) but not exposed anywhere in the frontend; reasonably immutable in practice (nothing updates a run after creation). |
| 16 | Fleet monitoring | **Not implemented** — direct consequence of Part 4's gap. |
| 17 | Fault tolerance | Good bones in `pipeline.py`'s stage-logging pattern; real gaps in error messaging and duplicate-artifact corruption (reproduced live). |
| 18 | Duplicate artifact management (content hashing) | **Not implemented — reproduced actual data corruption live.** |
| 19 | Security | Essentially none of the "at minimum" list is implemented. Needs a full pass. |
| 20 | Multi-model Flipkart scenario (world-changed vs. model-broke) | Depends entirely on Part 9 (expected drift) and Part 4 (fleet) — both missing, so this scenario is currently unbuildable. |
| 21–22 | Observability & auditability | Partial — stage logs exist but aren't persisted or queryable after the fact. |
| 23 | Frontend | Five of fourteen listed screens exist in some form; zero of them are model-registry-aware. |
| 24 | Testing | Ad hoc smoke scripts, one broken by a syntax error; no pytest suite, no failure/fleet/drift-scenario coverage. |
| 25 | Research infrastructure | No metrics logging beyond raw run records; nothing computes drift-detection rate, false-alarm rate, refinement success rate, etc. |
| 26 | Fail-safe philosophy | Partially honored (original model never deleted) and partially violated (fabricated `roc_auc=0.5` fallback, no UNKNOWN state, fully automatic promotion). |
| 27 | Avoid over-abstraction | The existing codebase actually honors this well — it's a monolith, no premature microservices, no unnecessary infra. This is worth explicitly preserving. |


---

## D. Target Architecture

The target system keeps the same monolith shape — FastAPI + SQLite + React, one process, no message queue, no orchestrator — and makes exactly one structural addition: everything is organized around a first-class **Monitoring Unit** rather than a single implicit global model.

```
┌──────────────────────────────────────────────────────────────────────┐
│  FRONTEND — model-registry-aware React app                           │
│  Fleet Dashboard ──► Model Detail (per Monitoring Unit) ──►          │
│    Health | Drift | Diagnosis | Refinement | Champion/Challenger |   │
│    Version History | Rollback | Alerts | Monitoring Runs |           │
│    Inference Sandbox                                                  │
│  Every screen after the Fleet Dashboard is scoped to one unit_id.    │
└───────────────────────────────┬────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  BACKEND — same FastAPI monolith, reorganized around MonitoringUnit  │
│                                                                        │
│  intake/           adapter registry (sklearn/xgboost + extension     │
│                     points), content-hash-based artifact identity    │
│  profiling/         dataset + model profiler (unchanged logic,       │
│                     now task-aware)                                  │
│  compatibility/      unchanged logic + dtype checks                  │
│  monitoring/         per-unit monitoring run orchestration           │
│  drift/              feature/prediction/schema drift (scipy-first,   │
│                     evidently as an optional, verified enhancement)  │
│                     + baseline/expected-drift comparison             │
│  health/             decomposed health engine (5 sub-scores + UNKNOWN)│
│  diagnosis/          observation/interpretation/recommendation split │
│  refinement/          diagnosis-driven strategy selection →           │
│                     candidate generation → persisted candidates      │
│  promotion/          safety-gated champion/challenger lifecycle,     │
│                     AUTO/ASSISTED/MANUAL modes                       │
│  versioning/          per-unit version history + audit trail         │
│  fleet/               cross-unit aggregation, isolation boundary     │
└───────────────────────────────┬────────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  STORAGE                                                              │
│  SQLite — MonitoringUnit is the new spine table; every other table   │
│    (versions, runs, candidates, alerts, drift baselines) carries a   │
│    unit_id foreign key and every query that mutates state filters    │
│    by it.                                                             │
│  Filesystem — content-addressed: storage/artifacts/<sha256>.pkl,     │
│    never overwritten; a unit's "current model" is a DB pointer to a  │
│    hash, not a mutable filename.                                     │
└──────────────────────────────────────────────────────────────────────┘
```

This is a reorganization, not a rewrite. `drift.py`, `data_quality.py`, `evaluation.py`, `promotion.py`'s core decision rule, and the adapter classes are all logic worth keeping close to as-is — they get a `unit_id` threaded through them and, in a few cases, a task-type branch. The genuinely new work is: the `MonitoringUnit` entity and everything that currently silently assumes there's only one of it; content-addressed storage; the diagnosis→strategy link in refinement; the decomposed health engine; and the security basics.

---

## E. Domain Model / Entity Relationships

```
MonitoringUnit  (NEW — the spine of the system)
 ├── id, name, task_type [classification|multiclass|regression|ranking]
 ├── owner_label (free text — no real auth yet, but a display name so
 │     20 units on one screen aren't anonymous)
 ├── promotion_mode [AUTO|ASSISTED|MANUAL]
 ├── target_column, positive_class (nullable — only meaningful for
 │     binary classification; task adapters interpret this per task)
 ├── created_at
 │
 ├──1:N── ModelArtifact        (content-addressed: sha256, file_path,
 │                               model_family, uploaded_at — an artifact
 │                               is immutable once stored; NEVER
 │                               overwritten, NEVER deleted)
 │
 ├──1:N── DatasetArtifact      (content-addressed: sha256, file_path,
 │                               row_count, schema snapshot (column
 │                               names+dtypes as JSON), uploaded_at)
 │
 ├──1:N── ModelVersion          (unit_id FK — THIS is what fixes the
 │         ├─ champion/challenger  global-active-flag bug: is_active is
 │         │   lifecycle_state     now scoped, "activate" always filters
 │         ├─ artifact_id (FK)     WHERE unit_id = X)
 │         ├─ parent_version_id (nullable — lineage: which version was
 │         │   this refined/rolled-back from)
 │         ├─ metrics snapshot (JSON, task-appropriate keys)
 │         └─ is_active (bool, unique-per-unit constraint enforced at
 │             the query layer)
 │
 ├──1:N── ReferenceBaseline    (unit_id FK — a named, dated snapshot of
 │                               "normal" — supports Part 9's seasonal/
 │                               contextual baselines: e.g.
 │                               "winter-2025", "pre-promo-baseline";
 │                               one is flagged is_default)
 │
 ├──1:N── MonitoringRun        (unit_id FK, dataset_artifact_id FK,
 │         │                    baseline_id FK, immutable once written)
 │         ├─ labels_status [AVAILABLE|DELAYED|UNAVAILABLE]
 │         ├─ health snapshot (5 sub-scores + overall, JSON)
 │         ├─ drift snapshot (JSON)
 │         └─ drift_classification [EXPECTED|UNEXPECTED|null]
 │
 ├──1:N── Diagnosis             (run_id FK — one run can yield several
 │                               diagnosis objects, each with
 │                               observation/interpretation/
 │                               recommendation/confidence fields)
 │
 ├──1:N── RefinementJob        (unit_id FK, triggered_by_run_id FK,
 │         │                    triggered_by_diagnosis_ids (JSON list))
 │         └──1:N── Candidate   (job_id FK, strategy_used, config JSON,
 │                               artifact_id FK once trained, metrics
 │                               JSON, status
 │                               [TRAINED|EVALUATED|PROMOTED|REJECTED|
 │                               FAILED])
 │
 ├──1:N── Alert                (unit_id FK, severity, message,
 │                               source_run_id FK, acknowledged bool)
 │
 └──1:N── AuditEvent           (unit_id FK, event_type
                                 [PROMOTION|ROLLBACK|REJECTION|
                                 REFINEMENT_SKIPPED|REFINEMENT_TRIGGERED],
                                 reason (free text, always populated —
                                 this is what makes Part 22's "why did X
                                 happen" reconstructable after the fact)
                                 before_version_id, after_version_id,
                                 triggered_by [SYSTEM|USER], timestamp)
```

**Why `AuditEvent` is a separate table from the stage-log pattern already in `pipeline.py`:** the existing `log_stage()` pattern is good but ephemeral — it's built, returned in one API response, and discarded. `AuditEvent` persists the same spirit of record but durably, per-unit, queryable later. This directly answers Part 22's list of "why did X happen" questions without requiring you to have been watching the API response in real time when it happened.

**Why a separate `Candidate` table instead of just more `ModelVersion` rows:** most candidates lose. Your brief (Part 12/13) wants every attempt recorded, including rejected ones, without cluttering the version history that's meant to represent "things that were, at some point, live." Keeping candidates in their own table with their own status makes "show me every refinement attempt for Model 7, including the ones that failed" a straightforward query, and keeps `ModelVersion` meaning "this was, or is, deployed."

---

## F. Database Schema Changes

**Principle: additive first, destructive second.** Every existing table (`models`, `datasets`, `runs`, `versions`, `alerts`) gets a nullable `unit_id` column added in an early migration so nothing breaks immediately; a later migration backfills a single default `MonitoringUnit` (so the currently-shipped `model_health.db`'s 9 models / 9 datasets / 12 runs / 4 versions / 48 alerts aren't discarded, just adopted under "Unit 1: Telco Baseline"), and only after that is `unit_id` made `NOT NULL` with a foreign key and the unscoped `UPDATE` in `save_version`/`activate_version` is replaced with a `WHERE unit_id = :unit_id` filter.

| Change | Why | Risk | Test |
|---|---|---|---|
| New `monitoring_units` table | Spine of the whole redesign (Section E) | Low — purely additive | Unit CRUD round-trip |
| Add `unit_id` FK to `models`, `datasets`, `versions`, `runs`, `alerts` | Scopes every existing table to a unit without renaming or restructuring them | Medium — every `save_*`/`list_*`/`activate_*` function in `database.py` needs its `WHERE` clause updated | For each: create 2 units, verify unit A's writes never appear in unit B's reads |
| Rename `file_path` columns' *meaning* (not name) to point at content-addressed paths | Fixes the duplicate-overwrite bug reproduced live in B.9 | Medium — every direct `joblib.load(record.file_path)` call site keeps working unchanged, since it's still just a path string; the only change is *how the path is chosen* at write time | Reproduce the exact "two different models, same original filename" test from the audit; assert both remain independently loadable afterward |
| New `candidates` table | Persist refinement attempts, including rejected ones (Part 12) | Low — additive | Refine a unit twice; verify both attempts appear with correct status |
| New `reference_baselines` table | Enables Part 9 (seasonal/contextual expected-drift baselines) | Low — additive; `runs.baseline_id` becomes nullable-FK, defaults to the unit's `is_default` baseline if unspecified | Register two baselines for one unit, run monitoring against each explicitly |
| New `audit_events` table | Durable answer to Part 22's "why" questions | Low — additive | Trigger a promotion and a rollback; verify both produce queryable, reason-populated rows |
| `versions.is_active` uniqueness — enforce "at most one active version per unit" | This is the actual fix for the global-flag bug | Medium — needs either an app-level transaction (deactivate-then-activate, both scoped by `unit_id`, in one commit) or a partial unique index (`SQLite` supports `CREATE UNIQUE INDEX ... WHERE is_active = 1`, but only per full-table, not per-group, unless you combine it with `unit_id` in a composite partial index — `CREATE UNIQUE INDEX ux_active_per_unit ON versions(unit_id) WHERE is_active = 1` is the right SQLite pattern) | Directly re-run the audit's reproduction test: promote Model A, assert Model B's active version is untouched |
| `runs.labels_status` column | Enables the AVAILABLE/DELAYED/UNAVAILABLE distinction from Part 8 | Low — additive, defaults to `AVAILABLE` for backward compatibility with existing rows | Run monitoring with no target column present; verify it now succeeds with `labels_status=UNAVAILABLE` and a drift-only report, instead of raising as it does today |
| `units.task_type` column | Foundation for task-adapter routing (Section I) | Low — defaults to `binary_classification` for the backfilled default unit | Register a regression model; verify `task_type` round-trips and routes to regression metrics |


---

## G. API Changes

**Principle: add `unit_id`-scoped routes; don't break the existing ones immediately.** The current routes (`/api/intake`, `/api/health/analyze`, etc.) keep working during migration by defaulting to the backfilled "Unit 1," so the existing frontend doesn't hard-break mid-migration. New routes are added alongside, and old ones are deprecated once the frontend is updated (Section S).

| New/changed route | Purpose | Replaces / extends |
|---|---|---|
| `GET /api/units` | List all monitoring units with a fleet-summary row each (health, active version, last run) | New — this is what makes a Fleet Dashboard possible |
| `POST /api/units` | Register a new monitoring unit (name, task_type, promotion_mode) | New |
| `GET /api/units/{unit_id}` | Full detail for one unit | New |
| `POST /api/units/{unit_id}/intake` | Intake a model+dataset *into a specific unit* | Extends `/api/intake`, which becomes a thin wrapper that requires/creates a unit |
| `POST /api/units/{unit_id}/monitor` | Run a monitoring run against a named baseline (defaults to the unit's default baseline) | Extends `/api/health/analyze`, adds `labels_status` handling and baseline selection |
| `GET /api/units/{unit_id}/runs` | Monitoring run history for one unit | New — currently `list_runs()` exists but isn't unit-scoped or exposed to the frontend |
| `POST /api/units/{unit_id}/diagnose` | Diagnose the latest (or a specified) run | Extends `/api/diagnosis` |
| `POST /api/units/{unit_id}/refine` | Trigger refinement — now takes the diagnosis result as an *input*, not a side observation, so strategy selection can actually use it | Extends `/api/refine` |
| `GET /api/units/{unit_id}/candidates` | List all refinement candidates (including rejected/failed) for a unit | New |
| `POST /api/units/{unit_id}/candidates/{candidate_id}/promote` | Explicit promotion action — required even in AUTO mode, so there's always one code path that writes an `AuditEvent`, rather than promotion happening as a side effect buried inside the pipeline function | Extends the promotion logic currently inlined in `pipeline.py` |
| `POST /api/units/{unit_id}/rollback` | Explicit rollback to a specified prior version — separate endpoint from "activate," so it's distinguishable in the audit trail (see F) | New — currently rollback and promotion both call the same `deploy_version` |
| `GET /api/units/{unit_id}/audit` | Full audit trail for a unit | New |
| `POST /api/units/{unit_id}/baselines` | Register a named reference baseline (e.g. "winter-2025") | New — supports Part 9 |
| `GET /api/fleet/summary` | Cross-unit aggregation (counts by health status, models needing action, recent events) | Extends `/api/dashboard/summary`, which today reports only global counts with no per-unit breakdown |
| `POST /api/units/{unit_id}/pipeline/run` | The orchestration endpoint, now unit-scoped and respecting `promotion_mode` (AUTO auto-promotes through the new promote endpoint; ASSISTED stops after generating candidates and returns them for review; MANUAL stops after diagnosis) | Replaces `/api/pipeline/run`'s unconditional auto-promote behavior — this is the direct fix for the "automatic drift→retrain→deploy" anti-pattern found in B.8 |

Existing routes that stay essentially as-is: `/api/profile/dataset`, `/api/profile/model`, `/api/compatibility`, `/api/inference/predict` (gains an optional `unit_id` param to pick which unit's active model to use, defaulting to a single-unit mode for backward compatibility).

---

## H. Model Adapter Architecture

The `ModelAdapter` ABC (`adapters/base.py`) is well-designed and stays as the interface. Two changes:

1. **Every call site goes through the adapter, with no exceptions.** Today `compatibility.py`, `health.py`, `evaluation.py`, `shap_explainer.py`, and the inference endpoint in `main.py` all call `joblib.load()` and `hasattr()` directly, bypassing the adapter (B.1). The fix is mechanical, not architectural: each of those modules takes a loaded `ModelAdapter` instance (or a `model_family` string to construct one) instead of a raw path, and calls `.predict()`/`.predict_proba()`/`.get_feature_names()` through it. This is what makes adding a new model family a one-file change instead of a six-file change.

2. **A small adapter registry replaces the if/elif chain in `detector.py`.** A `ADAPTER_REGISTRY: dict[str, Type[ModelAdapter]]` with a `register_adapter()` function lets `sklearn`/`xgboost` register themselves, and a future `lightgbm`/`catboost`/`onnx` adapter registers itself the same way — `detector.py`'s job becomes "inspect the loaded object, return the matching registry key, or explicitly raise `UnsupportedModelError` with the module name in the message" (fixing the `IndexError: pop from empty list` UX problem from B.1 at the same time, by catching `joblib`'s low-level exceptions and re-raising as a clean `CorruptArtifactError`).

Each adapter additionally exposes a `capabilities()` method returning what it can and can't do — e.g. `{"predict_proba": True, "feature_importance": True, "task_types": ["binary_classification", "multiclass"]}` — so the rest of the system (health engine, diagnosis, refinement) can check *before* calling something rather than catching an `AttributeError` after the fact. This is the direct mechanism for Part 5's "Information unavailable" requirement: if `capabilities()["feature_importance"]` is `False`, the diagnosis engine reports "feature importance unavailable for this model type" instead of silently returning a uniform-importance fallback the way `shap_explainer.py` does today.

**XGBoost gap to close (from B.1):** add explicit `xgboost.Booster` support (not just the sklearn-API wrapper) to `XGBoostAdapter`, since `xgb.train()` — a very common path for anyone following an XGBoost tutorial — produces a `Booster`, not an `XGBClassifier`, and today's adapter and detector don't handle it.

**Extension points prepared but not built in the first pass:** LightGBM and CatBoost adapters are close to mechanical (same `sklearn`-API shape as XGBoost's wrapped estimator) and are P2 work once the registry pattern exists. ONNX, PyTorch, and TensorFlow adapters are a materially different shape (no `.predict_proba` convention, different serialization, often no `feature_names_in_` at all) and are P3 — the registry pattern is what makes adding them *possible* without a rewrite, not something this phase needs to build.

---

## I. Task Adapter Architecture

Today the system has no `task_type` concept at all — it's binary classification everywhere, implicitly, with `probs[:, 1]` and unguarded `f1_score()` calls scattered across `health.py`, `prediction_drift.py`, and `main.py`. The fix is a second, orthogonal adapter axis: a `TaskAdapter` per task type, selected by the unit's `task_type` field (Section E), independent of which `ModelAdapter` (sklearn/XGBoost/etc.) is in play.

```
TaskAdapter (ABC)
 ├── compute_metrics(y_true, y_pred, y_proba=None) -> dict
 ├── compute_residual_analysis(y_true, y_pred) -> dict | None   # regression only
 ├── extract_positive_class_rate(y_pred) -> float | None        # binary only
 ├── validate_target(y) -> list[str]                            # e.g. "target
 │                                                                 has >50 unique
 │                                                                 values, did you
 │                                                                 mean regression?"
 └── task_name -> str
```

| Adapter | Metrics it computes | Priority |
|---|---|---|
| `BinaryClassificationTaskAdapter` | accuracy, precision, recall, F1, ROC-AUC, PR-AUC, confusion matrix, positive-class prediction rate | P0 — this is what already exists in the codebase; formalizing it into an adapter is mostly extraction, not new logic |
| `MulticlassClassificationTaskAdapter` | per-class precision/recall/F1, macro/micro/weighted F1, confusion matrix, per-class drift in the prediction-drift module | P1 — directly fixes the `f1_score()` crash-on-multiclass gap in B.3 |
| `RegressionTaskAdapter` | MAE, MSE, RMSE, R², residual distribution, target-drift (vs. prediction-drift), residual-vs-feature correlation for basic leakage-adjacent checks | P1 — currently entirely absent |
| `RankingTaskAdapter` | Precision@K, Recall@K, NDCG, MAP, CTR/conversion where a business-outcome label exists | P3 — your brief is explicit that this should be an interface, not a fully-built feature, in this phase. Build the abstract shape and one worked example (e.g. Precision@K) so the extension point is real, not aspirational; don't build the full ranking evaluation suite now. |

The health engine, diagnosis engine, and drift modules call `task_adapter.compute_metrics(...)` instead of hardcoding `f1_score`/`roc_auc_score`. This is the single change that lets `health_status.py`'s thresholds (currently hardcoded to F1/ROC-AUC) become task-aware — regression health checks against R²/RMSE-degradation instead, using the same "score, reasons, status" shape it already returns today.


---

## J. Monitoring Architecture

A `MonitoringRun` becomes the persisted, immutable unit of work Part 15 asks for — it's close to what `RunRecord` already is, widened to carry `unit_id`, `baseline_id`, and `labels_status`, and to store the *decomposed* health snapshot (Section on the health engine, below) rather than one score.

```
Reference/Baseline (named, e.g. "default" or "winter-2025")
        +
Current Batch (a DatasetArtifact)
        ↓
   [ label check ]  → sets labels_status: AVAILABLE | DELAYED | UNAVAILABLE
        ↓
   [ feature drift ]  (always runs — doesn't need labels)
   [ prediction drift ]  (always runs — doesn't need labels)
   [ data quality / schema check ]  (always runs)
   [ performance evaluation ]  (only runs if labels_status == AVAILABLE)
        ↓
   [ drift classification: EXPECTED vs UNEXPECTED ]  (Section K)
        ↓
   [ health engine ]  → 5 sub-scores + overall + UNKNOWN where evidence
                         is missing (Section on health engine)
        ↓
   MonitoringRun row written (immutable — no run is ever mutated after
   creation; a "re-run" is a new row, not an update)
        ↓
   [ diagnosis ] (Section L) — reads the run, doesn't mutate it
```

The key behavioral change from today's `health.py`, which raises an exception outright if the target column is missing from the current batch: **a monitoring run always completes** — it just completes with `labels_status=UNAVAILABLE` and a null performance section, rather than failing. This is what makes Scenario 9 in your brief (delayed labels) representable at all: a later run, once labels arrive for a previously-unlabeled batch, can be recorded as a distinct run referencing the same dataset artifact with `labels_status=AVAILABLE`, and the diagnosis engine can then look back and say "performance on the batch from three weeks ago is now known, and it's degraded" — which requires the run history to already contain the earlier unlabeled run to compare against.

---

## K. Drift Architecture

Three concrete changes on top of what already works (`drift.py`'s scipy KS-test/TVD implementation is correct and stays as the primary path):

**1. Stop silently pretending Evidently ran.** Given the audit finding that `evidently==0.7.21`'s API no longer matches this code's imports, there are two honest options: (a) update the Evidently integration to the current API surface (`evidently.presets`/whatever 0.7.x actually exposes) and add an integration test that fails loudly if the import breaks again, or (b) drop the Evidently dependency and document that drift detection is scipy-based KS-test/TVD, which is a legitimate, well-understood, explainable method that doesn't need a heavyweight library to justify itself. Given Part 27's "don't over-abstract, don't add dependencies you don't need" instruction, **(b) is the recommendation** — the scipy path already does the job, is simpler to reason about and test, and removing the dependency removes a whole class of "silently broken because a third-party API moved" risk. If Evidently's richer report visualizations are wanted later for the frontend, that's a P2/P3 add-on, not a drift-detection dependency.

**2. Fix the dead `EVIDENTLY_AVAILABLE` flag in `prediction_drift.py`.** Either wire it to something real or remove the unused import block — currently it's declared and never read, which is confusing dead code, not a functioning fallback.

**3. Add drift classification: EXPECTED vs. UNEXPECTED (Part 9).** This is genuinely new capability, and per your brief's own caution, it should stay simple:

```
DriftClassifier.classify(current_drift_result, unit, baseline_used) -> {
    classification: EXPECTED | UNEXPECTED | UNCLASSIFIED,
    reason: str
}
```

The classification rule, in order:
- If the unit has a `ReferenceBaseline` explicitly tagged for the current time window (e.g. a baseline named "winter" with a `valid_from`/`valid_to` date range, or a user-set "expected drift window" flag), and the current batch's drift pattern was measured *against that seasonal baseline* rather than the default one and comes back low/no-drift → **EXPECTED**, with reason "matches the {baseline_name} baseline for this period."
- If a user has explicitly annotated a past drift event as expected (a simple "mark as expected" action in the UI, stored as a flag on the `MonitoringRun`), and the current drift's *feature-level shape* (which features drifted, roughly how much) closely matches that annotated precedent → **EXPECTED**, with reason referencing the prior annotated run.
- Otherwise → **UNEXPECTED**, with reason "no matching historical or seasonal baseline found for this pattern," which is an honest UNCLASSIFIED-leaning-cautious default, not a confident claim.

This deliberately does **not** attempt automatic seasonality detection, forecasting, or unsupervised pattern-matching across arbitrary time windows — that would be the "unnecessarily complex forecasting system" your brief explicitly says not to build. It's baseline *comparison*, driven by baselines a human registered (or a past run a human annotated), which is a modest, honest, and buildable version of "context-aware model health."

**4. Add dtype-aware / schema-drift detection as a distinct category** from feature-value drift, reusing `data_quality.py`'s existing unexpected/missing-column logic but running it automatically on every monitoring run (today it only runs if `expected_columns` is explicitly passed, which nothing currently does).

---

## L. Diagnosis Architecture

`diagnosis.py`'s existing shape (issue/severity/affected_features/metric_value/explanation/recommended_action) is genuinely good and mostly stays. Three additions:

1. **Structurally separate observation from interpretation from recommendation**, per Part 11, rather than blending them into one `explanation` string. Concretely: `evidence: dict` (the raw numbers — e.g. `{"feature": "MonthlyCharges", "psi": 0.34, "threshold": 0.25}`), `interpretation: str` (the plain-English "what this probably means"), `confidence: LOW|MEDIUM|HIGH` (driven by how much evidence supports the interpretation — e.g. a single-batch drift observation is MEDIUM confidence; a pattern confirmed across 3+ consecutive runs is HIGH), and `recommended_action: str` stays as-is.

2. **Wire diagnosis output into `RefinementJob.triggered_by_diagnosis_ids`** (Section E) — this is the mechanical fix for Part 12's central gap. Today refinement runs blind; the fix is simply passing the diagnosis list into the refinement trigger and having the strategy-selection step (Section M) read it.

3. **Rename the SHAP module honestly.** Keep the existing feature-importance-bar-chart functionality (it's useful) but rename it to `feature_importance.py` / `"method": "tree-based feature importance"` rather than claiming SHAP. If true SHAP support is wanted, add it as a genuinely new, optional capability (`shap.TreeExplainer` for tree models, gated behind `ModelAdapter.capabilities()["shap_supported"]`, gracefully absent otherwise) — that's a real P2 addition, separate from fixing the current mislabeling, which is a P0/P1 correctness fix regardless of whether real SHAP is added.

4. **Fix `recommendations.py` or remove it.** Given it's currently fully dead and its matching logic doesn't align with `diagnosis.py`'s actual output strings, the cheaper and more honest fix is folding its recommendation-generation intent directly into the `Diagnosis.recommended_action` field (which already exists and is populated per-diagnosis) and deleting the orphaned module, rather than trying to resurrect a second, parallel recommendation layer that duplicates what diagnosis already produces.


---

## M. Refinement Architecture

This is where the largest *behavioral* change happens, even though the underlying training code (`clean_and_prepare_data`, `build_preprocessor`, `train_and_evaluate_candidate`) is solid and mostly stays as-is.

**Today:** `refine_model()` always trains the same fixed set of 2–3 algorithms with fixed hyperparameters, regardless of what's wrong, and always writes to one shared path.

**Target:**

```
Diagnosis (list of Diagnosis objects, each with an `issue` category)
        ↓
   [ Strategy Selector ]
        ↓
A small rule table maps diagnosis categories to candidate strategies:

  feature_drift          → retrain on current data (existing candidates)
  low_f1 / low_roc_auc    → hyperparameter search (NEW — see below) +
                            class balancing if imbalance also flagged
  data_quality:missing    → imputation strategy variants
  data_quality:constant   → low-variance column removal (already exists
                            in clean_and_prepare_data — just needs to be
                            triggered *because* this diagnosis fired,
                            not unconditionally every time)
  prediction_drift        → calibration / threshold review (flagged as
                            a candidate strategy; full calibration
                            implementation is P2)
        ↓
   [ Candidate Generation ] — only the strategies actually implicated
   by the diagnosis are attempted, not all of them every time. This is
   the direct fix for "the system tries everything regardless of what's
   wrong."
        ↓
   Each candidate is persisted to the `candidates` table (Section E)
   with its artifact written to content-addressed storage — never to
   a shared fixed filename — before evaluation, so a refinement job for
   Unit 7 can never collide with one for Unit 12.
        ↓
   [ Candidate Evaluation ] (Section N)
```

**Hyperparameter tuning gap (from B.7):** add a small, bounded `RandomizedSearchCV` (3–5 iterations, 2–3 parameters, e.g. `n_estimators`, `max_depth`, `min_samples_leaf` for tree models) as one of the available strategies, rather than the current fixed-hyperparameter "Tuned" naming that doesn't actually search anything. Keep it bounded and fast — this is a lightweight platform for students and small teams, not a production hyperparameter-optimization service; an exhaustive grid search would violate Part 27's "don't over-engineer" instruction as much as skipping tuning entirely would violate Part 12's actual requirement.

**Data provenance fix (from B.9):** `RefinementJob` always trains against the specific `DatasetArtifact` that triggered it (traceable via the `unit_id` → most recent intake, or an explicitly passed dataset), never a global fixed path. This is what makes multi-model refinement safe to run concurrently.

---

## N. Champion/Challenger Lifecycle

```
        CHAMPION (the currently active ModelVersion for a unit)
            │
            │  refinement triggered (by diagnosis, or manually)
            ▼
     CHALLENGER (Candidate, status=TRAINED)
            │
            │  evaluated on the unit's held-out test data
            ▼
    ┌───────┴────────┐
    │  Safety Gates   │
    │  1. Loads/deserializes cleanly (artifact integrity)          │
    │  2. Dry-run prediction on a small sample succeeds             │
    │     (reuses compatibility.py's existing dry-run logic)        │
    │  3. Primary metric improves by the configured minimum         │
    │     (reuses promotion.py's existing rule)                     │
    │  4. No secondary metric regresses beyond its configured        │
    │     tolerance (reuses promotion.py's ROC-AUC-non-regression    │
    │     check, generalized to whichever secondary metrics the     │
    │     unit's task adapter defines)                               │
    │  5. Absolute minimum-performance floor is met (NEW — today     │
    │     only *relative* improvement is checked; a candidate that   │
    │     is merely "less bad" than an already-terrible champion     │
    │     could pass today's rule)                                   │
    └───────┬────────┘
            │
     ┌──────┴───────┐
     │ ALL PASS      │ ANY FAIL
     ▼               ▼
 status=EVALUATED  status=REJECTED
     │               (AuditEvent: REJECTION, reason = which gate(s)
     │                failed and by how much — champion is never
     │                touched)
     ▼
promotion_mode check:
  AUTO      → promote immediately, write AuditEvent: PROMOTION
  ASSISTED  → status stays EVALUATED, surfaced in the UI as
              "awaiting approval," human calls the promote endpoint
  MANUAL    → status stays EVALUATED, recommendation only, human
              decides whether to even look at promoting
            │
            ▼ (if promoted)
     new CHAMPION, old CHAMPION → lifecycle_state=RETIRED (not deleted
     — its ModelVersion row and artifact remain, rollback-able)
```

If a later champion degrades (Scenario 6 in your brief), rollback is a distinct action (`POST /units/{id}/rollback`, Section G) that sets the target prior version back to `is_active=1` (scoped, per the fixed schema in Section F) and writes an `AuditEvent: ROLLBACK` with a reason — distinguishing it in the audit trail from an ordinary promotion, which today's `deploy_version()` cannot do since it's the same function for both.

---

## O. Fault-Tolerance Strategy

The existing `pipeline.py` stage-logging pattern (try/except per stage, append to a `stages[]` list, continue where safe / re-raise where not) is genuinely good and is the pattern to extend, not replace. Concrete additions:

- **Persist the stage log as `AuditEvent`/run metadata** instead of only returning it in the API response, so a failed pipeline run three days ago is still inspectable.
- **Clean, typed exceptions at the boundary.** Introduce a small exception hierarchy (`UnsupportedModelError`, `CorruptArtifactError`, `SchemaMismatchError`, `InsufficientEvidenceError`) raised by the lower layers, caught once at the API boundary, and mapped to a `{error_code, message, detail}` response — replacing the current pattern of raw exception strings (like the reproduced `IndexError: pop from empty list`) reaching the client.
- **Per-unit isolation is now structural, not just aspirational**, once every mutating query is scoped by `unit_id` (Section F) — a crash while refining Unit 7 cannot touch Unit 1–6/8–20's rows because there's no code path that writes outside its own `unit_id` anymore. This is the direct fix for Part 4's "one model's failure must not crash the fleet," and it should be tested exactly as your brief's Part 24 describes: register 20 units, force a failure in one, assert the other 19 are unaffected.
- **Idempotent intake.** Content-hashing (Section R) makes re-uploading the same artifact a no-op that returns the existing record instead of creating a duplicate row — this is what makes intake actually idempotent, not just "won't crash."
- **No fabricated fallback values.** The `except Exception: roc_auc = 0.5` pattern found in `health.py` gets replaced with "this metric is UNKNOWN for this run" rather than a plausible-looking neutral number that can silently influence a health-status decision. This is a direct implementation of Part 26's "explicit uncertainty over false confidence."

---

## P. Security Strategy

Scoped realistically for the intended audience (students/researchers/small teams on a single machine or small deployment), per Part 19's "reasonable real-world prototype security," not enterprise IAM:

| Item | Approach | Why this level |
|---|---|---|
| Authentication | A single shared API-key/bearer-token check (one env-configured secret), not full multi-user accounts | Matches Part 27's "don't over-engineer" — this isn't a multi-tenant SaaS, it's a lab tool that shouldn't be wide open on a network |
| CORS | Restrict `allow_origins` to an explicit configured list (default `http://localhost:5173`/whatever the dev frontend port is), drop the `["*"]` + `allow_credentials=True` combination entirely | Direct fix for a confirmed misconfiguration (B.11) |
| Upload limits | Enforce a configurable max file size (e.g. 200MB default) at the FastAPI layer before streaming to disk | Prevents trivial disk-exhaustion from an oversized upload |
| File type validation | Restrict accepted model files to `.pkl`/`.joblib` extensions and validate the magic bytes look like a pickle stream before attempting to load | Cheap first filter; doesn't replace the deserialization-risk mitigation below |
| Filename/path handling | Never use the client-supplied filename as a storage path component — content-addressed storage (Section R) makes this moot by construction, since the stored filename is always `sha256.pkl`, not anything client-controlled | Eliminates the path-traversal surface entirely, rather than trying to sanitize it |
| **Untrusted deserialization** | Document plainly, in the UI itself (not just this report), that uploaded model files are executed code at load time and should only come from sources the user trusts — this system cannot make arbitrary third-party pickle files safe to load. Where feasible, load uploaded artifacts in a **separate subprocess** with a timeout and restricted permissions (not a full sandbox/container — that would be over-engineering for this scope — but enough that a malformed or malicious file can't directly crash or compromise the main API process). This is an isolation *mitigation*, not a claim of full safety, and the report should say so explicitly rather than implying the risk is solved. | Directly answers Part 19's explicit instruction: "If true secure model ingestion is not possible in the current architecture, document the limitation and design an isolation strategy" — this is that documentation and that strategy, scoped honestly |
| Safe error messages | Exception hierarchy from Section O — user-facing messages are always from the typed exception set, never raw internals | Direct fix for the reproduced `IndexError` leak |
| Audit logging | `AuditEvent` table (Section E) | Already covered above |
| Rate limiting | A basic per-IP request-rate cap on `/api/*/intake` and `/api/*/refine` (the expensive endpoints), not a general API gateway | Enough to prevent accidental hammering (e.g. a buggy frontend retry loop) without adding real infrastructure |


---

## Q. Multi-Model (Fleet) Strategy

This section is really "Section F + Section O, applied consistently," so it's kept short: the entire fleet capability falls out of two mechanical changes — (1) `unit_id` scoping on every table and every mutating query (Section F), and (2) per-unit content-addressed artifact paths so no two units can ever collide on disk (Section R). No new "fleet service," queue, or scheduler is needed — `GET /api/fleet/summary` is just an aggregate query across `monitoring_units` joined with each unit's latest `MonitoringRun`, computed synchronously on request, exactly the way `/api/dashboard/summary` already works today, just widened from "one implicit unit" to "N units, grouped." This keeps the modular-monolith shape Part 27 asks for — 20 units is a small `GROUP BY`, not a distributed-systems problem.

The one genuinely new piece of logic is a **per-unit configuration** (thresholds, promotion mode, task type) rather than the single global set of thresholds hardcoded in `health_status.py` today (`f1 < 0.50`, `roc_auc < 0.70`, etc.). These become defaults on `MonitoringUnit` that can be overridden per unit — directly required by Part 24's "verify each can have different thresholds" test.

---

## R. Duplicate Artifact Strategy

Directly addressing the reproduced corruption in B.9:

1. **Content identity, not filename identity.** On upload, compute `sha256` of the file bytes before anything else touches it. Storage path becomes `storage/artifacts/{sha256[:2]}/{sha256}.pkl` (two-level sharding to avoid one giant flat directory once a fleet has many artifacts) — the original filename is retained only as a display label in the database, never as part of the storage path.
2. **Hash lookup before write.** If a `ModelArtifact`/`DatasetArtifact` with that hash already exists, intake returns the *existing* record (idempotent — see Section O) instead of writing a new file or creating a duplicate row. This directly implements "same model + same dataset" → no-op, from Part 18.
3. **Same hash, different unit** is legitimate and allowed — e.g. two different monitoring units both using the exact same baseline reference dataset — the artifact file is shared/reused on disk (no reason to store two physical copies of identical bytes), but each unit's `DatasetArtifact` row references the same underlying file independently, so deleting/retiring one unit's reference doesn't affect another's.
4. **Different content, same original filename** (the exact scenario reproduced live) now **cannot** collide, because the storage path is derived from content, not from the client-supplied filename — this is the direct fix, verified by re-running the audit's reproduction test against the new logic as an explicit regression test.
5. **New model + same dataset** and **same model + new dataset** are both just "one hash matches an existing artifact, the other doesn't" — handled naturally by rule 2 without special-casing.

---

## S. Frontend Architecture

The existing component set (`IntakeView`, `HealthView`, `DiagnosisView`, `RefinementView`, `VersionsView`, `InferenceView` — 2,457 lines total) is real, working UI and the goal is to **wrap it in unit-awareness, not rebuild it.**

```
Navbar (unit switcher added — a dropdown/list of registered units,
        replacing the current flat 7-tab bar as the top-level nav)
   │
   ├── Fleet Dashboard (NEW) — grid/list of all units, each showing
   │     name, task_type, health status badge, active version, last
   │     run time. Click → Model Detail.
   │
   └── Model Detail (unit_id in the URL/route) — the existing 6 views
         become tabs *within* a unit's detail page instead of global
         tabs, each one modified to:
           - read unit_id from the parent route instead of a
             hand-typed file path in a text box
           - call the new unit-scoped API routes (Section G)
         Plus 3 new tabs to close Part 23's gap:
           - Champion/Challenger (NEW) — shows current champion +
             any EVALUATED/pending candidates side by side, with an
             explicit Promote/Reject action when promotion_mode is
             ASSISTED
           - Monitoring Runs (NEW) — the run history that already
             exists in the database (`list_runs`) but has never been
             exposed in the frontend
           - Alerts (NEW, promoted from being buried inside
             VersionsView today) — with an acknowledge action,
             matching Part 12/23's alert-state expectations
```

Two concrete fixes alongside the restructuring: `api.js`'s hardcoded `API_BASE = "http://localhost:8000"` becomes an environment variable (`import.meta.env.VITE_API_BASE`, falling back to localhost for local dev), and `IntakeView` gets wired to the already-existing-but-unused `GET /api/models` pattern (now `GET /api/units/{id}/models`) so a user picks from what's actually registered instead of hand-typing a path — this alone closes most of the "frontend has zero registry awareness" finding from B.12.

This is explicitly **not** a rewrite: React/Vite/Tailwind stay, the existing components' internal logic (form state, result rendering) is largely reusable, and the change is primarily routing (adding a unit-scoped layer above the existing tabs) plus swapping hand-typed paths for registry-driven selects.


---

## T. Testing Strategy

The existing 19 `scripts/test_*.py` files are real smoke tests, not throwaway — the plan is to migrate them into a proper `pytest` suite (rename to `test_*` functions inside `tests/`, add fixtures for the temp SQLite DB and temp storage dir so tests don't mutate the real `model_health.db`) rather than discard them. `scripts/test_end_to_end.py` in particular becomes the seed for the new integration suite, since it already exercises the full 11-stage chain correctly.

| Layer | What's added | Notably reuses |
|---|---|---|
| Unit tests | One file per module in Sections H–N (adapters, task adapters, drift classifier, health engine, diagnosis, strategy selector, promotion gates) | `drift.py`, `data_quality.py`, `evaluation.py`'s existing logic is largely just relocated under test, not rewritten |
| Integration tests | Intake → profiling → compatibility → monitoring, run against both a classification and (once built) a regression model, to catch the task-type assumptions baked in today | `scripts/test_end_to_end.py`'s existing structure |
| End-to-end test | Register → monitor → detect drift → diagnose → refine → evaluate → promote → monitor again → simulate degradation → rollback, for a single unit | Same |
| **Multi-model isolation test (P0 — new)** | Register 20 units with different model types/thresholds/promotion modes; force a failure (corrupt artifact) in one; assert the other 19's state (active version, run history) is completely unaffected. This is the direct regression test for the bug reproduced in B.9. | — |
| **Duplicate artifact test (P0 — new)** | Directly re-run this audit's reproduction: two different models, same original filename; assert both remain independently loadable and no silent overwrite occurs | The exact script written during this audit becomes the regression test |
| **Failure-path tests (P0/P1 — new)** | Corrupt model file (assert a clean `CorruptArtifactError`, not `IndexError: pop from empty list`), unsupported model object, schema mismatch, missing target with `labels_status` handling, failed refinement (assert champion untouched), DB write failure (assert the caller is told, not silently `print()`ed) | — |
| **Drift scenario tests (P1/P2 — new)** | No drift / feature drift / prediction drift / performance drift / expected seasonal drift (against a registered baseline) / unexpected drift / delayed labels / potential concept drift | `scripts/generate_demo_data.py`'s existing drift-injection pattern extends naturally to also generate a seasonal-baseline scenario dataset |

---

## U. Research Evaluation Strategy

Nothing here needs new infrastructure beyond what Sections E–J already add — the `MonitoringRun`, `Candidate`, and `AuditEvent` tables, once they exist, already contain everything needed to compute the metrics your brief lists in Part 25:

| Research metric | Computed from |
|---|---|
| Drift detection rate / false alarm rate | `MonitoringRun.drift_classification` (EXPECTED vs UNEXPECTED) compared against a manually-labeled holdout set of runs |
| Unnecessary retraining rate | `RefinementJob`s whose triggering `MonitoringRun` was later confirmed EXPECTED, or whose resulting candidates were all REJECTED |
| Refinement success / regression rate | `Candidate.status` distribution (PROMOTED vs REJECTED vs FAILED) across all `RefinementJob`s |
| Performance recovery | Compare `ModelVersion.metrics` before/after a promotion event, joined via `AuditEvent` |
| Rollback rate | Count of `AuditEvent.event_type == ROLLBACK` over total promotions |
| Time-to-recovery | Timestamp delta between a degradation-triggering `MonitoringRun` and the next `AuditEvent: PROMOTION` for that unit |
| Computational cost / decision latency | `RefinementJob`'s existing `training_time_sec` field (already computed today in `train_and_evaluate_candidate`) aggregated per job, plus wall-clock timestamps already present on every table |

The only genuinely new piece of work is a small `scripts/export_research_dataset.py` that flattens these tables into a CSV/DataFrame for analysis — not a new subsystem. This is explicitly a P3 item: build the schema so it's *possible* (which the P0/P1 work already makes true as a side effect), don't build the export tooling or run actual experiments until the core platform is stable, per your brief's own instruction not to invent results ahead of having a working system to measure.

---

## V. Migration Strategy From the Current Codebase

Ordered so the system is never in a broken state between steps, and the existing `model_health.db` (9 models, 9 datasets, 12 runs, 4 versions, 48 alerts) is preserved throughout rather than reset:

1. **Fix the zero-risk correctness bugs first**, independent of any architectural change: re-save `requirements.txt` as UTF-8 and add `evidently`/`shap`/`matplotlib` (or drop the Evidently dependency per Section K's recommendation and only add `shap`/`matplotlib` if real SHAP is added); delete or fix `retraining.py`'s syntax error; rename the mislabeled `shap_explainer.py` output. None of this requires schema changes and all of it is independently testable against the existing `scripts/test_end_to_end.py`.
2. **Add `monitoring_units` table and backfill one default unit** wrapping all existing data (nullable `unit_id` FKs added to existing tables first, so nothing breaks; backfill migration sets every existing row's `unit_id` to the new default unit; only then are the FKs made `NOT NULL`).
3. **Fix the global-active-version bug** (scope `save_version`/`activate_version` by `unit_id`, add the partial unique index from Section F) — this is high-value and low-risk once step 2 exists, since with only one unit in the system it's behaviorally invisible that the fix happened, but it's now structurally correct for when a second unit is added.
4. **Switch artifact storage to content-addressed paths** (Section R) — migrate existing `storage/models/*.pkl` files by hashing them in place and updating their DB `file_path` records to point at the new hashed paths; old filename-based paths can be left as broken symlinks or simply abandoned since nothing will reference them anymore.
5. **Add the second monitoring unit** (a genuinely different model/dataset, not just Telco Churn again) as the first real test that isolation actually works — this is the point where Scenario 2 and Scenario 3 (partial — a few units) from your brief become demonstrable.
6. **Layer in task adapters**, starting with formalizing the existing binary-classification logic into `BinaryClassificationTaskAdapter` (pure extraction, no behavior change), then adding `RegressionTaskAdapter` and testing against a real regression model.
7. **Wire diagnosis into refinement strategy selection** (Section M) — the highest-value behavioral change, and the one most directly requested by Part 12.
8. **Add promotion modes (AUTO/ASSISTED/MANUAL)** and the explicit promote/rollback endpoints (Section G/N) — this is the fix for the "automatic drift→retrain→deploy" anti-pattern, and should land before scaling to 20 units, since it's the thing that makes automated maintenance *safe* rather than merely *automated*.
9. **Add the expected/unexpected drift classifier and reference baselines** (Section K) — this depends on nothing except the schema from step 2, and can land any time after step 2, but is sequenced here because it's meaningfully easier to build once there's more than one unit to test "baseline A vs baseline B" against.
10. **Scale to 20 units and add the fleet dashboard/multi-model tests** — by this point it's mostly registering more units and running the isolation test suite from Section T, not new backend logic.
11. **Security pass** (Section P) — deliberately sequenced after the functional work is stable, since auth/CORS/upload-limits are orthogonal to correctness and adding them earlier would slow down iteration on the parts of the system still actively changing; but they land before this is used by anyone outside a single trusted local machine.
12. **Frontend restructuring** (Section S) — sequenced last because it depends on every API route from Section G being final; building the unit-switcher UI against a still-changing backend would mean redoing it.


---

## Prioritization (Part 29)

**P0 — Required for system correctness.** Nothing above this line should be skipped or deferred; each item is either fixing a live bug or is a direct prerequisite for the platform's core safety claims.

- Fix `requirements.txt` encoding + missing dependencies; delete/fix `retraining.py`
- `monitoring_units` table + backfill migration
- Fix the global-active-version-flag bug (scope by `unit_id`)
- Content-addressed artifact storage (fixes the reproduced duplicate-overwrite corruption)
- Typed exception hierarchy + clean error messages at the API boundary
- Remove the fabricated `roc_auc=0.5` fallback pattern; add an explicit UNKNOWN state to the health engine
- Stop the pipeline's unconditional auto-promotion; add AUTO/ASSISTED/MANUAL modes with ASSISTED as the safe default
- Multi-model isolation test + duplicate-artifact regression test (the two tests that directly verify the two bugs reproduced in this audit are actually fixed)

**P1 — Required for real-world usability** (what makes this usable by the four audiences named in your brief, not just demoable on Telco Churn).

- Wire every model-loading call site through the adapter layer consistently (Section H)
- `RegressionTaskAdapter` + `MulticlassClassificationTaskAdapter` (Section I) — without these, "upload your own model" is false advertising for a large fraction of real student/researcher models
- Unlabeled-data monitoring path (`labels_status`) — without this, the platform can't monitor anything in a realistic production gap-between-labels scenario
- Diagnosis → strategy selection in refinement (Section M) — the core differentiator your brief describes
- Champion/Challenger explicit lifecycle states + audit trail (Section N)
- Decomposed health engine (5 sub-scores, not one blended number) — fixes the CRITICAL-overall/all-WARNING-diagnoses inconsistency found live
- Basic security pass: auth token, CORS restriction, upload limits, file-type validation (Section P)
- Frontend: Fleet Dashboard + unit-scoped Model Detail (Section S) — without this, 20 registered units are invisible/unusable even if the backend supports them correctly

**P2 — Strong enhancement.**

- Real hyperparameter search (bounded `RandomizedSearchCV`) replacing the current fixed-"tuned" hyperparameters
- LightGBM/CatBoost adapters
- Real SHAP integration (gated behind adapter capability), separate from the honestly-relabeled feature-importance chart
- Expected/unexpected drift baseline classifier (Section K) — genuinely valuable but the system is coherent and safe without it; it's the "smart" layer on top of a correct foundation
- Alerts acknowledge/resolve workflow
- Feature-mapping UI (the backend capability already exists and is currently backend-only)
- Isolated subprocess loading for uploaded model artifacts (Section P's deserialization mitigation)

**P3 — Research/experimental enhancement.**

- Ranking/recommendation task adapter (interface + one worked metric, not a full suite)
- ONNX/PyTorch/TensorFlow adapter stubs
- Research metrics export tooling (Section U)
- Evidently re-integration for richer drift visualizations (only if the frontend genuinely benefits from it later — not required for correct drift detection, which the scipy path already provides)

---

## Closing Note on Scope

Everything above is scoped to extend, not replace, the ~2,600 lines of backend and ~2,900 lines of frontend that already exist and, on the happy path, genuinely work — I verified that by running it, not by reading it and assuming. The two most serious problems found (global single active-model slot, and filename-based artifact collisions producing silent data corruption) are both narrow, mechanical fixes once isolated — they just happen to be foundational, which is why they're P0. Nothing in this plan proposes a rewrite, a new framework, a message queue, or any of the infrastructure Part 27 tells you not to reach for. The modular-monolith shape stays exactly as it is; it just stops assuming there's only one model in it.

Per Part 28's instruction, this is the point to stop and review before any implementation begins.
