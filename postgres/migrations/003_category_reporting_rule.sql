ALTER TABLE categories
ADD COLUMN IF NOT EXISTS reporting_rule TEXT;

UPDATE categories
SET reporting_rule = 'default'
WHERE reporting_rule IS NULL;

ALTER TABLE categories
ALTER COLUMN reporting_rule SET DEFAULT 'default';

ALTER TABLE categories
ALTER COLUMN reporting_rule SET NOT NULL;