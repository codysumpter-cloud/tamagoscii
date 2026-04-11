#!/usr/bin/env bash
# ============================================================
# TAMAGOSCII - Deployment script
# ------------------------------------------------------------
# Usage:
#   ./deploy.sh              # interactive menu
#   ./deploy.sh frontend     # deploy only the static frontend
#   ./deploy.sh backend      # deploy only the backend
#   ./deploy.sh all          # deploy both
#   ./deploy.sh preflight    # run checks only, no deploy
#
# Supported frontend targets (auto-detected): vercel, netlify, cloudflare, gh-pages
# Supported backend targets (auto-detected):  railway, fly, render, pm2
# ============================================================

set -euo pipefail

# ----- colors -----
if [ -t 1 ]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'
  C_CYAN=$'\033[36m'
  C_DIM=$'\033[2m'
else
  C_RESET= C_BOLD= C_GREEN= C_YELLOW= C_RED= C_CYAN= C_DIM=
fi

log()  { echo "${C_CYAN}▸${C_RESET} $*"; }
ok()   { echo "${C_GREEN}✓${C_RESET} $*"; }
warn() { echo "${C_YELLOW}⚠${C_RESET} $*"; }
err()  { echo "${C_RED}✗${C_RESET} $*" >&2; }
die()  { err "$*"; exit 1; }

banner() {
cat <<'EOF'

  ████████╗ █████╗ ███╗   ███╗ █████╗  ██████╗  ██████╗ ███████╗ ██████╗██╗██╗
  ╚══██╔══╝██╔══██╗████╗ ████║██╔══██╗██╔════╝ ██╔═══██╗██╔════╝██╔════╝██║██║
     ██║   ███████║██╔████╔██║███████║██║  ███╗██║   ██║███████╗██║     ██║██║
     ██║   ██╔══██║██║╚██╔╝██║██╔══██║██║   ██║██║   ██║╚════██║██║     ██║██║
     ██║   ██║  ██║██║ ╚═╝ ██║██║  ██║╚██████╔╝╚██████╔╝███████║╚██████╗██║██║
     ╚═╝   ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚══════╝ ╚═════╝╚═╝╚═╝
                                           タマゴッシー · Deploy script
EOF
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# ============================================================
# 1. PREFLIGHT CHECKS
# ============================================================
preflight() {
  log "Running preflight checks…"

  # git clean?
  if ! git rev-parse --git-dir >/dev/null 2>&1; then
    die "Not a git repository"
  fi
  if [ -n "$(git status --porcelain)" ]; then
    warn "Working tree is dirty:"
    git status --short
    read -r -p "Continue anyway? [y/N] " ans
    [[ "$ans" =~ ^[Yy]$ ]] || die "Aborted by user"
  else
    ok "Working tree is clean"
  fi

  # JS syntax on all committed scripts
  for f in config.js creature.js wallet.js audio.js game.js; do
    if [ -f "$f" ]; then
      node -c "$f" 2>/dev/null && ok "syntax: $f" || die "syntax error in $f"
    fi
  done
  if [ -f backend/server.js ]; then
    node -c backend/server.js 2>/dev/null && ok "syntax: backend/server.js" \
      || die "syntax error in backend/server.js"
  fi

  # Config sanity: treasury still the placeholder?
  if grep -q "rTamagosciiTreasuryReplaceMe" config.js 2>/dev/null; then
    warn "config.js still uses the PLACEHOLDER treasury address"
    warn "edit TREASURY_ADDRESS in config.js before going live"
    read -r -p "Continue anyway? [y/N] " ans
    [[ "$ans" =~ ^[Yy]$ ]] || die "Aborted — update config.js first"
  else
    ok "config.js treasury set"
  fi

  # Secrets not committed?
  if git ls-files --error-unmatch .env >/dev/null 2>&1 || \
     git ls-files --error-unmatch backend/.env >/dev/null 2>&1; then
    die "A .env file is tracked by git — remove it before deploying!"
  fi
  ok ".env files are not tracked"

  # tracks.json valid JSON?
  if [ -f music/tracks.json ]; then
    node -e "JSON.parse(require('fs').readFileSync('music/tracks.json','utf8'))" \
      && ok "music/tracks.json is valid JSON" \
      || die "music/tracks.json is not valid JSON"
  fi

  ok "Preflight OK"
}

# ============================================================
# 2. FRONTEND DEPLOY
# ============================================================
deploy_frontend() {
  log "Deploying frontend…"

  local target="${FRONTEND_TARGET:-}"
  if [ -z "$target" ]; then
    if [ -f vercel.json ] || command -v vercel >/dev/null 2>&1; then
      target="vercel"
    elif [ -f netlify.toml ] || command -v netlify >/dev/null 2>&1; then
      target="netlify"
    elif command -v wrangler >/dev/null 2>&1; then
      target="cloudflare"
    else
      target="manual"
    fi
  fi

  log "Target: ${C_BOLD}$target${C_RESET}"

  case "$target" in
    vercel)
      command -v vercel >/dev/null 2>&1 || die "Install vercel: npm i -g vercel"
      vercel --prod --yes
      ;;
    netlify)
      command -v netlify >/dev/null 2>&1 || die "Install netlify: npm i -g netlify-cli"
      netlify deploy --prod --dir .
      ;;
    cloudflare)
      command -v wrangler >/dev/null 2>&1 || die "Install wrangler: npm i -g wrangler"
      wrangler pages deploy . --project-name tamagoscii
      ;;
    gh-pages)
      command -v gh >/dev/null 2>&1 || die "Install GitHub CLI (gh)"
      git push origin HEAD:gh-pages
      ;;
    manual)
      warn "No deploy CLI detected. Zipping static assets to dist/tamagoscii.zip"
      mkdir -p dist
      zip -r dist/tamagoscii.zip \
        index.html config.js creature.js wallet.js audio.js game.js style.css music \
        README.md >/dev/null
      ok "dist/tamagoscii.zip ready — upload manually to your host"
      ;;
    *)
      die "Unknown frontend target: $target"
      ;;
  esac
  ok "Frontend deployed"
}

# ============================================================
# 3. BACKEND DEPLOY
# ============================================================
deploy_backend() {
  log "Deploying backend…"
  [ -d backend ] || die "No backend/ directory found"
  cd backend

  # Make sure deps are installed
  if [ ! -d node_modules ]; then
    log "Installing backend dependencies…"
    npm install --omit=dev
  fi

  # Make sure .env exists
  if [ ! -f .env ]; then
    warn ".env missing — copying from .env.example"
    cp .env.example .env
    warn "⚠️  Edit backend/.env with your real secrets before the app will work"
  fi

  local target="${BACKEND_TARGET:-}"
  if [ -z "$target" ]; then
    if [ -f railway.json ] || command -v railway >/dev/null 2>&1; then
      target="railway"
    elif [ -f fly.toml ] || command -v flyctl >/dev/null 2>&1; then
      target="fly"
    elif command -v render >/dev/null 2>&1; then
      target="render"
    elif command -v pm2 >/dev/null 2>&1; then
      target="pm2"
    else
      target="local"
    fi
  fi

  log "Target: ${C_BOLD}$target${C_RESET}"

  case "$target" in
    railway)
      command -v railway >/dev/null 2>&1 || die "Install Railway CLI: npm i -g @railway/cli"
      railway up
      ;;
    fly)
      command -v flyctl >/dev/null 2>&1 || die "Install flyctl: https://fly.io/docs/hands-on/install-flyctl/"
      flyctl deploy
      ;;
    render)
      warn "Render deploys via git push. Run: git push render main"
      ;;
    pm2)
      command -v pm2 >/dev/null 2>&1 || die "Install pm2: npm i -g pm2"
      pm2 startOrRestart server.js --name tamagoscii-api
      pm2 save
      ;;
    local)
      warn "No deploy target detected. Starting locally in the background with node…"
      nohup node server.js > ../tamagoscii-api.log 2>&1 &
      ok "Started — logs: tamagoscii-api.log"
      ;;
    *)
      die "Unknown backend target: $target"
      ;;
  esac
  cd "$REPO_ROOT"
  ok "Backend deployed"
}

# ============================================================
# 4. ENTRY POINT
# ============================================================
main() {
  banner
  local cmd="${1:-}"
  if [ -z "$cmd" ]; then
    echo
    echo "  ${C_BOLD}What do you want to deploy?${C_RESET}"
    echo "    1) Frontend only"
    echo "    2) Backend only"
    echo "    3) Both"
    echo "    4) Preflight checks only"
    echo "    q) Quit"
    echo
    read -r -p "  > " choice
    case "$choice" in
      1) cmd="frontend" ;;
      2) cmd="backend" ;;
      3) cmd="all" ;;
      4) cmd="preflight" ;;
      q|Q) exit 0 ;;
      *) die "Invalid choice" ;;
    esac
  fi

  case "$cmd" in
    preflight) preflight ;;
    frontend)  preflight; deploy_frontend ;;
    backend)   preflight; deploy_backend ;;
    all)       preflight; deploy_frontend; deploy_backend ;;
    *)         die "Usage: $0 [preflight|frontend|backend|all]" ;;
  esac

  echo
  ok "${C_BOLD}Done.${C_RESET} 🥚"
}

main "$@"
