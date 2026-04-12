import logging

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.extraction import ExtractionResult, extract_pdf

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/extract", tags=["extraction"])

_MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
_ALLOWED_CONTENT_TYPES = {"application/pdf", "application/octet-stream"}


@router.post("", response_model=ExtractionResult)
async def extract(file: UploadFile = File(...)) -> ExtractionResult:
    """
    Accept a PDF bank statement and return normalized transactions.

    Stateless — no database writes. Used to validate extraction quality
    before wiring up persistence (Milestone 5).
    """
    if file.content_type not in _ALLOWED_CONTENT_TYPES and not (
        file.filename or ""
    ).lower().endswith(".pdf"):
        raise HTTPException(
            status_code=415,
            detail="Only PDF files are accepted.",
        )

    content = await file.read()

    if len(content) > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size is {_MAX_FILE_SIZE // (1024 * 1024)} MB.",
        )

    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    logger.info("Extracting: %s (%d bytes)", file.filename, len(content))

    try:
        result = await extract_pdf(content, file.filename or "unknown.pdf")
    except Exception as exc:
        logger.exception("Extraction failed for %s", file.filename)
        raise HTTPException(
            status_code=500, detail=f"Extraction failed: {exc}"
        ) from exc

    logger.info(
        "Extracted %d transactions from %s (docling=%d, failed=%d)",
        result.transaction_count,
        file.filename,
        result.extraction_summary.docling_count,
        result.extraction_summary.failed_count,
    )

    return result
