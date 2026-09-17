from typing import Optional, Dict, Any


class ModelHealthException(Exception):
    """Base exception for all domain errors in the Model Health System."""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class CorruptModelError(ModelHealthException):
    """Raised when a model artifact cannot be deserialized, is empty, or has corrupt bytes."""
    pass


class UnsupportedModelError(ModelHealthException):
    """Raised when a model type/framework is not supported or recognized."""
    pass


class IncompatibleDataError(ModelHealthException):
    """Raised when a dataset has missing target, incompatible feature schema, or corrupted format."""
    pass


class InsufficientEvidenceError(ModelHealthException):
    """Raised when a calculation cannot be performed due to insufficient labels or data."""
    pass


class EntityNotFoundError(ModelHealthException):
    """Raised when a requested database entity (Model, Dataset, Unit, Version, Candidate) does not exist."""
    pass


class StorageError(ModelHealthException):
    """Raised when artifact storage operations fail, path traversal is attempted, or disk writes error."""
    pass


class SecurityError(ModelHealthException):
    """Raised when security boundaries are violated (e.g. unallowed file types, path traversal)."""
    pass


class PayloadTooLargeError(ModelHealthException):
    """Raised when uploaded artifact exceeds configured size limits."""
    pass


class AuthenticationError(ModelHealthException):
    """Raised when API token or credentials are missing or invalid."""
    pass


class DatabaseError(ModelHealthException):
    """Raised when database read, write, or migration transactions fail."""
    pass
