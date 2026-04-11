/* ============================================================
   TAMAGOSCII - Public runtime configuration
   Edit values here for production. Secrets stay server-side.
============================================================ */

window.TAMA_CONFIG = {
  // ---------- XRPL Network ----------
  // Switch between 'mainnet' and 'testnet' here.
  XRPL_NETWORK: 'mainnet',

  // WSS endpoints
  XRPL_WSS: {
    mainnet: 'wss://xrplcluster.com',
    testnet: 'wss://s.altnet.rippletest.net:51233',
  },

  // Block explorers
  XRPL_EXPLORER: {
    mainnet: 'https://livenet.xrpl.org',
    testnet: 'https://testnet.xrpl.org',
  },

  // ---------- Treasury (receives all micro-tx) ----------
  // ⚠️ Replace with your own mainnet XRPL address before going live.
  TREASURY_ADDRESS: 'rTamagosciiTreasuryReplaceMe00000',
  DESTINATION_TAG: 20260411,

  // ---------- Wallet providers ----------
  // The frontend supports both GemWallet (desktop) and Xaman (mobile).
  // Xaman requires the backend to create signing payloads — make sure
  // API_BASE_URL points to a server that has XUMM_API_KEY set.
  WALLET_PROVIDERS: ['gemwallet', 'xaman'],
  GEMWALLET_INSTALL_URL: 'https://gemwallet.app/',
  XAMAN_INSTALL_URL: 'https://xaman.app/',

  // ---------- Backend API ----------
  // URL of the Tamagoscii backend (server.js). Used for:
  //   - verifying real XRPL transactions server-side
  //   - creating Xaman sign-in / payment payloads
  //   - persisting creature state
  // Leave empty '' to run in static-only mode (GemWallet + demo only).
  API_BASE_URL: '',

  // ---------- Prices (in XRP) ----------
  PRICES: {
    feed: 0.01,
    play: 0.02,
    sleep: 0.01,
    clean: 0.01,
    pet: 0,
    pack_small: 0.5,
    pack_medium: 2,
    pack_large: 5,
    pack_whale: 10,
  },

  // ---------- Music ----------
  MUSIC_MANIFEST: './music/tracks.json',
  MUSIC_DIR: './music/',

  // ---------- App ----------
  APP_VERSION: '1.1.0',
  APP_NAME: 'Tamagoscii',
};
