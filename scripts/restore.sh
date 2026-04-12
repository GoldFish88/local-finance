#!/bin/bash
set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <path-to-db-backup-file> [path-to-pdf-backup-file] [target-database]"
    exit 1
fi

DB_BACKUP_FILE="$1"
PDF_BACKUP_FILE="${2:-}"
TARGET_DB="${3:-finance}"

if [ ! -f "$DB_BACKUP_FILE" ]; then
    echo "Error: Database backup file '$DB_BACKUP_FILE' not found!"
    exit 1
fi

# Make paths absolute if they aren't, so they work after changing directory
if [[ ! "$DB_BACKUP_FILE" = /* ]]; then
    DB_BACKUP_FILE="$(pwd)/$DB_BACKUP_FILE"
fi

if [ -n "$PDF_BACKUP_FILE" ]; then
    if [ ! -f "$PDF_BACKUP_FILE" ]; then
        echo "Error: PDF backup file '$PDF_BACKUP_FILE' not found!"
        exit 1
    fi
    if [[ ! "$PDF_BACKUP_FILE" = /* ]]; then
        PDF_BACKUP_FILE="$(pwd)/$PDF_BACKUP_FILE"
    fi
fi

# Change directory to the root of the project
cd "$(dirname "$0")/.."

echo "Restoring database from: $DB_BACKUP_FILE"
echo "Target database: $TARGET_DB"
echo "WARNING: This will drop existing database objects and cleanly restore."

# -c cleans (drops) DB objects before recreating them
# -1 implies single transaction
# -d specifies the database
docker compose exec -T postgres pg_restore -U finance -d "$TARGET_DB" -1 -c < "$DB_BACKUP_FILE"

# Restore PDFs if provided
if [ -n "$PDF_BACKUP_FILE" ]; then
    echo ""
    echo "Restoring PDFs from: $PDF_BACKUP_FILE"
    # Ensure directory exists in the container
    docker compose exec -T backend mkdir -p /data/pdfs
    # Extract tarball directly into the /data/pdfs folder
    cat "$PDF_BACKUP_FILE" | docker compose exec -T backend tar -xzf - -C /data/pdfs
    echo "PDF restore completed successfully!"
fi

echo "Restore process finished!"
