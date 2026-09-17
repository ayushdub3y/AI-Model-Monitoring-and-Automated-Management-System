# Security & Trust Architecture

## Overview
The AI Model Health & Refinement System manages autonomous monitoring, drift diagnostics, candidate retraining, and deployment versioning.

---

## 1. Model Serialization & Deserialization Security

### Pickle & Joblib Trust Warning
`pickle` and `joblib` formats serialize arbitrary Python objects and code execution graphs. Deserializing an untrusted model file can result in arbitrary remote code execution (RCE).

### Security Controls Enforced
1. **Extension Whitelisting**: Artifact intake permits only approved model extensions (`.pkl`, `.joblib`, `.json`, `.onnx`, `.bin`). Dangerous executables (`.exe`, `.sh`, `.bat`, etc.) are rejected with `SecurityError`.
2. **Content-Addressed Storage & Integrity Verification**: Every uploaded model artifact is digested with SHA-256 upon intake. Prior to execution and reloading, artifact integrity is verified against the stored hash.
3. **Storage Boundary Enforcement**: Path traversal sequences (`../`, `..\\`, absolute paths, null bytes) are stripped, and stored artifacts are sandboxed strictly within `STORAGE_DIR`.
4. **Adapter Mediation (In-Process)**: Deserialization is executed in-process mediated through the `ModelAdapter` registry (`backend/app/adapters/registry.py`) with strict exception handling mapping failures to typed `CorruptModelError` or `UnsupportedModelError`. Note: Process-level container sandboxing is not implemented; protection relies on source authorization, extension gating, SHA-256 verification, and the storage boundary.
5. **Production Deployment Recommendation**: In production enterprise deployments, only model artifacts cryptographically signed by internal CI/CD build pipelines or secure model registries (e.g. MLflow/W&B/Vertex) should be accepted.

---

## 2. API Authentication & Network Security

### Configurable Authentication
- When `MODEL_HEALTH_API_KEY` is configured in the environment, all management operations require authentication via:
  - Header: `X-API-Key: <token>` or `Authorization: Bearer <token>`
- Missing or invalid tokens return standard HTTP 401 (`AuthenticationError`).

### Upload Size Limits
- Upload sizes are bounded by `MAX_UPLOAD_SIZE_MB` (default: 50MB). Oversized payloads return HTTP 413 (`PayloadTooLargeError`).

### Rate Limiting
- High-cost compute and retraining endpoints (`/api/intake`, `/api/refine`) enforce sliding-window rate limiting per client IP to protect against runaway retry loops or Denial-of-Service bursts (HTTP 429).

### Restricted CORS
- Cross-Origin Resource Sharing (CORS) defaults to configured local and internal origins rather than wildcard in production.

---

## 3. Idempotency & Safe State Management

- **Safe Default Promotion Mode**: All newly registered monitoring units default to `"ASSISTED"` mode, staging passing candidates for human review and evaluation rather than auto-deploying without oversight.
- **Immutable Version History**: Promotions and rollbacks are recorded as explicit state transitions in the `audit_events` ledger. Previous Champion versions are never deleted or overwritten.
- **Content Deduplication**: Re-uploading identical model or dataset bytes references the existing hash without allocating duplicate storage.
- **Atomic Rollback**: Rollbacks switch active pointer within the specified `MonitoringUnit` without impacting any other unit.

