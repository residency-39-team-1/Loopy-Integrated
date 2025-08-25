# backend/crud/admin_analytics.py
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Tuple
from flask import Blueprint, request, jsonify, current_app, Response
from firebase_admin import auth as fb_auth
from google.cloud.firestore_v1.base_query import FieldFilter  # type: ignore
from backend.client import db, SERVER_TS  # type: ignore

bp = Blueprint("admin_analytics", __name__, url_prefix="/admin/analytics")

def _err(msg: str, code: int) -> Tuple[Response, int]:
    return jsonify({"error": msg}), code

def _require_decoded_token() -> Dict[str, Any]:
    authz = request.headers.get("Authorization", "")
    if not authz.startswith("Bearer "):
        raise ValueError("Missing or invalid Authorization header")
    token = authz.split(" ", 1)[1]
    return fb_auth.verify_id_token(token)

def _require_scope(decoded: Dict[str, Any], scope: str) -> None:
    role = decoded.get("role") or decoded.get("claims", {}).get("role")
    scopes = decoded.get("scopes") or decoded.get("claims", {}).get("scopes") or []
    if role != "admin" or (scope not in scopes):
        raise PermissionError(f"Admin with {scope} scope required")

def _iso_to_dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z","+00:00")).astimezone(timezone.utc)

def _date_range() -> Tuple[datetime, datetime]:
    since_s = request.args.get("since")  # ISO8601, e.g. 2025-08-01T00:00:00Z
    until_s = request.args.get("until")  # ISO8601
    now = datetime.now(timezone.utc)
    since = _iso_to_dt(since_s) if since_s else now - timedelta(days=30)
    until = _iso_to_dt(until_s) if until_s else now
    return since, until

# ---- Users: consented counts by country/age, MAU (last 30d), total consented ----
@bp.get("/users/summary")
def users_summary():
    try:
        decoded = _require_decoded_token()
        _require_scope(decoded, "analytics.read")
        admin_uid = decoded["uid"]
    except PermissionError as pe:
        return _err(str(pe), 403)
    except Exception:
        return _err("Unauthorized", 401)

    since, until = _date_range()

    # total consented
    consented_q = db.collection("users").where("marketingConsent", "==", True)
    consented_count = consented_q.count().get()[0][0].value  # aggregation count()

    # MAU (last 30 days or since param) based on lastSignIn
    mau_q = (
        db.collection("users")
        .where("marketingConsent", "==", True)
        .where("lastSignIn", ">=", since)
        .where("lastSignIn", "<=", until)
    )
    mau = mau_q.count().get()[0][0].value

    # breakdowns (best-effort; Firestore has no group-by—do client-side)
    country_counts: Dict[str,int] = {}
    age_counts: Dict[str,int] = {}

    # If large volume, consider BigQuery export or a daily rollup collection.
    docs = (
        db.collection("users")
        .where("marketingConsent", "==", True)
        .where("updatedAt", ">=", since)
        .where("updatedAt", "<=", until)
        .stream()
    )
    for d in docs:
        u = d.to_dict()
        c = (u.get("country") or "unknown").lower()
        a = (u.get("ageBracket") or "unknown").lower()
        country_counts[c] = country_counts.get(c, 0) + 1
        age_counts[a] = age_counts.get(a, 0) + 1

    # audit
    db.collection("activity_logs").document().set({
        "userId": admin_uid,
        "action": "admin.analytics.users_summary",
        "params": {"since": since.isoformat(), "until": until.isoformat()},
        "timestamp": SERVER_TS,
    })

    return jsonify({
        "range": {"since": since.isoformat(), "until": until.isoformat()},
        "consented_total": consented_count,
        "mau": mau,
        "by_country": country_counts,
        "by_age_bracket": age_counts,
    }), 200

# ---- Tasks: created/done counts & state mix in range ----
@bp.get("/tasks/summary")
def tasks_summary():
    try:
        decoded = _require_decoded_token()
        _require_scope(decoded, "analytics.read")
        admin_uid = decoded["uid"]
    except PermissionError as pe:
        return _err(str(pe), 403)
    except Exception:
        return _err("Unauthorized", 401)

    since, until = _date_range()

    created = (
        db.collection("tasks")
        .where("createdAt", ">=", since)
        .where("createdAt", "<=", until)
        .count().get()[0][0].value
    )

    done = (
        db.collection("tasks")
        .where("state", "==", "Done")
        .where("updatedAt", ">=", since)
        .where("updatedAt", "<=", until)
        .count().get()[0][0].value
    )

    # state mix (client-side count)
    state_mix: Dict[str,int] = {}
    snaps = (
        db.collection("tasks")
        .where("updatedAt", ">=", since)
        .where("updatedAt", "<=", until)
        .stream()
    )
    for s in snaps:
        st = (s.to_dict().get("state") or "unknown")
        state_mix[st] = state_mix.get(st, 0) + 1

    db.collection("activity_logs").document().set({
        "userId": admin_uid,
        "action": "admin.analytics.tasks_summary",
        "params": {"since": since.isoformat(), "until": until.isoformat()},
        "timestamp": SERVER_TS,
    })

    return jsonify({
        "range": {"since": since.isoformat(), "until": until.isoformat()},
        "created": created,
        "done": done,
        "state_mix": state_mix,
    }), 200

def register_admin_analytics_routes(app):
    app.register_blueprint(bp)
