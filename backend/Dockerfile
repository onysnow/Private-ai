FROM python:3.12-slim

# PyMuPDF's integrated OCR requires Tesseract language data. Keep the location
# explicit rather than relying on runtime autodiscovery.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential pkg-config libicu-dev tesseract-ocr tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*
ENV TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && python -c "import fitz, pathlib; p=pathlib.Path(fitz.get_tessdata()); assert (p/'eng.traineddata').is_file(), f'English tessdata missing: {p}'"
COPY . .

# GET /api/health is auth-exempt for local/loopback callers (see
# app.core.access.request_is_local_request), so this needs no token.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/api/health', timeout=3).status == 200 else 1)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
