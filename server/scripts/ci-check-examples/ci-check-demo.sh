#!/bin/bash
# ====================================================================
# GymCore ERP — CI Check Example
# Demonstrates how to use the ordered health check scripts.
# ====================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "=== CI Check Example ==="
echo "Project root: ${PROJECT_ROOT}"
echo ""

echo "Running ordered health checks..."
bash "${SCRIPT_DIR}/cicd/checks-ordered.sh"

echo ""
echo "=== CI Check Example Complete ==="
