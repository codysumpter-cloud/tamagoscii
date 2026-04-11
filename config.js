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

  // ---------- Wallet provider ----------
  // GemWallet is the only supported wallet.
  WALLET_PROVIDER: 'gemwallet',
  GEMWALLET_INSTALL_URL: 'https://gemwallet.app/',

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
