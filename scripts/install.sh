#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_SKILL="false"
CODEX_HOME_VALUE="${CODEX_HOME:-}"
STATE_ROOT_VALUE="${OPENCLAW_MANAGER_STATE_ROOT:-$HOME/.openclaw/skills/manager}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-skill)
      INSTALL_SKILL="true"
      shift
      ;;
    --codex-home)
      CODEX_HOME_VALUE="$2"
      shift 2
      ;;
    --state-root)
      STATE_ROOT_VALUE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

command -v node >/dev/null 2>&1 || { echo "node is required" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required" >&2; exit 1; }

cd "$REPO_ROOT"
npm install
npm run build

if [[ ! -f ".env.local" ]]; then
  cp .env.example .env.local
fi

mkdir -p "$STATE_ROOT_VALUE"

if [[ "$INSTALL_SKILL" == "true" ]]; then
  if [[ -z "$CODEX_HOME_VALUE" ]]; then
    echo "CODEX_HOME or --codex-home is required with --install-skill" >&2
    exit 1
  fi
  TARGET_DIR="$CODEX_HOME_VALUE/skills/openclaw-manager"
  mkdir -p "$TARGET_DIR"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude node_modules --exclude dist --exclude .git --exclude .env --exclude .env.local "$REPO_ROOT/" "$TARGET_DIR/"
  else
    cp -R "$REPO_ROOT"/. "$TARGET_DIR"/
    rm -rf "$TARGET_DIR/node_modules" "$TARGET_DIR/dist" "$TARGET_DIR/.git"
  fi
fi

echo ""
echo "OpenClaw Manager installed."
echo "Repo:       $REPO_ROOT"
echo "State root: $STATE_ROOT_VALUE"
if [[ "$INSTALL_SKILL" == "true" ]]; then
  echo "Skill dir:  $CODEX_HOME_VALUE/skills/openclaw-manager"
fi
echo ""
echo "Next steps:"
echo "1. Fill in .env.local with HUMANCLAW_API_KEY."
echo "2. Start the sidecar with: npm run dev"
