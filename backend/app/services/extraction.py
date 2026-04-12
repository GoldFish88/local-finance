"""
Primary extraction service using Docling.

ANZ statement formats handled:
  - Transaction/cheque account: Date | Particulars | Debit | Credit | Balance
  - Credit card:                Date | Description | Amount | Balance

First-run note: Docling downloads ~1 GB of ML models (TableFormer) on startup.
Subsequent starts are fast (models cached in HF_HOME).
"""

import asyncio
import logging
import os
import re
import tempfile
from datetime import date, datetime
from typing import Literal, Optional

import pandas as pd
import pypdfium2 as pdfium
from dateutil import parser as dateutil_parser
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
from docling.document_converter import DocumentConverter, PdfFormatOption
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class BBox(BaseModel):
    page: int
    x1: float
    y1: float
    x2: float
    y2: float
    page_w: float
    page_h: float


class Transaction(BaseModel):
    date: str
    description: str
    amount: float
    balance: Optional[float] = None
    extraction_method: Literal["docling"]
    bbox: Optional[BBox] = None


class ExtractionSummary(BaseModel):
    docling_count: int
    failed_count: int
    uncovered_pages: list[int] = []


class ExtractionResult(BaseModel):
    upload_filename: str
    transaction_count: int
    transactions: list[Transaction]
    extraction_summary: ExtractionSummary


# ---------------------------------------------------------------------------
# Column detection
# ---------------------------------------------------------------------------

_COLUMN_ALIASES: dict[str, list[str]] = {
    "date": ["date", "transaction date", "trans date", "trans. date", "value date"],
    "description": [
        "description",
        "particulars",
        "details",
        "narrative",
        "transaction details",
    ],
    "debit": ["debit", "withdrawals", "payment", "amount debited", "debit amount"],
    "credit": ["credit", "deposits", "amount credited", "credit amount"],
    "amount": ["amount", "transaction amount"],
    "balance": ["balance", "running balance", "closing balance", "available balance"],
}


def _detect_columns(headers: list[str]) -> dict[str, str]:
    """Map logical roles → actual column names via substring matching."""
    col_map: dict[str, str] = {}
    for role, aliases in _COLUMN_ALIASES.items():
        for header in headers:
            if any(alias in header for alias in aliases):
                col_map[role] = header
                break
    return col_map


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------


def _parse_date(s: str) -> Optional[date]:
    s = s.strip()
    if not s or s.lower() in {"nan", "date", ""}:
        return None
    for fmt in ("%d/%m/%Y", "%d %b %Y", "%d-%m-%Y", "%d/%m/%y", "%d %B %Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    try:
        return dateutil_parser.parse(s, dayfirst=True).date()
    except Exception:
        return None


def _parse_amount_str(s: str) -> Optional[float]:
    """Parse a plain positive number string; return None if not parseable."""
    if not s or s.lower() in {"nan", "-", ""}:
        return None
    cleaned = re.sub(r"[$,\s]", "", s).replace("CR", "").replace("DR", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_signed_amount(s: str) -> Optional[float]:
    """
    Parse a combined amount column.
    CR suffix → positive (credit), no suffix / DR → negative (debit).
    """
    if not s or s.lower() in {"nan", "-", ""}:
        return None
    s = s.strip()
    is_credit = "CR" in s.upper() and not s.upper().endswith("DR")
    cleaned = re.sub(r"[$,\s]", "", s).replace("CR", "").replace("DR", "").strip()
    try:
        val = float(cleaned)
        return abs(val) if is_credit else -abs(val)
    except ValueError:
        return None


def _normalize_description(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().upper()


def _split_multiline_cell(value: object) -> list[str]:
    """Split a Docling cell into logical line items, removing empty fragments."""
    if value is None:
        return []
    text = str(value).replace("\r", "\n").strip()
    if not text or text.lower() == "nan":
        return []
    return [
        cleaned
        for cleaned in (re.sub(r"\s+", " ", part).strip() for part in text.split("\n"))
        if cleaned and cleaned.lower() != "nan"
    ]


def _split_bbox_vertically(
    bbox: Optional["BBox"], parts: int, index: int
) -> Optional["BBox"]:
    """Divide a merged row bbox evenly across exploded logical rows."""
    if bbox is None or parts <= 1:
        return bbox

    row_height = (bbox.y2 - bbox.y1) / parts
    y1 = bbox.y1 + (row_height * index)
    y2 = bbox.y1 + (row_height * (index + 1))
    return BBox(
        page=bbox.page,
        x1=bbox.x1,
        y1=round(y1, 2),
        x2=bbox.x2,
        y2=round(y2, 2),
        page_w=bbox.page_w,
        page_h=bbox.page_h,
    )


def _expand_multiline_row(row: pd.Series, col_map: dict[str, str]) -> list[pd.Series]:
    """
    Recover rows Docling merged into a single borderless-table row.

    We only explode when multiple numeric/date columns agree on a multiline shape.
    That avoids breaking valid single transactions whose description simply wraps.
    """
    split_by_col = {col: _split_multiline_cell(row.get(col, "")) for col in row.index}
    split_by_role = {
        role: split_by_col.get(actual_col, []) for role, actual_col in col_map.items()
    }

    anchor_roles = [
        role
        for role in ("date", "debit", "credit", "amount", "balance")
        if len(split_by_role.get(role, [])) > 1
    ]
    if not anchor_roles:
        return [row]

    target_len = max(len(split_by_role[role]) for role in anchor_roles)
    if target_len < 2:
        return [row]

    matching_anchors = sum(
        1 for role in anchor_roles if len(split_by_role[role]) == target_len
    )
    if matching_anchors < 2 and len(split_by_role.get("date", [])) != target_len:
        return [row]

    expanded_rows: list[pd.Series] = []
    for idx in range(target_len):
        values: dict[str, object] = {}
        for col in row.index:
            parts = split_by_col.get(col, [])
            if not parts:
                values[col] = row.get(col, "")
            elif len(parts) == target_len:
                values[col] = parts[idx]
            elif len(parts) == 1:
                values[col] = parts[0]
            elif len(parts) < target_len:
                values[col] = parts[idx] if idx < len(parts) else parts[-1]
            else:
                values[col] = parts[idx] if idx < target_len - 1 else " ".join(parts[idx:])
        expanded_rows.append(pd.Series(values, index=row.index))

    return expanded_rows


# ---------------------------------------------------------------------------
# Row parser
# ---------------------------------------------------------------------------


def _parse_row(
    row: pd.Series, col_map: dict[str, str], bbox: Optional["BBox"] = None
) -> Optional[Transaction]:
    date_raw = str(row.get(col_map["date"], "")).strip()
    desc_raw = str(row.get(col_map["description"], "")).strip()

    if not date_raw or not desc_raw or desc_raw.lower() == "nan":
        return None

    parsed_date = _parse_date(date_raw)
    if not parsed_date:
        return None

    amount: Optional[float] = None
    if "debit" in col_map and "credit" in col_map:
        debit = _parse_amount_str(str(row.get(col_map["debit"], "")))
        credit = _parse_amount_str(str(row.get(col_map["credit"], "")))
        if debit is not None:
            amount = -abs(debit)
        elif credit is not None:
            amount = abs(credit)
    elif "amount" in col_map:
        amount = _parse_signed_amount(str(row.get(col_map["amount"], "")))

    if amount is None:
        return None

    balance: Optional[float] = None
    if "balance" in col_map:
        balance = _parse_amount_str(str(row.get(col_map["balance"], "")))

    return Transaction(
        date=parsed_date.isoformat(),
        description=_normalize_description(desc_raw),
        amount=round(amount, 2),
        balance=round(balance, 2) if balance is not None else None,
        extraction_method="docling",
        bbox=bbox,
    )


# ---------------------------------------------------------------------------
# Table parser
# ---------------------------------------------------------------------------


def _parse_table(
    df: pd.DataFrame,
    row_bboxes: Optional[dict] = None,
    page_no: int = 0,
    page_w: float = 595.0,
    page_h: float = 842.0,
) -> list[Transaction]:
    if df.empty:
        return []

    # Docling may return numeric column indices when no header is detected.
    # If so, promote the first meaningful row as the header.
    if all(isinstance(c, (int, float)) for c in df.columns):
        df.columns = [str(v).strip().lower() for v in df.iloc[0]]
        df = df.iloc[1:].reset_index(drop=True)
    else:
        df.columns = [str(c).strip().lower() for c in df.columns]

    col_map = _detect_columns(list(df.columns))
    if "date" not in col_map or "description" not in col_map:
        return []

    transactions: list[Transaction] = []
    expanded_row_count = 0
    expanded_txn_count = 0
    for i, (_, row) in enumerate(df.iterrows()):
        try:
            # Row 0 in Docling's bbox dict is the header; data rows start at 1.
            bbox: Optional[BBox] = None
            if row_bboxes:
                raw = row_bboxes.get(i + 1)
                if raw is not None:
                    try:
                        tl = raw.to_top_left_origin(page_h)
                        bbox = BBox(
                            page=page_no,
                            x1=round(tl.l, 2),
                            y1=round(tl.t, 2),
                            x2=round(tl.r, 2),
                            y2=round(tl.b, 2),
                            page_w=round(page_w, 2),
                            page_h=round(page_h, 2),
                        )
                    except Exception as exc:
                        logger.debug("Could not convert bbox for row %d: %s", i, exc)

            logical_rows = _expand_multiline_row(row, col_map)
            if len(logical_rows) > 1:
                expanded_row_count += 1
                expanded_txn_count += len(logical_rows)

            for split_idx, logical_row in enumerate(logical_rows):
                txn = _parse_row(
                    logical_row,
                    col_map,
                    bbox=_split_bbox_vertically(bbox, len(logical_rows), split_idx),
                )
                if txn:
                    transactions.append(txn)
        except Exception as exc:
            logger.debug("Skipping row: %s", exc)

    if expanded_row_count:
        logger.info(
            "Recovered %d merged Docling row(s) into %d logical row(s) on page %d",
            expanded_row_count,
            expanded_txn_count,
            page_no + 1,
        )

    return transactions


# ---------------------------------------------------------------------------
# PDF page count
# ---------------------------------------------------------------------------


def _count_pdf_pages(content: bytes) -> int:
    """Return the number of pages in a PDF from raw bytes."""
    try:
        return len(pdfium.PdfDocument(content))
    except Exception:
        return 1


# ---------------------------------------------------------------------------
# Docling converter singleton
# ---------------------------------------------------------------------------

_converter: Optional[DocumentConverter] = None


def get_converter() -> DocumentConverter:
    global _converter
    if _converter is None:
        logger.info(
            "Initializing Docling converter — first-run model download may take several minutes."
        )
        pipeline_options = PdfPipelineOptions()
        pipeline_options.do_ocr = (
            False  # ANZ statements are digital PDFs; OCR not needed
        )
        pipeline_options.do_table_structure = True
        pipeline_options.table_structure_options.mode = TableFormerMode.ACCURATE
        pipeline_options.table_structure_options.do_cell_matching = True
        _converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
            }
        )
        logger.info("Docling converter ready.")
    return _converter


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def extract_pdf(content: bytes, filename: str) -> ExtractionResult:
    """Extract transactions from PDF bytes using Docling."""
    loop = asyncio.get_event_loop()
    (
        docling_txns,
        _page_count,
        failed_count,
        _pages_covered,
    ) = await loop.run_in_executor(None, _run_docling, content)

    return ExtractionResult(
        upload_filename=filename,
        transaction_count=len(docling_txns),
        transactions=docling_txns,
        extraction_summary=ExtractionSummary(
            docling_count=len(docling_txns),
            failed_count=failed_count,
            uncovered_pages=[p for p in range(_page_count) if p not in _pages_covered],
        ),
    )


def _run_docling(content: bytes) -> tuple[list[Transaction], int, int, set[int]]:
    """
    Blocking Docling call — run via executor.

    Returns (transactions, page_count, failed_count, pages_with_transactions).
    pages_with_transactions contains 0-based page indices where Docling
    successfully extracted at least one transaction.
    """
    # Get real page count from the raw bytes so it is accurate even if
    # Docling fails to parse the document entirely.
    page_count = _count_pdf_pages(content)
    transactions: list[Transaction] = []
    failed_count = 0
    pages_with_transactions: set[int] = set()

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        converter = get_converter()
        result = converter.convert(tmp_path)
        doc = result.document
        if hasattr(doc, "pages") and doc.pages:
            page_count = len(doc.pages)

        for table in doc.tables:
            try:
                # Resolve the page this table lives on (0-based).
                page_idx: Optional[int] = None
                if getattr(table, "prov", None):
                    page_idx = table.prov[0].page_no - 1

                # Page dimensions (in PDF points) for bbox coordinate conversion.
                page_w: float = 595.0
                page_h: float = 842.0
                if page_idx is not None:
                    page_no_1based = page_idx + 1
                    page_obj = (
                        doc.pages.get(page_no_1based) if hasattr(doc, "pages") else None
                    )
                    if page_obj and getattr(page_obj, "size", None):
                        page_w, page_h = page_obj.size.as_tuple()

                # Row-level bounding boxes from Docling.
                row_bboxes: dict = {}
                try:
                    row_bboxes = table.data.get_row_bounding_boxes(minimal=False)
                except Exception as exc:
                    logger.debug("Could not get row bboxes: %s", exc)

                df = table.export_to_dataframe(doc)
                rows = _parse_table(
                    df,
                    row_bboxes=row_bboxes,
                    page_no=page_idx if page_idx is not None else 0,
                    page_w=page_w,
                    page_h=page_h,
                )
                if rows:
                    transactions.extend(rows)
                    if page_idx is not None:
                        pages_with_transactions.add(page_idx)
            except Exception as exc:
                logger.warning("Failed to parse table: %s", exc)
                failed_count += 1

    except Exception as exc:
        logger.error("Docling extraction failed: %s", exc)
        failed_count += 1
    finally:
        os.unlink(tmp_path)

    return transactions, page_count, failed_count, pages_with_transactions
