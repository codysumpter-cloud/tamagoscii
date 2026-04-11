/* ============================================================
   TAMAGOSCII - Public runtime configuration
   ============================================================
   This file is loaded directly by the browser. It is public —
   DO NOT put secrets (API secrets, seed phrases, passwords) here.

   ┌──────────────────────────────────────────────────────────┐
   │  👋  TO GO LIVE, EDIT ONLY THE 3 LINES MARKED "🔴 EDIT ME"│
   │      Everything else already has sensible defaults.      │
   │                                                          │
   │  1. TREASURY_ADDRESS  → your XRPL wallet (receives XRP)  │
   │  2. DESTINATION_TAG   → any integer of your choice       │
   │  3. API_BASE_URL      → your backend URL (can stay empty)│
   └──────────────────────────────────────────────────────────┘
============================================================ */

window.TAMA_CONFIG = {

  /* ════════════════════════════════════════════════════════
     1. XRPL NETWORK
     ════════════════════════════════════════════════════════
     'mainnet' = real XRP with real value (production)
     'testnet' = fake XRP for free testing
                 Get free testnet XRP here:
                 https://test.bithomp.com/faucet
  */
  XRPL_NETWORK: 'mainnet',

  XRPL_WSS: {
    mainnet: 'wss://xrplcluster.com',
    testnet: 'wss://s.altnet.rippletest.net:51233',
  },

  XRPL_EXPLORER: {
    mainnet: 'https://livenet.xrpl.org',
    testnet: 'https://testnet.xrpl.org',
  },


  /* ════════════════════════════════════════════════════════
     2. 🔴 EDIT ME — YOUR XRPL TREASURY ADDRESS
     ════════════════════════════════════════════════════════
     This is YOUR XRPL wallet address. Every time a player
     pays 0.01 XRP to FEED/PLAY/SLEEP their Tamagoscii, the
     XRP arrives in this wallet.

     How to get one:
       a) Install Xaman (https://xaman.app/) on your phone
       b) Create a new account in the app
       c) Write down the 12-word seed phrase in a safe place
       d) Send ≥10 XRP to the address to activate it
       e) Copy the address (starts with "r...") and paste below

     ⚠️ DOUBLE-CHECK the address. A typo = XRP lost forever.
     ⚠️ NEVER put your SEED PHRASE in this file. Only the
        public address (starts with "r").
  */
  TREASURY_ADDRESS: 'rBGY2TjRzPDFKYFCKqGRF3BEaf9HVpRZXZ',


  /* ════════════════════════════════════════════════════════
     3. 🔴 EDIT ME — DESTINATION TAG
     ════════════════════════════════════════════════════════
     Any positive integer you choose. This tag is attached to
     every Tamagoscii payment so you can later filter your
     revenue from this app vs other payments on the same
     wallet. Pick something memorable, for example:
        - your birthday as YYYYMMDD → 19910425
        - today's date               → 20260411
        - a simple number            → 1337

     Just make sure it's the SAME in backend/.env too.
  */
  DESTINATION_TAG: 20260411,


  /* ════════════════════════════════════════════════════════
     4. WALLET PROVIDERS
     ════════════════════════════════════════════════════════
     Keep this list as-is unless you want to disable one.
     - GemWallet works only on desktop (browser extension)
     - Xaman   works only on mobile  (phone app + QR code)
  */
  WALLET_PROVIDERS: ['gemwallet', 'xaman'],
  GEMWALLET_INSTALL_URL: 'https://gemwallet.app/',
  XAMAN_INSTALL_URL: 'https://xaman.app/',


  /* ════════════════════════════════════════════════════════
     5. 🔴 EDIT ME (LATER) — BACKEND API URL
     ════════════════════════════════════════════════════════
     URL of your deployed backend (see backend/README.md).
     The backend is needed for:
        - Xaman mobile wallet flow (QR code signing)
        - verifying XRPL transactions server-side
        - saving creature states across devices

     👉 Leave this EMPTY '' until you deploy the backend.
        With an empty value, Tamagoscii still works in:
           - GemWallet mode (desktop only)
           - Demo mode (no real payments)

     Once deployed, set it to something like:
        'https://tamagoscii-api.vercel.app'
        'https://tamagoscii-api.up.railway.app'
        'https://api.tamagoscii.app'
        (NO trailing slash)
  */
  API_BASE_URL: '',


  /* ════════════════════════════════════════════════════════
     6. PRICES (in XRP)
     ════════════════════════════════════════════════════════
     In-game actions (feed/play/sleep/clean/pet) no longer cost
     real XRP — they cost Scii Coins so the wallet doesn't pop
     up on every click. Only the SHOP charges real XRP to buy
     Scii Coins packs.
     Must match the PRICES object in backend/server.js.
  */
  PRICES: {
    feed:        0,      // Scii Coin only (see COSTS_COINS in game.js)
    play:        0,
    sleep:       0,
    clean:       0,
    pet:         0,      // petting is free
    pack_small:  0.05,   //  100 Scii Coins pack
    pack_medium: 0.1,    //  500 Scii Coins pack (best value)
    pack_large:  0.2,    // 1500 Scii Coins pack
    pack_whale:  0.3,    // 3500 Scii Coins pack
  },


  /* ════════════════════════════════════════════════════════
     7. MUSIC
     ════════════════════════════════════════════════════════
     The bottom-bar audio player auto-loads tracks listed in
     music/tracks.json. To add new tracks:
        1. Drop the .mp3 file inside the music/ folder
        2. Add an entry to music/tracks.json
        3. Refresh the page
  */
  MUSIC_MANIFEST: './music/tracks.json',
  MUSIC_DIR:      './music/',


  /* ════════════════════════════════════════════════════════
     8. APP METADATA
     ════════════════════════════════════════════════════════
     Cosmetic. Shown in the HUD and page <title>.
  */
  APP_VERSION: '1.1.0',
  APP_NAME:    'Tamagoscii',
};
