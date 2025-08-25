# backend/api/users.py
from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
from flask import Blueprint, request, jsonify, current_app, Response
from firebase_admin import auth as fb_auth
from backend.client import db, SERVER_TS  # type: ignore

bp = Blueprint("users", __name__)
COL = "users"
AUDIT_COL = "activity_logs"

# ----------------------- helpers -----------------------
def _err(msg: str, code: int) -> Tuple[Response, int]:
    return jsonify({"error": msg}), code

def _require_decoded_token() -> Dict[str, Any]:
    authz = request.headers.get("Authorization", "")
    if not authz.startswith("Bearer "):
        raise ValueError("Missing or invalid Authorization header")
    token = authz.split(" ", 1)[1]
    return fb_auth.verify_id_token(token)

def _require_auth_uid() -> str:
    return _require_decoded_token()["uid"]

def _require_admin(decoded: Dict[str, Any]) -> None:
    role = decoded.get("role") or decoded.get("claims", {}).get("role")
    scopes = decoded.get("scopes") or decoded.get("claims", {}).get("scopes") or []
    if role != "admin" or ("ads.read" not in scopes):
        raise PermissionError("Admin with ads.read scope required")

def _serialize_doc(snap) -> Dict[str, Any]:
    data = snap.to_dict()
    data["id"] = snap.id
    return data

def _audit(uid: str, action: str, details: Dict[str, Any]) -> None:
    db.collection(AUDIT_COL).document().set({  # type: ignore
        "userId": uid,
        "action": action,
        "details": details,
        "timestamp": SERVER_TS,  # type: ignore
    })

# ----------------------- core ops -----------------------
def create_or_update_user(uid: str, data: Dict[str, Any]) -> Dict[str, Any]:
    ref = db.collection(COL).document(uid)  # type: ignore
    snap = ref.get()
    payload: Dict[str, Any] = {
        "uid": uid,
        "email": data.get("email"),
        "displayName": data.get("displayName"),
        "photoURL": data.get("photoURL"),
        "isAnonymous": data.get("isAnonymous", False),
        "lastSignIn": SERVER_TS,  # type: ignore
        "updatedAt": SERVER_TS,   # type: ignore
    }
    if not snap.exists:
        payload["createdAt"] = SERVER_TS  # type: ignore
    # Optional consent updates if provided explicitly by UI
    if "marketingConsent" in data:
        payload["marketingConsent"] = bool(data.get("marketingConsent"))
        payload["marketingConsentUpdatedAt"] = SERVER_TS  # type: ignore
    # Optional cohort fields
    for k in ("country", "ageBracket"):
        if k in data:
            payload[k] = data.get(k)
    ref.set(payload, merge=True)
    return _serialize_doc(ref.get())

def get_user(uid: str) -> Optional[Dict[str, Any]]:
    snap = db.collection(COL).document(uid).get()  # type: ignore
    if not snap.exists:
        return None
    return _serialize_doc(snap)

def delete_user(uid: str) -> bool:
    ref = db.collection(COL).document(uid)  # type: ignore
    if not ref.get().exists:
        return False
    ref.delete()
    return True

# ----------------------- self routes -----------------------
@bp.post("/users/me")
def upsert_me():
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)

    if not request.is_json:
        return _err("Content-Type must be application/json", 415)

    body = request.get_json(silent=True) or {}
    try:
        doc = create_or_update_user(uid, body)
        return jsonify(doc), 201
    except Exception as e:
        current_app.logger.exception(e)
        return _err("Internal error", 500)

@bp.get("/users/me")
def get_me():
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)

    doc = get_user(uid)
    if not doc:
        return _err("User not found", 404)
    return jsonify(doc), 200

@bp.delete("/users/me")
def delete_me():
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)

    ok = delete_user(uid)
    if not ok:
        return _err("User not found", 404)
    return jsonify({"deleted": True, "id": uid}), 200

# ----------------------- admin route -----------------------
@bp.get("/admin/users")
def admin_list_users():
    """
    Admin-only, consented, least-privilege list of users for ad-sales.
    Query params:
      - limit (1..200, default 100)
      - startAfter (uid)
      - fields=country,ageBracket,email   // optional extras, email is PII; only if consented
    """
    try:
        decoded = _require_decoded_token()
        _require_admin(decoded)
        admin_uid = decoded["uid"]
    except PermissionError as pe:
        return _err(str(pe), 403)
    except Exception:
        return _err("Unauthorized", 401)

    try:
        limit = max(1, min(int(request.args.get("limit", 100)), 200))
    except Exception:
        limit = 100
    start_after = request.args.get("startAfter")
    requested_fields = set((request.args.get("fields") or "").split(",")) if request.args.get("fields") else set()

    base_fields = {"uid", "displayName", "createdAt", "lastSignIn"}
    optional_fields = {"country", "ageBracket"}
    pii_email = {"email"}
    allowed = base_fields | (requested_fields & optional_fields)
    include_email = "email" in requested_fields

    q = db.collection(COL).where("marketingConsent", "==", True).order_by("uid")  # type: ignore
    if start_after:
        last = db.collection(COL).document(start_after).get()  # type: ignore
        if last.exists:
            q = q.start_after(last)
    q = q.limit(limit)

    docs = list(q.stream())  # type: ignore
    results: List[Dict[str, Any]] = []

    for d in docs:
        u = d.to_dict()
        u["uid"] = u.get("uid", d.id)
        view = {k: u.get(k) for k in allowed}
        if include_email:
            view["email"] = u.get("email")  # consider hashing if you don't need raw
        view["id"] = d.id
        results.append(view)

    _audit(admin_uid, "admin.users.list", {
        "count": len(results),
        "limit": limit,
        "requested_fields": sorted(list(requested_fields)),
        "include_email": include_email,
    })

    return jsonify(results), 200

# --- registration hook expected by app.py ---
def register_user_routes(app):
    app.register_blueprint(bp)