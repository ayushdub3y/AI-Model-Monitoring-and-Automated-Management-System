"""
Content-Addressed Artifact Storage.

SECURITY & TRUST NOTICE:
Model artifacts serialized via pickle or joblib can execute arbitrary code upon deserialization.
In this system:
1. All stored artifacts are validated for allowed extensions (.pkl, .joblib, .json, .onnx).
2. All stored artifacts are content-addressed and SHA-256 verified before reading.
3. Path traversal attacks are sanitized and strictly sandboxed inside STORAGE_DIR.
4. Deserialization is mediated through ModelAdapter abstractions with safe exception containment.
In production environments, only models signed by trusted internal CI/CD pipelines should be accepted.
"""

from pathlib import Path
import hashlib
from typing import Tuple, Optional

from .config import STORAGE_DIR, ARTIFACTS_DIR
from .security import (
    sanitize_filename,
    validate_file_extension,
    validate_payload_size,
    enforce_storage_boundary
)
from .exceptions import StorageError, SecurityError


def calculate_sha256(content: bytes) -> str:
    """Calculates SHA-256 hexadecimal digest for binary content."""
    sha = hashlib.sha256()
    sha.update(content)
    return sha.hexdigest()


from typing import Tuple, Optional, Union

def store_artifact(
    content: Union[bytes, Path, str],
    category: str = "models",
    original_filename: Optional[str] = None
) -> Tuple[Path, str, bool]:
    """
    Stores an artifact immutably using its SHA-256 checksum.

    Enforces:
    - Payload size validation
    - File extension validation
    - Path traversal sanitization
    - Storage sandbox boundary check
    - Idempotency (re-uses existing file if exact hash already exists)

    Returns:
        (saved_path, sha256_hash, was_created)
    """
    if isinstance(content, (str, Path)):
        p_src = Path(content)
        if not p_src.exists():
            raise FileNotFoundError(f"Source file not found: {p_src.name}")
        if original_filename is None:
            original_filename = p_src.name
        with open(p_src, "rb") as f:
            raw_bytes = f.read()
    else:
        raw_bytes = content

    # 1. Validate payload size
    validate_payload_size(len(raw_bytes))

    # 2. Sanitize and validate filename
    safe_orig = sanitize_filename(original_filename or f"artifact_{category}.bin")
    validate_file_extension(safe_orig, category=category)

    # 3. Calculate SHA-256
    sha256_hash = calculate_sha256(raw_bytes)

    # 4. Determine storage target
    category_dir = ARTIFACTS_DIR / category
    category_dir.mkdir(parents=True, exist_ok=True)

    dest_filename = f"{sha256_hash[:16]}_{safe_orig}"
    dest_path = category_dir / dest_filename

    # 5. Enforce sandbox boundary
    dest_path = enforce_storage_boundary(dest_path)

    # 6. Idempotent check
    if dest_path.exists() and dest_path.stat().st_size == len(raw_bytes):
        return dest_path, sha256_hash, False

    # 7. Write to disk with verification
    try:
        with open(dest_path, "wb") as f:
            f.write(raw_bytes)
            f.flush()
    except Exception as e:
        raise StorageError(f"Failed to write artifact to '{dest_path.name}': {str(e)}")

    if not dest_path.exists() or dest_path.stat().st_size != len(raw_bytes):
        raise StorageError(f"Artifact integrity verification failed after writing '{dest_path.name}'.")

    return dest_path, sha256_hash, True
