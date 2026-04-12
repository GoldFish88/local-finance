#!/bin/bash
set -e

# Change directory to the root of the project
cd "$(dirname "$0")/.."

BACKUP_DIR="backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_FILENAME="$BACKUP_DIR/finance_db_$TIMESTAMP.dump"
PDF_FILENAME="$BACKUP_DIR/finance_pdfs_$TIMESTAMP.tar.gz"

echo "Creating database backup..."
echo "Destination: $DB_FILENAME"

# Run pg_dump in custom format (-F c) for easy, clean restores
docker compose exec -T postgres pg_dump -U finance -F c finance > "$DB_FILENAME"

echo "Creating PDF backup..."
echo "Destination: $PDF_FILENAME"

# Tar the contents of the /data/pdfs directory from the backend container
docker compose exec -T backend tar -czf - -C /data/pdfs . > "$PDF_FILENAME"

echo "Backup completed successfully!"
echo ""
echo "Export files:"
echo "- $DB_FILENAME"
echo "- $PDF_FILENAME"