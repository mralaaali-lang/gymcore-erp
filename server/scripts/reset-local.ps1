# Reset local database: drop → create → extensions → migrate → seed 10 gyms
# (+ engagement) → bootstrap super admin.
# Writes progress to backups/reset-status.json + backups/reset.log
# Usage (PowerShell, from repo root): .\server\scripts\reset-local.ps1
# Or triggered from UI: OTA Manager → Reset (POST /admin/ota/reset)
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$StatusFile = Join-Path $RepoRoot 'backups\reset-status.json'
$LogFile = Join-Path $RepoRoot 'backups\reset.log'
Start-Transcript -Path $LogFile -Append | Out-Null

function Set-ResetStatus($state, $step, $error = $null) {
  $obj = @{ state = $state; step = $step; started_at = $script:startedAt; updated_at = (Get-Date).ToString('o'); error = $error }
  $obj | ConvertTo-Json | Set-Content $StatusFile -Encoding UTF8
}

$script:startedAt = (Get-Date).ToString('o')
$env:PATH = "C:\Program Files\nodejs;$env:PATH"
$env:PGPASSWORD = "gymcore_secret"
$PG = "C:\pgsql\pgsql\bin"

try {
  Set-ResetStatus 'running' 'terminate-connections'
  # Drop needs zero open connections — the running backend holds a pool.
  & "$PG\psql.exe" -U gymcore -h localhost -p 5433 -d gymcore -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='gymcore' AND pid <> pg_backend_pid();"

  Set-ResetStatus 'running' 'drop-create'
  & "$PG\dropdb.exe" -U gymcore -h localhost -p 5433 --if-exists --force gymcore
  & "$PG\createdb.exe" -U gymcore -h localhost -p 5433 gymcore
  # Extensions via temp SQL file (inline -c breaks on quoted identifiers)
  $extSql = Join-Path ([IO.Path]::GetTempPath()) 'gymcore-ext.sql'
  'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS citext;' | Set-Content $extSql -Encoding ASCII
  & "$PG\psql.exe" -U gymcore -h localhost -p 5433 -d gymcore -f $extSql
  Remove-Item $extSql -Force -ErrorAction SilentlyContinue

  Set-Location "$PSScriptRoot\.."
  Set-ResetStatus 'running' 'migrate'
  npm run migrate
  Set-ResetStatus 'running' 'seed10'
  npm run db:seed10
  Set-ResetStatus 'running' 'seed-engagement'
  npm run db:seed:engagement

  Set-ResetStatus 'running' 'bootstrap-admin'
  $env:BOOTSTRAP_ADMIN_EMAIL = "mr.alaaali@gmail.com"
  $env:BOOTSTRAP_ADMIN_NAME = "Alaa Ali"
  $env:BOOTSTRAP_ADMIN_PASSWORD = "Alaa@2026"
  npm run bootstrap:platform-admin

  Set-ResetStatus 'done' 'complete'
  Write-Host "✅ Local reset complete: 10 gyms seeded + super admin ready" -ForegroundColor Green
} catch {
  Set-ResetStatus 'failed' 'error' $_.Exception.Message
  Write-Host "❌ Reset failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
} finally {
  Stop-Transcript | Out-Null
}
