# Build context: the repository root (docker-compose.yml sets it), so this
# image can carry both the API and the workbench screen it serves (ADR-0004).

# --- Stage 1: the Next.js workbench as static files --------------------------
FROM node:22-alpine AS workbench-screen
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# NEXT_PUBLIC_* values are inlined into the bundle at build time. The API URL
# is left unset on purpose: a production build then talks to the API on its
# own origin (frontend/next.config.mjs). The bearer token is only for the
# local development stack, where browser calls arrive from Docker's network
# rather than loopback; docker-compose.prod.yml never passes one.
ARG NEXT_PUBLIC_API_AUTH_TOKEN=
ENV NEXT_PUBLIC_API_AUTH_TOKEN=${NEXT_PUBLIC_API_AUTH_TOKEN}
RUN npm run build

# --- Stage 2: the Workbench API ----------------------------------------------
FROM python:3.12-slim

# PyMuPDF's integrated OCR requires Tesseract language data. Keep the location
# explicit rather than relying on runtime autodiscovery.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential pkg-config libicu-dev tesseract-ocr tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*
ENV TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && python -c "import fitz, pathlib; p=pathlib.Path(fitz.get_tessdata()); assert (p/'eng.traineddata').is_file(), f'English tessdata missing: {p}'"
COPY backend/ .

# Outside /app, so the development compose file's ./backend:/app bind mount
# doesn't hide it.
COPY --from=workbench-screen /frontend/out /srv/frontend
ENV FRONTEND_DIST_DIR=/srv/frontend

# GET /api/health is auth-exempt for local/loopback callers (see
# app.core.access.request_is_local_request), so this needs no token.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/api/health', timeout=3).status == 200 else 1)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
