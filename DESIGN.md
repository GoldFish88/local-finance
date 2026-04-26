# Design & Implementation Notes

This document covers the concepts, architecture, and implementation details behind Local Finance. For setup and deployment instructions see [README.md](README.md).

---

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

## User workflow

1. Upload a statement PDF.
2. The app saves the PDF, extracts rows in the background, and normalises them into a canonical transaction shape.
3. Transactions are auto-classified against the current category and example set.
4. Review the statement against the original PDF, fix extraction mistakes, and teach the system through manual categorisation.
5. Analyse the resulting dataset across statements, categories, and time ranges.

## API surface

Key endpoints exposed by the backend (interactive docs at `http://localhost:8000/docs`):

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

## Current constraints

- The extractor is tuned for ANZ statement formats.
- The app is local-first and single-user; there is no authentication or multi-tenant model.
- Pages that Docling cannot extract are surfaced for manual review rather than sent through a secondary OCR/LLM fallback.
- Classification is based on curated example strings and trigram similarity, not embeddings.
- There is no formal test suite or migration runner yet.

---

## Implementation notes

This section emphasizes the parts of the project that demonstrate applied data and ML-adjacent engineering: document extraction, normalization, provenance, categorisation, reporting semantics, and storage design.

## End-to-end pipeline

```text
Statement PDF
    -> saved to local storage by upload_id
    -> Docling table extraction
    -> ANZ-specific normalization
    -> hash-based duplicate filtering
    -> persisted as statement_uploads + transactions
    -> automatic categorisation from learned examples
    -> manual review, correction, and re-learning
    -> analytics and export across statements
```

There are two entry paths into that pipeline:

- `POST /extract` runs the extraction stack without writing to the database.
- `POST /uploads` persists the file, extracts in a background task, and then classifies pending rows.

## Canonical entities

| Entity | Key fields | Role in the system |
|---|---|---|
| `statement_uploads` | `filename`, `storage_path`, `period_start`, `period_end`, `status`, `archived_at` | The ingestion ledger for source documents |
| `transactions` | `date`, `description`, `amount`, `override_amount`, `balance`, `category_id`, `status`, `classification_level`, `similarity_score`, `dedup_hash`, `bbox` | The canonical transaction store used by review and analytics |
| `categories` | `name`, `color`, `reporting_rule`, `example_count` | User taxonomy plus reporting behavior |
| `manual_overrides` | `raw_description`, `category_id`, `override_count`, `last_used_at` | The learned example memory for exact and fuzzy classification |

Two fields are especially important from a data-modeling perspective:

- `override_amount` preserves the original bank amount while allowing reporting to reflect a personal share.
- `bbox` stores page-relative coordinates so an extracted row can be traced back to its visual source on the statement.

## Extraction and normalization

The extraction service is centered on Docling's table parser. The key design choice is to normalize the output into a single transaction shape as early as possible so every downstream feature works from the same representation.

### Supported source formats

The current parser targets two ANZ layouts:

| Account type | Expected columns |
|---|---|
| Transaction / cheque | `Date | Particulars | Debit | Credit | Balance` |
| Credit card | `Date | Description | Amount | Balance` |

### Normalization strategy

- Column names are detected through an alias map rather than strict header equality.
- If Docling returns numeric column indices, the first meaningful row is promoted to a header row.
- Multiline cells are split and reassembled into logical rows when multiple numeric or date columns share the same multiline pattern.
- Descriptions are whitespace-normalized and uppercased so matching behavior is consistent.
- Dates are parsed through ANZ-specific formats first, then `dateutil` as a fallback.
- Amounts are canonicalized to signed values: debits negative, credits positive.
- Balances remain optional because some statement formats or rows do not provide them cleanly.

That canonicalization step is what makes the rest of the system simple. Once a row is in the canonical shape, filtering, classification, aggregation, and export no longer care which original statement layout produced it.

### Provenance capture

The extractor records row-level bounding boxes when Docling provides them. If a merged visual row is split into several logical transactions, the bounding box is also split vertically so the review layer still has a usable source anchor.

If a page yields no recoverable transactions, the backend records that page number in `uncovered_pages` and surfaces a warning to the user. The current implementation deliberately routes that case into manual review rather than a second OCR/LLM path.

## Reviewability and auditability

Review is part of the data pipeline, not a UI afterthought.

- The original PDF is stored on disk under the upload UUID.
- The backend can render individual pages to PNG through `pypdfium2`.
- The review flow shows the source document beside the editable transaction table.
- Users can add, edit, and delete rows, and attach or clear bounding boxes while reviewing.

This matters because extraction quality is never perfect. The combination of source retention, page rendering, and bbox-level provenance turns manual correction into a traceable data curation step rather than an opaque overwrite.

## Classification and incremental learning

The current classifier is intentionally lightweight and explainable. It behaves more like interactive information retrieval over labeled examples than like a heavyweight embedding model.

### Classification stages

```text
Transaction description
    -> Level 1: exact match in manual_overrides
    -> Level 2: pg_trgm similarity search with top-k voting
    -> Level 3: pending_review if no strong match exists
```

### Level 1: exact match

If a transaction description already exists in `manual_overrides`, the classifier assigns that category immediately.

- `status = auto_classified`
- `classification_level = 1`
- `similarity_score = 1.0`

### Level 2: trigram similarity with voting

If there is no exact match, PostgreSQL's `pg_trgm` extension is used to find the top `k` similar example strings above a minimum similarity threshold.

Conceptually, the query is:

```sql
SELECT category_id, similarity(raw_description, :desc) AS sim
FROM manual_overrides
WHERE raw_description % :desc
  AND similarity(raw_description, :desc) >= :min_sim
ORDER BY sim DESC
LIMIT :k;
```

Those candidate matches are then aggregated by category, and the category with the highest total score wins. The stored `similarity_score` is the best individual similarity among the winning category's matches so the UI can show some notion of confidence.

The current runtime knobs are:

- `CLASSIFICATION_MIN_SIMILARITY` with a default of `0.30`
- `CLASSIFICATION_K` with a default of `3`

### Level 3: pending review

If no acceptable similar examples exist, the transaction remains uncategorised and is marked:

- `status = pending_review`
- `classification_level = 3`

That is a deliberate product choice. The system prefers uncertainty over silent misclassification.

### How learning happens

Manual category assignment does two things:

1. It marks the transaction as `verified`.
2. It can optionally upsert the transaction description into `manual_overrides` so future rows with the same or similar text are learned.

Category creation and category updates can also seed the system with example phrases. Those seeds are inserted into `manual_overrides`, which means the classifier can start from a small curated vocabulary instead of a blank slate.

This is the key data-science pattern in the app today: user feedback is converted directly into structured labeled memory that improves future automation.

## Reporting semantics

The raw bank ledger is not the same thing as the reporting layer. The code explicitly models that distinction.

### Signed transaction amounts

All extracted transactions use signed amounts:

- debits are negative
- credits are positive

This keeps the raw data internally consistent and makes storage and filtering straightforward.

### Effective amount

Analytics operate on an effective amount:

```text
effective_amount = override_amount if present else amount
```

That allows personal reporting to diverge from the original bank value without losing the original record.

### Reporting rules

Each category also carries a `reporting_rule`:

- `default`: negative values count as expenses, positive values count as income
- `expense`: use when both purchases and refunds belong to the same spending bucket
- `income`: use when credits represent income and debits are reversals
- `transfer`: exclude internal transfers from income and expense summaries

This gives the app a semantic layer over the ledger and prevents common analytical mistakes such as treating transfers as spending.

## Storage and integrity choices

### Postgres as the system of record

PostgreSQL is used for structured storage, classification queries, and concurrency-safe background processing. The current schema enables `pg_trgm`, which powers the fuzzy matching stage of classification.

### PDF storage

Uploaded statements are stored on disk under `PDF_STORAGE_PATH`, keyed by upload UUID. The database stores the resolved path in `statement_uploads.storage_path`.

### Deduplication

The ingestion flows compute a stable transaction hash from:

```text
date | description | amount | balance
```

That hash is used during upload and re-upload flows to filter duplicates. In other words, deduplication is already part of the data pipeline, but the current checked-in schema files do not yet enforce it with a database uniqueness constraint. Adding that constraint would be a good hardening step.

### Soft deletion

Uploads are archived through `archived_at` rather than immediately removed. This keeps the history model simple while excluding archived statements from normal browsing and duplicate checks.

## Current technical limitations and next directions

The implementation is already useful, but the next technical steps are clear:

- Add bank-specific adapters behind the same canonical transaction contract.
- Introduce an evaluation harness for extraction quality and classification precision/recall.
- Reintroduce a secondary OCR or LLM fallback only for `uncovered_pages`, not for the whole happy path.
- Consider merchant normalization or embedding-based retrieval as an additional classification layer on top of the current labeled-example memory.
- Add a formal migration workflow and enforce deduplication with schema-level constraints.

Those extensions fit the current abstractions cleanly, which is a good sign that the data model is carrying the right concepts already.
