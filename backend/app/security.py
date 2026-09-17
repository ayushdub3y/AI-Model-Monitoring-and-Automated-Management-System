import os
import re
from pathlib import Path
from typing import Optional
from fastapi import Request

from .config import (
    API_KEY,
    MAX_UPLOAD_SIZE_BYTES,
    MAX_UPLOAD_SIZE_MB,
    ALLOWED_EXTENSIONS_MODELS,
    ALLOWED_EXTENSIONS_DATASETS,
    STORAGE_DIR
)
from .exceptions import (
    AuthenticationError,
    PayloadTooLargeError,
    SecurityError
)


def verify_api_token(request: Request) -> bool:
    """
    Validates API key from request headers if API_KEY authentication is enabled.
    Accepts:
    - X-API-Key: <token>
    - Authorization: Bearer <token>
    """
    if not API_KEY:
        # Auth not enabled / public local mode
        return True

    header_key = request.headers.get("X-API-Key")
    auth_header = request.headers.get("Authorization")

    token = header_key
    if not token and auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()

    if not token or token != API_KEY:
        raise AuthenticationError("Unauthorized: Missing or invalid API authentication token.")

    return True


def validate_file_extension(filename: str, category: str = "models") -> str:
    """
    Validates that the file has an approved extension.
    Rejects executable, script, or dangerous extensions (.exe, .sh, .bat, etc.).
    """
    ext = Path(filename).suffix.lower()
    if category == "models":
        if ext not in ALLOWED_EXTENSIONS_MODELS:
            raise SecurityError(
                f"File '{filename}' has unallowed extension '{ext}'. Allowed model extensions: {', '.join(sorted(ALLOWED_EXTENSIONS_MODELS))}"
            )
    elif category == "datasets":
        if ext not in ALLOWED_EXTENSIONS_DATASETS:
            raise SecurityError(
                f"File '{filename}' has unallowed extension '{ext}'. Allowed dataset extensions: {', '.join(sorted(ALLOWED_EXTENSIONS_DATASETS))}"
            )
    return ext


def validate_payload_size(byte_count: int) -> None:
    """
    Checks that the file/payload size does not exceed the configured maximum.
    """
    if byte_count > MAX_UPLOAD_SIZE_BYTES:
        raise PayloadTooLargeError(
            f"Uploaded payload ({byte_count / (1024*1024):.1f} MB) exceeds maximum allowed size of {MAX_UPLOAD_SIZE_MB} MB."
        )


def sanitize_filename(filename: str) -> str:
    r"""
    Sanitizes filename against path traversal (../, ..\, absolute paths, null bytes, special characters).
    """
    # Remove null bytes
    clean = filename.replace("\x00", "")
    # Take basename only
    clean = Path(clean).name
    # Strip any directory separators or path traversal tokens
    clean = re.sub(r"[\/\\]+", "", clean)
    clean = clean.replace("..", "")
    # Keep only safe alphanumeric, underscores, hyphens, and dots
    clean = re.sub(r"[^\w\.\-]", "_", clean)
    if not clean:
        clean = "artifact.bin"
    return clean


def enforce_storage_boundary(target_path: Path) -> Path:
    """
    Verifies that the target path resolves strictly within the application STORAGE_DIR boundary.
    """
    resolved_target = target_path.resolve()
    resolved_storage = STORAGE_DIR.resolve()
    try:
        resolved_target.relative_to(resolved_storage)
    except ValueError:
        raise SecurityError(f"Access denied: Target path escapes storage sandbox.")
    return resolved_target
