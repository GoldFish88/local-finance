-- Migration: add bbox column to transactions
-- Run once against existing databases:
--   docker exec -it <postgres_container> psql -U finance -d finance -f /migrations/001_add_bbox.sql
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bbox JSONB;
