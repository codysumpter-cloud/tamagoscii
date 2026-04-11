/* ============================================================
   TAMAGOSCII - XRPL Wallet (mock)
   Simulates a wallet connection and micro-transactions.
   If a real provider (e.g. GemWallet, Xumm) is available on
   window, we try to use it; otherwise we mock locally with
   deterministic addresses stored in localStorage.
============================================================ */

(function(){
  'use strict';

  const STORAGE_KEY = 'tamagoscii:wallet';

  function randomXRPLAddress(){
    // Valid-looking rAddress: 25-35 chars base58-ish, starts with r
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let a = 'r';
    for (let i=0;i<32;i++) a += chars[Math.floor(Math.random()*chars.length)];
    return a;
  }

  function short(addr){
    if (!addr) return '';
    return addr.slice(0,6) + '...' + addr.slice(-4);
  }

  class Wallet {
    constructor(){
      this.address = null;
      this.xrpBalance = 0;
      this.connected = false;
      this.provider = 'mock';
    }
    async connect(){
      // Try real providers first (GemWallet)
      try{
        if (window.GemWalletApi && typeof window.GemWalletApi.isInstalled === 'function'){
          const installed = await window.GemWalletApi.isInstalled();
          if (installed && installed.result && installed.result.isInstalled){
            const addr = await window.GemWalletApi.getAddress();
            if (addr && addr.result && addr.result.address){
              this.address = addr.result.address;
              this.provider = 'GemWallet';
              this.connected = true;
              this.xrpBalance = 100;
              this._save();
              return this.address;
            }
          }
        }
      } catch(e){ /* fall through */ }

      // Mock: reuse existing if present, else generate
      const stored = this._load();
      if (stored && stored.address){
        this.address = stored.address;
        this.xrpBalance = stored.xrpBalance ?? 100;
      } else {
        this.address = randomXRPLAddress();
        this.xrpBalance = 100; // mock balance
      }
      this.connected = true;
      this.provider = 'mock';
      this._save();
      return this.address;
    }
    async pay(amountXRP, memo){
      if (!this.connected) throw new Error('Wallet not connected');
      if (this.xrpBalance < amountXRP){
        throw new Error('Insufficient XRP balance');
      }
      // Simulate a tiny delay like a real tx
      await new Promise(r=>setTimeout(r, 120));
      this.xrpBalance = Math.round((this.xrpBalance - amountXRP) * 1e6)/1e6;
      this._save();
      const txHash = 'sim_' + Math.random().toString(16).slice(2,10).toUpperCase();
      return { success:true, hash:txHash, amount:amountXRP, memo };
    }
    disconnect(){
      this.connected = false;
      this.address = null;
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
        xrpBalance:this.xrpBalance,
      }));
    }
    _load(){
      try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)); }
      catch(e){ return null; }
    }
  }

  window.TamaWallet = new Wallet();
  window.TamaShortAddr = short;
})();
