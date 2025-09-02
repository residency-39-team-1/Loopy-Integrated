# backend/api/chaos_entries.py
from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, current_app, Response
from firebase_admin import auth as fb_auth
from backend.client import db, SERVER_TS  # type: ignore

bp = Blueprint("chaos", __name__)
COL = "chaos_entries"

# ----------------- helpers -----------------
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

def _serialize_doc(snap) -> Dict[str, Any]:
    d = snap.to_dict()
    d["id"] = snap.id
    return d

def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        # Accept 'YYYY-MM-DD' or ISO8601; coerce to UTC
        if len(s) == 10 and s.count("-") == 2:
            return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None

def _coerce_int(v: Optional[str], default: int, lo: int = 1, hi: int = 200) -> int:
    try:
        n = int(v) if v is not None else default
        return max(lo, min(hi, n))
    except Exception:
        return default

# ----------------- core ops -----------------
def create_chaos(uid: str, data: Dict[str, Any]) -> Dict[str, Any]:
    text = (data.get("text") or "").strip()
    if not text:
        raise ValueError("text is required")

    captured_at = _parse_iso(data.get("capturedAt"))

    payload: Dict[str, Any] = {
        "userId": uid,
        "text": text,
        "tags": list(data.get("tags") or []),          # array<string>
        "context": data.get("context") or {},          # arbitrary object
        "pinned": bool(data.get("pinned") or False),   # quick-star
        "capturedAt": captured_at or SERVER_TS,        # type: ignore
        "createdAt": SERVER_TS,                        # type: ignore
        "updatedAt": SERVER_TS,                        # type: ignore
    }
    ref = db.collection(COL).document()  # type: ignore
    ref.set(payload)                      # type: ignore
    return _serialize_doc(ref.get())

def get_chaos(uid: str, chaos_id: str) -> Optional[Dict[str, Any] | str]:
    snap = db.collection(COL).document(chaos_id).get()  # type: ignore
    if not snap.exists:
        return None
    data = snap.to_dict()
    if data.get("userId") != uid:
        return "forbidden"
    return _serialize_doc(snap)

def update_chaos(uid: str, chaos_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any] | str]:
    ref = db.collection(COL).document(chaos_id)  # type: ignore
    snap = ref.get()
    if not snap.exists:
        return None
    cur = snap.to_dict()
    if cur.get("userId") != uid:
        return "forbidden"

    write: Dict[str, Any] = {}
    if "text" in updates:
        text = (updates.get("text") or "").strip()
        if not text:
            raise ValueError("text cannot be empty")
        write["text"] = text

    if "tags" in updates:
        write["tags"] = list(updates.get("tags") or [])

    if "context" in updates:
        write["context"] = updates.get("context") or {}

    if "pinned" in updates:
        write["pinned"] = bool(updates.get("pinned"))

    if "capturedAt" in updates:
        parsed = _parse_iso(updates.get("capturedAt"))
        if parsed:
            write["capturedAt"] = parsed

    if not write:
        return _serialize_doc(snap)

    write["updatedAt"] = SERVER_TS  # type: ignore
    ref.set(write, merge=True)
    return _serialize_doc(ref.get())

def delete_chaos(uid: str, chaos_id: str) -> Optional[str | str]:
    ref = db.collection(COL).document(chaos_id)  # type: ignore
    snap = ref.get()
    if not snap.exists:
        return None
    if snap.to_dict().get("userId") != uid:
        return "forbidden"
    ref.delete()
    return chaos_id

def list_chaos(
    uid: str,
    start: Optional[datetime],
    end: Optional[datetime],
    limit: int,
    start_after_id: Optional[str],
    pinned: Optional[bool],
    has_tag: Optional[str],
) -> List[Dict[str, Any]]:
    q = db.collection(COL).where("userId", "==", uid)  # type: ignore

    if pinned is not None:
        q = q.where("pinned", "==", pinned)

    if has_tag:
        # Firestore supports array membership via array_contains
        q = q.where("tags", "array_contains", has_tag)

    # Use createdAt for stable sort/pagination
    q = q.order_by("createdAt")

    if start:
        q = q.where("createdAt", ">=", start)
    if end:
        q = q.where("createdAt", "<=", end)

    if start_after_id:
        last = db.collection(COL).document(start_after_id).get()  # type: ignore
        if last.exists:
            q = q.start_after(last)

    q = q.limit(limit)
    return [_serialize_doc(d) for d in q.stream()]  # type: ignore

# ----------------- routes -----------------
@bp.post("/chaos")
def create_chaos_http():
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)
    if not request.is_json:
        return _err("Content-Type must be application/json", 415)
    body = request.get_json(silent=True) or {}
    try:
        doc = create_chaos(uid, body)
        return jsonify(doc), 201
    except ValueError as ve:
        return _err(str(ve), 400)
    except Exception as e:
        current_app.logger.exception(e)
        return _err("Internal error", 500)

@bp.get("/chaos/<chaos_id>")
def get_chaos_http(chaos_id: str):
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)
    result = get_chaos(uid, chaos_id)
    if result is None:
        return _err("Chaos entry not found", 404)
    if result == "forbidden":
        return _err("Forbidden", 403)
    return jsonify(result), 200

@bp.patch("/chaos/<chaos_id>")
def update_chaos_http(chaos_id: str):
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)
    if not request.is_json:
        return _err("Content-Type must be application/json", 415)
    body = request.get_json(silent=True) or {}
    try:
        result = update_chaos(uid, chaos_id, body)
    except ValueError as ve:
        return _err(str(ve), 400)
    except Exception as e:
        current_app.logger.exception(e)
        return _err("Internal error", 500)

    if result is None:
        return _err("Chaos entry not found", 404)
    if result == "forbidden":
        return _err("Forbidden", 403)
    return jsonify(result), 200

@bp.delete("/chaos/<chaos_id>")
def delete_chaos_http(chaos_id: str):
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)
    result = delete_chaos(uid, chaos_id)
    if result is None:
        return _err("Chaos entry not found", 404)
    if result == "forbidden":
        return _err("Forbidden", 403)
    return jsonify({"deleted": True, "id": result}), 200

@bp.get("/chaos")
def list_chaos_http():
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)

    limit = _coerce_int(request.args.get("limit"), 50, 1, 200)
    start_after = request.args.get("startAfter")
    pinned = request.args.get("pinned")
    has_tag = request.args.get("tag")
    start = _parse_iso(request.args.get("start"))
    end = _parse_iso(request.args.get("end"))

    pinned_bool: Optional[bool] = None
    if pinned is not None:
        if pinned.lower() in ("1", "true", "yes"):
            pinned_bool = True
        elif pinned.lower() in ("0", "false", "no"):
            pinned_bool = False

    try:
        items = list_chaos(uid, start, end, limit, start_after, pinned_bool, has_tag)
        return jsonify(items), 200
    except Exception as e:
        current_app.logger.exception(e)
        return _err("Internal error", 500)
