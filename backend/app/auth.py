"""Sign-in for the organiser.

One credential pair, read from the environment - there is no sign-up, no user
table and no password reset. On a correct sign-in the API hands back a short
HMAC-signed token that the browser sends on every later call.

The token is signed, not encrypted: it carries the username and an expiry, and
the signature stops anyone editing either. Nothing secret is inside it.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import secrets
import time

from fastapi import Header, HTTPException

from . import config

log = logging.getLogger("uvicorn.error")

# Sessions survive a restart only if SESSION_SECRET is set. Without it a fresh
# random secret is generated per process, so restarting signs everyone out.
_SECRET = config.SESSION_SECRET or secrets.token_hex(32)
if config.auth_enabled() and not config.SESSION_SECRET:
    log.warning(
        "SESSION_SECRET is not set - sign-ins will be dropped whenever the API restarts. "
        "Set it in backend/.env to keep people signed in."
    )
if not config.auth_enabled():
    log.warning(
        "AUTH_USERNAME / AUTH_PASSWORD are not set - the API is OPEN to anyone who can "
        "reach it. Set both in backend/.env to switch sign-in on."
    )

# Crude brute-force brake: failures per client address, newest last.
_failures: dict[str, list[float]] = {}
MAX_FAILURES = 5
FAILURE_WINDOW = 300.0  # seconds a failure is remembered
LOCKOUT = 60.0  # seconds locked out once the limit is hit


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _sign(payload: str) -> str:
    digest = hmac.new(_SECRET.encode(), payload.encode(), hashlib.sha256).digest()
    return _b64encode(digest)


def issue_token(username: str) -> tuple[str, int]:
    """Return (token, unix expiry)."""
    expires_at = int(time.time()) + config.SESSION_HOURS * 3600
    payload = _b64encode(json.dumps({"u": username, "exp": expires_at}).encode())
    return f"{payload}.{_sign(payload)}", expires_at


def verify_token(token: str) -> str | None:
    """Return the username if the token is genuine and unexpired, else None."""
    if not token or token.count(".") != 1:
        return None
    payload, signature = token.split(".", 1)
    if not hmac.compare_digest(signature, _sign(payload)):
        return None
    try:
        data = json.loads(_b64decode(payload))
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict) or int(data.get("exp", 0)) < time.time():
        return None
    username = data.get("u")
    return username if isinstance(username, str) else None


def _recent_failures(client: str) -> list[float]:
    now = time.time()
    recent = [at for at in _failures.get(client, []) if now - at < FAILURE_WINDOW]
    if recent:
        _failures[client] = recent
    else:
        _failures.pop(client, None)
    return recent


def seconds_locked_out(client: str) -> int:
    """How long this client must wait before trying again (0 = go ahead)."""
    recent = _recent_failures(client)
    if len(recent) < MAX_FAILURES:
        return 0
    wait = LOCKOUT - (time.time() - recent[-1])
    return max(0, int(wait) + 1)


def record_failure(client: str) -> None:
    _failures.setdefault(client, []).append(time.time())


def clear_failures(client: str) -> None:
    _failures.pop(client, None)


def check_credentials(username: str, password: str) -> bool:
    """Constant-time comparison, so a wrong username and a wrong password take
    the same time to reject."""
    user_ok = hmac.compare_digest(username.strip(), config.AUTH_USERNAME)
    password_ok = hmac.compare_digest(password, config.AUTH_PASSWORD)
    return user_ok and password_ok


def require_auth(authorization: str | None = Header(default=None)) -> str:
    """FastAPI dependency guarding every endpoint that is not public."""
    if not config.auth_enabled():
        return "open"

    token = ""
    if authorization:
        scheme, _, value = authorization.partition(" ")
        token = value.strip() if scheme.lower() == "bearer" else authorization.strip()

    username = verify_token(token)
    if not username:
        raise HTTPException(
            status_code=401,
            detail="Your session has ended. Sign in again to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return username
