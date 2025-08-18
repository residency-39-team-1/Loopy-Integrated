# backend/api/archive.py
from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
from flask import Blueprint, request, jsonify, current_app, Response
from firebase_admin import auth as fb_auth
from backend.client import db, SERVER_TS  # type: ignore

bp = Blueprint("archive", __name__)

# ---- collections (align with ERD / frontend camelCase) ----------------------
COL_ARCHIVE = "archived_entries"
COL_TASKS = "tasks"
COL_CHAOS = "chaos_entries"
COL_DOPA = "dopamine_logs"
COL_SESS = "daily_sessions"
COL_AUDIT = "activity_logs"

TARGET_COLLECTIONS = {
    "task": COL_TASKS,
    "chaos_entry": COL_CHAOS,
    "dopamine_log": COL_DOPA,
    "daily_session": COL_SESS,
}
ALLOWED_REF_TYPES = set(TARGET_COLLECTIONS.keys())

# -----------------------------------------------------------------------------
# Utilities
# -----------------------------------------------------------------------------
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

def _shallow_diff(old: Dict[str, Any], new: Dict[str, Any]) -> Dict[str, Any]:
    """
    Very small, predictable diff for review UIs.
    Keys:
      - added: keys present in new but not in old
      - removed: keys present in old but not in new
      - changed: {key: {"from": old_val, "to": new_val}}
      - unchanged: list[str]
    NOTE: shallow (one level); values shown raw (OK for our small docs).
    """
    old_keys, new_keys = set(old.keys()), set(new.keys())
    added = sorted(new_keys - old_keys)
    removed = sorted(old_keys - new_keys)
    changed: Dict[str, Dict[str, Any]] = {}
    unchanged: List[str] = []
    for k in sorted(old_keys & new_keys):
        if old[k] != new[k]:
            changed[k] = {"from": old[k], "to": new[k]}
        else:
            unchanged.append(k)
    return {"added": added, "removed": removed, "changed": changed, "unchanged": unchanged}

def _write_audit(uid: str, action: str, details: Dict[str, Any]) -> None:
    doc = {
        "userId": uid,
        "action": action,  # e.g., "archive.create", "archive.restore"
        "details": details,
        "timestamp": SERVER_TS,  # type: ignore
    }
    db.collection(COL_AUDIT).document().set(doc)  # type: ignore

def _load_owned_archive(uid: str, archive_id: str) -> Optional[Dict[str, Any]]:
    snap = db.collection(COL_ARCHIVE).document(archive_id).get()  # type: ignore
    if not snap.exists:
        return None
    data = snap.to_dict()
    if data.get("userId") != uid:
        return "forbidden"  # sentinel string
    data["id"] = snap.id
    return data

# -----------------------------------------------------------------------------
# Core operations (callable from routes)
# -----------------------------------------------------------------------------
def add_archive(uid: str, ref_type: str, ref_id: str, snapshot: Dict[str, Any]) -> Dict[str, Any]:
    if ref_type not in ALLOWED_REF_TYPES:
        raise ValueError(f"ref_type must be one of {sorted(ALLOWED_REF_TYPES)}")
    if not isinstance(snapshot, dict):
        raise ValueError("snapshot must be an object")
    # enforce ownership within snapshot
    snapshot["userId"] = uid

    doc_ref = db.collection(COL_ARCHIVE).document()  # type: ignore
    to_write = {
        "userId": uid,
        "refType": ref_type,       # "task" | "chaos_entry" | ...
        "refId": ref_id,           # original doc ID
        "snapshot": snapshot,      # fields to restore
        "createdAt": SERVER_TS,    # type: ignore
        "restoreCount": 0,
    }
    doc_ref.set(to_write)
    snap = doc_ref.get()
    result = {"id": snap.id, **snap.to_dict()}  # type: ignore
    _write_audit(uid, "archive.create", {"archiveId": snap.id, "refType": ref_type, "refId": ref_id})
    return result

def delete_archived_entry(uid: str, archive_id: str) -> bool:
    ref = db.collection(COL_ARCHIVE).document(archive_id)  # type: ignore
    snap = ref.get()
    if not snap.exists:
        return False
    data = snap.to_dict()
    if data.get("userId") != uid:
        raise PermissionError("forbidden")
    ref.delete()
    _write_audit(uid, "archive.delete", {"archiveId": archive_id})
    return True

def list_archived_for_user(uid: str, ref_type: Optional[str], limit: int, start_after: Optional[str]) -> List[Dict[str, Any]]:
    q = db.collection(COL_ARCHIVE).where("userId", "==", uid).order_by("createdAt")  # type: ignore
    if ref_type:
        q = q.where("refType", "==", ref_type)
    if start_after:
        last = db.collection(COL_ARCHIVE).document(start_after).get()  # type: ignore
        if last.exists:
            q = q.start_after(last)
    q = q.limit(max(1, min(limit, 100)))
    return [_serialize_doc(d) for d in q.stream()]  # type: ignore

def restore_archived(uid: str, archive: Dict[str, Any], mode: str = "merge", new_id: Optional[str] = None) -> Dict[str, Any]:
    # target collection
    ref_type = archive.get("refType")
    target_col = TARGET_COLLECTIONS.get(ref_type)
    if not target_col:
        raise ValueError(f"Unknown refType: {ref_type}")

    snapshot = archive.get("snapshot") or archive.get("payload") or {}
    if not isinstance(snapshot, dict):
        raise ValueError("archive snapshot is missing or invalid")
    snapshot["userId"] = uid  # keep ownership correct

    ref_id = archive.get("refId") or new_id
    ref = db.collection(target_col).document(ref_id) if ref_id else db.collection(target_col).document()  # type: ignore
    target_id = ref.id

    # Diff (compare current vs snapshot) BEFORE write
    current_snap = ref.get()
    current = current_snap.to_dict() if current_snap.exists else {}
    diff = _shallow_diff(current or {}, snapshot)

    # Write back
    if mode == "replace":
        ref.set(snapshot)
    else:
        ref.set(snapshot, merge=True)

    # Mark archive as restored
    db.collection(COL_ARCHIVE).document(archive["id"]).set({  # type: ignore
        "restoredAt": SERVER_TS,            # type: ignore
        "restoreCount": (archive.get("restoreCount") or 0) + 1
    }, merge=True)

    # Audit
    _write_audit(uid, "archive.restore", {
        "archiveId": archive["id"],
        "targetCollection": target_col,
        "targetId": target_id,
        "mode": mode,
        "diff": diff,
    })

    return {
        "restored": True,
        "archiveId": archive["id"],
        "targetCollection": target_col,
        "targetId": target_id,
        "mode": mode,
        "diff": diff,
    }

# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------
@bp.post("/archive")
def create_archive_http():
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)

    if not request.is_json:
        return _err("Content-Type must be application/json", 415)
    body = request.get_json(silent=True) or {}

    ref_type = body.get("ref_type")
    ref_id = body.get("ref_id")
    snapshot = body.get("snapshot") or body.get("payload") or {}

    if not isinstance(ref_type, str) or not isinstance(ref_id, str):
        return _err("ref_type and ref_id are required strings", 400)
    try:
        entry = add_archive(uid, ref_type, ref_id, snapshot)
    except ValueError as ve:
        return _err(str(ve), 400)
    except Exception as e:
        current_app.logger.exception(e)
        return _err("Internal error", 500)

    resp = jsonify(entry)
    resp.status_code = 201
    resp.headers["Location"] = f"/archive/{entry['id']}"
    return resp

@bp.get("/archive")
def list_archive_http():
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)

    ref_type = request.args.get("ref_type")
    limit = int(request.args.get("limit", 50))
    start_after = request.args.get("startAfter")

    try:
        entries = list_archived_for_user(uid, ref_type, limit, start_after)
    except Exception as e:
        current_app.logger.exception(e)
        return _err("Internal error", 500)
    return jsonify(entries), 200

@bp.get("/archive/<archive_id>")
def get_archive_http(archive_id: str):
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)

    owned = _load_owned_archive(uid, archive_id)
    if owned is None:
        return _err("Archive entry not found", 404)
    if owned == "forbidden":
        return _err("Forbidden", 403)
    return jsonify(owned), 200

@bp.delete("/archive/<archive_id>")
def delete_archive_http(archive_id: str):
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)

    try:
        ok = delete_archived_entry(uid, archive_id)
    except PermissionError:
        return _err("Forbidden", 403)
    if not ok:
        return _err("Archive entry not found", 404)
    return jsonify({"deleted": True, "id": archive_id}), 200

@bp.post("/archive/<archive_id>/restore")
def restore_archive_http(archive_id: str):
    """
    Restore a specific archived entry.
    Body (optional):
      {
        "mode": "merge" | "replace",  // default: "merge"
        "newId": "string",            // optional if original refId is missing
        "dryRun": true                // if true, don't write; just return diff/target info
      }
    """
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)

    owned = _load_owned_archive(uid, archive_id)
    if owned is None:
        return _err("Archive entry not found", 404)
    if owned == "forbidden":
        return _err("Forbidden", 403)

    body = request.get_json(silent=True) or {}
    mode = (body.get("mode") or "merge").lower()
    if mode not in ("merge", "replace"):
        return _err("mode must be 'merge' or 'replace'", 400)
    new_id = body.get("newId")
    dry_run = bool(body.get("dryRun", False))

    # Compute target and diff regardless (for preview)
    ref_type = owned.get("refType")
    target_col = TARGET_COLLECTIONS.get(ref_type)
    if not target_col:
        return _err(f"Unknown refType: {ref_type}", 400)

    snapshot = owned.get("snapshot") or owned.get("payload") or {}
    if not isinstance(snapshot, dict):
        return _err("archive snapshot is missing or invalid", 400)
    snapshot["userId"] = uid

    ref_id = owned.get("refId") or new_id
    doc_ref = db.collection(target_col).document(ref_id) if ref_id else db.collection(target_col).document()  # type: ignore
    target_id = doc_ref.id

    current_snap = doc_ref.get()
    current = current_snap.to_dict() if current_snap.exists else {}
    diff = _shallow_diff(current or {}, snapshot)

    if dry_run:
        return jsonify({
            "restored": False,
            "dryRun": True,
            "archiveId": archive_id,
            "targetCollection": target_col,
            "targetId": target_id,
            "mode": mode,
            "diff": diff
        }), 200

    # Execute restore
    try:
        if mode == "replace":
            doc_ref.set(snapshot)
        else:
            doc_ref.set(snapshot, merge=True)

        db.collection(COL_ARCHIVE).document(archive_id).set({  # type: ignore
            "restoredAt": SERVER_TS,            # type: ignore
            "restoreCount": (owned.get("restoreCount") or 0) + 1
        }, merge=True)

        _write_audit(uid, "archive.restore", {
            "archiveId": archive_id,
            "targetCollection": target_col,
            "targetId": target_id,
            "mode": mode,
            "diff": diff,
        })

        return jsonify({
            "restored": True,
            "archiveId": archive_id,
            "targetCollection": target_col,
            "targetId": target_id,
            "mode": mode,
            "diff": diff
        }), 200
    except Exception as e:
        current_app.logger.exception(e)
        return _err("Internal error", 500)
