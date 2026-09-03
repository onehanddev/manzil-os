"""Supabase Auth integration – thin wrapper with local fallback.

- When SUPABASE_URL (+ ANON or SERVICE key) is set, this module provides a real client.
- When not set (pytest, offline dev), functions no-op / raise gracefully and caller falls back to local JWT logic.
- Frontend already uses `supabase.auth.signInWithOtp` directly; backend's job is to *verify* the Supabase JWT and map `sub` -> `users.auth_user_id` -> roles.

Env vars (set in backend/.env or deployment):
  SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET
"""

import os
from typing import Optional


def _get_env(name: str) -> str | None:
    val = os.environ.get(name)
    if val:
        val = val.strip().strip('"').strip("'")
        if val:
            return val
    # also try reading backend/.env file directly (so get_database_url style fallback)
    try:
        import pathlib

        env_path = pathlib.Path(__file__).parent.parent.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line.startswith(name):
                    _, _, v = line.partition("=")
                    cand = v.strip().strip('"').strip("'")
                    if cand and not cand.startswith("#"):
                        return cand
    except Exception:
        pass
    return None


def get_supabase_url() -> str | None:
    return _get_env("SUPABASE_URL")


def get_supabase_jwt_secret() -> str | None:
    # Supabase JWT secret is used to verify JSW from supabase-js
    val = _get_env("SUPABASE_JWT_SECRET")
    if val:
        return val
    # fallback: SUPABASE_JWT_SECRET often same as legacy, try VITE_ variant
    return _get_env("VITE_SUPABASE_JWT_SECRET")


def is_supabase_configured() -> bool:
    # Local Supabase uses ES256 via JWKS (no HS256 secret verification needed); check for URL + any key
    return bool(get_supabase_url() and (get_supabase_jwt_secret() or _get_env("SUPABASE_ANON_KEY") or _get_env("SUPABASE_SERVICE_ROLE_KEY")))


def get_supabase_client(service_role: bool = False):
    """Return supabase client or None if not configured.

    service_role=True uses SERVICE_ROLE_KEY (for admin.create_user). Otherwise anon.
    """
    try:
        from supabase import create_client
    except ImportError:
        return None
    url = get_supabase_url()
    if not url:
        return None
    key = _get_env("SUPABASE_SERVICE_ROLE_KEY") if service_role else _get_env("SUPABASE_ANON_KEY")
    # fallback: try anon if service not set
    if not key:
        key = _get_env("SUPABASE_ANON_KEY") or _get_env("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None
    try:
        return create_client(url, key)
    except Exception:
        return None


_jwks_cache: dict[str, dict] = {}


def _get_jwks(supabase_url: str) -> dict | None:
    """Fetch and cache JWKS from Supabase Auth. Returns dict kid -> JWK."""
    if supabase_url in _jwks_cache:
        return _jwks_cache[supabase_url]
    try:
        import urllib.request
        import json

        url = supabase_url.rstrip("/") + "/auth/v1/.well-known/jwks.json"
        with urllib.request.urlopen(url, timeout=2) as resp:
            data = json.loads(resp.read().decode())
            cache = {k.get("kid"): k for k in data.get("keys", []) if k.get("kid")}
            if cache:
                _jwks_cache[supabase_url] = cache
                return cache
    except Exception:
        pass
    return None


def verify_supabase_jwt(token: str) -> dict | None:
    """Verify Supabase JWT.

    Tries HS256 via SUPABASE_JWT_SECRET first (hosted), then ES256/RS256 via JWKS
    from SUPABASE_URL (local Supabase uses ES256), and finally falls back to
    GoTrue /auth/v1/user introspection if crypto fails.
    """
    # 1. Hosted path: HS256 with shared secret
    secret = get_supabase_jwt_secret()
    if secret:
        try:
            import jwt as pyjwt

            payload = pyjwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
            return payload
        except Exception:
            pass

    supabase_url = get_supabase_url()
    if not supabase_url:
        return None

    # 2. Local path: ES256/RS256 via JWKS
    try:
        import jwt as pyjwt

        header = pyjwt.get_unverified_header(token)
        kid = header.get("kid")
        alg = header.get("alg", "ES256")
        jwks = _get_jwks(supabase_url)
        if jwks and kid and kid in jwks:
            jwk = jwks[kid]
            # Convert JWK to PEM public key
            public_key = pyjwt.algorithms.ECAlgorithm.from_jwk(jwk) if alg.startswith("ES") else pyjwt.algorithms.RSAAlgorithm.from_jwk(jwk)
            # For EC/RS, pyjwt expects the key object; also try string form
            try:
                payload = pyjwt.decode(token, public_key, algorithms=[alg], options={"verify_aud": False})
                return payload
            except Exception:
                # Retry with JWK JSON string (some pyjwt versions need it)
                import json

                payload = pyjwt.decode(
                    token, json.dumps(jwk), algorithms=[alg], options={"verify_aud": False}
                )
                return payload
        # 2b. Try JWKS without kid matching (single key case)
        if jwks and len(jwks) == 1:
            jwk = next(iter(jwks.values()))
            try:
                public_key = pyjwt.algorithms.ECAlgorithm.from_jwk(jwk)
                payload = pyjwt.decode(token, public_key, algorithms=[alg], options={"verify_aud": False})
                return payload
            except Exception:
                pass
    except Exception:
        pass

    # 3. Fallback: introspect via GoTrue user endpoint (works for any alg without local crypto)
    try:
        import urllib.request
        import json

        anon_key = _get_env("SUPABASE_ANON_KEY") or _get_env("SUPABASE_SERVICE_ROLE_KEY")
        if anon_key:
            url = supabase_url.rstrip("/") + "/auth/v1/user"
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "apikey": anon_key})
            with urllib.request.urlopen(req, timeout=3) as resp:
                user = json.loads(resp.read().decode())
                # GoTrue returns user object with id -> sub
                if isinstance(user, dict) and user.get("id"):
                    # Build minimal payload compatible with backend deps
                    return {"sub": user["id"], "phone": user.get("phone"), "aud": "authenticated", "user_metadata": user.get("user_metadata", {})}
    except Exception:
        pass

    return None


def _is_test_otp_mode() -> bool:
    val = _get_env("SUPABASE_TEST_OTP")
    if val and val.strip().lower() in ("1", "true", "yes"):
        return True
    # also allow explicit test env for CI without real Twilio
    if os.environ.get("PYTEST_CURRENT_TEST"):
        # When running pytest without real Supabase keys, treat as test OTP unless live flag set
        if _get_env("SUPABASE_TEST_OTP") != "0":
            return True
    return False


def supabase_send_otp(mobile: str) -> str | None:
    """Send OTP via Supabase. In test mode returns 123456 without SMS cost."""
    if _is_test_otp_mode():
        return "123456"
    client = get_supabase_client(service_role=False)
    if client is None:
        return None
    try:
        # Supabase phone OTP - shouldCreateUser true for registration flow
        client.auth.sign_in_with_otp({"phone": mobile})
        return "sent"
    except Exception:
        return None


def supabase_verify_otp(mobile: str, token: str) -> dict | None:
    """Verify OTP via Supabase. In test mode checks 123456 and mints a JWT (real Supabase user if configured)."""
    if _is_test_otp_mode():
        if token != "123456":
            return None
        secret = get_supabase_jwt_secret()
        if not secret:
            return None
        import jwt as pyjwt
        import uuid

        # If real Supabase is configured, create the user there so it appears in dashboard
        # This is the cheap test path: 123456 bypasses SMS but still writes to auth.users
        auth_id = None
        if is_supabase_configured():
            try:
                client = get_supabase_client(service_role=True)
                if client is not None:
                    synthetic_email = f"{mobile.replace('+', '')}@manzil.local"
                    try:
                        resp = client.auth.admin.create_user(
                            {
                                "phone": mobile,
                                "email": synthetic_email,
                                "phone_confirm": True,
                                "email_confirm": True,
                                "user_metadata": {"mobile": mobile},
                            }
                        )
                        u = getattr(resp, "user", None) or (resp.get("user") if isinstance(resp, dict) else None)
                        if u is not None:
                            auth_id = getattr(u, "id", None) if not isinstance(u, dict) else u.get("id")
                            if auth_id:
                                auth_id = str(auth_id)
                    except Exception as e:
                        # Already exists -> try to find existing by phone
                        if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                            try:
                                listed = client.auth.admin.list_users()
                                users = getattr(listed, "users", None) or (listed.get("users") if isinstance(listed, dict) else None)
                                if users:
                                    for u in users:
                                        phone = getattr(u, "phone", None) if not isinstance(u, dict) else u.get("phone")
                                        if phone == mobile:
                                            auth_id = str(getattr(u, "id", None) if not isinstance(u, dict) else u.get("id"))
                                            break
                            except Exception:
                                pass
            except Exception:
                pass
        if not auth_id:
            # Fallback to deterministic id for offline CI (fake https://test.supabase.co)
            auth_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, mobile))
        jwt_token = pyjwt.encode(
            {"sub": auth_id, "phone": mobile, "aud": "authenticated", "exp": 9999999999},
            secret,
            algorithm="HS256",
        )
        return {"access_token": jwt_token, "user": {"id": auth_id, "phone": mobile}}
    client = get_supabase_client(service_role=False)
    if client is None:
        return None
    try:
        resp = client.auth.verify_otp({"phone": mobile, "token": token, "type": "sms"})
        session = getattr(resp, "session", None) or (resp.get("session") if isinstance(resp, dict) else None)
        user = getattr(resp, "user", None) or (resp.get("user") if isinstance(resp, dict) else None)
        if session and getattr(session, "access_token", None):
            return {"access_token": session.access_token, "user": user}
        return None
    except Exception:
        return None


# Test-only in-memory password store for SUPABASE_TEST_OTP mode (so set-password + sign-in work offline)
_test_password_store: dict[str, str] = {}  # auth_user_id or mobile -> password


def supabase_set_password(auth_user_id: str, password: str) -> bool:
    """Set password for Supabase user. In test mode stores in memory + tries real Supabase if configured."""
    if _is_test_otp_mode():
        _test_password_store[auth_user_id] = password
        # If real Supabase is configured, also persist there so dashboard shows it
        if is_supabase_configured():
            try:
                client = get_supabase_client(service_role=True)
                if client is not None:
                    client.auth.admin.update_user_by_id(auth_user_id, {"password": password})
            except Exception:
                pass
        return True
    client = get_supabase_client(service_role=True)
    if client is None:
        return False
    try:
        client.auth.admin.update_user_by_id(auth_user_id, {"password": password})
        return True
    except Exception:
        return False


def supabase_create_user(mobile: str, password: str, display_name: str) -> str | None:
    """Create user in Supabase auth via service role, return auth_user_id or None.

    If the phone/email already exists in auth.users (common after truncating
    public.users but not auth.users), reuse the existing auth user and update
    its password so the new public.users row can link to it. This makes local
    DB wipes idempotent without manually clearing Supabase Auth.
    """
    client = get_supabase_client(service_role=True)
    if client is None:
        return None
    synthetic_email = f"{mobile.replace('+', '')}@manzil.local"
    try:
        resp = client.auth.admin.create_user(
            {
                "email": synthetic_email,
                "phone": mobile,
                "password": password,
                "email_confirm": True,
                "phone_confirm": True,
                "user_metadata": {"display_name": display_name, "mobile": mobile},
            }
        )
        user = getattr(resp, "user", None) or getattr(resp, "data", None)
        if user and getattr(user, "id", None):
            return str(user.id)
        if isinstance(resp, dict) and resp.get("user"):
            return str(resp["user"].get("id"))
        return None
    except Exception as e:
        msg = str(e).lower()
        # Duplicate phone/email – reuse existing auth user (Supabase messages vary: "already exists", "already registered", "already been registered")
        if "already" in msg or "duplicate" in msg or "exists" in msg or "registered" in msg:
            def _find_and_reuse(users_list):
                if not users_list:
                    return None
                norm_mobile = mobile.replace("+", "").strip()
                norm_synth = synthetic_email.lower()
                for u in users_list:
                    phone = getattr(u, "phone", None) if not isinstance(u, dict) else u.get("phone")
                    email = getattr(u, "email", None) if not isinstance(u, dict) else u.get("email")
                    uid = getattr(u, "id", None) if not isinstance(u, dict) else u.get("id")
                    phone_norm = str(phone).replace("+", "").strip() if phone else ""
                    email_norm = str(email).lower().strip() if email else ""
                    if phone_norm == norm_mobile or email_norm == norm_synth:
                        try:
                            client.auth.admin.update_user_by_id(str(uid), {"password": password, "user_metadata": {"display_name": display_name, "mobile": mobile}})
                        except Exception:
                            pass
                        return str(uid)
                return None

            # Try via Python client first
            try:
                listed = client.auth.admin.list_users()
                users = getattr(listed, "users", None) or (listed.get("users") if isinstance(listed, dict) else None)
                found = _find_and_reuse(users)
                if found:
                    return found
            except Exception:
                pass
            # Fallback: direct GoTrue HTTP (python client's list_users is paginated/buggy locally)
            try:
                import json as _json
                import urllib.request as _urllib

                supabase_url = get_supabase_url()
                service_key = _get_env("SUPABASE_SERVICE_ROLE_KEY")
                if supabase_url and service_key:
                    for page in (1, 2, 3):
                        url = supabase_url.rstrip("/") + f"/auth/v1/admin/users?page={page}&per_page=100"
                        req = _urllib.Request(url, headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"})
                        with _urllib.urlopen(req, timeout=5) as resp:
                            data = _json.loads(resp.read().decode())
                            http_users = data.get("users", []) if isinstance(data, dict) else []
                            if not http_users:
                                break
                            found = _find_and_reuse(http_users)
                            if found:
                                return found
                            if len(http_users) < 100:
                                break
            except Exception:
                pass
        # Log for local debugging (do not leak to client)
        try:
            import logging

            logging.getLogger(__name__).warning("supabase_create_user failed for %s: %s", mobile, e)
        except Exception:
            pass
        return None


def supabase_sign_in(mobile: str, password: str) -> dict | None:
    """Attempt Supabase sign-in with phone/password, return session dict or None."""
    if _is_test_otp_mode():
        import jwt as pyjwt
        import uuid

        auth_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, mobile))
        # Check test password store (set via supabase_set_password) or fallback to deterministic check
        stored = _test_password_store.get(auth_id) or _test_password_store.get(mobile)
        if stored is not None:
            if stored != password:
                return None
        else:
            # If no password ever set via set-password, allow none? For backward compat with test_auth mock, fallback to real client path
            # Try real client if not in test store, but we are in test mode without real Supabase, so return None
            # However test_auth's mock will intercept before this, so we return None here to let mock handle admin case
            # For OTP-registered users who just set password, stored will be present
            return None
        secret = get_supabase_jwt_secret()
        if not secret:
            return None
        token = pyjwt.encode(
            {"sub": auth_id, "phone": mobile, "aud": "authenticated", "exp": 9999999999},
            secret,
            algorithm="HS256",
        )
        return {"access_token": token, "user": {"id": auth_id}}

    client = get_supabase_client(service_role=False)
    if client is None:
        return None
    try:
        synthetic_email = f"{mobile.replace('+', '')}@manzil.local"
        # Try email+password first (works for synthetic email users)
        resp = client.auth.sign_in_with_password({"email": synthetic_email, "password": password})
        session = getattr(resp, "session", None) or (resp.get("session") if isinstance(resp, dict) else None)
        if session and getattr(session, "access_token", None):
            return {"access_token": session.access_token, "user": getattr(resp, "user", None)}
        # fallback: try phone+password (some projects allow)
        resp2 = client.auth.sign_in_with_password({"phone": mobile, "password": password})
        session2 = getattr(resp2, "session", None) or (resp2.get("session") if isinstance(resp2, dict) else None)
        if session2 and getattr(session2, "access_token", None):
            return {"access_token": session2.access_token, "user": getattr(resp2, "user", None)}
        return None
    except Exception:
        return None
