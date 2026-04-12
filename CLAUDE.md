# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Full Stack (Docker)
```bash
cp .env.example .env
docker compose up          # all services with live-reload (Compose Watch)
docker compose up postgres # postgres only (for local backend dev)
```
Development app URL: http://localhost:8080

### Backend (local)
```bash
cd backend
uv sync                    # install/sync deps
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# API docs: http://localhost:8000/docs
```
No test suite or linter is configured yet (`dev-dependencies = []`).

### Frontend (local)
```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
npm run build   # production build
npm run lint    # ESLint via eslint-config-next
```

### Database
Schema is in `postgres/init.sql` — runs once automatically on first postgres container start. To reset, delete the `postgres_data` Docker volume.

## Architecture

### Request Flow
```
Client
  → POST /uploads (multipart PDF)
    → save PDF to /data/pdfs/{upload_id}/
    → INSERT statement_uploads (status=processing)
    → return {upload_id} immediately (HTTP 202)
    → [BackgroundTask] extract_pdf()
        → Docling TableFormer parses PDF tables
        → ANZ normalization (signed amounts: debits negative, credits positive)
        → filter duplicates via dedup_hash(date|description|amount|balance)
        → batch INSERT pending transactions
        → classify against manual_overrides examples
        → update upload status → done/failed

Client polls GET /uploads/{id} every 2s until status ∈ {done, failed}
```

### Backend (`backend/app/`)

- **`config.py`** — single `settings` singleton (pydantic-settings, reads `.env`). Import from here everywhere.
- **`db.py`** — async SQLAlchemy engine with `asyncpg`. `get_db()` FastAPI dependency yields `AsyncSession`. Background tasks create their own sessions via `AsyncSessionLocal()` (not via DI).
- **`models.py`** — `StatementUpload`, `Transaction`, `Category` ORM models.
- **`schemas.py`** — Pydantic v2 response schemas with `from_attributes=True`.
- **`routers/uploads.py`** — upload CRUD, background extraction, PDF/page serving, transaction add/edit/delete, override-amount updates, archive, reclassification, and re-upload preview/confirm flows. Dedup uses `_dedup_hash()` over `date|description|amount|balance`.
- **`routers/categories.py`** — Category CRUD (`GET/POST /categories`, `PATCH/DELETE /categories/{id}`), `GET /categories/{id}/examples` (manual_overrides for that category), and `PATCH /uploads/{id}/transactions/{txn_id}/category` (manual assignment, optionally learns a new example string).
- **`routers/extract.py`** — stateless POST /extract for debug/testing (no DB).
- **`services/extraction.py`** — Docling extraction + ANZ-specific normalization. Handles both transaction/cheque format (Debit/Credit/Balance columns) and credit card format (Amount with CR suffix), recovers multiline rows, and records row bounding boxes when available.
- **`services/classification.py`** — three-level pipeline: (1) `manual_overrides` exact match, (2) `pg_trgm` similarity with top-k voting over learned example strings, (3) `pending_review`. `apply_manual_category()` handles manual assignment and upserts `manual_overrides` when learning is enabled.

### Frontend (`frontend/src/`)

All pages are `"use client"` components — no server components.

- **`lib/api.ts`** — typed `fetch` wrapper. `coerceTransaction()` converts Pydantic-serialized `Decimal` strings to JS numbers for `amount`/`balance`/`override_amount`. Also exposes `reclassifyUpload`, `setOverrideAmount`, `assignCategory`, `getPdfUrl`, and all category CRUD calls.
- **`lib/types.ts`** — shared TypeScript types. `Transaction` = stateless extract result; `StoredTransaction` = DB-persisted with `id`, `upload_id`, `status`, `category_id`, `category_name`, `override_amount`, `classification_level`, `similarity_score`.
- **`lib/export.ts`** — `exportToCSV` and `exportToXLSX` helpers for downloading filtered transaction data.
- **`app/upload/page.tsx`** — POST /uploads then polls GET /uploads/{id} every 2s, redirects on done.
- **`app/statements/page.tsx`** — statement library with per-statement summaries, archive, and "reclassify all" action.
- **`app/uploads/[id]/page.tsx`** — transaction table with filters, category badges, override-amount display, reclassify button, and links into review/re-upload.
- **`app/uploads/[id]/review/page.tsx`** — split-view page: PDF iframe on the left, editable transaction table on the right. Supports inline cell editing (date, description, amount, balance), My Share (override_amount), category assignment, add/delete rows.
- **`app/uploads/[id]/reupload/page.tsx`** — extract a replacement PDF, preview only new rows, and append them without mutating existing transactions.
- **`app/transactions/page.tsx`** — cross-statement view: aggregates all uploads, monthly bar chart + category donut (recharts), CSV/XLSX export, pagination (25/page), and time-range filtering including a specific month view.
- **`app/categories/page.tsx`** — category management: create with seed phrases (populates learned examples), edit name/color/rule/add seeds, view `manual_overrides` examples, delete.
- **`components/ui/`** — shadcn/ui components (New York style, zinc theme). Add new components manually — no CLI available.

### Database (PostgreSQL 16 + `pg_trgm`)

Key schema notes:
- `statement_uploads` stores source-file metadata, ingestion status, period boundaries, and archive state
- `transactions` stores the canonical ledger row with `override_amount`, `classification_level`, `similarity_score`, `dedup_hash`, and optional `bbox`
- `categories` stores taxonomy, display metadata, and `reporting_rule`
- `manual_overrides` stores learned description examples for exact and fuzzy classification
- `transactions.status`: `pending` / `auto_classified` / `verified` / `pending_review`
- `pg_trgm` powers similarity search over `manual_overrides.raw_description`
- Deduplication currently relies on the application computing `dedup_hash` from `date|description|amount|balance`

### Classification Pipeline

Level 1: `manual_overrides` exact match → `auto_classified`, level=1, score=1.0
Level 2: `pg_trgm` similarity search + top-k voting across learned examples → `auto_classified`, level=2
Level 3: no acceptable match → `pending_review`, level=3

Classification runs automatically after PDF extraction (skipped if no categories exist). Trigger manually via `POST /uploads/{id}/classify`. Manual assignment via `PATCH /uploads/{id}/transactions/{txn_id}/category` can upsert `manual_overrides` so future transactions with the same or similar description are learned.

### Environment Variables

| Variable | Default | Notes |
|---|---|---|
| `POSTGRES_PASSWORD` | generated manually | Docker Postgres password |
| `DATABASE_URL` | `postgresql+asyncpg://finance:finance@postgres:5432/finance` | |
| `PDF_STORAGE_PATH` | `/data/pdfs` | volume mount |
| `CLASSIFICATION_MIN_SIMILARITY` | `0.30` | trigram similarity cutoff |
| `CLASSIFICATION_K` | `3` | number of nearest learned examples to vote over |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:8080` | comma-separated |

## Key Constraints
- Signed amounts: debits are negative, credits are positive.
- `NEXT_PUBLIC_API_URL` is baked into the Next.js bundle at build time — changing it requires a rebuild.
- The extractor is currently tuned for ANZ statement formats.
- Pages Docling cannot recover are surfaced for manual review; there is no active OCR/LLM fallback path.
- `postgres/init.sql` only runs on first DB init. Schema changes require dropping/recreating the volume or running migrations manually.
