/* ============================================================
   TAMAGOSCII - GemWallet integration (XRPL mainnet)
   ------------------------------------------------------------
   Primary wallet provider: GemWallet (browser extension).
   https://gemwallet.app/

   Falls back to a local "demo mode" only if the user explicitly
   chooses it from the login screen.
============================================================ */

(function(){
  'use strict';

  const STORAGE_KEY = 'tamagoscii:wallet';

  function xrpToDrops(xrp){
    return String(Math.round(parseFloat(xrp) * 1_000_000));
  }
  function short(addr){
    if (!addr) return '';
    return addr.slice(0,6) + '...' + addr.slice(-4);
  }

  async function waitForGem(timeoutMs = 2000){
    const start = Date.now();
    while (Date.now() - start < timeoutMs){
      if (window.GemWalletApi) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return !!window.GemWalletApi;
  }

  async function isGemInstalled(){
    const ok = await waitForGem(1500);
    if (!ok) return false;
    try{
      const res = await window.GemWalletApi.isInstalled();
      return !!(res && res.result && res.result.isInstalled);
    }catch(e){
      return false;
    }
  }

  class Wallet {
    constructor(){
      this.address = null;
      this.network = null;
      this.connected = false;
      this.provider = null;      // 'gemwallet' | 'demo'
      this.demoBalance = 100;    // used only in demo mode
    }

    /* ---------------- CONNECT ---------------- */
    async connect(){
      const cfg = window.TAMA_CONFIG;
      const installed = await isGemInstalled();
      if (!installed){
        const err = new Error('GEMWALLET_NOT_INSTALLED');
        err.installUrl = cfg.GEMWALLET_INSTALL_URL;
        throw err;
      }

      // Ask GemWallet for the active address
      const res = await window.GemWalletApi.getAddress();
      const address = res && res.result && res.result.address;
      if (!address) throw new Error('GEMWALLET_REJECTED');

      // Try to get network info (GemWallet >= 3.x)
      let network = cfg.XRPL_NETWORK;
      try{
        if (typeof window.GemWalletApi.getNetwork === 'function'){
          const n = await window.GemWalletApi.getNetwork();
          if (n && n.result && n.result.network){
            network = String(n.result.network).toLowerCase();
          }
        }
      }catch(e){ /* ignore */ }

      this.address = address;
      this.network = network;
      this.provider = 'gemwallet';
      this.connected = true;
      this._save();
      return address;
    }

    async connectDemo(){
      // Demo mode for local testing without a wallet
      const stored = this._load();
      if (stored && stored.address && stored.provider === 'demo'){
        this.address = stored.address;
        this.demoBalance = stored.demoBalance ?? 100;
      } else {
        this.address = this._generateDemoAddress();
        this.demoBalance = 100;
      }
      this.network = 'demo';
      this.provider = 'demo';
      this.connected = true;
      this._save();
      return this.address;
    }

    _generateDemoAddress(){
      const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      let a = 'r';
      for (let i=0; i<32; i++) a += chars[Math.floor(Math.random()*chars.length)];
      return a;
    }

    /* ---------------- PAYMENT ---------------- */
    async pay(amountXRP, memo){
      if (!this.connected) throw new Error('WALLET_NOT_CONNECTED');
      const cfg = window.TAMA_CONFIG;
      if (amountXRP <= 0){
        return { success:true, hash:'free', amount:0, memo };
      }

      if (this.provider === 'demo'){
        // Simulate a tx for offline testing
        if (this.demoBalance < amountXRP){
          throw new Error('INSUFFICIENT_XRP');
        }
        await new Promise(r=>setTimeout(r,120));
        this.demoBalance = Math.round((this.demoBalance - amountXRP) * 1e6)/1e6;
        this._save();
        return {
          success:true,
          hash:'demo_'+Math.random().toString(16).slice(2,12).toUpperCase(),
          amount:amountXRP,
          memo,
        };
      }

      // Real GemWallet payment on mainnet
      if (!window.GemWalletApi || typeof window.GemWalletApi.sendPayment !== 'function'){
        throw new Error('GEMWALLET_UNAVAILABLE');
      }

      const payload = {
        amount: xrpToDrops(amountXRP),
        destination: cfg.TREASURY_ADDRESS,
      };
      if (cfg.DESTINATION_TAG){
        payload.destinationTag = cfg.DESTINATION_TAG;
      }
      if (memo){
        payload.memos = [{
          memo: {
            memoType: Array.from(new TextEncoder().encode('tamagoscii'))
              .map(b=>b.toString(16).padStart(2,'0')).join(''),
            memoData: Array.from(new TextEncoder().encode(String(memo)))
              .map(b=>b.toString(16).padStart(2,'0')).join(''),
          }
        }];
      }

      const res = await window.GemWalletApi.sendPayment(payload);
      if (!res || !res.result || !res.result.hash){
        const e = new Error('TX_REJECTED');
        throw e;
      }
      return {
        success:true,
        hash:res.result.hash,
        amount:amountXRP,
        memo,
        explorer: this._explorerUrl(res.result.hash),
      };
    }

    _explorerUrl(hash){
      const cfg = window.TAMA_CONFIG;
      const base = cfg.XRPL_EXPLORER[cfg.XRPL_NETWORK] || cfg.XRPL_EXPLORER.mainnet;
      return `${base}/transactions/${hash}`;
    }

    /* ---------------- PROFILE ---------------- */
    disconnect(){
      this.connected = false;
      this.address = null;
      this.provider = null;
    }
    setPseudo(p){
      const data = this._load() || {};
      data.pseudo = p;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
    getPseudo(){
      const data = this._load();
      return data ? data.pseudo : null;
    }
    _save(){
      const existing = this._load() || {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...existing,
        address:this.address,
        provider:this.provider,
        network:this.network,
        demoBalance:this.demoBalance,
      }));
    }
    _load(){
      try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)); }
      catch(e){ return null; }
    }
  }

  window.TamaWallet = new Wallet();
  window.TamaShortAddr = short;
  window.TamaIsGemInstalled = isGemInstalled;
})();
