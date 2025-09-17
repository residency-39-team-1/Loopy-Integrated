# backend/app.py
import os
from flask import Flask, jsonify
from flask_cors import CORS

# use absolute imports everywhere
from backend.crud.tasks import register_task_routes
from backend.crud.archived import register_archived_routes
from backend.crud.users import register_user_routes
from backend.crud.chaos_catcher import bp as chaos_bp
from backend.crud.dopamine_logs import register_dopamine_logs_routes
from backend.crud.dopamine_plant import dopamine_bp



import firebase_admin
from firebase_admin import credentials

def _init_firebase_admin():
    if firebase_admin._apps:
        return
    gcred = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if gcred and os.path.exists(gcred):
        # Explicitly specify project ID even with env var
        firebase_admin.initialize_app(credentials.ApplicationDefault(), {
            'projectId': 'loopy-productivity-app'
        })
    else:
        sa_path = os.getenv("FIREBASE_SERVICE_ACCOUNT", "serviceAccount.json")
        if not os.path.exists(sa_path):
            raise RuntimeError(
                "Firebase Admin needs credentials. Set GOOGLE_APPLICATION_CREDENTIALS "
                "to a service account JSON, or provide FIREBASE_SERVICE_ACCOUNT path."
            )
        firebase_admin.initialize_app(credentials.Certificate(sa_path))

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

_init_firebase_admin()

@app.get("/")
def index():
    return jsonify({"message": "Loopy Backend API is running"}), 200

@app.get("/health")
def health():
    return jsonify({"ok": True}), 200

register_task_routes(app)
register_archived_routes(app)
register_user_routes(app)
app.register_blueprint(chaos_bp)
register_dopamine_logs_routes(app)
app.register_blueprint(dopamine_bp)


if __name__ == "__main__":
    app.run(
        debug=True,
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5001"))
    )
