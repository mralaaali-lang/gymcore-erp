#!/bin/bash
# Phase 2 Database V2 — Migration Application Script
# Purpose: Apply all Phase 2 migrations in correct order
# Usage: bash apply_phase2_migrations.sh

set -e  # Exit on error

echo "🚀 GymCore Phase 2 — Database V2 Migration Application"
echo "========================================================"
echo ""

# Configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-gymcore_db}"
DB_USER="${DB_USER:-postgres}"
MIGRATIONS_DIR="./migrations"

echo "📋 Configuration:"
echo "  Database: ${DB_NAME}@${DB_HOST}:${DB_PORT}"
echo "  User: ${DB_USER}"
echo "  Migrations: ${MIGRATIONS_DIR}"
echo ""

# Check if migrations directory exists
if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo "❌ ERROR: Migrations directory not found: $MIGRATIONS_DIR"
    echo "   Make sure you're in the 'server' directory"
    exit 1
fi

echo "⚠️  IMPORTANT NOTES:"
echo "   1. Ensure database backup is created (current backup will be overwritten)"
echo "   2. This is a clean rebuild (appropriate for design-phase projects)"
echo "   3. All migrations will be applied in order: 047 → 048 → 049 → 050 → 051"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Create backup before applying migrations
echo ""
echo "🔄 Creating backup before migrations..."
BACKUP_FILE="backups/gymcore_backup_pre_phase2_$(date +%Y%m%d_%H%M%S).sql"
mkdir -p backups
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_FILE"
echo "✅ Backup created: $BACKUP_FILE"

# Function to apply migration
apply_migration() {
    local migration_file=$1
    local migration_name=$(basename "$migration_file")
    
    echo ""
    echo "📝 Applying: $migration_name"
    
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration_file" > /dev/null 2>&1; then
        echo "✅ Success: $migration_name"
        return 0
    else
        echo "❌ FAILED: $migration_name"
        echo "   Restoring backup: $BACKUP_FILE"
        pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < "$BACKUP_FILE"
        exit 1
    fi
}

# Apply Phase 2 migrations in order
echo ""
echo "🔄 Applying Phase 2 Migrations..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Phase 2أ
apply_migration "$MIGRATIONS_DIR/047_phase2a_soft_delete_columns.sql"
apply_migration "$MIGRATIONS_DIR/048_phase2a_new_platform_tables.sql"
apply_migration "$MIGRATIONS_DIR/049_phase2a_add_member_id_to_invoices.sql"

# Phase 2ب
apply_migration "$MIGRATIONS_DIR/050_phase2b_add_branches_and_branch_id.sql"

# Phase 2ج
apply_migration "$MIGRATIONS_DIR/051_phase2c_rls_policies_and_indexes.sql"

echo ""
echo "✅ All migrations applied successfully!"
echo ""
echo "🧪 Next: Run RLS isolation tests"
echo "   psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f migrations/051_phase2c_rls_test_scenarios.sql"
echo ""
echo "📊 Verify success:"
echo "   - Check RLS policies: SELECT * FROM pg_policies WHERE schemaname = 'public' LIMIT 5;"
echo "   - Check soft_delete columns: SELECT column_name FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'deleted_at';"
echo "   - Check branches: SELECT COUNT(*) FROM branches;"
