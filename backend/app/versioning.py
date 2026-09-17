from pathlib import Path
from typing import Optional, Dict, Any, List
from .database import (
    save_version,
    activate_version,
    get_active_version,
    list_versions
)
from .artifact_storage import store_artifact

VERSION_STORAGE = Path("storage/models/versions")
VERSION_STORAGE.mkdir(parents=True, exist_ok=True)


def register_model_version(
    model_id: int,
    version_tag: str,
    name: str,
    source_model_path: str,
    accuracy: Optional[float] = None,
    f1_score: Optional[float] = None,
    roc_auc: Optional[float] = None,
    description: Optional[str] = None,
    make_active: bool = False,
    unit_id: int = 1
) -> Dict[str, Any]:
    """
    Registers a new version in SQLite and persists the artifact.
    Scoped strictly to the specified unit_id.
    """
    src = Path(source_model_path)
    if not src.exists():
        raise FileNotFoundError(f"Source model not found: {src.name}")

    # Store via content-addressed storage
    dest_path, sha256, _ = store_artifact(
        src,
        category="models",
        original_filename=f"{version_tag}_{src.name}"
    )

    record = save_version(
        model_id=model_id,
        version=version_tag,
        name=name,
        file_path=str(dest_path),
        is_active=make_active,
        accuracy=accuracy,
        f1_score=f1_score,
        roc_auc=roc_auc,
        description=description,
        unit_id=unit_id or 1
    )

    return {
        "id": record.id,
        "unit_id": record.unit_id or 1,
        "model_id": record.model_id,
        "version": record.version,
        "name": record.name,
        "file_path": record.file_path,
        "is_active": bool(record.is_active),
        "accuracy": record.accuracy,
        "f1_score": record.f1_score,
        "roc_auc": record.roc_auc,
        "description": record.description
    }


def deploy_version(version_id: int, unit_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Switches the active model pointer to the specified version ID within its monitoring unit.
    """
    target = activate_version(version_id, unit_id=unit_id)
    return {
        "status": "success",
        "unit_id": target.unit_id or 1,
        "active_version_id": target.id,
        "version": target.version,
        "name": target.name,
        "file_path": target.file_path,
        "message": f"Successfully activated model version {target.version} ({target.name}) for unit {target.unit_id or 1}."
    }


def get_current_active_model(unit_id: int = 1) -> Optional[Dict[str, Any]]:
    """
    Retrieves the currently active model version metadata for a unit.
    """
    active = get_active_version(unit_id=unit_id or 1)
    if not active:
        all_v = list_versions(unit_id=unit_id or 1)
        if all_v:
            return all_v[0]
        return None

    return {
        "id": active.id,
        "unit_id": active.unit_id or 1,
        "model_id": active.model_id,
        "version": active.version,
        "name": active.name,
        "file_path": active.file_path,
        "accuracy": active.accuracy,
        "f1_score": active.f1_score,
        "roc_auc": active.roc_auc,
        "description": active.description
    }


def get_version_history(unit_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Returns full history of registered versions, optionally filtered by unit_id.
    """
    return list_versions(unit_id=unit_id)
