FROM python:3.12-slim

# PyMuPDF's integrated OCR requires Tesseract language data. Keep the location
# explicit rather than relying on runtime autodiscovery.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*
ENV TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && python -c "import fitz, pathlib; p=pathlib.Path(fitz.get_tessdata()); assert (p/'eng.traineddata').is_file(), f'English tessdata missing: {p}'"
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
