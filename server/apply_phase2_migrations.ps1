# Phase 2 Database V2 — Migration Application Script (PowerShell)
# Purpose: Apply all Phase 2 migrations in correct order
# Usage: .\apply_phase2_migrations.ps1

param(
    [string]$DBHost = "localhost",
    [string]$DBPort = "5432",
    [string]$DBName = "gymcore_db",
    [string]$DBUser = "postgres",
    [string]$MigrationsDir = ".\migrations"
)

Write-Host "🚀 GymCore Phase 2 — Database V2 Migration Application" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

# Configuration
Write-Host "📋 Configuration:" -ForegroundColor Yellow
Write-Host "  Database: $DBName@$DBHost`:$DBPort" -ForegroundColor Gray
Write-Host "  User: $DBUser" -ForegroundColor Gray
Write-Host "  Migrations: $MigrationsDir" -ForegroundColor Gray
Write-Host ""

# Check if migrations directory exists
if (-not (Test-Path $MigrationsDir)) {
    Write-Host "❌ ERROR: Migrations directory not found: $MigrationsDir" -ForegroundColor Red
    Write-Host "   Make sure you're in the 'server' directory" -ForegroundColor Red
    exit 1
}

Write-Host "⚠️  IMPORTANT NOTES:" -ForegroundColor Yellow
Write-Host "   1. Ensure database backup is created (current backup will be overwritten)" -ForegroundColor Gray
Write-Host "   2. This is a clean rebuild (appropriate for design-phase projects)" -ForegroundColor Gray
Write-Host "   3. All migrations will be applied in order: 047 → 048 → 049 → 050 → 051" -ForegroundColor Gray
Write-Host ""

$response = Read-Host "Continue? (y/n)"
if ($response -ne "y" -and $response -ne "Y") {
    Write-Host "Aborted." -ForegroundColor Yellow
    exit 1
}

# Create backup before applying migrations
Write-Host ""
Write-Host "🔄 Creating backup before migrations..." -ForegroundColor Cyan
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "backups"
$backupFile = "$backupDir\gymcore_backup_pre_phase2_$timestamp.sql"

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$env:PGPASSWORD = Read-Host "Enter PostgreSQL password" -AsSecureString
$plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToCoTaskMemUnicode($env:PGPASSWORD))
$env:PGPASSWORD = $plainPassword

Write-Host "Creating backup..." -ForegroundColor Gray
& pg_dump -h $DBHost -p $DBPort -U $DBUser -d $DBName | Out-File -FilePath $backupFile -Encoding UTF8
Write-Host "✅ Backup created: $backupFile" -ForegroundColor Green

# Function to apply migration
function Apply-Migration {
    param(
        [string]$MigrationFile
    )
    
    $migrationName = Split-Path -Leaf $MigrationFile
    Write-Host ""
    Write-Host "📝 Applying: $migrationName" -ForegroundColor Cyan
    
    try {
        $env:PGPASSWORD = $plainPassword
        & psql -h $DBHost -p $DBPort -U $DBUser -d $DBName -f $MigrationFile | Out-Null
        Write-Host "✅ Success: $migrationName" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "❌ FAILED: $migrationName" -ForegroundColor Red
        Write-Host "   Error: $_" -ForegroundColor Red
        Write-Host "   Restoring backup: $backupFile" -ForegroundColor Yellow
        try {
            & pg_restore -h $DBHost -p $DBPort -U $DBUser -d $DBName -f $backupFile
            Write-Host "✅ Backup restored" -ForegroundColor Green
        } catch {
            Write-Host "❌ Failed to restore backup: $_" -ForegroundColor Red
        }
        return $false
    }
}

# Apply Phase 2 migrations in order
Write-Host ""
Write-Host "🔄 Applying Phase 2 Migrations..." -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray

# Phase 2أ
$success = Apply-Migration "$MigrationsDir\047_phase2a_soft_delete_columns.sql"
if (-not $success) { exit 1 }

$success = Apply-Migration "$MigrationsDir\048_phase2a_new_platform_tables.sql"
if (-not $success) { exit 1 }

$success = Apply-Migration "$MigrationsDir\049_phase2a_add_member_id_to_invoices.sql"
if (-not $success) { exit 1 }

# Phase 2ب
$success = Apply-Migration "$MigrationsDir\050_phase2b_add_branches_and_branch_id.sql"
if (-not $success) { exit 1 }

# Phase 2ج
$success = Apply-Migration "$MigrationsDir\051_phase2c_rls_policies_and_indexes.sql"
if (-not $success) { exit 1 }

Write-Host ""
Write-Host "✅ All migrations applied successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "🧪 Next: Run RLS isolation tests" -ForegroundColor Yellow
Write-Host "   psql -h $DBHost -p $DBPort -U $DBUser -d $DBName -f migrations/051_phase2c_rls_test_scenarios.sql" -ForegroundColor Gray
Write-Host ""
Write-Host "📊 Verify success:" -ForegroundColor Yellow
Write-Host "   - Check RLS policies: SELECT * FROM pg_policies WHERE schemaname = 'public' LIMIT 5;" -ForegroundColor Gray
Write-Host "   - Check soft_delete columns: SELECT column_name FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'deleted_at';" -ForegroundColor Gray
Write-Host "   - Check branches: SELECT COUNT(*) FROM branches;" -ForegroundColor Gray

# Clean up
$env:PGPASSWORD = ""
