# 🥚 Tamagoscii — Setup checklist

Follow these steps in order. You only have **3 things** to change in `config.js`
and then you're live.

---

## ✅ Step 1 — Create your XRPL wallet (5 min)

1. Install **Xaman** on your phone: https://xaman.app/
2. Open the app → "Add account" → "Create new account"
3. **Write down** the 12-word seed phrase on paper (never a screenshot)
4. Copy your address — it starts with `r...` (e.g. `rAlice1234...`)
5. Send at least **10 XRP** to this address to activate it
   - Buy on an exchange (Kraken, Bitstamp, Bitfinex)
   - Or receive from a friend
   - Or use the testnet faucet first: https://test.bithomp.com/faucet

✅ You now have: a working XRPL address.

---

## ✅ Step 2 — Edit `config.js` (2 min)

Open [`config.js`](./config.js) on GitHub and look for the 3 lines marked
`🔴 EDIT ME`. Click the pencil ✏️ icon top-right of the file viewer to edit.

### 🔴 Line 1 — `TREASURY_ADDRESS`

```js
TREASURY_ADDRESS: 'rREPLACE_ME_WITH_YOUR_XRPL_ADDRESS',
```

Replace with the address you just created in Step 1:

```js
TREASURY_ADDRESS: 'rAlice1234567890abcDEfGhIjKlMnOpQr',  //  ← your address
```

### 🔴 Line 2 — `DESTINATION_TAG`

```js
DESTINATION_TAG: 20260411,
```

Any positive integer. You can keep `20260411` if you don't care, or pick
something meaningful like your birthday `19910425`, `1337`, etc.

### 🔴 Line 3 — `API_BASE_URL`

```js
API_BASE_URL: '',
```

**Leave this empty for now** — you don't need a backend to start. Come back
here later when you've deployed `backend/server.js` somewhere.

### Commit the change

Scroll down → "Commit changes" → write a message like `config: set mainnet
treasury` → click the green button. **Vercel will auto-redeploy in ~1 min.**

---

## ✅ Step 3 — Deploy the frontend (1 min)

If you haven't already:

1. Go to https://vercel.com/new
2. Import your GitHub repo `presidentxerak/tamagoscii`
3. Framework: **"Other"** (no build step)
4. Root directory: `/` (default)
5. Click **Deploy**

Your app is now live at `https://tamagoscii.vercel.app` 🎉

---

## ✅ Step 4 — Test it (5 min)

| Test | Expected result |
|---|---|
| Open your Vercel URL on desktop Chrome with GemWallet installed | "CONNECT GEMWALLET" works, creature hatches |
| Open the same URL on your phone | Xaman button is disabled (needs backend) |
| Click "skip · try demo mode" on any device | Demo mode works, no real payments |
| Click FEED with GemWallet connected | GemWallet popup asks to confirm 0.01 XRP tx |
| Check your wallet balance after | Balance increased by 0.01 XRP |
| Look at the tx on livenet.xrpl.org | Your tx is visible with the DestinationTag |

---

## 🟡 Later — Enable Xaman (mobile wallet)

To let mobile users pay with Xaman instead of GemWallet, you need the
backend. Follow:

1. [`backend/README.md`](./backend/README.md) — how to deploy the API
2. [`backend/.env.example`](./backend/.env.example) — what secrets it needs
3. Get Xaman API keys at https://apps.xaman.dev/
4. Once deployed, come back to `config.js` and set:
   ```js
   API_BASE_URL: 'https://your-backend-url.vercel.app',
   ```
5. Commit → Vercel redeploys → mobile users can now use Xaman 📱

---

## ❓ Troubleshooting

| Problem | Fix |
|---|---|
| "GEMWALLET NOT INSTALLED" on desktop | Install the extension: https://gemwallet.app/ |
| Xaman button is grayed out | Normal — means `API_BASE_URL` is empty. Deploy backend first. |
| Creature doesn't hatch after connect | Open browser console (F12) and check for errors |
| Tx says "WRONG_DESTINATION" | `TREASURY_ADDRESS` in `config.js` doesn't match your actual wallet |
| Tx says "WRONG_DESTINATION_TAG" | `DESTINATION_TAG` mismatch between `config.js` and `backend/.env` |
| Nothing happens when I click | Hard refresh (Cmd+Shift+R / Ctrl+Shift+F5) to get the new `config.js` |

---

## 🆘 Need help?

All configuration values are documented inline inside `config.js` itself.
Open it and read the comments — everything is explained step by step.
