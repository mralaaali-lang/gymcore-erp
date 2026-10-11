#!/bin/bash
# ====================================================================
# GymCore ERP — Ordered CI/CD Health Checks
# Runs backend check first, then frontend check.
# Usage: ./checks-ordered.sh
# ====================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Starting ordered CI/CD health checks ==="
echo ""

echo "1/2 Backend health check..."
bash "${SCRIPT_DIR}/backend-health-check.sh"
echo ""

echo "2/2 Frontend health check..."
bash "${SCRIPT_DIR}/frontend-health-check.sh"
echo ""

echo "=== All CI/CD health checks passed ==="
