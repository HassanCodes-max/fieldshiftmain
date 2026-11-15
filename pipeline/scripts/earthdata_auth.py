"""NASA Earthdata credentials shared by the SMAP and IMERG download scripts.

Order: EARTHDATA_USERNAME / EARTHDATA_PASSWORD → ~/.netrc or ~/_netrc (machine urs.earthdata.nasa.gov)
→ the operating system's credential store (Windows Credential Manager / macOS Keychain, via `keyring`,
saved there by scripts.fetch_earthdata after a successful login) → interactive prompt.
Credentials are never written to project files.
"""
from __future__ import annotations

import functools
import getpass
import netrc
import os
from pathlib import Path
from urllib.parse import urlparse

import requests

AUTH_HOST = "urs.earthdata.nasa.gov"


def _from_netrc() -> tuple[str, str] | None:
    for name in (".netrc", "_netrc"):
        path = Path.home() / name
        if path.exists():
            try:
                auth = netrc.netrc(str(path)).authenticators(AUTH_HOST)
            except (netrc.NetrcParseError, OSError):
                continue
            if auth:
                return auth[0], auth[2]
    return None


KEYRING_SERVICE = "fieldshift-earthdata"


def _keyring():
    try:
        import keyring
        return keyring
    except ImportError:
        return None


def _from_keyring() -> tuple[str, str] | None:
    kr = _keyring()
    if kr is None:
        return None
    try:
        user = kr.get_password(KEYRING_SERVICE, "__username__")
        pwd = kr.get_password(KEYRING_SERVICE, user) if user else None
    except Exception:  # noqa: BLE001 - no usable backend
        return None
    return (user, pwd) if user and pwd else None


def remember(user: str, pwd: str) -> bool:
    """Save a verified login in the OS credential store so later runs do not ask again."""
    kr = _keyring()
    if kr is None:
        return False
    try:
        kr.set_password(KEYRING_SERVICE, "__username__", user)
        kr.set_password(KEYRING_SERVICE, user, pwd)
        return True
    except Exception:  # noqa: BLE001
        return False


def forget() -> None:
    kr = _keyring()
    found = _from_keyring()
    if kr and found:
        for key in ("__username__", found[0]):
            try:
                kr.delete_password(KEYRING_SERVICE, key)
            except Exception:  # noqa: BLE001
                pass
    credentials.cache_clear()


def source() -> str:
    """Where credentials() will come from (for messages; never returns the secret)."""
    if os.environ.get("EARTHDATA_USERNAME") and os.environ.get("EARTHDATA_PASSWORD"):
        return "environment"
    if _from_netrc():
        return "netrc"
    if _from_keyring():
        return "keyring"
    return "prompt"


@functools.lru_cache(maxsize=1)
def credentials() -> tuple[str, str]:
    user, pwd = os.environ.get("EARTHDATA_USERNAME"), os.environ.get("EARTHDATA_PASSWORD")
    if user and pwd:
        return user, pwd
    found = _from_netrc() or _from_keyring()
    if found:
        return found
    user = user or input("NASA Earthdata username: ")
    return user, pwd or getpass.getpass("NASA Earthdata password: ")


class EarthdataSession(requests.Session):
    """Keeps credentials across the redirect to Earthdata login, but never sends them anywhere else."""

    def rebuild_auth(self, prepared_request, response):
        headers = prepared_request.headers
        if "Authorization" in headers:
            orig = urlparse(response.request.url).hostname
            redir = urlparse(prepared_request.url).hostname
            if orig != redir and AUTH_HOST not in (orig, redir):
                del headers["Authorization"]


def session(headers: dict | None = None) -> requests.Session:
    """Session for Earthdata-protected HTTPS data (e.g. GES DISC). EARTHDATA_TOKEN is used if set."""
    s = EarthdataSession()
    s.headers.update(headers or {})
    token = os.environ.get("EARTHDATA_TOKEN")
    if token:
        s.headers["Authorization"] = f"Bearer {token}"
    else:
        s.auth = credentials()
    return s
