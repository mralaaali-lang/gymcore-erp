#!/bin/bash
# ====================================================================
# GymCore ERP — Backend Health Check
# Usage: ./backend-health-check.sh
# ====================================================================

set -euo pipefail

URL="${BACKEND_URL:-http://localhost:4000/health}"
echo "🔍 Checking backend health at ${URL}..."

STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${URL}")

if [ "${STATUS}" != "200" ]; then
  echo "❌ Backend health check failed: HTTP ${STATUS}"
  exit 1
fi

echo "✅ Backend is healthy (HTTP ${STATUS})"
