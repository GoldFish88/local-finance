"""
Categories endpoints.

GET    /categories                 List all categories
POST   /categories                 Create a category (with optional seed phrases)
PATCH  /categories/{id}            Update name/color/icon
DELETE /categories/{id}            Delete a category
PATCH  /uploads/{id}/transactions/{txn_id}/category   Manually assign a category
"""

import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Category, Transaction, StatementUpload
from app.schemas import (
    CategoryAssign,
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    TransactionRead,
)
from app.services.classification import apply_manual_category

logger = logging.getLogger(__name__)

router = APIRouter(tags=["categories"])


async def _upsert_seeds_to_overrides(
    db: AsyncSession, category_id: uuid.UUID, seed_phrases: list[str]
) -> None:
    """Insert seed phrases into manual_overrides so they appear alongside learned examples."""
    from sqlalchemy import text as sa_text

    for phrase in seed_phrases:
        await db.execute(
            sa_text(
                """
                INSERT INTO manual_overrides (raw_description, category_id, override_count, last_used_at)
                VALUES (:desc, :cid, 0, now())
                ON CONFLICT (raw_description) DO UPDATE
                    SET category_id = :cid
                """
            ),
            {"desc": phrase, "cid": str(category_id)},
        )


# ---------------------------------------------------------------------------
# Category CRUD
# ---------------------------------------------------------------------------


@router.get("/categories", response_model=list[CategoryRead])
async def list_categories(db: AsyncSession = Depends(get_db)) -> list[CategoryRead]:
    cats = (await db.execute(select(Category).order_by(Category.name))).scalars().all()
    return [CategoryRead.model_validate(c) for c in cats]


@router.post("/categories", response_model=CategoryRead, status_code=201)
async def create_category(
    body: CategoryCreate, db: AsyncSession = Depends(get_db)
) -> CategoryRead:
    # Check for duplicate name
    existing = await db.scalar(select(Category).where(Category.name == body.name))
    if existing:
        raise HTTPException(
            status_code=409, detail="A category with this name already exists."
        )

    cat = Category(
        name=body.name,
        parent_id=body.parent_id,
        color=body.color,
        icon=body.icon,
        reporting_rule=body.reporting_rule,
        example_count=len(body.seed_phrases),
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)

    # Insert seed phrases directly into manual overrides
    if body.seed_phrases:
        try:
            await _upsert_seeds_to_overrides(db, cat.id, body.seed_phrases)
            await db.commit()
        except Exception as exc:
            logger.warning(
                "Failed to insert seed phrases for category %s: %s", cat.id, exc
            )

    return CategoryRead.model_validate(cat)


@router.get("/categories/spending")
async def get_all_categories_spending(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """
    Return monthly spending aggregated by category.
    Returns list of {category_id, category_name, color, reporting_rule, month, amount}.
    """
    from sqlalchemy import text as sa_text

    rows = (
        await db.execute(
            sa_text(
                """
                SELECT
                    c.id AS category_id,
                    c.name AS category_name,
                    c.color,
                    c.reporting_rule,
                    TO_CHAR(t.date, 'YYYY-MM') AS month,
                    SUM(COALESCE(t.override_amount, t.amount)) AS total_amount
                FROM transactions t
                JOIN categories c ON t.category_id = c.id
                JOIN statement_uploads u ON t.upload_id = u.id
                WHERE u.archived_at IS NULL
                GROUP BY c.id, c.name, c.color, c.reporting_rule, TO_CHAR(t.date, 'YYYY-MM')
                ORDER BY month ASC, c.name ASC
                """
            )
        )
    ).fetchall()

    return [
        {
            "category_id": str(r.category_id),
            "category_name": r.category_name,
            "color": r.color,
            "reporting_rule": r.reporting_rule,
            "month": r.month,
            "amount": float(r.total_amount),
        }
        for r in rows
    ]


@router.patch("/categories/{category_id}", response_model=CategoryRead)
async def update_category(
    category_id: uuid.UUID,
    body: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
) -> CategoryRead:
    cat = await db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    if body.name is not None:
        cat.name = body.name
    if body.color is not None:
        cat.color = body.color
    if body.icon is not None:
        cat.icon = body.icon
    if body.reporting_rule is not None:
        cat.reporting_rule = body.reporting_rule

    if body.seed_phrases:
        try:
            cat.example_count = (cat.example_count or 0) + len(body.seed_phrases)
            await _upsert_seeds_to_overrides(db, cat.id, body.seed_phrases)
        except Exception as exc:
            logger.warning("Re-seed failed for category %s: %s", category_id, exc)
    await db.commit()
    await db.refresh(cat)
    return CategoryRead.model_validate(cat)


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(
    category_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> None:
    cat = await db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    await db.delete(cat)
    await db.commit()


@router.get("/categories/{category_id}/examples")
async def list_category_examples(
    category_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[dict]:
    """Return the exact-match descriptions stored in manual_overrides for this category."""
    from sqlalchemy import text as sa_text

    cat = await db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")

    rows = (
        await db.execute(
            sa_text(
                """
                SELECT raw_description, override_count, last_used_at
                FROM manual_overrides
                WHERE category_id = :cid
                ORDER BY override_count DESC, last_used_at DESC
                """
            ),
            {"cid": str(category_id)},
        )
    ).fetchall()

    return [
        {
            "description": r.raw_description,
            "count": r.override_count,
            "last_used_at": r.last_used_at.isoformat() if r.last_used_at else None,
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Manual category assignment on a transaction
# ---------------------------------------------------------------------------


@router.patch(
    "/uploads/{upload_id}/transactions/{txn_id}/category",
    response_model=TransactionRead,
)
async def assign_category(
    upload_id: uuid.UUID,
    txn_id: uuid.UUID,
    body: CategoryAssign,
    db: AsyncSession = Depends(get_db),
) -> TransactionRead:
    """Assign a category_id (or null to clear) to a transaction."""
    txn = await db.get(Transaction, txn_id)
    if not txn or txn.upload_id != upload_id:
        raise HTTPException(status_code=404, detail="Transaction not found.")

    category_id = body.category_id

    if category_id is None:
        # Clear classification
        txn.category_id = None
        txn.status = "pending"
        txn.classification_level = None
        txn.similarity_score = None
        await db.commit()
        await db.refresh(txn)
        return TransactionRead.model_validate(txn)

    cat = await db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")

    await apply_manual_category(db, txn, category_id, learn=body.learn)
    await db.refresh(txn)
    data = TransactionRead.model_validate(txn)
    data.category_name = cat.name
    return data
