"""Wraps the app for the MicroVM, where no Caddy sits in front (README.md here).

Refuses the two requests the droplet's Caddyfile refused or that the preserved copy
doesn't allow, before they reach the app:
- POST /api/sources: adding a source makes the server fetch any URL it's given.
- POST /api/readings (uploads), unless UPLOADS_ENABLED=1. There's no OCR in the image.

Paths are matched the way FastAPI routes them (exact and case-sensitive), so
nothing else can reach those two routes. Since the harden-public merge the app
does both itself (UPLOADS_ENABLED, and search.get_public for every fetch), so this
is a second layer: to drop it, point uvicorn at main:app in entrypoint.sh.
"""
import json
import os

import main  # the Dialectic app; entrypoint.sh runs this from app/backend

REFUSED = "{} is turned off on this copy of Dialectic."


def refusal(path, method):
    if method != "POST":
        return None
    path = path.rstrip("/") or "/"
    if path == "/api/sources":
        return REFUSED.format("Adding sources")
    if path == "/api/readings" and os.environ.get("UPLOADS_ENABLED", "0") != "1":
        return REFUSED.format("Uploading readings")
    return None


async def app(scope, receive, send):
    if scope["type"] == "http":
        detail = refusal(scope["path"], scope["method"])
        if detail:
            body = json.dumps({"detail": detail}).encode()
            await send({"type": "http.response.start", "status": 403,
                        "headers": [(b"content-type", b"application/json"),
                                    (b"content-length", str(len(body)).encode())]})
            await send({"type": "http.response.body", "body": body})
            return
    await main.app(scope, receive, send)
