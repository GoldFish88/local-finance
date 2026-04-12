FROM python:3.12-slim

# System dependencies for Docling (OpenCV, OpenMP) and pypdfium2
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

ENV UV_SYSTEM_PYTHON=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    # Docling caches models here — mount as volume in prod to persist across rebuilds
    HF_HOME=/app/.cache/huggingface \
    DOCLING_CACHE=/app/.cache/docling

WORKDIR /app

# Stub the package so uv can resolve deps without the full source
COPY pyproject.toml ./
RUN mkdir -p app && touch app/__init__.py

# Install all dependencies (this layer is cached unless pyproject.toml changes)
RUN uv pip install --system .

# Copy the actual source after deps are installed
COPY app/ ./app/
COPY scripts/ ./scripts/

# Run as non-root
# Also create /data/pdfs here so Docker initialises the named volume with the
# correct ownership on first mount (for existing volumes see ops note below).
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser \
    && chown -R appuser:appgroup /app \
    && mkdir -p /data/pdfs \
    && chown appuser:appgroup /data/pdfs
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
