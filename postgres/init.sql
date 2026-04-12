CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Categories (hierarchical)
CREATE TABLE categories (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT UNIQUE NOT NULL,
    parent_id           UUID REFERENCES categories(id) ON DELETE SET NULL,
    example_count       INT DEFAULT 0,
    color               TEXT,
    icon                TEXT,
    reporting_rule      TEXT NOT NULL DEFAULT 'default',
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- Statement uploads (audit trail)
CREATE TABLE statement_uploads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename        TEXT NOT NULL,
    storage_path    TEXT NOT NULL,
    bank_name       TEXT DEFAULT 'ANZ',
    account_type    TEXT,
    period_start    DATE,
    period_end      DATE,
    uploaded_at     TIMESTAMPTZ DEFAULT now(),
    status          TEXT DEFAULT 'processing',
    error_message   TEXT,
    archived_at     TIMESTAMPTZ DEFAULT NULL
);

-- Transactions
CREATE TABLE transactions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id            UUID REFERENCES statement_uploads(id) ON DELETE CASCADE,
    date                 DATE NOT NULL,
    description          TEXT NOT NULL,
    amount               DECIMAL(12,2) NOT NULL,
    override_amount      DECIMAL(12,2),
    balance              DECIMAL(12,2),
    category_id          UUID REFERENCES categories(id) ON DELETE SET NULL,
    status               TEXT DEFAULT 'pending',
    similarity_score     FLOAT,
    classification_level INT,
    dedup_hash           TEXT NOT NULL,
    bbox                 JSONB,
    created_at           TIMESTAMPTZ DEFAULT now()
);

-- Manual overrides (exact match cache)
CREATE TABLE manual_overrides (
    raw_description TEXT PRIMARY KEY,
    category_id     UUID REFERENCES categories(id) ON DELETE CASCADE,
    override_count  INT DEFAULT 1,
    last_used_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_upload ON transactions(upload_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_manual_overrides_desc_trgm ON manual_overrides USING gist (raw_description gist_trgm_ops);
