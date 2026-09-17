import time
import os
from collections import defaultdict
from threading import Lock
from typing import Dict, List
from fastapi import Request, HTTPException


class SlidingWindowRateLimiter:
    """
    Thread-safe in-memory sliding window rate limiter.
    Tracks timestamps per client key to enforce rate limits without external infrastructure.
    """

    def __init__(self):
        self._requests: Dict[str, List[float]] = defaultdict(list)
        self._lock = Lock()

    def is_allowed(self, client_key: str, max_requests: int, window_seconds: float = 60.0) -> bool:
        now = time.time()
        cutoff = now - window_seconds

        with self._lock:
            # Filter timestamps to current sliding window
            timestamps = self._requests[client_key]
            valid_timestamps = [t for t in timestamps if t > cutoff]

            if len(valid_timestamps) >= max_requests:
                self._requests[client_key] = valid_timestamps
                return False

            valid_timestamps.append(now)
            self._requests[client_key] = valid_timestamps
            return True

    def reset(self):
        """Clears all stored rate limiter state (useful for tests)."""
        with self._lock:
            self._requests.clear()


# Global rate limiter singleton
limiter = SlidingWindowRateLimiter()

# Configurable limits per minute
DEFAULT_INTAKE_LIMIT = int(os.getenv("RATE_LIMIT_INTAKE", "20"))
DEFAULT_REFINE_LIMIT = int(os.getenv("RATE_LIMIT_REFINE", "15"))


def get_client_identifier(request: Request) -> str:
    """Extracts client IP or authorization token for rate-limiting key."""
    api_key = request.headers.get("X-API-Key")
    if api_key:
        return f"key:{api_key}"

    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return f"ip:{forwarded.split(',')[0].strip()}"

    client = request.client
    if client and client.host:
        return f"ip:{client.host}"

    return "ip:anonymous"


def rate_limit_intake(request: Request):
    """FastAPI dependency to rate limit /api/intake."""
    client_id = get_client_identifier(request)
    if not limiter.is_allowed(client_id, max_requests=DEFAULT_INTAKE_LIMIT, window_seconds=60.0):
        raise HTTPException(
            status_code=429,
            detail=f"Too Many Requests: Rate limit of {DEFAULT_INTAKE_LIMIT} intake requests/min exceeded. Please try again later."
        )


def rate_limit_refine(request: Request):
    """FastAPI dependency to rate limit /api/refine."""
    client_id = get_client_identifier(request)
    if not limiter.is_allowed(client_id, max_requests=DEFAULT_REFINE_LIMIT, window_seconds=60.0):
        raise HTTPException(
            status_code=429,
            detail=f"Too Many Requests: Rate limit of {DEFAULT_REFINE_LIMIT} refinement requests/min exceeded. Please try again later."
        )
