import pandas as pd
from datetime import datetime
from pathlib import Path
import json
from typing import Optional, List, Dict, Any
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Float,
    Text,
    DateTime,
    Boolean,
    text
)
from sqlalchemy.orm import declarative_base, sessionmaker

DB_PATH = Path("model_health.db").resolve()
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class MonitoringUnitRecord(Base):
    __tablename__ = "monitoring_units"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    task_type = Column(String, default="classification", nullable=False)
    owner_label = Column(String, default="default", nullable=True)
    target_column = Column(String, default="Churn", nullable=True)
    positive_class = Column(String, default="1", nullable=True)
    promotion_mode = Column(String, default="ASSISTED", nullable=False)  # AUTO, ASSISTED, MANUAL
    thresholds_json = Column(Text, nullable=True)  # JSON configured health/drift thresholds
    current_dataset_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ReferenceBaselineRecord(Base):
    __tablename__ = "reference_baselines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    unit_id = Column(Integer, nullable=False, default=1)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    file_path = Column(String, nullable=False)
    sha256 = Column(String, nullable=True)
    expected_drift_features = Column(Text, nullable=True)  # JSON list of features expected to drift
    is_default = Column(Integer, default=0)
    row_count = Column(Integer, nullable=True)
    column_count = Column(Integer, nullable=True)
    target_column = Column(String, nullable=True)
    status = Column(String, default="READY", nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ModelRecord(Base):
    __tablename__ = "models"

    id = Column(Integer, primary_key=True, autoincrement=True)
    unit_id = Column(Integer, nullable=True, default=1)
    name = Column(String, nullable=False)
    model_type = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    sha256 = Column(String, nullable=True)
    feature_names = Column(Text, nullable=True)  # JSON encoded list
    created_at = Column(DateTime, default=datetime.utcnow)


class DatasetRecord(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    unit_id = Column(Integer, nullable=True, default=1)
    name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    sha256 = Column(String, nullable=True)
    row_count = Column(Integer, nullable=True)
    column_count = Column(Integer, nullable=True)
    target_column = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    status = Column(String, default="READY", nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class RunRecord(Base):
    __tablename__ = "runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    unit_id = Column(Integer, nullable=True, default=1)
    model_id = Column(Integer, nullable=True)
    dataset_id = Column(Integer, nullable=True)
    baseline_id = Column(Integer, nullable=True)
    run_type = Column(String, nullable=False, default="health_check")
    labels_status = Column(String, nullable=True, default="AVAILABLE")  # AVAILABLE, DELAYED, UNAVAILABLE
    drift_classification = Column(String, nullable=True, default="UNCLASSIFIED")  # EXPECTED, UNEXPECTED, UNCLASSIFIED
    accuracy = Column(Float, nullable=True)
    f1_score = Column(Float, nullable=True)
    roc_auc = Column(Float, nullable=True)
    health_status = Column(String, nullable=True)
    drift_rate = Column(Float, nullable=True)
    health_components_json = Column(Text, nullable=True)  # JSON of 5 decomposed health scores
    metrics_json = Column(Text, nullable=True)  # JSON encoded full report
    created_at = Column(DateTime, default=datetime.utcnow)


class VersionRecord(Base):
    __tablename__ = "versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    unit_id = Column(Integer, nullable=True, default=1)
    model_id = Column(Integer, nullable=True)
    version = Column(String, nullable=False)
    name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    is_active = Column(Integer, default=0)
    accuracy = Column(Float, nullable=True)
    f1_score = Column(Float, nullable=True)
    roc_auc = Column(Float, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class RefinementJobRecord(Base):
    __tablename__ = "refinement_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    unit_id = Column(Integer, nullable=False, default=1)
    run_id = Column(Integer, nullable=True)
    trigger_reason = Column(Text, nullable=False)
    diagnoses_json = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="PENDING")  # PENDING, RUNNING, COMPLETED, FAILED, SKIPPED
    explanation = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class CandidateRecord(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    unit_id = Column(Integer, nullable=False, default=1)
    job_id = Column(Integer, nullable=True)
    parent_version_id = Column(Integer, nullable=True)
    triggering_run_id = Column(Integer, nullable=True)
    strategy = Column(String, nullable=False)  # DATA_REFRESH, HYPERPARAMETER_SEARCH, CLASS_BALANCING, etc.
    configuration_json = Column(Text, nullable=True)
    training_data_sha256 = Column(String, nullable=True)
    model_file_path = Column(String, nullable=False)
    sha256 = Column(String, nullable=True)
    metrics_json = Column(Text, nullable=True)
    execution_time_sec = Column(Float, nullable=True)
    lifecycle_state = Column(String, nullable=False, default="CHALLENGER")  # CHALLENGER, EVALUATED, PROMOTED, REJECTED, CHAMPION, RETIRED, FAILED
    rejection_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AuditEventRecord(Base):
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    unit_id = Column(Integer, nullable=False, default=1)
    event_type = Column(String, nullable=False)  # REFINEMENT_TRIGGERED, REFINEMENT_SKIPPED, CANDIDATE_EVALUATED, CANDIDATE_REJECTED, CANDIDATE_PROMOTED, ROLLBACK, REFINEMENT_FAILED
    actor = Column(String, nullable=False, default="SYSTEM")  # SYSTEM, USER
    details_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AlertRecord(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    unit_id = Column(Integer, nullable=True, default=1)
    model_id = Column(Integer, nullable=True)
    alert_type = Column(String, nullable=False)
    severity = Column(String, nullable=False, default="WARNING")
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


def _migrate_schema_if_needed():
    """Applies schema migrations to existing SQLite database gracefully."""
    with engine.connect() as conn:
        tables_to_check = [
            ("monitoring_units", ["thresholds_json TEXT", "current_dataset_id INTEGER"]),
            ("models", ["unit_id INTEGER DEFAULT 1", "sha256 TEXT"]),
            ("datasets", ["unit_id INTEGER DEFAULT 1", "sha256 TEXT", "description TEXT", "status TEXT DEFAULT 'READY'"]),
            ("reference_baselines", [
                "row_count INTEGER",
                "column_count INTEGER",
                "target_column TEXT",
                "status TEXT DEFAULT 'READY'"
            ]),
            ("runs", [
                "unit_id INTEGER DEFAULT 1",
                "baseline_id INTEGER",
                "labels_status TEXT DEFAULT 'AVAILABLE'",
                "drift_classification TEXT DEFAULT 'UNCLASSIFIED'",
                "health_components_json TEXT"
            ]),
            ("versions", ["unit_id INTEGER DEFAULT 1"]),
            ("alerts", ["unit_id INTEGER DEFAULT 1"]),
        ]

        for table, new_cols in tables_to_check:
            table_check = conn.execute(
                text(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'")
            ).fetchone()
            if table_check:
                existing_cols = [
                    row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
                ]
                for col_def in new_cols:
                    col_name = col_def.split()[0]
                    if col_name not in existing_cols:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_def}"))
                        conn.commit()


def init_db():
    Base.metadata.create_all(bind=engine)
    _migrate_schema_if_needed()

    # Ensure default unit exists
    with SessionLocal() as db:
        default_unit = db.query(MonitoringUnitRecord).filter(MonitoringUnitRecord.id == 1).first()
        if not default_unit:
            default_unit = MonitoringUnitRecord(
                id=1,
                name="Telco Baseline Churn Unit",
                task_type="classification",
                owner_label="default",
                target_column="Churn",
                positive_class="1",
                promotion_mode="ASSISTED"
            )
            db.add(default_unit)
            db.commit()

        # Backfill any null unit_id to 1
        db.query(ModelRecord).filter(ModelRecord.unit_id == None).update({ModelRecord.unit_id: 1})
        db.query(DatasetRecord).filter(DatasetRecord.unit_id == None).update({DatasetRecord.unit_id: 1})
        db.query(RunRecord).filter(RunRecord.unit_id == None).update({RunRecord.unit_id: 1})
        db.query(VersionRecord).filter(VersionRecord.unit_id == None).update({VersionRecord.unit_id: 1})
        db.query(AlertRecord).filter(AlertRecord.unit_id == None).update({AlertRecord.unit_id: 1})
        db.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==========================================
# Monitoring Unit CRUD Helper Functions
# ==========================================

def create_monitoring_unit(
    name: str,
    task_type: str = "classification",
    owner_label: str = "default",
    target_column: str = "Churn",
    positive_class: str = "1",
    promotion_mode: str = "ASSISTED",
    thresholds: Optional[Dict[str, Any]] = None
) -> MonitoringUnitRecord:
    init_db()
    with SessionLocal() as db:
        record = MonitoringUnitRecord(
            name=name,
            task_type=task_type,
            owner_label=owner_label,
            target_column=target_column,
            positive_class=positive_class,
            promotion_mode=promotion_mode,
            thresholds_json=json.dumps(thresholds) if thresholds else None
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record


def get_monitoring_unit(unit_id: int = 1) -> Optional[MonitoringUnitRecord]:
    init_db()
    with SessionLocal() as db:
        return db.query(MonitoringUnitRecord).filter(MonitoringUnitRecord.id == unit_id).first()


def update_monitoring_unit_thresholds(unit_id: int, thresholds: Dict[str, Any]) -> Optional[MonitoringUnitRecord]:
    init_db()
    with SessionLocal() as db:
        unit = db.query(MonitoringUnitRecord).filter(MonitoringUnitRecord.id == unit_id).first()
        if unit:
            unit.thresholds_json = json.dumps(thresholds)
            db.commit()
            db.refresh(unit)
        return unit


def list_monitoring_units() -> List[Dict[str, Any]]:
    init_db()
    with SessionLocal() as db:
        records = db.query(MonitoringUnitRecord).order_by(MonitoringUnitRecord.id.asc()).all()
        return [
            {
                "id": r.id,
                "name": r.name,
                "task_type": r.task_type,
                "owner_label": r.owner_label,
                "target_column": r.target_column,
                "positive_class": r.positive_class,
                "promotion_mode": r.promotion_mode,
                "thresholds": json.loads(r.thresholds_json) if r.thresholds_json else {},
                "current_dataset_id": r.current_dataset_id,
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in records
        ]


# ==========================================
# Reference Baseline CRUD
# ==========================================

def save_reference_baseline(
    unit_id: int,
    name: str,
    file_path: str,
    description: Optional[str] = None,
    expected_drift_features: Optional[List[str]] = None,
    is_default: bool = False,
    sha256: Optional[str] = None,
    row_count: Optional[int] = None,
    column_count: Optional[int] = None,
    target_column: Optional[str] = None,
    status: Optional[str] = "READY"
) -> ReferenceBaselineRecord:
    init_db()
    with SessionLocal() as db:
        if is_default:
            db.query(ReferenceBaselineRecord).filter(
                ReferenceBaselineRecord.unit_id == unit_id
            ).update({ReferenceBaselineRecord.is_default: 0})
            db.commit()

        # If metadata not passed, attempt quick read if file exists
        if (row_count is None or column_count is None) and file_path and Path(file_path).exists():
            try:
                df = pd.read_csv(file_path)
                if row_count is None:
                    row_count = len(df)
                if column_count is None:
                    column_count = len(df.columns)
                if target_column is None:
                    unit = db.query(MonitoringUnitRecord).filter(MonitoringUnitRecord.id == unit_id).first()
                    if unit and unit.target_column in df.columns:
                        target_column = unit.target_column
            except Exception:
                pass

        record = ReferenceBaselineRecord(
            unit_id=unit_id,
            name=name,
            description=description,
            file_path=str(file_path),
            sha256=sha256,
            expected_drift_features=json.dumps(expected_drift_features) if expected_drift_features else None,
            is_default=1 if is_default else 0,
            row_count=row_count,
            column_count=column_count,
            target_column=target_column,
            status="DEFAULT" if is_default else (status or "READY")
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record


def get_reference_baseline(
    baseline_id: Optional[int] = None,
    unit_id: int = 1,
    name: Optional[str] = None
) -> Optional[ReferenceBaselineRecord]:
    init_db()
    with SessionLocal() as db:
        query = db.query(ReferenceBaselineRecord).filter(ReferenceBaselineRecord.unit_id == unit_id)
        if baseline_id is not None:
            return query.filter(ReferenceBaselineRecord.id == baseline_id).first()
        if name is not None:
            return query.filter(ReferenceBaselineRecord.name == name).first()
        # Fallback to default or latest
        default_b = query.filter(ReferenceBaselineRecord.is_default == 1).first()
        if default_b:
            return default_b
        return query.order_by(ReferenceBaselineRecord.id.desc()).first()


def list_reference_baselines(unit_id: Optional[int] = None) -> List[Dict[str, Any]]:
    init_db()
    with SessionLocal() as db:
        query = db.query(ReferenceBaselineRecord)
        if unit_id is not None:
            query = query.filter(ReferenceBaselineRecord.unit_id == unit_id)
        records = query.order_by(ReferenceBaselineRecord.id.desc()).all()
        result = []
        for r in records:
            row_count = r.row_count
            column_count = r.column_count
            target_col = r.target_column

            # Backfill metadata on the fly if needed
            if (row_count is None or column_count is None) and r.file_path and Path(r.file_path).exists():
                try:
                    df = pd.read_csv(r.file_path)
                    row_count = len(df)
                    column_count = len(df.columns)
                    if not target_col:
                        unit = db.query(MonitoringUnitRecord).filter(MonitoringUnitRecord.id == r.unit_id).first()
                        if unit and unit.target_column in df.columns:
                            target_col = unit.target_column
                except Exception:
                    pass

            result.append({
                "id": r.id,
                "unit_id": r.unit_id,
                "name": r.name,
                "description": r.description,
                "file_path": r.file_path,
                "sha256": r.sha256,
                "expected_drift_features": json.loads(r.expected_drift_features) if r.expected_drift_features else [],
                "is_default": bool(r.is_default),
                "row_count": row_count,
                "column_count": column_count,
                "target_column": target_col,
                "status": "DEFAULT" if bool(r.is_default) else (r.status or "READY"),
                "created_at": r.created_at.isoformat() if r.created_at else None
            })
        return result


# ==========================================
# RefinementJob CRUD
# ==========================================

def create_refinement_job(
    unit_id: int,
    trigger_reason: str,
    diagnoses: Optional[List[Dict[str, Any]]] = None,
    run_id: Optional[int] = None,
    status: str = "PENDING"
) -> RefinementJobRecord:
    init_db()
    with SessionLocal() as db:
        job = RefinementJobRecord(
            unit_id=unit_id,
            run_id=run_id,
            trigger_reason=trigger_reason,
            diagnoses_json=json.dumps(diagnoses) if diagnoses else None,
            status=status
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        return job


def update_refinement_job(job_id: int, status: str, explanation: Optional[str] = None) -> Optional[RefinementJobRecord]:
    init_db()
    with SessionLocal() as db:
        job = db.query(RefinementJobRecord).filter(RefinementJobRecord.id == job_id).first()
        if job:
            job.status = status
            if explanation:
                job.explanation = explanation
            db.commit()
            db.refresh(job)
        return job


def list_refinement_jobs(unit_id: Optional[int] = None, limit: int = 50) -> List[Dict[str, Any]]:
    init_db()
    with SessionLocal() as db:
        query = db.query(RefinementJobRecord)
        if unit_id is not None:
            query = query.filter(RefinementJobRecord.unit_id == unit_id)
        records = query.order_by(RefinementJobRecord.id.desc()).limit(limit).all()
        return [
            {
                "id": r.id,
                "unit_id": r.unit_id,
                "run_id": r.run_id,
                "trigger_reason": r.trigger_reason,
                "status": r.status,
                "explanation": r.explanation,
                "diagnoses": json.loads(r.diagnoses_json) if r.diagnoses_json else [],
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in records
        ]


# ==========================================
# Candidate CRUD
# ==========================================

def save_candidate(
    unit_id: int,
    strategy: str,
    model_file_path: str,
    job_id: Optional[int] = None,
    parent_version_id: Optional[int] = None,
    triggering_run_id: Optional[int] = None,
    configuration: Optional[Dict[str, Any]] = None,
    training_data_sha256: Optional[str] = None,
    sha256: Optional[str] = None,
    metrics: Optional[Dict[str, Any]] = None,
    execution_time_sec: Optional[float] = None,
    lifecycle_state: str = "CHALLENGER"
) -> CandidateRecord:
    init_db()
    with SessionLocal() as db:
        record = CandidateRecord(
            unit_id=unit_id,
            job_id=job_id,
            parent_version_id=parent_version_id,
            triggering_run_id=triggering_run_id,
            strategy=strategy,
            configuration_json=json.dumps(configuration) if configuration else None,
            training_data_sha256=training_data_sha256,
            model_file_path=str(model_file_path),
            sha256=sha256,
            metrics_json=json.dumps(metrics) if metrics else None,
            execution_time_sec=execution_time_sec,
            lifecycle_state=lifecycle_state
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record


def get_candidate(candidate_id: int) -> Optional[CandidateRecord]:
    init_db()
    with SessionLocal() as db:
        return db.query(CandidateRecord).filter(CandidateRecord.id == candidate_id).first()


def update_candidate_state(
    candidate_id: int,
    lifecycle_state: str,
    rejection_reason: Optional[str] = None
) -> Optional[CandidateRecord]:
    init_db()
    with SessionLocal() as db:
        cand = db.query(CandidateRecord).filter(CandidateRecord.id == candidate_id).first()
        if cand:
            cand.lifecycle_state = lifecycle_state
            if rejection_reason:
                cand.rejection_reason = rejection_reason
            db.commit()
            db.refresh(cand)
        return cand


def list_candidates(unit_id: Optional[int] = None, limit: int = 50) -> List[Dict[str, Any]]:
    init_db()
    with SessionLocal() as db:
        query = db.query(CandidateRecord)
        if unit_id is not None:
            query = query.filter(CandidateRecord.unit_id == unit_id)
        records = query.order_by(CandidateRecord.id.desc()).limit(limit).all()
        return [
            {
                "id": r.id,
                "unit_id": r.unit_id,
                "job_id": r.job_id,
                "parent_version_id": r.parent_version_id,
                "strategy": r.strategy,
                "configuration": json.loads(r.configuration_json) if r.configuration_json else {},
                "model_file_path": r.model_file_path,
                "sha256": r.sha256,
                "metrics": json.loads(r.metrics_json) if r.metrics_json else {},
                "execution_time_sec": r.execution_time_sec,
                "lifecycle_state": r.lifecycle_state,
                "rejection_reason": r.rejection_reason,
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in records
        ]


# ==========================================
# Audit Trail CRUD
# ==========================================

def record_audit_event(
    unit_id: int,
    event_type: str,
    actor: str = "SYSTEM",
    details: Optional[Dict[str, Any]] = None
) -> AuditEventRecord:
    init_db()
    with SessionLocal() as db:
        evt = AuditEventRecord(
            unit_id=unit_id,
            event_type=event_type,
            actor=actor,
            details_json=json.dumps(details) if details else None
        )
        db.add(evt)
        db.commit()
        db.refresh(evt)
        return evt


def list_audit_events(unit_id: Optional[int] = None, limit: int = 100) -> List[Dict[str, Any]]:
    init_db()
    with SessionLocal() as db:
        query = db.query(AuditEventRecord)
        if unit_id is not None:
            query = query.filter(AuditEventRecord.unit_id == unit_id)
        records = query.order_by(AuditEventRecord.id.desc()).limit(limit).all()
        return [
            {
                "id": r.id,
                "unit_id": r.unit_id,
                "event_type": r.event_type,
                "actor": r.actor,
                "details": json.loads(r.details_json) if r.details_json else {},
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in records
        ]


# ==========================================
# Model & Dataset CRUD Helper Functions
# ==========================================

def save_model(
    name: str,
    model_type: str,
    file_path: str,
    feature_names: list = None,
    unit_id: int = 1,
    sha256: str = None
) -> ModelRecord:
    init_db()
    with SessionLocal() as db:
        record = ModelRecord(
            unit_id=unit_id or 1,
            name=name,
            model_type=model_type,
            file_path=str(file_path),
            sha256=sha256,
            feature_names=json.dumps(feature_names) if feature_names else None
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record


def find_model_by_hash(sha256: str, unit_id: int = None) -> Optional[ModelRecord]:
    init_db()
    with SessionLocal() as db:
        query = db.query(ModelRecord).filter(ModelRecord.sha256 == sha256)
        if unit_id is not None:
            query = query.filter(ModelRecord.unit_id == unit_id)
        return query.first()


def save_dataset(
    name: str,
    file_path: str,
    row_count: int = None,
    column_count: int = None,
    target_column: str = None,
    unit_id: int = 1,
    sha256: str = None,
    description: str = None,
    status: str = "READY"
) -> DatasetRecord:
    init_db()
    with SessionLocal() as db:
        record = DatasetRecord(
            unit_id=unit_id or 1,
            name=name,
            file_path=str(file_path),
            sha256=sha256,
            row_count=row_count,
            column_count=column_count,
            target_column=target_column,
            description=description,
            status=status
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record


def find_dataset_by_hash(sha256: str, unit_id: int = None) -> Optional[DatasetRecord]:
    init_db()
    with SessionLocal() as db:
        query = db.query(DatasetRecord).filter(DatasetRecord.sha256 == sha256)
        if unit_id is not None:
            query = query.filter(DatasetRecord.unit_id == unit_id)
        return query.first()


def save_run(
    model_id: int,
    dataset_id: int,
    run_type: str,
    accuracy: Optional[float],
    f1_score: Optional[float],
    roc_auc: Optional[float],
    health_status: str,
    drift_rate: Optional[float],
    metrics_json: dict = None,
    unit_id: int = 1,
    baseline_id: Optional[int] = None,
    labels_status: str = "AVAILABLE",
    drift_classification: str = "UNCLASSIFIED",
    health_components: Optional[dict] = None
) -> RunRecord:
    init_db()
    with SessionLocal() as db:
        record = RunRecord(
            unit_id=unit_id or 1,
            model_id=model_id,
            dataset_id=dataset_id,
            baseline_id=baseline_id,
            run_type=run_type,
            labels_status=labels_status,
            drift_classification=drift_classification,
            accuracy=accuracy,
            f1_score=f1_score,
            roc_auc=roc_auc,
            health_status=health_status,
            drift_rate=drift_rate,
            health_components_json=json.dumps(health_components) if health_components else None,
            metrics_json=json.dumps(metrics_json) if metrics_json else None
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record


def save_version(
    model_id: int,
    version: str,
    name: str,
    file_path: str,
    is_active: bool = False,
    accuracy: float = None,
    f1_score: float = None,
    roc_auc: float = None,
    description: str = None,
    unit_id: int = 1
) -> VersionRecord:
    init_db()
    effective_unit_id = unit_id or 1
    with SessionLocal() as db:
        if is_active:
            db.query(VersionRecord).filter(VersionRecord.unit_id == effective_unit_id).update({VersionRecord.is_active: 0})
            db.commit()

        record = VersionRecord(
            unit_id=effective_unit_id,
            model_id=model_id,
            version=version,
            name=name,
            file_path=str(file_path),
            is_active=1 if is_active else 0,
            accuracy=accuracy,
            f1_score=f1_score,
            roc_auc=roc_auc,
            description=description
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record


def activate_version(version_id: int, unit_id: Optional[int] = None) -> VersionRecord:
    init_db()
    with SessionLocal() as db:
        query = db.query(VersionRecord).filter(VersionRecord.id == version_id)
        if unit_id is not None:
            query = query.filter(VersionRecord.unit_id == unit_id)
        target = query.first()

        if not target:
            raise ValueError(f"Version with ID {version_id} not found" + (f" in unit {unit_id}." if unit_id else "."))

        target_unit_id = target.unit_id or 1
        db.query(VersionRecord).filter(VersionRecord.unit_id == target_unit_id).update({VersionRecord.is_active: 0})
        target.is_active = 1
        db.commit()
        db.refresh(target)
        return target


def get_active_version(unit_id: int = 1) -> Optional[VersionRecord]:
    init_db()
    with SessionLocal() as db:
        return db.query(VersionRecord).filter(
            VersionRecord.unit_id == (unit_id or 1),
            VersionRecord.is_active == 1
        ).first()


def list_versions(unit_id: Optional[int] = None) -> List[Dict[str, Any]]:
    init_db()
    with SessionLocal() as db:
        query = db.query(VersionRecord)
        if unit_id is not None:
            query = query.filter(VersionRecord.unit_id == unit_id)
        records = query.order_by(VersionRecord.id.desc()).all()
        return [
            {
                "id": r.id,
                "unit_id": r.unit_id or 1,
                "model_id": r.model_id,
                "version": r.version,
                "name": r.name,
                "file_path": r.file_path,
                "is_active": bool(r.is_active),
                "accuracy": r.accuracy,
                "f1_score": r.f1_score,
                "roc_auc": r.roc_auc,
                "description": r.description,
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in records
        ]


def rollback_version(unit_id: int = 1) -> Optional[VersionRecord]:
    """
    Rolls back to the previous version in the unit without deleting any version history.
    """
    init_db()
    effective_unit_id = unit_id or 1
    with SessionLocal() as db:
        current_active = db.query(VersionRecord).filter(
            VersionRecord.unit_id == effective_unit_id,
            VersionRecord.is_active == 1
        ).first()

        # Find previous version
        versions = db.query(VersionRecord).filter(
            VersionRecord.unit_id == effective_unit_id
        ).order_by(VersionRecord.id.desc()).all()

        if len(versions) < 2:
            raise ValueError(f"No previous version available for rollback in unit {effective_unit_id}.")

        prev_version = None
        for v in versions:
            if current_active and v.id != current_active.id:
                prev_version = v
                break
        if not prev_version:
            prev_version = versions[1]

        # Deactivate all and activate previous
        db.query(VersionRecord).filter(VersionRecord.unit_id == effective_unit_id).update({VersionRecord.is_active: 0})
        prev_version.is_active = 1
        db.commit()
        db.refresh(prev_version)
        return prev_version


def save_alert(
    model_id: int,
    alert_type: str,
    severity: str,
    message: str,
    unit_id: int = 1
) -> AlertRecord:
    init_db()
    with SessionLocal() as db:
        record = AlertRecord(
            unit_id=unit_id or 1,
            model_id=model_id,
            alert_type=alert_type,
            severity=severity,
            message=message
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return record


def list_alerts(unit_id: Optional[int] = None, limit: int = 50) -> List[Dict[str, Any]]:
    init_db()
    with SessionLocal() as db:
        query = db.query(AlertRecord)
        if unit_id is not None:
            query = query.filter(AlertRecord.unit_id == unit_id)
        records = query.order_by(AlertRecord.id.desc()).limit(limit).all()
        return [
            {
                "id": r.id,
                "unit_id": r.unit_id or 1,
                "model_id": r.model_id,
                "alert_type": r.alert_type,
                "severity": r.severity,
                "message": r.message,
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in records
        ]


def list_runs(unit_id: Optional[int] = None, limit: int = 50) -> List[Dict[str, Any]]:
    init_db()
    with SessionLocal() as db:
        query = db.query(RunRecord)
        if unit_id is not None:
            query = query.filter(RunRecord.unit_id == unit_id)
        records = query.order_by(RunRecord.id.desc()).limit(limit).all()
        return [
            {
                "id": r.id,
                "unit_id": r.unit_id or 1,
                "model_id": r.model_id,
                "dataset_id": r.dataset_id,
                "baseline_id": r.baseline_id,
                "run_type": r.run_type,
                "labels_status": r.labels_status,
                "drift_classification": r.drift_classification,
                "accuracy": r.accuracy,
                "f1_score": r.f1_score,
                "roc_auc": r.roc_auc,
                "health_status": r.health_status,
                "drift_rate": r.drift_rate,
                "health_components": json.loads(r.health_components_json) if r.health_components_json else {},
                "metrics": json.loads(r.metrics_json) if r.metrics_json else None,
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in records
        ]


def list_models(unit_id: Optional[int] = None) -> List[Dict[str, Any]]:
    init_db()
    with SessionLocal() as db:
        query = db.query(ModelRecord)
        if unit_id is not None:
            query = query.filter(ModelRecord.unit_id == unit_id)
        records = query.order_by(ModelRecord.id.desc()).all()
        return [
            {
                "id": r.id,
                "unit_id": r.unit_id or 1,
                "name": r.name,
                "model_type": r.model_type,
                "file_path": r.file_path,
                "sha256": r.sha256,
                "feature_names": json.loads(r.feature_names) if r.feature_names else [],
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in records
        ]


def list_datasets(unit_id: Optional[int] = None) -> List[Dict[str, Any]]:
    init_db()
    with SessionLocal() as db:
        query = db.query(DatasetRecord)
        if unit_id is not None:
            query = query.filter(DatasetRecord.unit_id == unit_id)
        records = query.order_by(DatasetRecord.id.desc()).all()

        current_dataset_id = None
        if unit_id is not None:
            unit = db.query(MonitoringUnitRecord).filter(MonitoringUnitRecord.id == unit_id).first()
            if unit:
                current_dataset_id = unit.current_dataset_id

        # Determine used datasets from runs
        used_ids = set()
        run_q = db.query(RunRecord.dataset_id).filter(RunRecord.dataset_id != None)
        if unit_id is not None:
            run_q = run_q.filter(RunRecord.unit_id == unit_id)
        for row in run_q.all():
            if row[0]:
                used_ids.add(row[0])

        res = []
        for r in records:
            p = Path(r.file_path) if r.file_path else None
            if current_dataset_id and r.id == current_dataset_id:
                st = "CURRENT"
            elif r.id in used_ids:
                st = "USED"
            elif p and not p.exists():
                st = "ERROR"
            elif r.status == "CURRENT":
                st = "READY"
            else:
                st = r.status or "READY"

            res.append({
                "id": r.id,
                "unit_id": r.unit_id or 1,
                "name": r.name,
                "description": r.description,
                "file_path": r.file_path,
                "sha256": r.sha256,
                "row_count": r.row_count,
                "column_count": r.column_count,
                "target_column": r.target_column,
                "status": st,
                "created_at": r.created_at.isoformat() if r.created_at else None
            })
        return res


def set_unit_current_dataset(unit_id: int, dataset_id: int) -> Optional[MonitoringUnitRecord]:
    init_db()
    with SessionLocal() as db:
        unit = db.query(MonitoringUnitRecord).filter(MonitoringUnitRecord.id == unit_id).first()
        if unit:
            unit.current_dataset_id = dataset_id
            db.commit()
            db.refresh(unit)
        return unit


def delete_dataset(dataset_id: int) -> bool:
    init_db()
    with SessionLocal() as db:
        record = db.query(DatasetRecord).filter(DatasetRecord.id == dataset_id).first()
        if not record:
            return False
        if record.unit_id:
            db.query(MonitoringUnitRecord).filter(
                MonitoringUnitRecord.id == record.unit_id,
                MonitoringUnitRecord.current_dataset_id == record.id
            ).update({MonitoringUnitRecord.current_dataset_id: None})
        db.delete(record)
        db.commit()
        return True