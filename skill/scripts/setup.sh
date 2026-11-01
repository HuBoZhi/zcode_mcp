#!/usr/bin/env bash
# zcode-mcp one-shot setup: build the bridge, ensure a Node >= 24 runtime for the
# zcode app-server child, and register it into MCP clients. Idempotent.
#
# Usage: bash setup.sh [repo_dir] [--register codex|claude|all] [--no-register]
#   repo_dir defaults to ~/zcode_mcp (cloned from GitHub if missing).

set -euo pipefail

REPO_URL="https://github.com/TechYan/zcode_mcp.git"
NODE_VERSION="24.21.0"
RUNTIME_ROOT="$HOME/.zcode-mcp/runtime"

REPO_DIR="${1:-$HOME/zcode_mcp}"
shift || true
REGISTER="all"
for arg in "$@"; do
  case "$arg" in
    --register) shift; REGISTER="${1:-all}" ;;
    --register=*) REGISTER="${arg#--register=}" ;;
    --no-register) REGISTER="none" ;;
  esac
done

log() { printf '\033[1;32m[zcode-mcp]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[zcode-mcp] %s\033[0m\n' "$*" >&2; exit 1; }

# --- 1. repo + build ---------------------------------------------------------
if [ ! -f "$REPO_DIR/package.json" ]; then
  log "cloning $REPO_URL -> $REPO_DIR"
  git clone "$REPO_URL" "$REPO_DIR"
fi
cd "$REPO_DIR"
log "building in $REPO_DIR"
npm install --silent
npm run build
[ -f dist/index.js ] || die "build failed: dist/index.js missing"

# --- 2. Node >= 24 runtime for the zcode child -------------------------------
need_runtime=1
if ls "$RUNTIME_ROOT"/node-v2[4-9].*/bin/node >/dev/null 2>&1; then
  need_runtime=0
elif command -v node >/dev/null 2>&1; then
  sys_major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$sys_major" -ge 24 ] && need_runtime=0
fi
if [ "$need_runtime" -eq 1 ]; then
  case "$(uname -m)" in
    arm64) NODE_ARCH="darwin-arm64" ;;
    x86_64) NODE_ARCH="darwin-x64" ;;
    *) die "unsupported arch $(uname -m); install Node >= 24 manually and set ZCODE_NODE_BIN" ;;
  esac
  TARBALL="node-v${NODE_VERSION}-${NODE_ARCH}.tar.gz"
  log "downloading portable Node $NODE_VERSION ($NODE_ARCH)"
  mkdir -p "$RUNTIME_ROOT"
  curl -fsSL --retry 3 -o "/tmp/$TARBALL" "https://nodejs.org/dist/v${NODE_VERSION}/${TARBALL}"
  tar -xzf "/tmp/$TARBALL" -C "$RUNTIME_ROOT"
  rm -f "/tmp/$TARBALL"
  "$RUNTIME_ROOT/node-v${NODE_VERSION}-${NODE_ARCH}/bin/node" --version || die "portable node broken"
fi
log "Node runtime OK ($RUNTIME_ROOT or system >= 24)"

# --- 3. register clients ------------------------------------------------------
SERVER_JS="$REPO_DIR/dist/index.js"
register_codex() {
  CODEX_CONFIG="$HOME/.codex/config.toml"
  [ -f "$CODEX_CONFIG" ] || touch "$CODEX_CONFIG"
  if grep -q '\[mcp_servers\.zcode\]' "$CODEX_CONFIG"; then
    log "codex: already registered"
  else
    printf '\n[mcp_servers.zcode]\ncommand = "node"\nargs = ["%s"]\n' "$SERVER_JS" >> "$CODEX_CONFIG"
    log "codex: registered ($CODEX_CONFIG)"
  fi
}
register_claude() {
  if command -v claude >/dev/null 2>&1; then
    claude mcp add zcode -- node "$SERVER_JS" && log "claude: registered" || log "claude: registration skipped"
  else
    log "claude: CLI not found, skipped (add manually: claude mcp add zcode -- node $SERVER_JS)"
  fi
}

case "$REGISTER" in
  codex) register_codex ;;
  claude) register_claude ;;
  all) register_codex; register_claude ;;
  none) log "registration skipped (--no-register)" ;;
  *) die "unknown --register target: $REGISTER" ;;
esac

log "done. Verify inside your MCP client: call zcode_check (expect status: ok, models non-empty)."
