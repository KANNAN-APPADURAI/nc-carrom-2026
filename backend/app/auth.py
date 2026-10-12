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

from fastapi import Depends, Header, HTTPException

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


ADMIN = "admin"
VIEWER = "viewer"


def issue_token(username: str, role: str = ADMIN) -> tuple[str, int]:
    """Return (token, unix expiry). The role rides along, signed."""
    expires_at = int(time.time()) + config.SESSION_HOURS * 3600
    payload = _b64encode(
        json.dumps({"u": username, "r": role, "exp": expires_at}).encode()
    )
    return f"{payload}.{_sign(payload)}", expires_at


def verify_token(token: str) -> dict[str, str] | None:
    """Return {username, role} if the token is genuine and unexpired."""
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
    if not isinstance(username, str):
        return None
    # Tokens issued before viewers existed carry no role; only the organiser
    # could ever have held one, so they stay organiser tokens.
    role = data.get("r") if data.get("r") in (ADMIN, VIEWER) else ADMIN
    return {"username": username, "role": role}


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


def _matches(given_user: str, given_password: str, user: str, password: str) -> bool:
    """Constant-time comparison, so a wrong username and a wrong password take
    the same time to reject."""
    user_ok = hmac.compare_digest(given_user, user)
    password_ok = hmac.compare_digest(given_password, password)
    return user_ok and password_ok


def authenticate(username: str, password: str) -> str | None:
    """Return the role these credentials earn, or None."""
    username = username.strip()
    if _matches(username, password, config.AUTH_USERNAME, config.AUTH_PASSWORD):
        return ADMIN
    if config.viewer_enabled() and _matches(
        username, password, config.VIEWER_USERNAME, config.VIEWER_PASSWORD
    ):
        return VIEWER
    return None


def require_auth(authorization: str | None = Header(default=None)) -> dict[str, str]:
    """Guards every endpoint that is not public. Viewers get through here."""
    if not config.auth_enabled():
        return {"username": "open", "role": ADMIN}

    token = ""
    if authorization:
        scheme, _, value = authorization.partition(" ")
        token = value.strip() if scheme.lower() == "bearer" else authorization.strip()

    principal = verify_token(token)
    if not principal:
        raise HTTPException(
            status_code=401,
            detail="Your session has ended. Sign in again to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return principal


def require_editor(
    principal: dict[str, str] = Depends(require_auth),
) -> dict[str, str]:
    """Guards everything that writes. A viewer is turned away with a 403."""
    if principal.get("role") == VIEWER:
        raise HTTPException(
            status_code=403,
            detail="You are signed in as a viewer. Only the organiser can change results.",
        )
    return principal
