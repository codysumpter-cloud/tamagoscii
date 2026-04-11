# TAMAGOSCII - タマゴッシー

A retro ASCII & Pixel art Tamagotchi-style virtual pet web app, powered by the XRP Ledger (XRPL).

Fully responsive, no build step required — just open `index.html` in a browser or serve it with any static HTTP server.

## Features

- **XRPL Wallet connect** (supports GemWallet if installed, falls back to a local mock wallet for development/demo)
- **Unique creature per wallet** — the creature's geometric shape, color, and pattern are deterministically derived from your XRPL address (10 shapes × 10 colors × 5 patterns = 500+ combinations)
- **Animated ASCII art expressions** that react to every interaction (happy, hungry, sad, sleeping, dirty, loved, angry...)
- **Classic Tamagotchi stats**: Hunger, Happy, Energy, Hygiene (decay over time)
- **Actions**: Feed, Play, Sleep, Clean, Pet — each with its own animation, particle FX, sound FX, and XRP micro-transaction
- **6 food types** with different stat effects
- **Scii Coin economy** — earn rewards for taking good care, spend on shop packs
- **Mini-game** "Catch the Pixel" for bonus coins
- **Achievements** system
- **Share your creature** on Twitter, Facebook, Telegram, WhatsApp, or by copying the URL
- **Procedural chiptune SFX** generated with the Web Audio API (100% royalty-free)
- **Custom music player** in the bottom bar — load your own tracks
- **Responsive design** — works on mobile, tablet and desktop

## Run locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Or open `index.html` directly in your browser.

## Files

- `index.html` — markup and UI templates
- `config.js` — public runtime configuration (mainnet/testnet, treasury, prices)
- `style.css` — pixel/CRT retro styling with scanlines & glow
- `creature.js` — egg shape generator + ASCII face engine
- `wallet.js` — GemWallet integration with optional demo fallback
- `audio.js` — procedural SFX engine + music player (auto-loads `music/tracks.json`)
- `game.js` — game logic, stats, economy, modals
- `music/` — drop your audio files here and list them in `tracks.json`
- `backend/` — optional Express API that verifies XRPL tx and stores state
- `deploy.sh` — one-command interactive deploy script

## Deployment

```bash
./deploy.sh              # interactive menu (frontend / backend / both)
./deploy.sh preflight    # run checks only (safe to run anytime)
./deploy.sh frontend     # deploy static frontend (Vercel / Netlify / Cloudflare)
./deploy.sh backend      # deploy API (Railway / Fly / Render / pm2)
```

See [`backend/README.md`](./backend/README.md) for the backend setup and
[`.env.example`](./.env.example) / [`backend/.env.example`](./backend/.env.example)
for the configuration templates.

## XRPL Integration

Real payments are handled by [GemWallet](https://gemwallet.app/) on XRPL mainnet.
The app calls `GemWalletApi.sendPayment()` for every action, attaches a
`DestinationTag` to identify Tamagoscii payments, and optionally verifies the
resulting tx hash against the backend (`POST /api/tx/verify`) to credit Scii
Coins. An explicit **demo mode** is available on the login screen for users
without a wallet.
