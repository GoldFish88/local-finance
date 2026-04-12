# Local Finance

Local Finance is a local-first statement ingestion and review app for Australian bank statements. It turns statement PDFs into structured transactions, keeps the source document alongside the extracted data, and gives you a human-in-the-loop workflow for categorisation and reporting.

The current implementation is tuned for ANZ PDFs and a single-user local workflow. The goal is not just extraction, but a durable data model that can support richer features later.

## Core concepts

| Concept | What it represents | Why it matters |
|---|---|---|
| Statement upload | One source PDF plus its ingestion status, storage path, and statement period | This is the unit of ingestion, re-upload, and archival |
| Transaction | The canonical record created from the statement: date, description, signed amount, optional balance, optional category | This is the main analytical unit across the entire app |
| Category | A user-defined label with a color and a reporting rule | Categories drive both classification and downstream reporting |
| Learned example | A raw transaction description stored in `manual_overrides`, either from seed phrases or verified user edits | This is the app's current classification memory |
| Reporting rule | How a category should behave in analytics: `default`, `expense`, `income`, or `transfer` | This separates bank movement semantics from reporting semantics |
| Override amount | An optional per-transaction "My Share" value that replaces the bank amount in reporting views | This lets the app model shared spending without mutating the raw transaction |
| Source provenance | An optional PDF bounding box linked to a transaction row | This keeps review and correction auditable against the source document |

## Capability map

| Area | What works today | Natural extension points |
|---|---|---|
| Ingestion | Upload PDFs, process them in the background, keep the original file, and archive uploads | More bank adapters, email ingestion, automated statement detection |
| Extraction | Parse ANZ tables into normalized signed transactions with dates, descriptions, balances, and page coordinates | OCR fallback, quality scoring, extraction benchmarks |
| Review | Render statement pages, inspect transactions side-by-side with the PDF, and add/edit/delete rows manually | Better audit trails, bulk correction tools, reviewer workflows |
| Classification | Seed categories with example phrases, auto-classify with exact and trigram similarity, and learn from manual assignments | Merchant normalization, embeddings, active learning, confidence evaluation |
| Reporting | Browse transactions across statements, filter/search/sort, see statement summaries and charts, and export CSV/XLSX | Budgets, cash-flow forecasting, recurring spend detection, anomaly detection |
| Privacy | Hide monetary values in the UI with privacy mode | Fine-grained redaction, export masking, screenshot-safe views |

## Current workflow

1. Upload a statement PDF.
2. Save the PDF, extract rows in the background, and normalize them into a canonical transaction shape.
3. Auto-classify what can be classified from the current category/example set.
4. Review the statement against the original PDF, fix extraction mistakes, and teach the system through manual categorisation.
5. Analyse the resulting dataset across statements, categories, and time ranges.

## Technical focus

This repo already contains the foundations for a meaningful applied data product: semi-structured document extraction, normalization, provenance capture, human-in-the-loop labeling, and analytics-aware data modeling. The implementation details live in [DESIGN.md](DESIGN.md).

## Quick start

### Docker (development)

```bash
cp .env.example .env
docker compose up --build
```

- App via nginx: http://localhost:8080
- Backend API and Swagger docs: http://localhost:8000/docs
- Postgres: `localhost:5432`

The development stack automatically applies [docker-compose.override.yml](docker-compose.override.yml), which exposes nginx on port `8080` and the backend on `8000` for direct API access. The first upload can be slow because Docling may download its models on demand.

For a production-style compose run without the dev override:

```bash
docker compose -f docker-compose.yml up --build
```

### Local development

Running the backend and frontend locally gives faster edit/reload cycles.

#### Postgres

```bash
docker compose up postgres
```

#### Backend

```bash
cd backend
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Frontend

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

The local frontend runs on http://localhost:3000.

## Configuration

Copy `.env.example` to `.env` and adjust as needed.

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | `CHANGE_ME_GENERATE_A_STRONG_PASSWORD` | Password used by the Docker Postgres service |
| `DATABASE_URL` | `postgresql+asyncpg://finance:...@postgres:5432/finance` | Backend database connection string |
| `PDF_STORAGE_PATH` | `/data/pdfs` | Filesystem location for uploaded PDFs |
| `CLASSIFICATION_MIN_SIMILARITY` | `0.30` | Minimum trigram similarity required for automatic classification |
| `CLASSIFICATION_K` | `3` | Number of nearest example strings used in similarity voting |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:8080` | Allowed origins for local backend development |

When you run the frontend outside Docker, set `NEXT_PUBLIC_API_URL` to the backend URL you want the browser to call.

## API surface

Key endpoints exposed by the current backend:

| Path | Purpose |
|---|---|
| `GET /health` | Basic API and database health check |
| `POST /extract` | Stateless extraction for debugging or evaluation without DB writes |
| `GET /uploads`, `POST /uploads`, `GET /uploads/{id}`, `DELETE /uploads/{id}` | List, create, inspect, and archive statement uploads |
| `GET /uploads/{id}/pdf`, `GET /uploads/{id}/pages`, `GET /uploads/{id}/pages/{n}` | Access the original PDF and rendered pages for review |
| `GET /uploads/{id}/transactions`, `POST /uploads/{id}/transactions` | Read and manually add transactions |
| `PATCH /uploads/{id}/transactions/{txn_id}`, `DELETE /uploads/{id}/transactions/{txn_id}` | Edit or delete extracted transactions |
| `PATCH /uploads/{id}/transactions/{txn_id}/override` | Set or clear the per-transaction override amount |
| `PATCH /uploads/{id}/transactions/{txn_id}/category` | Assign or clear a category, optionally teaching the classifier |
| `POST /uploads/{id}/classify` | Re-run classification on pending rows for an upload |
| `POST /uploads/{id}/reupload/preview`, `POST /uploads/{id}/reupload/confirm` | Diff a new PDF against an existing statement and append only new rows |
| `GET /categories`, `POST /categories`, `PATCH /categories/{id}`, `DELETE /categories/{id}` | Manage the category taxonomy |
| `GET /categories/{id}/examples` | Inspect the learned example phrases for a category |

Interactive docs are available at http://localhost:8000/docs when the backend is running.

## Current constraints

- The extractor is currently tuned for ANZ statement formats.
- The app is local-first and single-user; there is no authentication or multi-tenant model.
- Pages that Docling cannot extract are surfaced for manual review rather than sent through a secondary OCR/LLM fallback.
- Classification is currently based on curated example strings and trigram similarity, not embeddings.
- There is no formal test suite or migration runner yet.
