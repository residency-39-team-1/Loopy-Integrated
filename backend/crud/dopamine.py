# backend/blueprints/dopamine.py
# Flask Blueprint for Dopamine Plant CRUD (Firestore + Marshmallow)
# Aligns with Loopy's conventions: UID doc IDs, immutable logs, archive-before-delete

from flask import Blueprint, request, jsonify
from marshmallow import Schema, fields, validate, ValidationError
from backend.crud.dopamSine_logs import create_log as create_dopa_log
from backend.client import SERVER_TS  # to align timestamps if you want
from datetime import datetime, timezone
from firebase_admin import auth as fb_auth
import random
import os

try:
    # If your app initializes Firebase Admin centrally, just import the client here.
    from firebase_admin import firestore  # type: ignore
    db = firestore.client()
except Exception as e:
    db = None  # Allow import without initialized Firebase; app should set db later.

dopamine_bp = Blueprint("dopamine", __name__, url_prefix="/dopamine")

# -------- Manifest (filenames must match your asset pack) --------
# If you later host assets on Firebase Storage/CDN, keep filenames and
# just prefix with your CDN base on the frontend.
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

# Branching table (Phase/Variant → next choices)
PHASE_BRANCHES = {
    "1": ["2A", "2B"],        # 1→2
    "2A": ["3A", "3B"],       # 2→3
    "2B": ["3C", "3D"],       # 2→3
    "3A": ["4A", "4B"],       # 3→4 (final)
    "3B": ["4C", "4D"],
    "3C": ["4E", "4F"],
    "3D": ["4G", "4H"],
}

# Thresholds to advance per phase (tune via UX)
ADVANCE_THRESHOLDS = {1: 1, 2: 2, 3: 3}

# Collections
COL_PLANTS = "dopamine_plants"   # one active plant doc per user
COL_LOGS   = "dopamine_logs"     # immutable logs (task + phase advance)
COL_ARCH   = "archived_entries"  # shared archive


# --------------------------- Schemas ---------------------------

class InitSchema(Schema):
    user_id = fields.String(required=True, validate=validate.Length(min=1))

class StateQuerySchema(Schema):
    user_id = fields.String(required=True, validate=validate.Length(min=1))

class TaskCompleteSchema(Schema):
    user_id = fields.String(required=True)
    task_id = fields.String(required=False, allow_none=True)
    points  = fields.Integer(required=False, missing=1, validate=validate.Range(min=0))

class ResetSchema(Schema):
    user_id = fields.String(required=True)
    reason  = fields.String(required=False, allow_none=True)


# ------------------------ Helpers -----------------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def manifest_lookup(phase: int, variant: str) -> str:
    return MANIFEST.get(str(phase), {}).get(variant, "")

def plant_doc_ref(user_id: str):
    return db.collection(COL_PLANTS).document(user_id)

def log_entry(payload: dict):
    db.collection(COL_LOGS).add(payload)

def archive_plant(user_id: str, plant_snapshot, cause: str = "manual"):
    """Archive current plant into archived_entries for compliance (soft-delete pattern)."""
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
    """Return (next_phase, next_variant). Phase 4 is terminal."""
    if current_phase >= 4:
        return current_phase, current_variant
    if current_phase == 1:
        return 2, random.choice(PHASE_BRANCHES["1"])
    # From phase 2 or 3 we branch using current variant
    next_choices = PHASE_BRANCHES.get(current_variant, [])
    if not next_choices:
        # Safety fallback: stay put if mapping missing
        return current_phase, current_variant
    next_phase = current_phase + 1
    return next_phase, random.choice(next_choices)

def init_payload(user_id: str):
    return {
        "user_id": user_id,
        "phase": 1,
        "variant": "POT",
        "tasks_completed_since_phase": 0,
        "asset_filename": manifest_lookup(1, "POT"),
        "last_updated": now_iso(),
    }

def _require_uid_from_bearer() -> str:
    authz = request.headers.get("Authorization", "")
    if not authz.startswith("Bearer "):
        raise ValueError("Missing or invalid Authorization header")
    token = authz.split(" ", 1)[1]
    return fb_auth.verify_id_token(token)["uid"]
# -------------------------- Routes ----------------------------

@dopamine_bp.errorhandler(ValidationError)
def on_validation_error(err):
    return jsonify({"error": "validation_error", "details": err.messages}), 400


@dopamine_bp.route("/init", methods=["POST"])
def init_plant():
    """Create or ensure an active plant at Phase 1 for a user."""
    if db is None:
        return jsonify({"error": "firestore_uninitialized"}), 500

    payload = InitSchema().load(request.get_json(force=True))
    user_id = payload["user_id"]
    ref = plant_doc_ref(user_id)
    snap = ref.get()

    if snap.exists:
        # Idempotent: if already created, return existing
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
    """Read current plant state."""
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
    """Log a completed task, possibly advance the plant. Uses a transaction for concurrency safety."""
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
            # auto-init if missing (idempotent behavior)
            doc = init_payload(user_id)
            ref.set(doc)
            current = doc
        else:
            current = snap.to_dict()

        # Increment counter
        tasks_since = int(current.get("tasks_completed_since_phase", 0)) + 1
        current["tasks_completed_since_phase"] = tasks_since

        advanced = False
        if should_advance(current["phase"], tasks_since):
            new_phase, new_variant = pick_next_variant(current["phase"], current["variant"])
            if (new_phase, new_variant) != (current["phase"], current["variant"]):
                # Log phase advance BEFORE mutation
                log_entry({
                    "user_id": user_id,
                    "event_type": "phase_advanced",
                    "phase_before": current["phase"],
                    "variant_before": current["variant"],
                    "phase_after": new_phase,
                    "variant_after": new_variant,
                    "created_at": now_iso(),
                })
                # Apply advance
                current["phase"] = new_phase
                current["variant"] = new_variant
                current["tasks_completed_since_phase"] = 0
                advanced = True

        # Always log the task completion (immutable)
        log_entry({
            "user_id": user_id,
            "event_type": "task_completed",
            "task_id": task_id,
            "points": points,
            "phase": current["phase"],
            "variant": current["variant"],
            "created_at": now_iso(),
        })

        # Update asset & timestamp
        current["asset_filename"] = manifest_lookup(current["phase"], current["variant"])
        current["last_updated"] = now_iso()

        transaction.set(ref, current)
        return current, advanced

    transaction = db.transaction()
    plant, advanced = tx_update(transaction)

    # Always write a log for the task that drove the event
    create_dopa_log(user_id, {
        "points": points,  # usually 1
        "source": "plant_task_completed",
        "context": {"taskId": task_id},
        "note": f"Phase {plant['phase']} variant {plant['variant']}",

    })

    return jsonify({
        "ok": True,
        "advanced": advanced,
        "plant": plant
    }), 200


@dopamine_bp.route("/reset", methods=["POST"])
def reset():
    """Archive current plant and reinitialize to Phase 1."""
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
    # after ref.set(doc)
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
    """Archive then permanently delete the active plant doc."""
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
