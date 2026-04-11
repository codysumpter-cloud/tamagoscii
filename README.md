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
- `style.css` — pixel/CRT retro styling with scanlines & glow
- `creature.js` — shape generator + ASCII face engine
- `wallet.js` — XRPL wallet (real provider + mock fallback)
- `audio.js` — procedural SFX engine + music player
- `game.js` — game logic, stats, economy, modals

## XRPL Integration

The app tries to use [GemWallet](https://gemwallet.app/) if installed. Otherwise it falls back to a deterministic mock wallet for demo purposes. All micro-transactions are simulated in the mock; to use real XRPL payments, plug in `xrpl.js` or the wallet provider of your choice in `wallet.js`.
