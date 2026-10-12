#!/usr/bin/env bash
# =====================================================================
# GymCore ERP — one-command publish: GitHub push + Railway staging
# (backend then frontend) + live probes.
#
# Usage (Git Bash on this machine):
#   bash deploy.sh              # push + deploy both services
#   bash deploy.sh --no-deploy  # GitHub push only
#
# Why WSL: the Windows railway.exe is blocked by Smart App Control
# (LOCAL_TESTING_REPORT.md §25), and uploading from /mnt/d corrupts
# files. The proven recipe: git archive -> extract in WSL-native fs
# -> railway Linux CLI from there. Never change this order:
# backend first, frontend second (nginx frozen DNS).
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")"
REPO="$(pwd -W 2>/dev/null || pwd)"

PROJECT_ID=3afee7fa-2cf0-4b90-a81f-832ebba65f36
ENVIRONMENT_ID=1e7438e0-61de-457a-b5dd-5c9d53a607f9
BACKEND_ID=64b179de-64a8-4e6a-a4c5-247013cb6913
FRONTEND_ID=043d0844-680f-4a04-b4c3-0fbb4ddf3c01
RAILWAY_VER=v5.66.0
RAILWAY_URL="https://github.com/railwayapp/cli/releases/download/${RAILWAY_VER}/railway-${RAILWAY_VER}-x86_64-unknown-linux-musl.tar.gz"

DEPLOY=1
[ "${1:-}" = "--no-deploy" ] && DEPLOY=0

echo "==> [1/5] GitHub push (main)"
git push origin main
echo "    pushed: $(git rev-parse --short HEAD)"

if [ "$DEPLOY" = "0" ]; then
  echo "==> --no-deploy: skipping Railway. Done."
  exit 0
fi

wslsh() { wsl -d docker-desktop sh -c "export HOME=/mnt/c/Users/X870; $1"; }

echo "==> [2/5] Preparing snapshot (git archive -> /root/deploy in WSL)"
TAR_WIN="/tmp/deploy-snapshot.tar"
git archive HEAD --format=tar -o "$TAR_WIN"
wslsh 'rm -rf /root/deploy /tmp/deploy-snapshot.tar; mkdir -p /root/deploy'
wslsh "cat > /tmp/deploy-snapshot.tar" < "$TAR_WIN"
wslsh 'tar xf /tmp/deploy-snapshot.tar -C /root/deploy; wc -c /root/deploy/server/tsconfig.json'

echo "    Ensuring railway Linux CLI inside WSL"
wslsh 'test -x /tmp/railway || (cd /tmp && wget -q "'"$RAILWAY_URL"'" -O r.tgz && tar xzf r.tgz && mv -f railway /tmp/railway && rm -rf r.tgz) ; /tmp/railway whoami'

wait_status() {
  # $1 = service id, $2 = label
  local label="$2" sid="$1" deadline=$((SECONDS + 900))
  while [ $SECONDS -lt $deadline ]; do
    line=$(wslsh "cd /root/deploy && /tmp/railway deployment list -p $PROJECT_ID -e $ENVIRONMENT_ID -s $sid 2>/dev/null | sed -n '2p'")
    case "$line" in
      *SUCCESS*) echo "    $label -> SUCCESS"; return 0 ;;
      *FAILED*)  echo "    $label -> FAILED!"; echo "$line"; return 1 ;;
      *)         echo "    $label building..."; sleep 45 ;;
    esac
  done
  echo "    $label: timeout waiting for build"; return 1
}

echo "==> [3/5] Deploy BACKEND (must be first)"
wslsh 'cd /root/deploy && /tmp/railway up --detach -p '"$PROJECT_ID"' -e '"$ENVIRONMENT_ID"' -s '"$BACKEND_ID"'' | tail -1
wait_status "$BACKEND_ID" "backend"

echo "==> [4/5] Deploy FRONTEND (mandatory after backend: frozen nginx DNS)"
wslsh 'cd /root/deploy && /tmp/railway up --detach -p '"$PROJECT_ID"' -e '"$ENVIRONMENT_ID"' -s '"$FRONTEND_ID"'' | tail -1
wait_status "$FRONTEND_ID" "frontend"

echo "==> [5/5] Live probes"
code() { curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$1"; }
BE=https://backend-production-9b567.up.railway.app
FE=https://frontend-production-abdd.up.railway.app
printf '    backend /health           : %s (want 200)\n' "$(code $BE/health)"
printf '    backend expiring-soon     : %s (want 401 without auth)\n' "$(code $BE/api/dashboard/expiring-soon)"
printf '    frontend /                : %s (want 200)\n' "$(code $FE/)"
printf '    frontend proxy /health    : %s (want 200)\n' "$(code $FE/health)"
printf '    frontend /admin/dashboard : %s (want 200)\n' "$(code $FE/admin/dashboard)"

wslsh 'rm -rf /root/deploy /tmp/deploy-snapshot.tar' || true
echo "==> DONE. Staging now runs commit $(git rev-parse --short HEAD)."
