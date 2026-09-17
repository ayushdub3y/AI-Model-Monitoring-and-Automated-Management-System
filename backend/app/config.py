import os
from pathlib import Path
from typing import List, Set

BASE_DIR = Path(__file__).resolve().parent.parent.parent
STORAGE_DIR = (BASE_DIR / "storage").resolve()
ARTIFACTS_DIR = (STORAGE_DIR / "artifacts").resolve()

# Security & Auth Settings
API_KEY: str = os.getenv("MODEL_HEALTH_API_KEY", "")  # When non-empty, authentication is strictly enforced
MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50"))
MAX_UPLOAD_SIZE_BYTES: int = MAX_UPLOAD_SIZE_MB * 1024 * 1024

# Allowed file extensions
ALLOWED_EXTENSIONS_MODELS: Set[str] = {".pkl", ".joblib", ".json", ".onnx", ".bin"}
ALLOWED_EXTENSIONS_DATASETS: Set[str] = {".csv", ".parquet", ".json"}

# CORS Settings
raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000"
)
ALLOWED_ORIGINS: List[str] = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

