/* ============================================================
   TAMAGOSCII - Minimal backend
   ------------------------------------------------------------
   Express API that:
     1. Verifies XRPL transactions (destination, amount, tag, hash)
        so the client can't fake "I paid" to earn Scii Coins.
     2. Persists creature state per wallet in a local SQLite file.
     3. Prevents tx replay (each tx hash can only be claimed once).
     4. Exposes a public leaderboard.

   Designed to run anywhere Node.js runs: Railway, Fly.io,
   Render, a $5 VPS, a Raspberry Pi... Zero external dependencies
   beyond npm packages.
============================================================ */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Database from 'better-sqlite3';
import { Client, dropsToXrp } from 'xrpl';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/* ------------------------------------------------------------
   CONFIG (from .env)
------------------------------------------------------------ */
const PORT          = parseInt(process.env.API_PORT || '3000', 10);
const NODE_ENV      = process.env.NODE_ENV || 'development';
const XRPL_NETWORK  = process.env.XRPL_NETWORK || 'mainnet';
const XRPL_WSS_URL  = process.env.XRPL_WSS_URL
  || (XRPL_NETWORK === 'testnet'
        ? 'wss://s.altnet.rippletest.net:51233'
        : 'wss://xrplcluster.com');
const TREASURY      = (process.env.TREASURY_ADDRESS || '').trim();
const DEST_TAG      = process.env.DESTINATION_TAG
  ? parseInt(process.env.DESTINATION_TAG, 10) : null;
const CORS_ORIGINS  = (process.env.CORS_ORIGINS || '*')
  .split(',').map(s => s.trim()).filter(Boolean);
const RATE_MAX      = parseInt(process.env.RATE_LIMIT_MAX || '120', 10);
const RATE_WINDOW   = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const DB_PATH       = process.env.DB_PATH || join(__dirname, 'data', 'tamagoscii.sqlite');

// ------ Xaman (Xumm) ------
const XUMM_API_KEY    = process.env.XUMM_API_KEY || '';
const XUMM_API_SECRET = process.env.XUMM_API_SECRET || '';
const XUMM_API_BASE   = 'https://xumm.app/api/v1/platform';
const XUMM_ENABLED    = !!(XUMM_API_KEY && XUMM_API_SECRET);

if (!TREASURY){
  console.error('❌ TREASURY_ADDRESS missing — set it in .env before starting');
  process.exit(1);
}
if (!XUMM_ENABLED){
  console.warn('⚠️  XUMM_API_KEY / XUMM_API_SECRET not set — Xaman endpoints disabled');
}

// Micro-transaction prices and the Scii Coin reward per action.
// Must match the frontend in config.js — ideally loaded from a shared file.
const PRICES = {
  feed:0.01, play:0.02, sleep:0.01, clean:0.01,
  pack_small:0.5, pack_medium:2, pack_large:5, pack_whale:10,
};
const REWARDS = {
  feed:5, play:8, sleep:4, clean:4,
  pack_small:100, pack_medium:500, pack_large:1500, pack_whale:3500,
};

/* ------------------------------------------------------------
   DATABASE (SQLite — single file, zero config)
------------------------------------------------------------ */
if (!existsSync(dirname(DB_PATH))) mkdirSync(dirname(DB_PATH), { recursive:true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS creatures (
    address     TEXT PRIMARY KEY,
    pseudo      TEXT,
    state_json  TEXT NOT NULL,
    score       INTEGER NOT NULL DEFAULT 0,
    coins       INTEGER NOT NULL DEFAULT 500,
    level       INTEGER NOT NULL DEFAULT 1,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS claimed_tx (
    hash        TEXT PRIMARY KEY,
    address     TEXT NOT NULL,
    action      TEXT NOT NULL,
    amount_xrp  REAL NOT NULL,
    reward      INTEGER NOT NULL,
    claimed_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_creatures_score ON creatures(score DESC);
  CREATE INDEX IF NOT EXISTS idx_claims_address ON claimed_tx(address);
`);

const stmts = {
  getCreature: db.prepare('SELECT * FROM creatures WHERE address = ?'),
  upsertCreature: db.prepare(`
    INSERT INTO creatures (address, pseudo, state_json, score, coins, level, updated_at)
    VALUES (@address, @pseudo, @state_json, @score, @coins, @level, @updated_at)
    ON CONFLICT(address) DO UPDATE SET
      pseudo     = excluded.pseudo,
      state_json = excluded.state_json,
      score      = excluded.score,
      coins      = excluded.coins,
      level      = excluded.level,
      updated_at = excluded.updated_at
  `),
  getClaim: db.prepare('SELECT * FROM claimed_tx WHERE hash = ?'),
  insertClaim: db.prepare(`
    INSERT INTO claimed_tx (hash, address, action, amount_xrp, reward, claimed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  addCoins: db.prepare(`
    UPDATE creatures SET coins = coins + ?, updated_at = ? WHERE address = ?
  `),
  topLeaderboard: db.prepare(`
    SELECT address, pseudo, score, coins, level FROM creatures
    ORDER BY score DESC, level DESC LIMIT ?
  `),
};

/* ------------------------------------------------------------
   XRPL CLIENT
------------------------------------------------------------ */
let xrplClient = null;
async function getXrplClient(){
  if (xrplClient && xrplClient.isConnected()) return xrplClient;
  xrplClient = new Client(XRPL_WSS_URL);
  await xrplClient.connect();
  return xrplClient;
}

/**
 * Verify a payment transaction on XRPL.
 * Returns { ok, reason, amountXrp, destinationTag, from } — throws on network errors.
 *
 * Checks:
 *   - tx exists and is validated
 *   - TransactionType === 'Payment'
 *   - Destination === TREASURY
 *   - DestinationTag matches (if configured)
 *   - amount is >= expected
 *   - transaction is marked successful (tesSUCCESS)
 */
async function verifyXrplTx(hash, expectedXrp, expectedSender){
  const client = await getXrplClient();
  let res;
  try{
    res = await client.request({ command:'tx', transaction:hash, binary:false });
  }catch(e){
    return { ok:false, reason:'TX_NOT_FOUND' };
  }

  const tx = res.result;
  if (!tx || !tx.validated){
    return { ok:false, reason:'TX_NOT_VALIDATED' };
  }
  if (tx.TransactionType !== 'Payment'){
    return { ok:false, reason:'NOT_A_PAYMENT' };
  }
  if (tx.meta && tx.meta.TransactionResult !== 'tesSUCCESS'){
    return { ok:false, reason:'TX_FAILED:'+tx.meta.TransactionResult };
  }
  if (tx.Destination !== TREASURY){
    return { ok:false, reason:'WRONG_DESTINATION' };
  }
  if (DEST_TAG != null && tx.DestinationTag !== DEST_TAG){
    return { ok:false, reason:'WRONG_DESTINATION_TAG' };
  }
  if (expectedSender && tx.Account !== expectedSender){
    return { ok:false, reason:'WRONG_SENDER' };
  }

  // Amount can be a string (drops) for XRP or an object for issued currency.
  if (typeof tx.Amount !== 'string'){
    return { ok:false, reason:'NOT_XRP' };
  }
  const paidXrp = parseFloat(dropsToXrp(tx.Amount));
  if (paidXrp + 1e-9 < expectedXrp){
    return { ok:false, reason:'UNDERPAID', paidXrp };
  }

  return {
    ok:true,
    amountXrp:paidXrp,
    destinationTag:tx.DestinationTag,
    from:tx.Account,
    ledgerIndex:tx.ledger_index,
  };
}

/* ------------------------------------------------------------
   XAMAN (XUMM) PLATFORM API
   ------------------------------------------------------------
   Creates signing payloads on behalf of the user. The frontend
   shows the returned QR code / deeplink; the user signs in the
   Xaman mobile app; the frontend polls getXumm() or subscribes
   to the returned websocket to know when it's signed.

   Docs: https://docs.xaman.dev/
------------------------------------------------------------ */
async function xummFetch(path, opts = {}){
  if (!XUMM_ENABLED) throw new Error('XUMM_DISABLED');
  const res = await fetch(XUMM_API_BASE + path, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type':'application/json',
      'X-API-Key': XUMM_API_KEY,
      'X-API-Secret': XUMM_API_SECRET,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch(e){ data = { raw:text }; }
  if (!res.ok){
    const err = new Error('XUMM_'+res.status);
    err.details = data;
    throw err;
  }
  return data;
}

function normalizeXummPayload(data){
  // Keep only what the frontend needs (don't leak internals)
  return {
    uuid: data.uuid,
    next: data.next?.always,
    refs: {
      qrPng: data.refs?.qr_png,
      qrUri: data.refs?.qr_uri_quality_opts?.m || data.refs?.qr_png,
      websocket: data.refs?.websocket_status,
    },
    pushed: data.pushed,
  };
}

/* ------------------------------------------------------------
   EXPRESS APP
------------------------------------------------------------ */
const app = express();
app.use(helmet({ contentSecurityPolicy:false }));
app.use(express.json({ limit:'64kb' }));
app.use(cors({
  origin: CORS_ORIGINS.includes('*') ? true : CORS_ORIGINS,
  credentials:false,
}));

// Basic rate-limit: N requests / window per IP
app.use(rateLimit({
  windowMs:RATE_WINDOW,
  max:RATE_MAX,
  standardHeaders:true,
  legacyHeaders:false,
}));

// --- Helpers ---
function isValidXrplAddress(addr){
  return typeof addr === 'string' && /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(addr);
}
function isValidHash(h){
  return typeof h === 'string' && /^[A-F0-9]{64}$/.test(h);
}

/* ---------- /api/health ---------- */
app.get('/api/health', (req, res) => {
  res.json({
    status:'ok',
    network:XRPL_NETWORK,
    treasury:TREASURY,
    version:'1.0.0',
    uptime:Math.round(process.uptime()),
  });
});

/* ---------- /api/config (public client config) ---------- */
app.get('/api/config', (req, res) => {
  res.json({
    network:XRPL_NETWORK,
    treasuryAddress:TREASURY,
    destinationTag:DEST_TAG,
    prices:PRICES,
    rewards:REWARDS,
  });
});

/* ---------- /api/tx/verify ----------
   POST { address, hash, action }
   - address: sender XRPL address (must match tx Account)
   - hash:    64-char hex tx hash
   - action:  'feed' | 'play' | 'sleep' | 'clean' | 'pack_small' | ...

   On success, credits the user with the corresponding Scii Coins
   and records the claim so the same tx can't be used twice.
------------------------------------------------ */
app.post('/api/tx/verify', async (req, res) => {
  try{
    const { address, hash, action } = req.body || {};
    if (!isValidXrplAddress(address)) return res.status(400).json({ error:'INVALID_ADDRESS' });
    if (!isValidHash(hash))          return res.status(400).json({ error:'INVALID_HASH' });
    if (!(action in PRICES))          return res.status(400).json({ error:'INVALID_ACTION' });

    // Replay protection
    const existing = stmts.getClaim.get(hash);
    if (existing) return res.status(409).json({ error:'ALREADY_CLAIMED' });

    const expectedXrp = PRICES[action];
    const check = await verifyXrplTx(hash, expectedXrp, address);
    if (!check.ok){
      return res.status(402).json({ error:check.reason });
    }

    const reward = REWARDS[action] || 0;
    const now = Date.now();

    // Ensure creature row exists, then credit coins atomically.
    const tx = db.transaction(() => {
      const existing = stmts.getCreature.get(address);
      if (!existing){
        stmts.upsertCreature.run({
          address,
          pseudo:null,
          state_json:JSON.stringify({}),
          score:0,
          coins:500 + reward,  // starter + first reward
          level:1,
          updated_at:now,
        });
      } else {
        stmts.addCoins.run(reward, now, address);
      }
      stmts.insertClaim.run(hash, address, action, check.amountXrp, reward, now);
    });
    tx();

    const updated = stmts.getCreature.get(address);
    res.json({
      ok:true,
      reward,
      balance:updated.coins,
      tx:{ hash, amountXrp:check.amountXrp, action },
    });
  }catch(e){
    console.error('[/api/tx/verify]', e);
    res.status(500).json({ error:'SERVER_ERROR' });
  }
});

/* ---------- /api/creature/:address ----------
   GET  -> load persisted state (or 404 if new user)
   POST -> save state (currently trusts the address; see TODO)
------------------------------------------------ */
app.get('/api/creature/:address', (req, res) => {
  const { address } = req.params;
  if (!isValidXrplAddress(address)) return res.status(400).json({ error:'INVALID_ADDRESS' });
  const row = stmts.getCreature.get(address);
  if (!row) return res.status(404).json({ error:'NOT_FOUND' });
  res.json({
    address:row.address,
    pseudo:row.pseudo,
    score:row.score,
    coins:row.coins,
    level:row.level,
    state:JSON.parse(row.state_json || '{}'),
    updatedAt:row.updated_at,
  });
});

app.post('/api/creature/:address', (req, res) => {
  const { address } = req.params;
  if (!isValidXrplAddress(address)) return res.status(400).json({ error:'INVALID_ADDRESS' });

  const { pseudo, state, score, coins, level } = req.body || {};
  if (typeof state !== 'object' || state === null){
    return res.status(400).json({ error:'INVALID_STATE' });
  }

  // ⚠️ TODO: in production require a signed nonce from the wallet to prove
  // the caller actually owns `address`. For now we trust the client for
  // simplicity. Add GemWallet.signMessage() verification here.

  stmts.upsertCreature.run({
    address,
    pseudo:pseudo ? String(pseudo).slice(0,16) : null,
    state_json:JSON.stringify(state).slice(0, 16_000),
    score:Math.max(0, parseInt(score || 0, 10) || 0),
    coins:Math.max(0, parseInt(coins || 0, 10) || 0),
    level:Math.max(1, parseInt(level || 1, 10) || 1),
    updated_at:Date.now(),
  });
  res.json({ ok:true });
});

/* ---------- /api/leaderboard ---------- */
app.get('/api/leaderboard', (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const rows = stmts.topLeaderboard.all(limit);
  res.json({
    leaderboard: rows.map((r, i) => ({
      rank:i+1,
      address:r.address,
      pseudo:r.pseudo || 'ANON',
      score:r.score,
      coins:r.coins,
      level:r.level,
    })),
  });
});

/* ---------- /api/og/:address ----------
   Simple OG image as SVG so shared links have a nice preview.
------------------------------------------------ */
app.get('/api/og/:address.svg', (req, res) => {
  const { address } = req.params;
  if (!isValidXrplAddress(address)) return res.status(400).send('invalid');
  const row = stmts.getCreature.get(address);
  const pseudo = (row?.pseudo || 'ANON').replace(/[<>&"]/g, '');
  const score = row?.score ?? 0;
  const level = row?.level ?? 1;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2a0b4b"/>
      <stop offset="100%" stop-color="#0a0014"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <text x="600" y="190" text-anchor="middle" font-family="monospace" font-size="88" fill="#ff2d7a" font-weight="bold">TAMAGOSCII</text>
  <text x="600" y="260" text-anchor="middle" font-family="monospace" font-size="44" fill="#36e0f5">タマゴッシー</text>
  <text x="600" y="380" text-anchor="middle" font-family="monospace" font-size="56" fill="#f6e24b">${pseudo}</text>
  <text x="600" y="470" text-anchor="middle" font-family="monospace" font-size="36" fill="#4bf58a">SCORE ${score}  ·  LV.${level}</text>
  <text x="600" y="560" text-anchor="middle" font-family="monospace" font-size="26" fill="#8b7fb8">xrpl ascii pet · powered by GemWallet</text>
</svg>`;
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=60');
  res.send(svg);
});

/* ---------- /api/xaman/status ---------- */
app.get('/api/xaman/status', (req, res) => {
  res.json({ enabled: XUMM_ENABLED });
});

/* ---------- /api/xaman/signin ----------
   Creates a Xaman SignIn payload (free, no-op tx).
   Returns a QR code URL + websocket URL so the frontend can
   display it and wait for the user to sign in their app.
------------------------------------------------- */
app.post('/api/xaman/signin', async (req, res) => {
  try{
    if (!XUMM_ENABLED) return res.status(503).json({ error:'XUMM_DISABLED' });
    const data = await xummFetch('/payload', {
      method:'POST',
      body:{
        txjson:{ TransactionType:'SignIn' },
        options:{
          submit:false,
          expire:5, // minutes
        },
      },
    });
    res.json(normalizeXummPayload(data));
  }catch(e){
    console.error('[xaman/signin]', e.message, e.details || '');
    res.status(500).json({ error:'XUMM_SIGNIN_FAILED' });
  }
});

/* ---------- /api/xaman/payment ----------
   Creates a Xaman Payment payload for one of the in-game
   actions. Amount is taken from PRICES, destination from
   TREASURY, and the destination tag from DEST_TAG.
   Body: { action: 'feed' | 'play' | ... }
------------------------------------------------- */
app.post('/api/xaman/payment', async (req, res) => {
  try{
    if (!XUMM_ENABLED) return res.status(503).json({ error:'XUMM_DISABLED' });
    const { action } = req.body || {};
    if (!(action in PRICES)) return res.status(400).json({ error:'INVALID_ACTION' });
    const xrp = PRICES[action];
    const drops = String(Math.round(xrp * 1_000_000));

    const txjson = {
      TransactionType:'Payment',
      Destination:TREASURY,
      Amount:drops,
    };
    if (DEST_TAG != null) txjson.DestinationTag = DEST_TAG;
    // Memo tags the tx as tamagoscii + action for explorers
    const hex = s => Array.from(new TextEncoder().encode(s))
      .map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    txjson.Memos = [{
      Memo:{
        MemoType:hex('tamagoscii'),
        MemoData:hex(action),
      }
    }];

    const data = await xummFetch('/payload', {
      method:'POST',
      body:{
        txjson,
        options:{
          submit:true,
          expire:5,
        },
        custom_meta:{
          identifier:'tamagoscii:'+action,
          blob:{ action, xrp },
        },
      },
    });
    res.json(normalizeXummPayload(data));
  }catch(e){
    console.error('[xaman/payment]', e.message, e.details || '');
    res.status(500).json({ error:'XUMM_PAYMENT_FAILED' });
  }
});

/* ---------- /api/xaman/payload/:uuid ----------
   Fetches the current status of a Xaman payload.
   Returns { signed, account, txid } when the user has signed.
------------------------------------------------- */
app.get('/api/xaman/payload/:uuid', async (req, res) => {
  try{
    if (!XUMM_ENABLED) return res.status(503).json({ error:'XUMM_DISABLED' });
    const { uuid } = req.params;
    if (!/^[a-f0-9-]{36}$/i.test(uuid)) return res.status(400).json({ error:'INVALID_UUID' });
    const data = await xummFetch('/payload/' + uuid);
    res.json({
      uuid: data.meta?.uuid,
      expired: data.meta?.expired,
      resolved: data.meta?.resolved,
      signed: data.meta?.signed,
      cancelled: data.meta?.cancelled,
      account: data.response?.account || null,
      txid: data.response?.txid || null,
      network: data.response?.environment_nodeuri || null,
    });
  }catch(e){
    console.error('[xaman/payload/:uuid]', e.message);
    res.status(500).json({ error:'XUMM_STATUS_FAILED' });
  }
});

/* ---------- /api/xaman/webhook ----------
   Xaman calls this endpoint when a payload is signed/cancelled.
   Optional — useful for push notifications or automatic crediting.
------------------------------------------------- */
app.post('/api/xaman/webhook', (req, res) => {
  // You can persist the webhook here if you need server-side triggers.
  // For now we just accept it and return 200 quickly.
  console.log('[xaman webhook]', req.body?.meta?.payload_uuidv4 || '?');
  res.json({ ok:true });
});

/* ---------- 404 ---------- */
app.use((req, res) => res.status(404).json({ error:'NOT_FOUND' }));

/* ------------------------------------------------------------
   START SERVER
------------------------------------------------------------ */
app.listen(PORT, () => {
  const xummStatus = XUMM_ENABLED ? 'enabled' : 'disabled (no keys)';
  console.log(`
╔══════════════════════════════════════════╗
║  🥚 TAMAGOSCII BACKEND                   ║
║                                          ║
║  env:      ${NODE_ENV.padEnd(30)}║
║  network:  ${XRPL_NETWORK.padEnd(30)}║
║  treasury: ${TREASURY.slice(0,14).padEnd(30)}║
║  port:     ${String(PORT).padEnd(30)}║
║  db:       ${DB_PATH.split('/').pop().padEnd(30)}║
║  xaman:    ${xummStatus.padEnd(30)}║
╚══════════════════════════════════════════╝
  `);
});

// Graceful shutdown so in-flight XRPL connection is closed cleanly.
async function shutdown(){
  console.log('\n⏻ shutting down...');
  try { if (xrplClient && xrplClient.isConnected()) await xrplClient.disconnect(); } catch(e){}
  try { db.close(); } catch(e){}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
