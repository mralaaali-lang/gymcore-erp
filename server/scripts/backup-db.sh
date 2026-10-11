#!/bin/bash
# ====================================================================
# GymCore ERP — Database Backup Script
# Usage: ./backup-db.sh
# Retention: Last 7 days (older backups are automatically deleted)
# ====================================================================

set -euo pipefail

# ── Configuration ──────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-$(pwd)/../backups/db}"
DATABASE_URL="${DATABASE_URL:-postgres://gymcore:gymcore@localhost:5433/gymcore}"
RETENTION_DAYS=7
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="gymcore_backup_${TIMESTAMP}.sql.gz"

# ── Ensure backup directory exists ─────────────────────────
mkdir -p "$BACKUP_DIR"

echo "🗄️  Starting GymCore database backup..."
echo "   Timestamp: ${TIMESTAMP}"
echo "   Target:    ${BACKUP_DIR}/${BACKUP_FILE}"

# ── Run pg_dump and compress ───────────────────────────────
pg_dump "$DATABASE_URL" \
  --clean --if-exists --no-owner --no-privileges \
  | gzip > "${BACKUP_DIR}/${BACKUP_FILE}"

BACKUP_SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_FILE}" | cut -f1)
echo "✅ Backup complete: ${BACKUP_SIZE}"

# ── Cleanup old backups (older than RETENTION_DAYS) ────────
DELETED=$(find "$BACKUP_DIR" -name "gymcore_backup_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "🗑️  Cleaned up ${DELETED} backup(s) older than ${RETENTION_DAYS} days."
fi

# ── List remaining backups ─────────────────────────────────
REMAINING=$(find "$BACKUP_DIR" -name "gymcore_backup_*.sql.gz" | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
echo "📦 Remaining backups: ${REMAINING} (total: ${TOTAL_SIZE})"
echo "🏁 Done."
