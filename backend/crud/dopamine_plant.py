# backend/blueprints/dopamine.py
from flask import Blueprint, request, jsonify
from marshmallow import Schema, fields, validate, ValidationError
from backend.crud.dopamine_logs import create_log as create_dopa_log
from datetime import datetime, timezone
from firebase_admin import auth as fb_auth
import random

try:
    from firebase_admin import firestore  # type: ignore
    db = firestore.client()
except Exception:
    db = None

dopamine_bp = Blueprint("dopamine", __name__, url_prefix="/dopamine")

MANIFEST = {
    "1": {"POT": "plant_phase1_POT.png"},
    "2": {"2A": "plant_phase2_2A.png", "2B": "plant_phase2_2B.png"},
    "3": {
        "3A": "plant_phase3_3A.png",
        "3B": "plant_phase3_3B.png",
        "3C": "plant_phase3_3C.png",
        "3D": "plant_phase3_3D.png",
    },
    "4": {
        "4A": "plant_phase4_4A.png",
        "4B": "plant_phase4_4B.png",
        "4C": "plant_phase4_4C.png",
        "4D": "plant_phase4_4D.png",
        "4E": "plant_phase4_4E.png",
        "4F": "plant_phase4_4F.png",
        "4G": "plant_phase4_4G.png",
        "4H": "plant_phase4_4H.png",
    },
}

PHASE_BRANCHES = {
    "1": ["2A", "2B"],
    "2A": ["3A", "3B"],
    "2B": ["3C", "3D"],
    "3A": ["4A", "4B"],
    "3B": ["4C", "4D"],
    "3C": ["4E", "4F"],
    "3D": ["4G", "4H"],
}

ADVANCE_THRESHOLDS = {1: 1, 2: 2, 3: 3}

COL_PLANTS = "dopamine_plants"
COL_LOGS   = "dopamine_logs"
COL_ARCH   = "archived_entries"

class InitSchema(Schema):
    user_id = fields.String(required=True, validate=validate.Length(min=1))

class StateQuerySchema(Schema):
    user_id = fields.String(required=True, validate=validate.Length(min=1))

class TaskCompleteSchema(Schema):
    user_id = fields.String(required=True)
    task_id = fields.String(required=False, allow_none=True)
    points  = fields.Integer(required=False, load_default=1, validate=validate.Range(min=0))

class ResetSchema(Schema):
    user_id = fields.String(required=True)
    reason  = fields.String(required=False, allow_none=True)

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def manifest_lookup(phase: int, variant: str) -> str:
    return MANIFEST.get(str(phase), {}).get(variant, "")

def plant_doc_ref(user_id: str):
    return db.collection(COL_PLANTS).document(user_id)

def log_entry(payload: dict):
    db.collection(COL_LOGS).add(payload)

def archive_plant(user_id: str, plant_snapshot, cause: str = "manual"):
    if plant_snapshot and plant_snapshot.exists:
        data = plant_snapshot.to_dict()
        archive_doc = {
            "type": "dopamine_plant",
            "user_id": user_id,
            "archived_at": now_iso(),
            "cause": cause,
            "payload": data,
        }
        db.collection(COL_ARCH).add(archive_doc)

def should_advance(phase: int, tasks_since: int) -> bool:
    threshold = ADVANCE_THRESHOLDS.get(phase)
    return threshold is not None and tasks_since >= threshold

def pick_next_variant(current_phase: int, current_variant: str) -> tuple[int, str]:
    if current_phase >= 4:
        return current_phase, current_variant
    if current_phase == 1:
        return 2, random.choice(PHASE_BRANCHES["1"])
    next_choices = PHASE_BRANCHES.get(current_variant, [])
    if not next_choices:
        return current_phase, current_variant
    next_phase = current_phase + 1
    return next_phase, random.choice(next_choices)

def init_payload(user_id: str):
    return {
        "user_id": user_id,
        "phase": 1,
        "variant": "POT",
        "tasks_completed_since_phase": 0,
        "tasks_completed_total": 0,
        "asset_filename": manifest_lookup(1, "POT"),
        "last_updated": now_iso(),
    }

def _require_uid_from_bearer() -> str:
    authz = request.headers.get("Authorization", "")
    if not authz.startswith("Bearer "):
        raise ValueError("Missing or invalid Authorization header")
    token = authz.split(" ", 1)[1]
    return fb_auth.verify_id_token(token)["uid"]

@dopamine_bp.errorhandler(ValidationError)
def on_validation_error(err):
    return jsonify({"error": "validation_error", "details": err.messages}), 400

@dopamine_bp.route("/init", methods=["POST"])
def init_plant():
    if db is None:
        return jsonify({"error": "firestore_uninitialized"}), 500

    payload = InitSchema().load(request.get_json(force=True))
    user_id = payload["user_id"]
    ref = plant_doc_ref(user_id)
    snap = ref.get()

    if snap.exists:
        doc = snap.to_dict()
        return jsonify({"ok": True, "plant": doc, "idempotent": True}), 200

    doc = init_payload(user_id)
    ref.set(doc)
    log_entry({
        "user_id": user_id,
        "event_type": "plant_init",
        "phase_after": doc["phase"],
        "variant_after": doc["variant"],
        "created_at": now_iso(),
    })
    return jsonify({"ok": True, "plant": doc}), 201

@dopamine_bp.route("/state", methods=["GET"])
def get_state():
    if db is None:
        return jsonify({"error": "firestore_uninitialized"}), 500

    args = StateQuerySchema().load(request.args)
    user_id = args["user_id"]
    ref = plant_doc_ref(user_id)
    snap = ref.get()
    if not snap.exists:
        return jsonify({"error": "not_found", "message": "Plant not initialized."}), 404
    return jsonify({"ok": True, "plant": snap.to_dict()}), 200

@dopamine_bp.route("/task-complete", methods=["POST"])
def task_complete():
    if db is None:
        return jsonify({"error": "firestore_uninitialized"}), 500

    req = TaskCompleteSchema().load(request.get_json(force=True))
    user_id = req["user_id"]
    task_id = req.get("task_id")
    points  = req.get("points", 1)

    ref = plant_doc_ref(user_id)

    @firestore.transactional
    def tx_update(transaction):
        snap = ref.get(transaction=transaction)
        if not snap.exists:
            doc = init_payload(user_id)
            transaction.set(ref, doc)
            current = doc
        else:
            current = snap.to_dict() or {}

        tasks_since = int(current.get("tasks_completed_since_phase", 0)) + 1
        tasks_total = int(current.get("tasks_completed_total", 0)) + 1
        current["tasks_completed_since_phase"] = tasks_since
        current["tasks_completed_total"] = tasks_total

        advanced = False
        current_phase   = int(current.get("phase", 1))
        current_variant = str(current.get("variant", "POT"))

        if current_phase < 4 and should_advance(current_phase, tasks_since):
            next_phase, next_variant = pick_next_variant(current_phase, current_variant)
            if (next_phase, next_variant) != (current_phase, current_variant):
                log_entry({
                    "user_id": user_id,
                    "event_type": "phase_advanced",
                    "phase_before": current_phase,
                    "variant_before": current_variant,
                    "phase_after": next_phase,
                    "variant_after": next_variant,
                    "created_at": now_iso(),
                })
                current["phase"] = next_phase
                current["variant"] = next_variant
                current["tasks_completed_since_phase"] = 0
                advanced = True

        log_entry({
            "user_id": user_id,
            "event_type": "task_completed",
            "task_id": task_id,
            "points": points,
            "phase": current.get("phase", 1),
            "variant": current.get("variant", "POT"),
            "created_at": now_iso(),
        })

        current["asset_filename"] = manifest_lookup(int(current["phase"]), str(current["variant"]))
        current["last_updated"] = now_iso()

        transaction.set(ref, current)
        return current, advanced

    transaction = db.transaction()
    plant, advanced = tx_update(transaction)

    create_dopa_log(user_id, {
        "points": points,
        "source": "plant_task_completed",
        "context": {"taskId": task_id},
        "note": f"Phase {plant['phase']} variant {plant['variant']}",
    })

    return jsonify({"ok": True, "advanced": advanced, "plant": plant}), 200

@dopamine_bp.route("/reset", methods=["POST"])
def reset():
    if db is None:
        return jsonify({"error": "firestore_uninitialized"}), 500

    req = ResetSchema().load(request.get_json(force=True))
    user_id = req["user_id"]
    reason  = req.get("reason") or "reset"

    ref = plant_doc_ref(user_id)
    snap = ref.get()
    archive_plant(user_id, snap, cause=reason)

    doc = init_payload(user_id)
    ref.set(doc)

    create_dopa_log(user_id, {
        "points": 0,
        "source": "plant_reset",
        "context": {},
        "note": "Plant initialized",
    })

    log_entry({
        "user_id": user_id,
        "event_type": "plant_reset",
        "reason": reason,
        "phase_after": doc["phase"],
        "variant_after": doc["variant"],
        "created_at": now_iso(),
    })

    create_dopa_log(user_id, {
        "points": 0,
        "source": "plant_reset",
        "context": {},
        "note": reason or "reset",
    })
    return jsonify({"ok": True, "plant": doc}), 200

@dopamine_bp.route("/delete", methods=["DELETE"])
def delete_plant():
    if db is None:
        return jsonify({"error": "firestore_uninitialized"}), 500

    try:
        req = StateQuerySchema().load(request.args or request.get_json(silent=True) or {})
    except ValidationError as err:
        return jsonify({"error": "validation_error", "details": err.messages}), 400

    user_id = req["user_id"]
    ref = plant_doc_ref(user_id)
    snap = ref.get()

    if not snap.exists:
        return jsonify({"ok": True, "deleted": False, "message": "Nothing to delete."}), 200

    archive_plant(user_id, snap, cause="delete")
    ref.delete()
    log_entry({
        "user_id": user_id,
        "event_type": "plant_deleted",
        "created_at": now_iso(),
    })

    create_dopa_log(user_id, {
        "points": 0,
        "source": "plant_deleted",
        "context": {},
        "note": "Archived then deleted",
    })
    return jsonify({"ok": True, "deleted": True}), 200

@dopamine_bp.route("/advance", methods=["POST"])
def advance():
    if db is None:
        return jsonify({"error": "firestore_uninitialized"}), 500

    try:
        user_id = _require_uid_from_bearer()
    except Exception:
        return jsonify({"error": "unauthorized"}), 401

    ref = plant_doc_ref(user_id)

    @firestore.transactional
    def tx_advance(transaction):
        snap = ref.get(transaction=transaction)
        if not snap.exists:
            doc = init_payload(user_id)
            transaction.set(ref, doc)
            current = doc
        else:
            current = snap.to_dict()

        current_phase   = int(current.get("phase", 1))
        current_variant = str(current.get("variant", "POT"))

        if current_phase >= 4:
            return current, False

        next_phase, next_variant = pick_next_variant(current_phase, current_variant)
        if (next_phase, next_variant) == (current_phase, current_variant):
            return current, False

        log_entry({
            "user_id": user_id,
            "event_type": "phase_advanced",
            "phase_before": current_phase,
            "variant_before": current_variant,
            "phase_after": next_phase,
            "variant_after": next_variant,
            "created_at": now_iso(),
        })

        current["phase"] = next_phase
        current["variant"] = next_variant
        current["tasks_completed_since_phase"] = 0
        current["asset_filename"] = manifest_lookup(next_phase, next_variant)
        current["last_updated"] = now_iso()

        transaction.set(ref, current)
        return current, True

    transaction = db.transaction()
    plant, advanced = tx_advance(transaction)

    create_dopa_log(user_id, {
        "points": 1,
        "source": "plant_phase_advanced",
        "context": {},
        "note": f"Advanced to phase {plant['phase']} variant {plant['variant']}",
    })

    return jsonify({"ok": True, "advanced": advanced, "plant": plant}), 200
