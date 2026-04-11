# Integration study — Boundless & QuickNode

Honest, opinionated analysis of how Tamagoscii could integrate these two
platforms, including whether it's actually worth the effort.

---

## TL;DR

| Platform | Fit for Tamagoscii | Priority | Effort | Payoff |
|---|---|---|---|---|
| **QuickNode** | ✅ Very good fit | 🔴 High | Low (half-day) | Reliable XRPL RPC, real-time webhooks, optional serverless backend |
| **Boundless** | 🟡 Overkill for v1, great for v2 | 🟢 Low | High (days) | Anti-cheat leaderboards, verifiable minigame scores |

**My recommendation**: **Integrate QuickNode now**, keep Boundless on the
roadmap for when you add competitive features or real-money rewards.

---

## 1. QuickNode

### What it is
QuickNode is a blockchain **node-as-a-service** provider: you get a dedicated
RPC endpoint (WebSocket + HTTPS) for 30+ chains including XRPL. On top of
that they sell **Streams** (real-time blockchain webhooks) and **Functions**
(serverless JavaScript that runs alongside your node).

### Why it's a good fit for Tamagoscii

**Problem 1 — the free public XRPL RPC is unreliable.**
Your current config uses `wss://xrplcluster.com` which is a community-run
free cluster. It works most of the time but:
- no SLA, no support
- rate-limited when you grow
- occasionally drops WebSocket connections
- no historical tx queries

**Problem 2 — tx verification is polling-based.**
Your `backend/server.js` verifies shop purchases by querying XRPL each time
the frontend POSTs `/api/tx/verify`. QuickNode Streams can push a webhook to
your backend the instant a payment hits the treasury, so you know about it
before the frontend even calls you.

**Problem 3 — you still need to host the backend somewhere.**
QuickNode Functions let you run the `/api/xaman/*` and `/api/tx/verify`
routes as serverless functions **on QuickNode itself**, no Railway / Fly /
Render needed.

### Integration points

#### A. Replace the XRPL RPC endpoint (5 minutes)

```js
// config.js
XRPL_WSS: {
  mainnet: 'wss://your-endpoint-name.xrp-mainnet.quiknode.pro/YOUR_TOKEN/',
  testnet: 'wss://your-endpoint-name.xrp-testnet.quiknode.pro/YOUR_TOKEN/',
},
```

```env
# backend/.env
XRPL_WSS_URL=wss://your-endpoint-name.xrp-mainnet.quiknode.pro/YOUR_TOKEN/
```

**Gain**: reliable connection, faster responses, dashboard with request
metrics, 1.3M credits/month free.

#### B. Real-time treasury monitoring (Streams)

Create a **Stream** on QuickNode that filters XRPL transactions where:

- `TransactionType === 'Payment'`
- `Destination === TREASURY_ADDRESS`
- `DestinationTag === DESTINATION_TAG`

Point the webhook at `https://your-backend/api/quicknode/webhook`.

Add a new route in `backend/server.js`:

```js
app.post('/api/quicknode/webhook', async (req, res) => {
  // Verify the X-Quicknode-Signature header
  const { data } = req.body;
  for (const tx of data) {
    if (tx.meta?.TransactionResult !== 'tesSUCCESS') continue;
    if (tx.Destination !== TREASURY) continue;
    if (tx.DestinationTag !== DEST_TAG) continue;
    const sender = tx.Account;
    const amountXrp = parseFloat(dropsToXrp(tx.Amount));
    // Credit the user proactively, even before they POST /api/tx/verify
    await creditFromWebhook(sender, amountXrp, tx.hash);
  }
  res.json({ ok: true });
});
```

**Gain**: zero-latency shop credit, anti-replay still via `claimed_tx` table,
no more client-trust even if the frontend is compromised.

#### C. QuickNode Functions (optional but cool)

Instead of deploying `backend/server.js` to Railway/Fly, you can port each
Express route to a **QuickNode Function**:

```js
// quicknode-function.js
exports.handler = async function (req) {
  const { address, hash, action } = req.body;
  // verify tx via the co-located node (zero network latency)
  const tx = await client.request({ command: 'tx', transaction: hash });
  // ... credit logic
  return { status: 200, body: JSON.stringify({ ok: true }) };
};
```

Each function has access to the same node that the Stream uses, so tx lookups
are nearly instantaneous. Free tier gives 500k function executions / month.

**Gain**: no hosting bill, single vendor, auto-scale for free.

### Cost estimate

| Tier | Credits/mo | Streams | Functions | Price | Fits Tamagoscii? |
|---|---|---|---|---|---|
| Free | 1.3M | 1 | 500k | $0 | ✅ Yes for launch |
| Build | 40M | 5 | 2M | $10 | ✅ Yes after traction |
| Scale | 300M | 25 | 15M | $49 | ✅ For 10k+ DAU |

### Setup steps

1. Sign up at https://www.quicknode.com
2. Create an **Endpoint** → choose **XRP** → **Mainnet**
3. Copy the **HTTPS** and **WSS** URLs
4. Paste the WSS into `config.js` → `XRPL_WSS.mainnet`
5. Paste the same into `backend/.env` → `XRPL_WSS_URL`
6. (optional) Go to **Streams** → "New Stream" → XRPL → filter by
   destination tag → webhook to your backend
7. Redeploy

### Files that would change

- `config.js` — 1 line
- `backend/.env.example` — 1 line comment
- `backend/server.js` — read `XRPL_WSS_URL` (already done) + add
  `/api/quicknode/webhook` route (30 lines)

Total: **~50 lines of code + a couple of dashboard clicks.**

---

## 2. Boundless

### What it is
Boundless is a **verifiable compute marketplace** from RISC Zero. You write
a program in Rust that runs inside a zkVM; a decentralized network of
provers executes it off-chain; they return a **cryptographic proof** that the
computation was correct; a smart contract verifies the proof on-chain in
~200 k gas regardless of how heavy the computation was.

It's the "proof-of-computation" layer that lets rollups, ZK bridges,
verifiable AI and cheat-proof games exist.

### Why it's overkill for Tamagoscii v1

- Tamagoscii is a casual pet game. Cheating has zero financial consequence
  because in-game actions cost in-game coins, not real XRP.
- Writing ZK programs requires **Rust** and **circuit thinking** — a
  significant skill jump from "edit some JS".
- You need a **verifier smart contract** somewhere. XRPL Mainnet doesn't
  natively run EVM contracts, so you'd deploy on XRPL EVM Sidechain
  (testnet-only for now) or a separate chain (Base, Arbitrum, etc.),
  adding cross-chain plumbing.
- The proof takes 5–60 seconds to generate — totally fine for claiming a
  leaderboard prize, but way too slow for an in-game click.

### Where Boundless *would* make sense

#### A. Cheat-proof competitive leaderboards

Imagine you announce "top 10 players at the end of the month get 100 XRP
each". You need to prove that:
- Each score was computed from a legitimate sequence of in-game actions
- Nobody tampered with their localStorage to claim fake points

Flow:
1. User plays the minigame. The client records every smash + timestamp.
2. At the end of the round, client sends `{ actions, finalScore }` to a
   Boundless prover.
3. The zkVM program replays the actions → computes the score → asserts it
   matches `finalScore`.
4. Prover returns a ZK proof.
5. Your smart contract verifies the proof and records the score on-chain.

The contract is the single source of truth for the leaderboard. No backend
trust required.

#### B. Verifiable random egg generation

Currently the creature is seeded deterministically from the XRPL address.
That's already verifiable without ZK. But if you wanted "rare gold eggs"
distributed by a random draw, Boundless could prove the VRF output was
honest.

#### C. Verifiable evolution stages

If the game gains stages / breeding / death mechanics with real stakes,
Boundless can prove the creature's history is consistent with the rules
without publishing every action on-chain.

### What the integration actually looks like

Rough architecture:

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Tamagoscii   │    │  Boundless   │    │ Verifier     │
│ frontend     │───▶│ marketplace  │───▶│ contract     │
│ (JS)         │◀───│ (Rust/zkVM)  │◀───│ (Solidity)   │
└──────────────┘    └──────────────┘    └──────────────┘
                                               │
                                               ▼
                                     ┌──────────────────┐
                                     │ On-chain         │
                                     │ leaderboard      │
                                     └──────────────────┘
```

Required skills & components:
- 🦀 Rust program (~200 LOC) for the zkVM
- 📜 Solidity verifier contract (generated by RISC Zero tooling)
- 🌐 A chain to deploy on (XRPL EVM Sidechain when mainnet, or Base for now)
- 💰 Prover credits (pay-per-proof on Boundless mainnet)
- 🧪 Test harness to catch circuit bugs before deploy

### Cost estimate

- Prover fees: tiny for a game (likely < $0.001 per proof)
- Verifier contract gas: ~200 k gas per proof = $0.10–$1.00 depending on
  the chain
- Developer time to set up: **2–5 days** for a first working integration

### Setup steps (if you go for it)

1. Install RISC Zero toolchain: `curl -L https://risczero.com/install | bash`
2. `cargo risczero new tamagoscii-zk`
3. Write your game logic as a `#[risc0_zkvm::entry]` function
4. Generate the verifier contract: `cargo risczero build`
5. Deploy the verifier to a chain (Base testnet is free)
6. Add a `/api/prove-score` endpoint in your backend that calls Boundless
7. Modify the minigame client to submit `{ actions, claimed_score }` to
   that endpoint when the round ends
8. Read the leaderboard from the smart contract instead of the local DB

### Files that would change

New files:
- `zk/` — Rust zkVM program (new directory)
- `contracts/` — Solidity verifier (new directory)
- `backend/routes/boundless.js` — new endpoint
- `game.js` — submit proofs from the minigame
- `backend/server.js` — read leaderboard from chain

Total: **500–1000 new lines + learning curve.**

---

## Recommended roadmap

```
 v1 (now)       ──▶  QuickNode endpoint + Streams (½ day)
 v1.5           ──▶  QuickNode Functions for serverless backend (½ day)
 v2 (compete)   ──▶  Add real-money tournaments
 v2.1           ──▶  Boundless-proof leaderboards (1 week)
```

Start with QuickNode. Ship it. Get players. Then evaluate whether you
actually need Boundless based on user demand for competitive integrity.

---

## How to display the logos in-app

Both Boundless and QuickNode have official SVG logos.

1. Download `boundless.svg` and `quicknode.svg`
2. Drop them in the `logo/` folder
3. Edit [`logo/logos.json`](../logo/logos.json):
   ```json
   [
     {
       "name": "QuickNode",
       "file": "quicknode.svg",
       "url": "https://www.quicknode.com",
       "tagline": "XRPL RPC"
     },
     {
       "name": "Boundless",
       "file": "boundless.svg",
       "url": "https://beboundless.xyz",
       "tagline": "Verifiable compute"
     }
   ]
   ```
4. Refresh the app — they appear in the "POWERED BY" strip on the login
   screen with a link to each partner.
