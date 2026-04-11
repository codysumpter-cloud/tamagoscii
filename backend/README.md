# Tamagoscii Backend

Minimal Express API that verifies XRPL micro-transactions and persists creature states.

## Features

- `POST /api/tx/verify` — verifies a real XRPL transaction (destination, tag, amount, hash) and credits Scii Coins. Replay-proof.
- `GET  /api/creature/:address` — load persisted state
- `POST /api/creature/:address` — save state
- `GET  /api/leaderboard` — top players
- `GET  /api/config` — public config for the frontend
- `GET  /api/health` — uptime + network info
- `GET  /api/og/:address.svg` — dynamic social share image
- SQLite persistence (single file, no DB server to run)
- Helmet, CORS, rate limiting out of the box

## Quick start

```bash
cd backend
cp .env.example .env        # fill in TREASURY_ADDRESS
npm install
npm run dev                  # or: npm start
```

The API listens on `http://localhost:3000`.

## How tx verification works

1. User clicks "FEED" in the frontend (cost: 0.01 XRP)
2. GemWallet signs + broadcasts the payment to your treasury address
3. Frontend receives the tx `hash` and POSTs it to `/api/tx/verify`:
   ```json
   { "address": "rAlice...", "hash": "ABCD1234...", "action": "feed" }
   ```
4. Backend queries XRPL via `xrpl.js` and checks:
   - tx is validated
   - `Destination === TREASURY_ADDRESS`
   - `DestinationTag === DESTINATION_TAG`
   - amount ≥ expected price
   - `Account === address` (sender matches claim)
   - `meta.TransactionResult === "tesSUCCESS"`
   - hash not already claimed (replay protection)
5. If valid, the user's Scii Coins balance is incremented and the hash is
   inserted into `claimed_tx` so it can never be reused.

## Wiring it to the frontend

In `config.js`, set `API_BASE_URL` and wrap your client-side `pay()` flow so
that after GemWallet returns a tx hash you call:

```js
await fetch(window.TAMA_CONFIG.API_BASE_URL + '/api/tx/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ address, hash, action: 'feed' })
});
```

The backend is the **source of truth** for coin balances. Trust nothing
from `localStorage` in production.

## Deployment

Works out of the box on:
- **Railway** — push the `backend/` directory, set env vars in the UI
- **Fly.io** — `fly launch` inside `backend/`, accept defaults
- **Render** — new Web Service, root = `backend`, build = `npm install`, start = `npm start`
- **A $5 VPS** — `pm2 start server.js --name tamagoscii-api`

The SQLite file lives in `./data/tamagoscii.sqlite`. Mount a persistent
volume on that path in prod so data survives restarts.

## Security TODO for real production

- [ ] Verify wallet ownership via `GemWalletApi.signMessage` nonce instead
      of trusting `address` on save
- [ ] Add per-address rate limits on `/api/tx/verify`
- [ ] Store claims in a proper DB (Postgres) and add backups
- [ ] Add Sentry / structured logging
- [ ] Add `helmet({ contentSecurityPolicy: true })` once frontend CSP
      is stable
