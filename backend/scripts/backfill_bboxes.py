"""
Backfill bounding boxes for transactions extracted before bbox support was added.

For each upload whose PDF is still on disk, re-runs Docling extraction and
matches the resulting transactions back to DB rows by dedup_hash.  Only rows
where bbox IS NULL are updated — all other fields (amount, category, status,
classification, overrides …) are left untouched.

Usage
-----
# Dry-run (preview only, no writes):
uv run python scripts/backfill_bboxes.py --dry-run

# All uploads that have at least one NULL bbox:
uv run python scripts/backfill_bboxes.py

# Target a single upload:
uv run python scripts/backfill_bboxes.py --upload-id <uuid>

# Force re-run even if all bboxes are already populated:
uv run python scripts/backfill_bboxes.py --force

Environment
-----------
Reads DATABASE_URL and PDF_STORAGE_PATH from .env (same as the app).
Run from the backend/ directory so pydantic-settings picks up .env.
"""

import argparse
import asyncio
import hashlib
import json
import logging
import sys
import uuid
from pathlib import Path

from sqlalchemy import select, update as sa_update

# Ensure the app package is importable when running from backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings
from app.db import AsyncSessionLocal
from app.models import StatementUpload, Transaction
from app.services.extraction import _run_docling

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _dedup_hash(txn_date: str, description: str, amount: float, balance: float | None = None) -> str:
    bal_part = f"{balance:.2f}" if balance is not None else ""
    raw = f"{txn_date}|{description}|{amount:.2f}|{bal_part}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _bbox_dict(bbox) -> dict | None:
    """Convert a BBox model to a plain dict suitable for JSON storage."""
    if bbox is None:
        return None
    return {
        "page": bbox.page,
        "x1": bbox.x1,
        "y1": bbox.y1,
        "x2": bbox.x2,
        "y2": bbox.y2,
        "page_w": bbox.page_w,
        "page_h": bbox.page_h,
    }


# ---------------------------------------------------------------------------
# Per-upload backfill
# ---------------------------------------------------------------------------


async def backfill_upload(
    upload: StatementUpload,
    *,
    dry_run: bool,
    force: bool,
) -> tuple[int, int, int]:
    """
    Backfill bboxes for one upload.

    Returns (updated, skipped_already_set, skipped_no_match).
    """
    updated = 0
    skipped_already_set = 0
    skipped_no_match = 0

    async with AsyncSessionLocal() as session:
        stmt = select(Transaction).where(Transaction.upload_id == upload.id)
        txns = (await session.execute(stmt)).scalars().all()

        if not txns:
            logger.info("  [%s] No transactions — skipping.", upload.filename)
            return 0, 0, 0

        null_count = sum(1 for t in txns if t.bbox is None)
        if null_count == 0 and not force:
            logger.info(
                "  [%s] All %d transaction(s) already have bboxes — skipping (use --force to override).",
                upload.filename,
                len(txns),
            )
            return 0, len(txns), 0

        logger.info(
            "  [%s] %d transaction(s), %d with NULL bbox — re-extracting …",
            upload.filename,
            len(txns),
            null_count,
        )

        # Build a lookup: dedup_hash → Transaction (only those needing update)
        hash_to_txn: dict[str, Transaction] = {}
        for t in txns:
            if t.bbox is None or force:
                hash_to_txn[t.dedup_hash] = t

        # Read the PDF from disk
        pdf_path = Path(upload.storage_path)
        if not pdf_path.exists():
            logger.warning(
                "  [%s] PDF not found at %s — skipping.", upload.filename, pdf_path
            )
            return 0, 0, len(hash_to_txn)

        try:
            content = pdf_path.read_bytes()
        except OSError as exc:
            logger.error("  [%s] Failed to read PDF: %s", upload.filename, exc)
            return 0, 0, len(hash_to_txn)

        # Run Docling (blocking) in a thread executor
        loop = asyncio.get_event_loop()
        try:
            extracted_txns, _pages, _failed, _covered = await loop.run_in_executor(
                None, _run_docling, content
            )
        except Exception as exc:
            logger.error("  [%s] Docling extraction failed: %s", upload.filename, exc)
            return 0, 0, len(hash_to_txn)

        # Build extracted hash → bbox map; keep first occurrence per hash
        # (duplicate hashes from the same PDF are treated identically).
        extracted_hash_to_bbox: dict[str, dict | None] = {}
        for ex in extracted_txns:
            h = _dedup_hash(ex.date, ex.description, ex.amount, ex.balance if hasattr(ex, 'balance') else None)
            if h not in extracted_hash_to_bbox:
                extracted_hash_to_bbox[h] = _bbox_dict(ex.bbox)

        # Match and update
        ids_to_update: list[tuple[uuid.UUID, dict | None]] = []
        for h, db_txn in hash_to_txn.items():
            if h in extracted_hash_to_bbox:
                if db_txn.bbox is not None and not force:
                    skipped_already_set += 1
                else:
                    ids_to_update.append((db_txn.id, extracted_hash_to_bbox[h]))
            else:
                skipped_no_match += 1
                logger.debug(
                    "  [%s] No Docling match for hash %s (date=%s desc=%.40s amount=%s)",
                    upload.filename,
                    h[:12],
                    db_txn.date,
                    db_txn.description,
                    db_txn.amount,
                )

        if ids_to_update:
            if dry_run:
                logger.info(
                    "  [%s] DRY-RUN: would update bbox on %d row(s).",
                    upload.filename,
                    len(ids_to_update),
                )
                updated = len(ids_to_update)
            else:
                for txn_id, bbox in ids_to_update:
                    await session.execute(
                        sa_update(Transaction)
                        .where(Transaction.id == txn_id)
                        .values(bbox=bbox)
                    )
                await session.commit()
                updated = len(ids_to_update)
                logger.info("  [%s] Updated %d row(s).", upload.filename, updated)
        else:
            logger.info("  [%s] Nothing to update.", upload.filename)

    return updated, skipped_already_set, skipped_no_match


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


async def main(
    upload_id: str | None,
    dry_run: bool,
    force: bool,
) -> None:
    async with AsyncSessionLocal() as session:
        if upload_id:
            try:
                uid = uuid.UUID(upload_id)
            except ValueError:
                logger.error("Invalid UUID: %s", upload_id)
                sys.exit(1)
            upload = await session.get(StatementUpload, uid)
            if upload is None:
                logger.error("Upload %s not found.", upload_id)
                sys.exit(1)
            uploads = [upload]
        else:
            # All non-archived uploads that have at least one NULL bbox
            # (unless --force, in which case process everything).
            if force:
                stmt = select(StatementUpload).where(
                    StatementUpload.archived_at.is_(None)
                )
            else:
                from sqlalchemy import exists

                null_bbox_subq = exists().where(
                    (Transaction.upload_id == StatementUpload.id)
                    & (Transaction.bbox.is_(None))
                )
                stmt = select(StatementUpload).where(
                    StatementUpload.archived_at.is_(None),
                    null_bbox_subq,
                )
            uploads = list((await session.execute(stmt)).scalars().all())

    if not uploads:
        logger.info("No uploads require backfilling.")
        return

    logger.info(
        "%s%d upload(s) to process.",
        "[DRY-RUN] " if dry_run else "",
        len(uploads),
    )

    total_updated = 0
    total_already_set = 0
    total_no_match = 0

    for i, upload in enumerate(uploads, 1):
        logger.info("(%d/%d) %s [%s]", i, len(uploads), upload.filename, upload.id)
        u, a, n = await backfill_upload(upload, dry_run=dry_run, force=force)
        total_updated += u
        total_already_set += a
        total_no_match += n

    logger.info(
        "\nSummary: %s%d updated, %d already had bbox, %d no Docling match.",
        "[DRY-RUN] " if dry_run else "",
        total_updated,
        total_already_set,
        total_no_match,
    )
    if total_no_match:
        logger.warning(
            "%d transaction(s) could not be matched — they may have been manually "
            "added, edited, or the PDF format may have changed since upload.",
            total_no_match,
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Backfill bbox column for existing transactions."
    )
    parser.add_argument(
        "--upload-id",
        metavar="UUID",
        help="Target a single upload (default: all uploads with NULL bboxes).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without writing to the database.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-run even for transactions that already have a bbox.",
    )
    args = parser.parse_args()

    asyncio.run(main(args.upload_id, args.dry_run, args.force))
