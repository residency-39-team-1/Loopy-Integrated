# backend/api/dopamine_logs.py
from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify, current_app, Response
from firebase_admin import auth as fb_auth
from backend.client import db, SERVER_TS  # type: ignore

bp = Blueprint("dopamine_logs", __name__)
COL = "dopamine_logs"
USERS = "users"
AUDIT_COL = "activity_logs"

ALLOWED_SOURCES = {
    "task_completed",
    "chaos_entry_created",
    "daily_session_review",
    "manual_reward",
    "plant_task_completed",
    "plant_phase_advanced",
    "plant_init",
    "plant_reset",
    "plant_deleted",
}

# ---------- helpers ----------
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
    d = snap.to_dict()
    d["id"] = snap.id
    return d

def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        # Accept YYYY-MM-DD or ISO 8601
        if len(s) == 10 and s.count("-") == 2:
            return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        return None

def _start_of_day(dt: datetime) -> datetime:
    dt = dt.astimezone(timezone.utc)
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)

def _coerce_int(v: Optional[str], default: int, lo: int = 1, hi: int = 200) -> int:
    try:
        n = int(v) if v is not None else default
        return max(lo, min(hi, n))
    except Exception:
        return default

def _audit(uid: str, action: str, details: Dict[str, Any]) -> None:
    db.collection(AUDIT_COL).document().set({  # type: ignore
        "userId": uid,
        "action": action,
        "details": details,
        "timestamp": SERVER_TS,  # type: ignore
    })

# ---------- core ops ----------
def create_log(uid: str, data: Dict[str, Any]) -> Dict[str, Any]:
    points = data.get("points")
    if not isinstance(points, int):
        raise ValueError("points must be an integer")
    source = data.get("source", "manual_reward")
    if source not in ALLOWED_SOURCES:
        raise ValueError(f"source must be one of {sorted(ALLOWED_SOURCES)}")

    payload: Dict[str, Any] = {
        "userId": uid,
        "points": points,
        "source": source,
        "context": data.get("context") or {},   # e.g., {"taskId": "..."}
        "note": data.get("note"),
        "createdAt": SERVER_TS,                 # type: ignore
    }
    ref = db.collection(COL).document()   # type: ignore
    ref.set(payload)                      # type: ignore
    return _serialize_doc(ref.get())

def get_log(uid: str, log_id: str) -> Optional[Dict[str, Any] | str]:
    snap = db.collection(COL).document(log_id).get()  # type: ignore
    if not snap.exists:
        return None
    data = snap.to_dict()
    if data.get("userId") != uid:
        return "forbidden"
    return _serialize_doc(snap)

def delete_log(uid: str, log_id: str) -> Optional[str | str]:
    ref = db.collection(COL).document(log_id)  # type: ignore
    snap = ref.get()
    if not snap.exists:
        return None
    if snap.to_dict().get("userId") != uid:
        return "forbidden"
    ref.delete()
    return log_id

def list_logs(
    uid: str,
    start: Optional[datetime],
    end: Optional[datetime],
    limit: int,
    start_after_id: Optional[str],
    source: Optional[str],
) -> List[Dict[str, Any]]:
    q = db.collection(COL).where("userId", "==", uid)  # type: ignore
    if source:
        q = q.where("source", "==", source)

    # All logs are ordered by createdAt for range queries
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

def summarize(uid: str, start: datetime, end: datetime) -> Dict[str, Any]:
    # Sum client-side from queried docs (fast enough for small windows).
    items = list_logs(uid, start, end, limit=200, start_after_id=None, source=None)
    total = sum(int(i.get("points", 0)) for i in items)
    by_source: Dict[str, int] = {}
    for i in items:
        s = i.get("source") or "unknown"
        by_source[s] = by_source.get(s, 0) + int(i.get("points", 0))
    return {"total": total, "count": len(items), "bySource": by_source}

# ---------- user routes ----------
@bp.post("/dopamine-logs")
def create_log_http():
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)
    if not request.is_json:
        return _err("Content-Type must be application/json", 415)
    body = request.get_json(silent=True) or {}
    try:
        doc = create_log(uid, body)
        # optional: also write to daily total doc here if you later maintain denormalized tallies
        return jsonify(doc), 201
    except ValueError as ve:
        return _err(str(ve), 400)
    except Exception as e:
        current_app.logger.exception(e)
        return _err("Internal error", 500)

@bp.get("/dopamine-logs/<log_id>")
def get_log_http(log_id: str):
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)
    result = get_log(uid, log_id)
    if result is None:
        return _err("Log not found", 404)
    if result == "forbidden":
        return _err("Forbidden", 403)
    return jsonify(result), 200

@bp.delete("/dopamine-logs/<log_id>")
def delete_log_http(log_id: str):
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)
    result = delete_log(uid, log_id)
    if result is None:
        return _err("Log not found", 404)
    if result == "forbidden":
        return _err("Forbidden", 403)
    return jsonify({"deleted": True, "id": result}), 200

@bp.get("/dopamine-logs")
def list_logs_http():
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)

    limit = _coerce_int(request.args.get("limit"), 100, 1, 200)
    start_after = request.args.get("startAfter")
    source = request.args.get("source")

    start = _parse_iso(request.args.get("start"))
    end = _parse_iso(request.args.get("end"))

    try:
        items = list_logs(uid, start, end, limit, start_after, source)
        return jsonify(items), 200
    except Exception as e:
        current_app.logger.exception(e)
        return _err("Internal error", 500)

@bp.get("/dopamine-logs/summary")
def summary_http():
    """
    Summaries by date window. Clients can pass:
      - window = day|week|month (default: day)
      - date = ISO date (defaults to today UTC)
      OR explicit start, end ISO timestamps.
    """
    try:
        uid = _require_auth_uid()
    except Exception:
        return _err("Unauthorized", 401)

    window = (request.args.get("window") or "day").lower()
    date = _parse_iso(request.args.get("date"))
    start = _parse_iso(request.args.get("start"))
    end = _parse_iso(request.args.get("end"))

    if not (start and end):
        base = _start_of_day(date or datetime.now(timezone.utc))
        if window == "week":
            start, end = base - timedelta(days=base.weekday()), base + timedelta(days=6, hours=23, minutes=59, seconds=59)
        elif window == "month":
            first = base.replace(day=1)
            # calc end of month
            if first.month == 12:
                next_first = first.replace(year=first.year + 1, month=1)
            else:
                next_first = first.replace(month=first.month + 1)
            start, end = first, next_first - timedelta(seconds=1)
        else:  # day
            start, end = base, base + timedelta(hours=23, minutes=59, seconds=59)

    try:
        data = summarize(uid, start, end)
        data.update({
            "window": window,
            "start": start.isoformat(),
            "end": end.isoformat(),
        })
        return jsonify(data), 200
    except Exception as e:
        current_app.logger.exception(e)
        return _err("Internal error", 500)

# ---------- admin routes (consent + least-privilege) ----------
@bp.get("/admin/dopamine-logs")
def admin_list_logs():
    """
    Admin-only list (consented users only).
    Query:
      - userId (optional): filter to a specific user
      - start, end (ISO)
      - limit (1..500, default 200)
      - startAfter (doc id)
    Requires role=admin and scope ads.read.
    """
    try:
        decoded = _require_decoded_token()
        _require_admin(decoded)
        admin_uid = decoded["uid"]
    except PermissionError as pe:
        return _err(str(pe), 403)
    except Exception:
        return _err("Unauthorized", 401)

    limit = _coerce_int(request.args.get("limit"), 200, 1, 500)
    start_after = request.args.get("startAfter")
    start = _parse_iso(request.args.get("start"))
    end = _parse_iso(request.args.get("end"))
    user_id = request.args.get("userId")

    # consent filter via join on users (read each doc; ok for admin tooling scale)
    def _consented(u: str) -> bool:
        snap = db.collection(USERS).document(u).get()  # type: ignore
        return bool(snap.exists and (snap.to_dict() or {}).get("marketingConsent") is True)

    q = db.collection(COL)  # type: ignore
    if user_id:
        if not _consented(user_id):
            return jsonify([]), 200
        q = q.where("userId", "==", user_id)
    # range + order
    q = q.order_by("createdAt")
    if start:
        q = q.where("createdAt", ">=", start)
    if end:
        q = q.where("createdAt", "<=", end)
    if start_after:
        last = db.collection(COL).document(start_after).get()  # type: ignore
        if last.exists:
            q = q.start_after(last)
    q = q.limit(limit)

    docs = list(q.stream())  # type: ignore
    items: List[Dict[str, Any]] = []
    for d in docs:
        row = _serialize_doc(d)
        if user_id:
            items.append(row)
        else:
            # per-row consent check (skip non-consented)
            if _consented(row.get("userId")):
                items.append(row)

    _audit(admin_uid, "admin.dopamine.list", {
        "count": len(items),
        "limit": limit,
        "hasUserFilter": bool(user_id),
    })

    return jsonify(items), 200

@bp.get("/admin/dopamine-logs/summary")
def admin_summary():
    """
    Admin-only aggregate (consented users only).
    Query: start, end (ISO). Optional userId filter.
    Returns total points and count.
    """
    try:
        decoded = _require_decoded_token()
        _require_admin(decoded)
        admin_uid = decoded["uid"]
    except PermissionError as pe:
        return _err(str(pe), 403)
    except Exception:
        return _err("Unauthorized", 401)

    start = _parse_iso(request.args.get("start"))
    end = _parse_iso(request.args.get("end"))
    user_id = request.args.get("userId")

    # fetch via admin_list_logs logic but without pagination (bounded windows suggested)
    limit = 500
    # Reuse list endpoint behavior quickly
    with current_app.test_request_context():
        pass

    # Build query
    q = db.collection(COL).order_by("createdAt")  # type: ignore
    if start: q = q.where("createdAt", ">=", start)
    if end:   q = q.where("createdAt", "<=", end)
    if user_id: q = q.where("userId", "==", user_id)
    docs = list(q.limit(1000).stream())  # type: ignore

    # Filter consent
    def _consented(u: str) -> bool:
        snap = db.collection(USERS).document(u).get()  # type: ignore
        return bool(snap.exists and (snap.to_dict() or {}).get("marketingConsent") is True)

    total = 0
    count = 0
    by_user: Dict[str, int] = {}
    for d in docs:
        row = d.to_dict()
        u = row.get("userId")
        if not u or not _consented(u):
            continue
        p = int(row.get("points", 0))
        total += p
        count += 1
        by_user[u] = by_user.get(u, 0) + p

    _audit(admin_uid, "admin.dopamine.summary", {
        "count": count,
        "total": total,
        "hasUserFilter": bool(user_id),
    })

    return jsonify({"total": total, "count": count, "byUser": by_user}), 200

# --- registration hook expected by app.py ---
def register_dopamine_logs_routes(app):
    app.register_blueprint(bp)