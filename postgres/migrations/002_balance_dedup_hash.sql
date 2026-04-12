-- Migration 002: include balance in dedup_hash
--
-- The old hash was SHA256(date|description|amount).
-- The new hash is SHA256(date|description|amount|balance) where balance is
-- formatted as 2-decimal string, or empty string when NULL.
--
-- DECIMAL(12,2)::text gives e.g. "12.50" which matches Python's f"{v:.2f}".
--
-- Run once against a live database:
--   psql $DATABASE_URL -f 002_balance_dedup_hash.sql

UPDATE transactions
SET dedup_hash = encode(
    sha256((
        date::text
            || '|' || description
            || '|' || amount::text
            || '|' || COALESCE(balance::text, '')
    )::bytea),
    'hex'
);
