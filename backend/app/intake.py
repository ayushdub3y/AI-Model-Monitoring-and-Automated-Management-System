from pathlib import Path
from typing import Optional, Dict, Any
import pandas as pd

from .adapters.registry import load_model_adapter
from .artifact_storage import store_artifact
from .database import (
    save_model,
    save_dataset,
    save_version,
    get_active_version,
    find_model_by_hash,
    find_dataset_by_hash,
    get_monitoring_unit,
    create_monitoring_unit
)
from .exceptions import CorruptModelError, IncompatibleDataError


def intake_model(
    model_path: str,
    dataset_path: str,
    target_column: str = "Churn",
    model_name: str = None,
    dataset_name: str = None,
    unit_id: int = 1
) -> Dict[str, Any]:
    """
    Intakes a model and reference dataset into a specified MonitoringUnit.
    Guarantees:
    - Content-addressed artifact storage (SHA-256), preserving all artifacts.
    - Idempotency for identical uploads.
    - Uses ModelAdapter abstraction for safe loading and capability detection.
    """
    model_src = Path(model_path)
    dataset_src = Path(dataset_path)

    if not model_src.exists():
        raise FileNotFoundError(f"Model file not found: {model_src.name}")
    if not dataset_src.exists():
        raise FileNotFoundError(f"Dataset file not found: {dataset_src.name}")

    # Ensure MonitoringUnit exists
    effective_unit_id = unit_id or 1
    unit = get_monitoring_unit(effective_unit_id)
    if not unit:
        unit = create_monitoring_unit(
            name=f"Monitoring Unit #{effective_unit_id}",
            target_column=target_column
        )
        effective_unit_id = unit.id

    # 1. Content-addressed storage for Model
    stored_model_path, model_sha256, model_is_dup = store_artifact(
        model_src,
        category="models",
        original_filename=model_src.name
    )

    # 2. Load model via ModelAdapter registry (will validate & catch corrupt models)
    adapter = load_model_adapter(str(stored_model_path))
    model_type = adapter.get_model_type()
    feature_names = adapter.get_feature_names()

    # 3. Content-addressed storage for Dataset
    stored_dataset_path, dataset_sha256, dataset_is_dup = store_artifact(
        dataset_src,
        category="datasets",
        original_filename=dataset_src.name
    )

    # 4. Profile and validate dataset readability
    try:
        df = pd.read_csv(stored_dataset_path)
        if df.empty or len(df.columns) < 1:
            raise IncompatibleDataError(f"Dataset '{stored_dataset_path.name}' is empty or contains no valid tabular data.")
        if target_column and target_column not in df.columns:
            raise IncompatibleDataError(f"Target column '{target_column}' is missing from dataset '{stored_dataset_path.name}'.")
    except IncompatibleDataError:
        raise
    except Exception as e:
        raise IncompatibleDataError(f"Failed to parse dataset CSV '{stored_dataset_path.name}': {str(e)}")

    row_count = len(df)
    column_count = len(df.columns)

    model_record_name = model_name or model_src.stem
    dataset_record_name = dataset_name or dataset_src.stem

    # 5. Check idempotency in DB
    existing_model = find_model_by_hash(model_sha256, unit_id=effective_unit_id)
    if existing_model:
        saved_model = existing_model
    else:
        saved_model = save_model(
            name=model_record_name,
            model_type=model_type,
            file_path=str(stored_model_path),
            feature_names=feature_names,
            unit_id=effective_unit_id,
            sha256=model_sha256
        )

    existing_dataset = find_dataset_by_hash(dataset_sha256, unit_id=effective_unit_id)
    if existing_dataset:
        saved_dataset = existing_dataset
    else:
        saved_dataset = save_dataset(
            name=dataset_record_name,
            file_path=str(stored_dataset_path),
            row_count=row_count,
            column_count=column_count,
            target_column=target_column,
            unit_id=effective_unit_id,
            sha256=dataset_sha256
        )

    # 6. Ensure active version exists for this specific Monitoring Unit
    active_version = get_active_version(unit_id=effective_unit_id)
    if not active_version:
        save_version(
            model_id=saved_model.id,
            version="v1.0.0-original",
            name=f"Baseline ({model_record_name})",
            file_path=str(stored_model_path),
            is_active=True,
            description="Original intaken baseline model",
            unit_id=effective_unit_id
        )

    return {
        "status": "success",
        "unit_id": effective_unit_id,
        "model_id": saved_model.id,
        "dataset_id": saved_dataset.id,
        "model_type": model_type,
        "model_name": model_record_name,
        "dataset_name": dataset_record_name,
        "model_path": str(stored_model_path),
        "dataset_path": str(stored_dataset_path),
        "model_sha256": model_sha256,
        "dataset_sha256": dataset_sha256,
        "feature_names": feature_names,
        "row_count": row_count,
        "column_count": column_count,
        "target_column": target_column
    }