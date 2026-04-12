"""Classification service — three-level pipeline.

Level 1: manual_overrides exact match           → status="auto_classified", level=1
Level 2: trigram similarity on manual_overrides → status="auto_classified", level=2
Level 3: similarity < threshold or no matches   → status="pending_review",  level=3
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict

from sqlalchemy import select, text
from sqlalchemy.sql import func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Category, Transaction

logger = logging.getLogger(__name__)


async def classify_transaction(
    session: AsyncSession,
    txn: Transaction,
) -> None:
    """Classify and mutate *txn* in place using trigram similarity (does not commit)."""
    # --- Level 1: manual override exact match ---
    override_row = await session.execute(
        text("SELECT category_id FROM manual_overrides WHERE raw_description = :desc"),
        {"desc": txn.description},
    )
    override = override_row.first()
    if override:
        txn.category_id = override.category_id
        txn.status = "auto_classified"
        txn.classification_level = 1
        txn.similarity_score = 1.0
        return

    # --- Level 2: Trigram similarity with Top K voting ---
    # Query the top K closest matches above the minimum similarity threshold
    knn_row = await session.execute(
        text(
            """
            SELECT category_id, similarity(raw_description, :desc) as sim
            FROM manual_overrides
            WHERE raw_description % :desc
              AND similarity(raw_description, :desc) >= :min_sim
            ORDER BY sim DESC
            LIMIT :k
            """
        ),
        {
            "desc": txn.description,
            "min_sim": settings.classification_min_similarity,
            "k": settings.classification_k,
        },
    )
    matches = knn_row.fetchall()

    if not matches:
        txn.status = "pending_review"
        txn.classification_level = 3
        txn.similarity_score = None
        return

    # Top K voting by aggregating similarity scores per category
    category_scores = defaultdict(float)
    for match in matches:
        category_scores[match.category_id] += match.sim

    # Pick the best category based on the highest aggregated score
    best_category_id = max(category_scores.keys(), key=lambda k: category_scores[k])

    # Store the highest individual similarity for that winning category to pass to UI
    best_sim = max(
        match.sim for match in matches if match.category_id == best_category_id
    )

    txn.category_id = best_category_id
    txn.status = "auto_classified"
    txn.classification_level = 2
    txn.similarity_score = float(best_sim)


async def classify_batch(session: AsyncSession, upload_id: uuid.UUID) -> int:
    """Classify all pending transactions in an upload. Returns count classified.

    Skips entirely if no categories exist yet.
    """
    category_count = await session.scalar(select(func.count()).select_from(Category))
    if not category_count:
        logger.info(
            "No categories defined — skipping classification for upload %s", upload_id
        )
        return 0

    stmt = select(Transaction).where(
        Transaction.upload_id == upload_id,
        Transaction.status == "pending",
    )
    txns = (await session.execute(stmt)).scalars().all()
    for txn in txns:
        await classify_transaction(session, txn)
    await session.commit()
    return len(txns)


async def apply_manual_category(
    session: AsyncSession,
    txn: Transaction,
    category_id: uuid.UUID,
    learn: bool = True,
) -> None:
    """Manually assign a category and update manual_overrides.

    If learn=False, the transaction is assigned but not saved as a text example.
    Commits the session.
    """
    txn.category_id = category_id
    txn.status = "verified"
    txn.classification_level = 1
    txn.similarity_score = 1.0

    if not learn:
        await session.commit()
        return

    # Upsert manual_overrides — but first check if the description was already
    # mapped to a *different* category, so we can clean up the old one.
    existing = await session.execute(
        text(
            "SELECT category_id, override_count FROM manual_overrides WHERE raw_description = :desc"
        ),
        {"desc": txn.description},
    )
    old_row = existing.first()
    old_category_id = old_row.category_id if old_row else None

    if old_category_id and str(old_category_id) != str(category_id):
        # Remove (or decrement) the entry on the old category
        old_count = old_row.override_count
        if old_count <= 1:
            await session.execute(
                text("DELETE FROM manual_overrides WHERE raw_description = :desc"),
                {"desc": txn.description},
            )
        else:
            await session.execute(
                text(
                    "UPDATE manual_overrides SET override_count = override_count - 1 WHERE raw_description = :desc"
                ),
                {"desc": txn.description},
            )
        # Decrement the old category's example_count
        old_cat = await session.get(Category, old_category_id)
        if old_cat is not None:
            old_cat.example_count = max(0, (old_cat.example_count or 1) - 1)

    await session.execute(
        text(
            """
            INSERT INTO manual_overrides (raw_description, category_id, override_count, last_used_at)
            VALUES (:desc, :cat_id, 1, now())
            ON CONFLICT (raw_description) DO UPDATE
                SET category_id    = excluded.category_id,
                    override_count = manual_overrides.override_count + 1,
                    last_used_at   = now()
            """
        ),
        {"desc": txn.description, "cat_id": str(category_id)},
    )

    # Increment new category's example_count if this is a new override mapping
    if str(old_category_id) != str(category_id):
        new_cat = await session.get(Category, category_id)
        if new_cat is not None:
            new_cat.example_count = (new_cat.example_count or 0) + 1

    await session.commit()
