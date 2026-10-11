#!/bin/bash
# ====================================================================
# GymCore ERP — Frontend Health Check
# Usage: ./frontend-health-check.sh
# ====================================================================

set -euo pipefail

URL="${FRONTEND_URL:-http://localhost:9000/}"
echo "🔍 Checking frontend health at ${URL}..."

STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${URL}")

if [ "${STATUS}" != "200" ]; then
  echo "❌ Frontend health check failed: HTTP ${STATUS}"
  exit 1
fi

echo "✅ Frontend is healthy (HTTP ${STATUS})"
