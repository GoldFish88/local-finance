"""
Upload endpoints — persistent pipeline.

POST /uploads                              Upload a PDF → extract → store in DB (background)
GET  /uploads                              List all uploads with transaction counts
GET  /uploads/{id}                         Single upload detail
GET  /uploads/{id}/pdf                     Serve the original PDF file
GET  /uploads/{id}/pages                   Page count for the uploaded PDF
GET  /uploads/{id}/pages/{n}               Render PDF page n (0-based) as a PNG image
GET  /uploads/{id}/transactions            Transactions for an upload
POST /uploads/{id}/transactions            Add a transaction manually
PATCH /uploads/{id}/transactions/{txn_id}  Edit a transaction
DELETE /uploads/{id}/transactions/{txn_id} Delete a transaction
DELETE /uploads/{id}                       Soft-delete (archive) an upload
"""

import asyncio
import hashlib
import io
import logging
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import FileResponse, Response
from sqlalchemy import func, select, update as sa_update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import AsyncSessionLocal, get_db
from app.models import StatementUpload, Transaction
from app.schemas import (
    OverrideAmountUpdate,
    ReuploadConfirmResponse,
    ReuploadPreviewResponse,
    ReuploadPreviewTransaction,
    TransactionCreate,
    TransactionRead,
    TransactionUpdate,
    UploadListItem,
    UploadResponse,
)
from app.services.extraction import extract_pdf
from app.services.classification import classify_batch

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/uploads", tags=["uploads"])

_MAX_FILE_SIZE = 50 * 1024 * 1024


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _dedup_hash(txn_date: str, description: str, amount: float, balance: float | None = None) -> str:
    # Use fixed 2-decimal formatting to avoid float repr differences.
    # Balance is included to distinguish transactions with identical date/description/amount
    # (e.g. two transfers of the same value on the same day).
    bal_part = f"{balance:.2f}" if balance is not None else ""
    raw = f"{txn_date}|{description}|{amount:.2f}|{bal_part}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _save_pdf(content: bytes, filename: str, upload_id: uuid.UUID) -> str:
    from app.config import settings

    # Sanitize filename to prevent path traversal
    safe_filename = Path(filename).name
    if not safe_filename:
        safe_filename = "statement.pdf"

    upload_dir = Path(settings.pdf_storage_path) / str(upload_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / safe_filename
    dest.write_bytes(content)
    return str(dest)


def _to_list_item(upload: StatementUpload, count: int) -> UploadListItem:
    return UploadListItem(
        id=upload.id,
        filename=upload.filename,
        bank_name=upload.bank_name,
        account_type=upload.account_type,
        period_start=upload.period_start,
        period_end=upload.period_end,
        uploaded_at=upload.uploaded_at,
        status=upload.status,
        error_message=upload.error_message,
        transaction_count=count,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


def _txn_read(txn: Transaction) -> TransactionRead:
    data = TransactionRead.model_validate(txn)
    if txn.category is not None:
        data.category_name = txn.category.name
    return data


@router.post("", response_model=UploadResponse, status_code=202)
async def create_upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> UploadResponse:
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Only PDF files are accepted.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(content) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Max 50 MB.")

    filename = file.filename or "statement.pdf"

    upload = StatementUpload(filename=filename, storage_path="pending")
    db.add(upload)
    await db.commit()
    await db.refresh(upload)

    storage_path = _save_pdf(content, filename, upload.id)
    upload.storage_path = storage_path
    await db.commit()

    background_tasks.add_task(_process_upload, upload.id, content, filename)
    logger.info("Queued upload %s (%s)", upload.id, filename)

    return UploadResponse(upload_id=upload.id, status="processing")


@router.get("", response_model=list[UploadListItem])
async def list_uploads(db: AsyncSession = Depends(get_db)) -> list[UploadListItem]:
    stmt = (
        select(StatementUpload, func.count(Transaction.id).label("cnt"))
        .outerjoin(Transaction, Transaction.upload_id == StatementUpload.id)
        .where(StatementUpload.archived_at.is_(None))
        .group_by(StatementUpload.id)
        .order_by(StatementUpload.uploaded_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [_to_list_item(row.StatementUpload, row.cnt) for row in rows]


@router.get("/{upload_id}", response_model=UploadListItem)
async def get_upload(
    upload_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> UploadListItem:
    stmt = (
        select(StatementUpload, func.count(Transaction.id).label("cnt"))
        .outerjoin(Transaction, Transaction.upload_id == StatementUpload.id)
        .where(StatementUpload.id == upload_id)
        .where(StatementUpload.archived_at.is_(None))
        .group_by(StatementUpload.id)
    )
    row = (await db.execute(stmt)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Upload not found.")
    return _to_list_item(row.StatementUpload, row.cnt)


@router.get("/{upload_id}/transactions", response_model=list[TransactionRead])
async def get_upload_transactions(
    upload_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[TransactionRead]:
    upload = await db.get(StatementUpload, upload_id)
    if not upload or upload.archived_at is not None:
        raise HTTPException(status_code=404, detail="Upload not found.")

    stmt = (
        select(Transaction)
        .options(selectinload(Transaction.category))
        .where(Transaction.upload_id == upload_id)
        .order_by(Transaction.date.asc(), Transaction.created_at.asc())
    )
    txns = (await db.execute(stmt)).scalars().all()
    return [_txn_read(t) for t in txns]


def _validate_pdf_path(storage_path: str) -> Path:
    """Resolve the storage path and verify it lives under PDF_STORAGE_PATH."""
    from app.config import settings

    path = Path(storage_path).resolve()
    base = Path(settings.pdf_storage_path).resolve()
    if not path.is_relative_to(base):
        raise HTTPException(status_code=403, detail="Access denied.")
    if not path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found on disk.")
    return path


@router.get("/{upload_id}/pdf")
async def get_upload_pdf(
    upload_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> FileResponse:
    upload = await db.get(StatementUpload, upload_id)
    if not upload or upload.archived_at is not None:
        raise HTTPException(status_code=404, detail="Upload not found.")
    path = _validate_pdf_path(upload.storage_path)
    safe_name = Path(upload.filename).name.replace('"', "'")
    return FileResponse(
        str(path),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
    )


@router.get("/{upload_id}/pages")
async def get_upload_page_count(
    upload_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> dict:
    upload = await db.get(StatementUpload, upload_id)
    if not upload or upload.archived_at is not None:
        raise HTTPException(status_code=404, detail="Upload not found.")
    path = _validate_pdf_path(upload.storage_path)

    def _get_pages() -> list[dict]:
        import pypdfium2 as pdfium

        doc = pdfium.PdfDocument(str(path))
        pages = []
        for i in range(len(doc)):
            page = doc[i]
            w, h = page.get_size()
            pages.append({"width_pt": round(w, 2), "height_pt": round(h, 2)})
        return pages

    loop = asyncio.get_event_loop()
    pages = await loop.run_in_executor(None, _get_pages)
    return {"page_count": len(pages), "pages": pages}


@router.get("/{upload_id}/pages/{page_num}")
async def get_upload_page_image(
    upload_id: uuid.UUID,
    page_num: int,
    scale: float = Query(default=2.0, ge=1.0, le=3.0),
    db: AsyncSession = Depends(get_db),
) -> Response:
    upload = await db.get(StatementUpload, upload_id)
    if not upload or upload.archived_at is not None:
        raise HTTPException(status_code=404, detail="Upload not found.")
    path = _validate_pdf_path(upload.storage_path)

    def _render() -> bytes | None:
        import pypdfium2 as pdfium

        doc = pdfium.PdfDocument(str(path))
        if page_num < 0 or page_num >= len(doc):
            return None
        page = doc[page_num]
        bitmap = page.render(scale=scale)
        pil_img = bitmap.to_pil()
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG", optimize=True)
        return buf.getvalue()

    loop = asyncio.get_event_loop()
    img_bytes = await loop.run_in_executor(None, _render)
    if img_bytes is None:
        raise HTTPException(status_code=404, detail="Page not found.")
    return Response(
        content=img_bytes,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.post(
    "/{upload_id}/transactions", response_model=TransactionRead, status_code=201
)
async def create_transaction(
    upload_id: uuid.UUID,
    body: TransactionCreate,
    db: AsyncSession = Depends(get_db),
) -> TransactionRead:
    upload = await db.get(StatementUpload, upload_id)
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found.")
    dedup = _dedup_hash(body.date.isoformat(), body.description, float(body.amount), float(body.balance) if body.balance is not None else None)
    existing = await db.scalar(
        select(func.count())
        .select_from(Transaction)
        .join(StatementUpload, Transaction.upload_id == StatementUpload.id)
        .where(
            Transaction.dedup_hash == dedup,
            StatementUpload.archived_at.is_(None),
        )
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="A transaction with this date, description, and amount already exists.",
        )
    txn = Transaction(
        upload_id=upload_id,
        date=body.date,
        description=body.description,
        amount=body.amount,
        balance=body.balance,
        dedup_hash=dedup,
        status="pending",
        bbox=body.bbox,
    )
    db.add(txn)
    await db.commit()
    await db.refresh(txn)
    return TransactionRead.model_validate(txn)


@router.patch("/{upload_id}/transactions/{txn_id}", response_model=TransactionRead)
async def update_transaction(
    upload_id: uuid.UUID,
    txn_id: uuid.UUID,
    body: TransactionUpdate,
    db: AsyncSession = Depends(get_db),
) -> TransactionRead:
    txn = await db.get(Transaction, txn_id)
    if not txn or txn.upload_id != upload_id:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    if body.date is not None:
        txn.date = body.date
    if body.description is not None:
        txn.description = body.description
    if body.amount is not None:
        txn.amount = body.amount
    if body.balance is not None:
        txn.balance = body.balance
    if body.bbox is not None:
        txn.bbox = body.bbox
    new_hash = _dedup_hash(txn.date.isoformat(), txn.description, float(txn.amount), float(txn.balance) if txn.balance is not None else None)
    existing = await db.scalar(
        select(func.count())
        .select_from(Transaction)
        .join(StatementUpload, Transaction.upload_id == StatementUpload.id)
        .where(
            Transaction.dedup_hash == new_hash,
            StatementUpload.archived_at.is_(None),
            Transaction.id != txn_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="A transaction with this date, description, and amount already exists.",
        )
    txn.dedup_hash = new_hash
    await db.commit()
    await db.refresh(txn)
    return TransactionRead.model_validate(txn)


@router.patch(
    "/{upload_id}/transactions/{txn_id}/override", response_model=TransactionRead
)
async def set_override_amount(
    upload_id: uuid.UUID,
    txn_id: uuid.UUID,
    body: OverrideAmountUpdate,
    db: AsyncSession = Depends(get_db),
) -> TransactionRead:
    txn = await db.scalar(
        select(Transaction)
        .options(selectinload(Transaction.category))
        .where(Transaction.id == txn_id)
    )
    if not txn or txn.upload_id != upload_id:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    txn.override_amount = body.override_amount
    await db.commit()
    await db.refresh(txn, ["override_amount"])
    return _txn_read(txn)


@router.delete("/{upload_id}/transactions/{txn_id}", status_code=204)
async def delete_transaction(
    upload_id: uuid.UUID,
    txn_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    txn = await db.get(Transaction, txn_id)
    if not txn or txn.upload_id != upload_id:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    await db.delete(txn)
    await db.commit()


@router.post("/{upload_id}/classify", status_code=202)
async def reclassify_upload(
    upload_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict:
    upload = await db.get(StatementUpload, upload_id)
    if not upload or upload.archived_at is not None:
        raise HTTPException(status_code=404, detail="Upload not found.")

    async def _do_classify(uid: uuid.UUID) -> None:
        async with AsyncSessionLocal() as session:
            # Only reset transactions that still need classification (pending / pending_review).
            # auto_classified and verified transactions are left untouched.
            from sqlalchemy import update as sa_update

            await session.execute(
                sa_update(Transaction)
                .where(
                    Transaction.upload_id == uid,
                    Transaction.status.in_(["pending", "pending_review"]),
                )
                .values(status="pending")
            )
            await session.commit()
            count = await classify_batch(session, uid)
            logger.info("Reclassify: %d transactions for upload %s", count, uid)

    background_tasks.add_task(_do_classify, upload_id)
    return {"status": "reclassifying"}


@router.delete("/{upload_id}", status_code=204)
async def archive_upload(
    upload_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    upload = await db.get(StatementUpload, upload_id)
    if not upload or upload.archived_at is not None:
        raise HTTPException(status_code=404, detail="Upload not found.")
    upload.archived_at = datetime.now(timezone.utc)
    await db.commit()


# ---------------------------------------------------------------------------
# Background task
# ---------------------------------------------------------------------------


async def _process_upload(upload_id: uuid.UUID, content: bytes, filename: str) -> None:
    async with AsyncSessionLocal() as session:
        try:
            result = await extract_pdf(content, filename)

            if result.transactions:
                values = [
                    {
                        "upload_id": upload_id,
                        "date": date.fromisoformat(txn.date),
                        "description": txn.description,
                        "amount": txn.amount,
                        "balance": txn.balance,
                        "dedup_hash": _dedup_hash(
                            txn.date, txn.description, float(txn.amount), float(txn.balance) if txn.balance is not None else None
                        ),
                        "status": "pending",
                        "bbox": txn.bbox.model_dump() if txn.bbox else None,
                    }
                    for txn in result.transactions
                ]
                # Dedup against active (non-archived) uploads only.
                candidate_hashes = {v["dedup_hash"] for v in values}
                existing_hashes = set(
                    await session.scalars(
                        select(Transaction.dedup_hash)
                        .join(
                            StatementUpload, Transaction.upload_id == StatementUpload.id
                        )
                        .where(
                            Transaction.dedup_hash.in_(candidate_hashes),
                            StatementUpload.archived_at.is_(None),
                        )
                    )
                )
                values = [v for v in values if v["dedup_hash"] not in existing_hashes]
                if values:
                    await session.execute(pg_insert(Transaction).values(values))

            upload = await session.get(StatementUpload, upload_id)
            if upload is None:
                logger.error(
                    "Upload %s disappeared before processing completed", upload_id
                )
                return

            upload.status = "done"
            # Warn if Docling missed any pages (vision fallback is disabled)
            uncovered = result.extraction_summary.uncovered_pages
            if uncovered:
                # Pages are 0-indexed internally; show 1-indexed to users
                page_list = ", ".join(str(p + 1) for p in uncovered)
                upload.error_message = (
                    f"Pages {page_list} could not be extracted automatically. "
                    "Check those pages manually and add any missing transactions via Review."
                )
            # Set period from all extracted transactions — even if every row
            # was a duplicate (re-upload), the date range is still meaningful.
            if result.transactions:
                dates = [date.fromisoformat(t.date) for t in result.transactions]
                upload.period_start = min(dates)
                upload.period_end = max(dates)

            await session.commit()
            logger.info(
                "Processed upload %s: %d transactions",
                upload_id,
                len(result.transactions),
            )

            # Embed + classify all pending transactions for this upload
            classified = await classify_batch(session, upload_id)
            logger.info(
                "Classified %d transactions for upload %s", classified, upload_id
            )

        except Exception as exc:
            logger.exception("Failed to process upload %s", upload_id)
            async with AsyncSessionLocal() as err_session:
                upload = await err_session.get(StatementUpload, upload_id)
                if upload:
                    upload.status = "failed"
                    upload.error_message = str(exc)
                    await err_session.commit()


# ---------------------------------------------------------------------------
# Re-upload endpoints
# ---------------------------------------------------------------------------

def _reupload_diff(
    existing_hashes: set[str],
    result,
) -> tuple[list[ReuploadPreviewTransaction], int]:
    """Return (new_transactions, existing_count) given extracted result and known hashes."""
    new_txns: list[ReuploadPreviewTransaction] = []
    existing_count = 0
    for txn in result.transactions:
        h = _dedup_hash(
            txn.date,
            txn.description,
            float(txn.amount),
            float(txn.balance) if txn.balance is not None else None,
        )
        if h in existing_hashes:
            existing_count += 1
        else:
            new_txns.append(
                ReuploadPreviewTransaction(
                    date=date.fromisoformat(txn.date),
                    description=txn.description,
                    amount=txn.amount,
                    balance=txn.balance,
                    dedup_hash=h,
                )
            )
    return new_txns, existing_count


@router.post("/{upload_id}/reupload/preview", response_model=ReuploadPreviewResponse)
async def reupload_preview(
    upload_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> ReuploadPreviewResponse:
    """Extract a PDF and diff it against the existing transactions — no DB writes."""
    upload = await db.get(StatementUpload, upload_id)
    if not upload or upload.archived_at is not None:
        raise HTTPException(status_code=404, detail="Upload not found.")

    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Only PDF files are accepted.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(content) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Max 50 MB.")

    new_filename = file.filename or "statement.pdf"

    # Extract without writing anything
    result = await extract_pdf(content, new_filename)

    # Fetch existing dedup hashes for this upload only
    existing_hashes = set(
        await db.scalars(
            select(Transaction.dedup_hash).where(Transaction.upload_id == upload_id)
        )
    )

    new_txns, existing_count = _reupload_diff(existing_hashes, result)

    # Build date-range warning: warn if the new file's date range doesn't overlap
    # with the existing upload period at all.
    date_range_warning: str | None = None
    if new_txns and upload.period_start and upload.period_end:
        new_dates = [t.date for t in new_txns]
        new_min, new_max = min(new_dates), max(new_dates)
        if new_max < upload.period_start or new_min > upload.period_end:
            date_range_warning = (
                f"The new file covers {new_min} – {new_max} which does not overlap "
                f"with the existing period {upload.period_start} – {upload.period_end}. "
                "You may have selected the wrong file."
            )

    return ReuploadPreviewResponse(
        new_count=len(new_txns),
        existing_count=existing_count,
        total_in_file=len(result.transactions),
        filename_changed=new_filename != upload.filename,
        original_filename=upload.filename,
        new_filename=new_filename,
        date_range_warning=date_range_warning,
        new_transactions=new_txns,
    )


@router.post("/{upload_id}/reupload/confirm", response_model=ReuploadConfirmResponse)
async def reupload_confirm(
    upload_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> ReuploadConfirmResponse:
    """Re-extract a PDF and insert only new (non-duplicate) transactions."""
    upload = await db.get(StatementUpload, upload_id)
    if not upload or upload.archived_at is not None:
        raise HTTPException(status_code=404, detail="Upload not found.")

    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Only PDF files are accepted.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(content) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Max 50 MB.")

    new_filename = file.filename or "statement.pdf"
    result = await extract_pdf(content, new_filename)

    async with AsyncSessionLocal() as session:
        # Fetch existing hashes for this upload
        existing_hashes = set(
            await session.scalars(
                select(Transaction.dedup_hash).where(Transaction.upload_id == upload_id)
            )
        )

        new_txns, _ = _reupload_diff(existing_hashes, result)

        added_count = 0
        if new_txns:
            values = [
                {
                    "upload_id": upload_id,
                    "date": t.date,
                    "description": t.description,
                    "amount": t.amount,
                    "balance": t.balance,
                    "dedup_hash": t.dedup_hash,
                    "status": "pending",
                    "bbox": None,
                }
                for t in new_txns
            ]
            await session.execute(
                pg_insert(Transaction).values(values).on_conflict_do_nothing(index_elements=["dedup_hash"])
            )
            added_count = len(new_txns)

        # Update PDF on disk and filename if a different file was supplied
        if new_filename != upload.filename:
            _save_pdf(content, new_filename, upload_id)
            upload_row = await session.get(StatementUpload, upload_id)
            if upload_row:
                upload_row.filename = new_filename

        # Extend the period if new transactions fall outside the current range
        if new_txns:
            upload_row = await session.get(StatementUpload, upload_id)
            if upload_row:
                all_dates = [t.date for t in new_txns]
                if upload_row.period_start:
                    all_dates.append(upload_row.period_start)
                if upload_row.period_end:
                    all_dates.append(upload_row.period_end)
                upload_row.period_start = min(all_dates)
                upload_row.period_end = max(all_dates)

        await session.commit()

    # Classify the newly inserted transactions in the background
    classified = 0
    if added_count > 0:
        async with AsyncSessionLocal() as cls_session:
            classified = await classify_batch(cls_session, upload_id)

    return ReuploadConfirmResponse(added_count=added_count, classified_count=classified)
