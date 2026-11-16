# Dialectic as one container, for a DigitalOcean MicroVM (README.md here).
# Built by build.sh from a clean `git archive` of HEAD plus the prepared database
# (seed.db), never from the working tree. No OCR packages: uploads are off.

# ---------- the frontend: built here, served by FastAPI ----------
FROM docker.io/library/node:22-slim AS frontend
WORKDIR /src
COPY app/frontend/package.json app/frontend/package-lock.json ./
RUN npm ci --silent
COPY app/frontend/ ./
ARG VERSION=unknown
RUN npx vite build && echo "$VERSION" > dist/version.txt

# ---------- the backend ----------
FROM docker.io/library/python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.2 /uv /usr/local/bin/uv

ENV LANG=C.UTF-8 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

# Same layout as a checkout (/app = the repo root): main.py finds the frontend at
# ../frontend/dist, and the DB and uploads/ sit next to the code, where db.py and
# seed.py put them. The VM's disk keeps them across pause and resume.
WORKDIR /app/app/backend
COPY app/backend/pyproject.toml app/backend/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY app/backend/ ./
COPY --from=frontend /src/dist /app/app/frontend/dist
# --chmod: build.sh's copy is mode 600 (it's kept private on the laptop).
COPY --chmod=644 seed.db /app/seed.db
COPY deploy/microvm/entrypoint.sh deploy/microvm/guard.py /app/deploy/microvm/

# Runs as `dialectic`, not root (and `doctl ... exec` runs as this user too).
RUN useradd --create-home --uid 1000 dialectic \
 && mkdir -p /var/lib/dialectic \
 && chown -R dialectic:dialectic /app/app/backend /var/lib/dialectic \
 && chmod 755 /app/deploy/microvm/entrypoint.sh
USER dialectic

ARG VERSION=unknown
RUN echo "$VERSION" > /var/lib/dialectic/image-version
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/app/deploy/microvm/entrypoint.sh"]
