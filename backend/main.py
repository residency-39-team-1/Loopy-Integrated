# backend/main.py
from __future__ import annotations

import os
import logging
from typing import Any, Dict, Tuple

from flask import Flask, jsonify, request
from flask_cors import CORS

# Import initializes Firebase Admin via backend.client (credentials come from env)
from backend import client  # noqa: F401

# Blueprints
from backend.crud.tasks import bp as tasks_bp
from backend.crud.archived import bp as archive_bp
from backend.crud.users import bp as users_bp
from backend.crud.dopamine_logs import bp as dopamine_bp
from backend.crud.bootstrap import bp as bootstrap_bp

  

def create_app() -> Flask:
    app = Flask(__name__)

    # --- Basic configuration ---
    app.config["JSON_SORT_KEYS"] = False
    app.config["JSONIFY_PRETTYPRINT_REGULAR"] = False
    app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024  # 2MB safety limit

    # --- CORS ---
    # In prod, restrict to your frontend origins:
    # CORS(app, resources={r"/*": {"origins": ["https://your-app.example"]}})
    CORS(app)

    # --- Logging ---
    gunicorn_error_logger = logging.getLogger("gunicorn.error")
    root = logging.getLogger()
    if gunicorn_error_logger.handlers:
        root.handlers = gunicorn_error_logger.handlers
        root.setLevel(gunicorn_error_logger.level)
    else:
        logging.basicConfig(level=logging.INFO)

    # --- Health checks & root ---
    @app.get("/")
    def root() -> Tuple[Any, int]:
        return jsonify({"ok": True, "service": "loopy-backend"}), 200

    @app.get("/healthz")
    def healthz() -> Tuple[Any, int]:
        # If Firebase Admin init failed at import time, requests would fail anyway.
        return jsonify({"status": "healthy"}), 200

    # --- Error handlers (consistent JSON) ---
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": "Bad Request"}), 400

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Not Found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method Not Allowed"}), 405

    @app.errorhandler(413)
    def payload_too_large(e):
        return jsonify({"error": "Payload Too Large"}), 413

    @app.errorhandler(500)
    def server_error(e):
        app.logger.exception(e)
        return jsonify({"error": "Internal Server Error"}), 500

    # --- Simple request logging ---
    @app.before_request
    def _log_request():
        app.logger.info("%s %s", request.method, request.path)

    # --- Register blueprints ---
    app.register_blueprint(tasks_bp)
    app.register_blueprint(archive_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(dopamine_bp)
    app.register_blueprint(bootstrap_bp)


    return app


app = create_app()

if __name__ == "__main__":
    # Local dev run:
    #   GOOGLE_APPLICATION_CREDENTIALS must be set in your environment
    #   python -m backend.main
    port = int(os.environ.get("PORT", "8000"))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
