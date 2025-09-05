# backend/api/bootstrap.py
from __future__ import annotations
from typing import Any, Dict, Tuple
from flask import Blueprint, request, jsonify
from firebase_admin import auth as fb_auth
from backend.client import db, SERVER_TS  # type: ignore

bp = Blueprint("bootstrap", __name__)

def _err(msg: str, code: int) -> Tuple[Any, int]:
    return jsonify({"error": msg}), code

def _uid_from_auth() -> str:
    authz = request.headers.get("Authorization", "")
    if not authz.startswith("Bearer "):
        raise ValueError("Missing or invalid Authorization header")
    token = authz.split(" ", 1)[1]
    decoded = fb_auth.verify_id_token(token)
    return decoded["uid"]

@bp.post("/bootstrap/import")
def import_local_data():
    # 1) Auth
    try:
        uid = _uid_from_auth()
    except Exception:
        return _err("Unauthorized", 401)

    # 2) Validate body
    if not request.is_json:
        return _err("Content-Type must be application/json", 415)
    body: Dict[str, Any] = request.get_json(silent=True) or {}

    tasks = body.get("tasks") or []
    archived = body.get("archived_entries") or []
    chaos = body.get("chaos_entries") or []

    # 3) Upsert user doc (optional hardening)
    db.collection("users").document(uid).set({
        "uid": uid,
        "updatedAt": SERVER_TS,  # type: ignore
        "lastSignIn": SERVER_TS  # type: ignore
    }, merge=True)

    # 4) Create docs & build id mapping
    task_map: Dict[str, str] = {}
    for t in tasks:
        local_id = t.get("localId")
        if not local_id:
            continue
        payload = {
            "userId": uid,
            "title": (t.get("title") or "").strip(),
            "notes": t.get("notes"),
            "priority": t.get("priority"),
            "dueDate": t.get("dueDate"),
            "state": t.get("state") or "Exploring",
            "createdAt": SERVER_TS,  # type: ignore
            "updatedAt": SERVER_TS,  # type: ignore
        }
        ref = db.collection("tasks").document()  # type: ignore
        ref.set(payload)
        task_map[local_id] = ref.id

    arch_map: Dict[str, str] = {}
    for a in archived:
        local_id = a.get("localId")
        if not local_id:
            continue
        ref_type = a.get("refType") or "task"
        snapshot = a.get("snapshot") or {}
        snapshot["userId"] = uid
        doc = {
            "userId": uid,
            "refType": ref_type,
            "refId": a.get("refId"),       # may be None (new when restored)
            "snapshot": snapshot,
            "createdAt": SERVER_TS,        # type: ignore
            "restoreCount": 0
        }
        ref = db.collection("archived_entries").document()  # type: ignore
        ref.set(doc)
        arch_map[local_id] = ref.id

    chaos_map: Dict[str, str] = {}
    for c in chaos:
        local_id = c.get("localId")
        if not local_id:
            continue
        payload = {
            "userId": uid,
            "text": c.get("text"),
            "capturedAt": c.get("capturedAt") or SERVER_TS,  # type: ignore
            "createdAt": SERVER_TS,  # type: ignore
            "updatedAt": SERVER_TS,  # type: ignore
        }
        ref = db.collection("chaos_entries").document()  # type: ignore
        ref.set(payload)
        chaos_map[local_id] = ref.id

    return jsonify({
        "tasks": task_map,
        "archived_entries": arch_map,
        "chaos_entries": chaos_map
    }), 200
