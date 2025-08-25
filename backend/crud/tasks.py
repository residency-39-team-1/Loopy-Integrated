# backend/api/tasks.py
from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
from flask import Blueprint, request, jsonify, current_app, Response
from firebase_admin import auth as fb_auth
from backend.client import db, SERVER_TS  # type: ignore

bp = Blueprint("tasks", __name__)
COL = "tasks"

# ---------------------------------------------------------------------------
# Settings / enums (align with frontend)
# ---------------------------------------------------------------------------
ALLOWED_STATES = {"Exploring", "Planning", "Doing", "Done"}  # keep in sync with RN
ALLOWED_ORDER = {"createdAt", "updatedAt", "priority", "dueDate"}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _err(msg: str, code: int) -> Tuple[Response, int]:
    return jsonify({"error": msg}), code

def _require_auth_uid() -> str:
    authz = request.headers.get("Authorization", "")
    if not authz.startswith("Bearer "):
        raise ValueError("Missing or invalid Authorization header")
    token = authz.split(" ", 1)[1]
    decoded = fb_auth.verify_id_token(token)
    return decoded["uid"]

def _serialize_doc(snap) -> Dict[str, Any]:
    data = snap.to_dict()
    data["id"] = snap.id
    return data

def _coerce_int(v: Optional[str], default: int, lo: int = 1, hi: int = 100) -> int:
    try:
        if v is None:
            return default
        n = int(v)
        return max(lo, min(hi, n))
    except Exception:
        return default

# ---------------------------------------------------------------------------
# Core ops (callable from routes)
# ---------------------------------------------------------------------------
def create_task(uid: str, data: Dict[str, Any]) -> Dict[str, Any]:
    title = (data.get("title") or "").strip()
    if not title:
        raise ValueError("title is required")

    state = data.get("state", "Exploring")
    if state not in ALLOWED_STATES:
        raise ValueError(f"state must be one of {sorted(ALLOWED_STATES)}")

    payload: Dict[str, Any] = {
        "userId": uid,
        "title": title,
        "notes": data.get("notes"),
        "priority": data.get("priority"),       # number or enum per UI
        "dueDate": data.get("dueDate"),         # ISO string or timestamp from client
        "state": state,
        "createdAt": SERVER_TS,                 # type: ignore
        "updatedAt": SERVER_TS,                 # type: ignore
    }

    ref = db.collection(COL).document()  # type: ignore
    ref.set(payload)                     # type: ignore
    snap = ref.get()
    return _serialize_doc(snap)

def get_task(uid: str, task_id: str) -> Optional[Dict[str, Any]]:
    snap = db.collection(COL).document(task_id).get()  # type: ignore
    if not snap.exists:
        return None
    data = snap.to_dict()
    if data.get("userId") != uid:
        return "forbidden"  # sentinel
    return _serialize_doc(snap)

def update_task(uid: str, task_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    ref = db.collection(COL).document(task_id)  # type: ignore
    snap = ref.get()
    if not snap.exists:
        return None
    current = snap.to_dict()
    if current.get("userId") != uid:
        return "forbidden"

    write: Dict[str, Any] = {}
    if "title" in updates:
        title = (updates.get("title") or "").strip()
        if not title:
            raise ValueError("title cannot be empty")
        write["title"] = title

    if "state" in updates:
        state = updates.get("state")
        if state not in ALLOWED_STATES:
            raise ValueError(f"state must be one of {sorted(ALLOWED_STATES)}")
        write["state"] = state

    for k in ("notes", "priority", "dueDate"):
        if k in updates:
            write[k] = updates.get(k)

    if not write:
        return _serialize_doc(snap)  # no-op

    write["updatedAt"] = SERVER_TS  # type: ignore
    ref.set(write, merge=True)
    return _serialize_doc(ref.get())

def delete_task(uid: str, task_id: str) -> str | None:
    ref = db.collection(COL).document(task_id)  # type: ignore
    snap = ref.get()
    if not snap.exists:
        return None
    if snap.to_dict().get("userId") != uid:
        return "forbidden"
    ref.delete()
    return task_id

def list_tasks(
    uid: str,
    state: Optional[str],
    order_by: str,
    limit: int,
    start_after: Optional[str],
    due_before: Optional[str],
    due_after: Optional[str],
) -> List[Dict[str, Any]]:
    # base query
    q = db.collection(COL).where("userId", "==", uid)  # type: ignore

    if state:
        if state not in ALLOWED_STATES:
            raise ValueError(f"state must be one of {sorted(ALLOWED_STATES)}")
        q = q.where("state", "==", state)

    # range filters on dueDate (if client sends them)
    if due_before:
        q = q.where("dueDate", "<=", due_before)
    if due_after:
        q = q.where("dueDate", ">=", due_after)

    # order and pagination
    if order_by not in ALLOWED_ORDER:
        order_by = "createdAt"
    q = q.order_by(order_by)

    if start_after:
        last = db.collection(COL).document(start_after).get()  # type: ignore
        if last.exists:
            q = q.start_after(last)

    q = q.limit(limit)
    return [_serialize_doc(d) for d in q.stream()]  # type: ignore

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@bp.post("/tasks")
def create_task_http():
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)

    if not request.is_json:
        return _err("Content-Type must be application/json", 415)
    body = request.get_json(silent=True) or {}

    try:
        task = create_task(uid, body)
        # Optional: write audit log here
        return jsonify(task), 201
    except ValueError as ve:
        return _err(str(ve), 400)
    except Exception as e:
        current_app.logger.exception(e)
        return _err("Internal error", 500)

@bp.get("/tasks/<task_id>")
def get_task_http(task_id: str):
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)

    result = get_task(uid, task_id)
    if result is None:
        return _err("Task not found", 404)
    if result == "forbidden":
        return _err("Forbidden", 403)
    return jsonify(result), 200

@bp.patch("/tasks/<task_id>")
def update_task_http(task_id: str):
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)

    if not request.is_json:
        return _err("Content-Type must be application/json", 415)
    body = request.get_json(silent=True) or {}

    try:
        result = update_task(uid, task_id, body)
    except ValueError as ve:
        return _err(str(ve), 400)
    except Exception as e:
        current_app.logger.exception(e)
        return _err("Internal error", 500)

    if result is None:
        return _err("Task not found", 404)
    if result == "forbidden":
        return _err("Forbidden", 403)
    return jsonify(result), 200

@bp.delete("/tasks/<task_id>")
def delete_task_http(task_id: str):
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)

    result = delete_task(uid, task_id)
    if result is None:
        return _err("Task not found", 404)
    if result == "forbidden":
        return _err("Forbidden", 403)
    return jsonify({"deleted": True, "id": result}), 200

@bp.get("/tasks")
def list_tasks_http():
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)

    state = request.args.get("state")
    order_by = request.args.get("orderBy", "createdAt")
    start_after = request.args.get("startAfter")
    due_before = request.args.get("dueBefore")
    due_after = request.args.get("dueAfter")
    limit = _coerce_int(request.args.get("limit"), default=50, lo=1, hi=100)

    try:
        items = list_tasks(uid, state, order_by, limit, start_after, due_before, due_after)
        return jsonify(items), 200
    except ValueError as ve:
        return _err(str(ve), 400)
    except Exception as e:
        current_app.logger.exception(e)
        return _err("Internal error", 500)

# --- registration hook expected by app.py ---
def register_task_routes(app):
    app.register_blueprint(bp)