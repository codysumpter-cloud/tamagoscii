/* ============================================================
   TAMAGOSCII - Multi-provider XRPL wallet
   ------------------------------------------------------------
   Supported providers:
     1. gemwallet  — browser extension (desktop)
     2. xaman      — mobile app via QR code (requires backend)
     3. demo       — local-only fallback for testing

   The frontend picks the right default based on the device
   (mobile → Xaman, desktop → GemWallet) but users can always
   override the choice from the login screen.
============================================================ */

(function(){
  'use strict';

  const STORAGE_KEY = 'tamagoscii:wallet';

  /* ---------- helpers ---------- */
  function xrpToDrops(xrp){
    return String(Math.round(parseFloat(xrp) * 1_000_000));
  }
  function short(addr){
    if (!addr) return '';
    return addr.slice(0,6) + '...' + addr.slice(-4);
  }
  function isMobile(){
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /iPhone|iPad|iPod|Android|Mobile|webOS|BlackBerry|Opera Mini/i.test(ua);
  }
  // Wait until the GemWallet SDK has finished loading from a CDN.
  // The ESM loader in index.html sets window.__gemReady and dispatches
  // the 'gemwallet-ready' event; we fall back to polling in case the
  // script order differs.
  async function waitForGem(timeoutMs = 5000){
    if (window.GemWalletApi) return true;
    return new Promise(resolve => {
      let done = false;
      const finish = ok => { if (!done){ done = true; resolve(ok); } };
      document.addEventListener('gemwallet-ready', () => finish(true), { once:true });
      const start = Date.now();
      const iv = setInterval(() => {
        if (window.GemWalletApi){ clearInterval(iv); finish(true); }
        else if (window.__gemReady === false){ clearInterval(iv); finish(false); }
        else if (Date.now() - start > timeoutMs){ clearInterval(iv); finish(!!window.GemWalletApi); }
      }, 120);
    });
  }
  async function isGemInstalled(){
    const sdkReady = await waitForGem();
    if (!sdkReady){
      console.warn('[TamaWallet] GemWallet SDK not available (CDN blocked or offline)');
      return false;
    }
    try{
      const res = await window.GemWalletApi.isInstalled();
      const installed = !!(res && res.result && res.result.isInstalled);
      console.log('[TamaWallet] GemWallet extension installed =', installed);
      return installed;
    }catch(e){
      console.warn('[TamaWallet] GemWallet isInstalled() threw:', e);
      return false;
    }
  }
  function apiBase(){
    const cfg = window.TAMA_CONFIG || {};
    return (cfg.API_BASE_URL || '').replace(/\/$/, '');
  }
  async function apiCall(path, opts = {}){
    const base = apiBase();
    if (!base) throw new Error('API_BASE_URL_NOT_SET');
    const res = await fetch(base + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type':'application/json' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok){
      let msg = 'HTTP_'+res.status;
      try { const d = await res.json(); if (d.error) msg = d.error; } catch(e){}
      throw new Error(msg);
    }
    return res.json();
  }

  /* ---------- Xaman payload lifecycle ---------- */
  // Polls the backend until a payload is signed, cancelled or expired.
  // onUpdate is called with { signed, resolved, account, txid }.
  async function pollXamanPayload(uuid, onUpdate, { intervalMs = 1500, timeoutMs = 5*60*1000 } = {}){
    const start = Date.now();
    while (Date.now() - start < timeoutMs){
      let status;
      try {
        status = await apiCall('/api/xaman/payload/' + uuid);
      } catch(e) {
        await new Promise(r => setTimeout(r, intervalMs));
        continue;
      }
      if (onUpdate) onUpdate(status);
      if (status.signed) return status;
      if (status.cancelled || status.expired) throw new Error('XUMM_CANCELLED');
      await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error('XUMM_TIMEOUT');
  }

  /* ============================================================
     Wallet
  ============================================================ */
  class Wallet {
    constructor(){
      this.address = null;
      this.network = null;
      this.connected = false;
      this.provider = null;          // 'gemwallet' | 'xaman' | 'demo'
      this.demoBalance = 100;
      this._xamanUI = null;          // hook set by game.js to show QR modal
    }

    /* ---------- wiring UI ---------- */
    setXamanUI(ui){ this._xamanUI = ui; }

    /* ---------- platform hints ---------- */
    preferredProvider(){
      return isMobile() ? 'xaman' : 'gemwallet';
    }
    async availableProviders(){
      const cfg = window.TAMA_CONFIG || {};
      const enabled = cfg.WALLET_PROVIDERS || ['gemwallet','xaman'];
      const list = [];
      if (enabled.includes('gemwallet')){
        list.push({
          id:'gemwallet',
          name:'GemWallet',
          subtitle:'Browser extension · Desktop',
          installed: await isGemInstalled(),
          installUrl: cfg.GEMWALLET_INSTALL_URL,
          preferred: !isMobile(),
        });
      }
      if (enabled.includes('xaman') && apiBase()){
        list.push({
          id:'xaman',
          name:'Xaman',
          subtitle:'Mobile app · Scan QR code',
          installed: true, // handled server-side
          installUrl: cfg.XAMAN_INSTALL_URL,
          preferred: isMobile(),
        });
      }
      return list;
    }

    /* ---------- CONNECT dispatcher ---------- */
    async connect(provider){
      provider = provider || this.preferredProvider();
      switch (provider){
        case 'gemwallet': return this.connectGem();
        case 'xaman':     return this.connectXaman();
        case 'demo':      return this.connectDemo();
        default: throw new Error('UNKNOWN_PROVIDER');
      }
    }

    /* Returns true if the connected wallet is also the configured
       treasury (source == destination). XRPL rejects such tx so we
       have to skip real payments and credit packs directly. */
    isSelfTreasury(){
      const cfg = window.TAMA_CONFIG;
      if (!cfg || !cfg.TREASURY_ADDRESS || !this.address) return false;
      return this.address === cfg.TREASURY_ADDRESS;
    }

    /* ---------- GemWallet ---------- */
    async connectGem(){
      const cfg = window.TAMA_CONFIG;
      const installed = await isGemInstalled();
      if (!installed){
        const err = new Error('GEMWALLET_NOT_INSTALLED');
        err.installUrl = cfg.GEMWALLET_INSTALL_URL;
        throw err;
      }
      const res = await window.GemWalletApi.getAddress();
      const address = res && res.result && res.result.address;
      if (!address) throw new Error('GEMWALLET_REJECTED');

      let network = cfg.XRPL_NETWORK;
      try{
        if (typeof window.GemWalletApi.getNetwork === 'function'){
          const n = await window.GemWalletApi.getNetwork();
          if (n && n.result && n.result.network){
            network = String(n.result.network).toLowerCase();
          }
        }
      }catch(e){}

      this.address = address;
      this.network = network;
      this.provider = 'gemwallet';
      this.connected = true;
      this._save();
      return address;
    }

    /* ---------- Xaman ----------
       Two paths:
         1. Client-side XummPkce (preferred, works on mobile
            without any backend — uses the user's XAMAN_APP_KEY).
         2. Backend flow (legacy, requires API_BASE_URL +
            XUMM secret on the server).
       We try PKCE first and fall back to backend if it's not
       loaded or the config is missing. */
    async connectXaman(){
      const cfg = window.TAMA_CONFIG || {};

      // ---- 1. Client-side PKCE (no backend needed) ----
      if (cfg.XAMAN_APP_KEY && await this._waitForXummPkce()){
        try {
          return await this._connectXamanPkce();
        } catch (e) {
          console.warn('[TamaWallet] XummPkce sign-in failed:', e.message || e);
          if (e.message === 'XUMM_CANCELLED') throw e;
          // else fall through to backend attempt
        }
      }

      // ---- 2. Backend flow ----
      if (!apiBase()){
        // Neither PKCE nor backend available → tell the user how to set it up
        const err = new Error('XAMAN_NOT_CONFIGURED');
        err.userMessage = cfg.XAMAN_APP_KEY
          ? 'Xaman SDK failed to load. Check your connection.'
          : 'Set XAMAN_APP_KEY in config.js (https://apps.xaman.dev/).';
        throw err;
      }
      return await this._connectXamanBackend();
    }

    async _waitForXummPkce(timeoutMs = 3000){
      if (window.XummPkce) return true;
      return new Promise(resolve => {
        let done = false;
        const finish = v => { if (!done){ done = true; resolve(v); } };
        document.addEventListener('xumm-ready', () => finish(true), { once:true });
        const start = Date.now();
        const iv = setInterval(() => {
          if (window.XummPkce){ clearInterval(iv); finish(true); }
          else if (window.__xummReady === false){ clearInterval(iv); finish(false); }
          else if (Date.now() - start > timeoutMs){ clearInterval(iv); finish(!!window.XummPkce); }
        }, 120);
      });
    }

    async _connectXamanPkce(){
      const cfg = window.TAMA_CONFIG;
      if (!window.XummPkce) throw new Error('XUMM_SDK_MISSING');
      // `implicit: true` skips the OAuth redirect/popup loop on
      // platforms that support direct in-app callbacks.
      const xumm = new window.XummPkce(cfg.XAMAN_APP_KEY, {
        implicit: true,
      });
      // Some versions of the SDK expose an event-based API,
      // others return a promise. Handle both.
      let authorized;
      try {
        authorized = await xumm.authorize();
      } catch (e) {
        throw new Error('XUMM_CANCELLED');
      }
      if (!authorized && typeof xumm.state === 'function'){
        authorized = await xumm.state();
      }
      if (!authorized){
        throw new Error('XUMM_NO_AUTH');
      }
      const account = authorized.me?.account
                   || authorized.account
                   || authorized.jwt_data?.sub
                   || null;
      if (!account) throw new Error('XUMM_NO_ACCOUNT');

      this._xummInstance   = xumm;
      this._xummAuthorized = authorized;
      this.address  = account;
      this.network  = cfg.XRPL_NETWORK || 'mainnet';
      this.provider = 'xaman';
      this.connected = true;
      this._save();
      return this.address;
    }

    async _connectXamanBackend(){
      // 1. Ask the backend for a sign-in payload
      const payload = await apiCall('/api/xaman/signin', { method:'POST' });
      if (!payload || !payload.uuid){
        throw new Error('XUMM_SIGNIN_FAILED');
      }
      // 2. Show QR + deeplink to the user
      if (this._xamanUI && this._xamanUI.show){
        this._xamanUI.show({
          title:'SIGN IN WITH XAMAN',
          subtitle:'Open Xaman → scan this code',
          qr: payload.refs.qrPng,
          deeplink: payload.next,
        });
      }
      // 3. Poll the backend until the user signs
      let status;
      try{
        status = await pollXamanPayload(payload.uuid, (s)=>{
          if (this._xamanUI && this._xamanUI.update) this._xamanUI.update(s);
        });
      } finally {
        if (this._xamanUI && this._xamanUI.hide) this._xamanUI.hide();
      }
      if (!status || !status.account){
        throw new Error('XUMM_NO_ACCOUNT');
      }
      this.address = status.account;
      this.network = (window.TAMA_CONFIG && window.TAMA_CONFIG.XRPL_NETWORK) || 'mainnet';
      this.provider = 'xaman';
      this.connected = true;
      this._save();
      return this.address;
    }

    /* ---------- Xaman MANUAL (user-typed address) ----------
       Simplest possible Xaman flow: the user pastes their XRPL
       address (copied from the Xaman app) and we treat it as a
       connected wallet. No backend, no PKCE, no SDK required.

       Limitations:
         - cannot sign transactions — so real-XRP purchases are
           disabled. In-game actions (Scii Coins) still work.
         - we can't verify the user actually owns the address,
           so this mode is best-effort. */
    async connectXamanManual(address){
      if (!address || !/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address)){
        throw new Error('INVALID_ADDRESS');
      }
      this.address = address;
      this.network = (window.TAMA_CONFIG && window.TAMA_CONFIG.XRPL_NETWORK) || 'mainnet';
      this.provider = 'xaman-manual';
      this.connected = true;
      this._save();
      return this.address;
    }

    /* ---------- Demo ---------- */
    async connectDemo(){
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

    /* ============================================================
       PAY — dispatches based on the active provider
    ============================================================ */
    async pay(amountXRP, memo, action){
      if (!this.connected) throw new Error('WALLET_NOT_CONNECTED');
      if (amountXRP <= 0) return { success:true, hash:'free', amount:0, memo };

      switch (this.provider){
        case 'gemwallet':     return this._payGem(amountXRP, memo);
        case 'xaman':         return this._payXaman(amountXRP, memo, action);
        case 'xaman-manual':
          // Manual (paste-address) mode can't sign transactions.
          // The caller should handle this error by falling back
          // (e.g. dev-mode credit in the shop).
          throw new Error('MANUAL_MODE_CANNOT_SIGN');
        case 'demo':          return this._payDemo(amountXRP, memo);
        default: throw new Error('UNKNOWN_PROVIDER');
      }
    }

    async _payGem(amountXRP, memo){
      const cfg = window.TAMA_CONFIG;
      // XRPL refuses tx where source == destination. Detect upfront
      // with a dedicated error so the caller can fall back to a
      // "dev mode" credit without opening the wallet popup.
      if (this.isSelfTreasury()){
        throw new Error('SELF_TREASURY');
      }
      if (!window.GemWalletApi || typeof window.GemWalletApi.sendPayment !== 'function'){
        throw new Error('GEMWALLET_UNAVAILABLE');
      }
      const payload = {
        amount: xrpToDrops(amountXRP),
        destination: cfg.TREASURY_ADDRESS,
      };
      if (cfg.DESTINATION_TAG) payload.destinationTag = cfg.DESTINATION_TAG;
      if (memo){
        const enc = s => Array.from(new TextEncoder().encode(s))
          .map(b=>b.toString(16).padStart(2,'0')).join('');
        payload.memos = [{
          memo:{
            memoType: enc('tamagoscii'),
            memoData: enc(String(memo)),
          }
        }];
      }
      const res = await window.GemWalletApi.sendPayment(payload);
      if (!res || !res.result || !res.result.hash) throw new Error('TX_REJECTED');
      return { success:true, hash:res.result.hash, amount:amountXRP, memo };
    }

    async _payXaman(amountXRP, memo, action){
      const cfg = window.TAMA_CONFIG;
      if (this.isSelfTreasury()) throw new Error('SELF_TREASURY');

      // ---- Prefer client-side PKCE payload if authorized ----
      if (this._xummAuthorized && this._xummAuthorized.sdk){
        try {
          return await this._payXamanPkce(amountXRP, memo, action);
        } catch (e) {
          console.warn('[TamaWallet] PKCE payment failed, trying backend', e.message || e);
          if (e.message === 'XUMM_CANCELLED') throw e;
        }
      }

      // ---- Backend fallback ----
      if (!apiBase()) throw new Error('XAMAN_BACKEND_REQUIRED');
      if (!action) throw new Error('XAMAN_REQUIRES_ACTION');

      const payload = await apiCall('/api/xaman/payment', {
        method:'POST',
        body:{ action },
      });
      if (!payload || !payload.uuid) throw new Error('XUMM_PAYMENT_FAILED');

      if (this._xamanUI && this._xamanUI.show){
        this._xamanUI.show({
          title:'CONFIRM PAYMENT',
          subtitle:`${amountXRP} XRP · ${String(action).toUpperCase()}`,
          qr: payload.refs.qrPng,
          deeplink: payload.next,
        });
      }
      let status;
      try{
        status = await pollXamanPayload(payload.uuid, (s)=>{
          if (this._xamanUI && this._xamanUI.update) this._xamanUI.update(s);
        });
      } finally {
        if (this._xamanUI && this._xamanUI.hide) this._xamanUI.hide();
      }
      if (!status || !status.signed || !status.txid){
        throw new Error('XUMM_NOT_SIGNED');
      }
      return { success:true, hash:status.txid, amount:amountXRP, memo };
    }

    async _payXamanPkce(amountXRP, memo, action){
      const cfg = window.TAMA_CONFIG;
      const sdk = this._xummAuthorized?.sdk;
      if (!sdk || typeof sdk.payload?.create !== 'function'){
        throw new Error('XUMM_SDK_INCOMPLETE');
      }
      const txjson = {
        TransactionType: 'Payment',
        Destination: cfg.TREASURY_ADDRESS,
        Amount: xrpToDrops(amountXRP),
      };
      if (cfg.DESTINATION_TAG) txjson.DestinationTag = cfg.DESTINATION_TAG;
      if (action || memo){
        const enc = s => Array.from(new TextEncoder().encode(String(s)))
          .map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
        txjson.Memos = [{
          Memo:{
            MemoType: enc('tamagoscii'),
            MemoData: enc(action || memo || 'pay'),
          }
        }];
      }
      const payload = await sdk.payload.create(txjson);
      if (!payload || !payload.uuid) throw new Error('XUMM_PAYLOAD_FAILED');

      // Show QR on desktop, or auto-open the app on mobile
      if (this._xamanUI && this._xamanUI.show){
        this._xamanUI.show({
          title:'CONFIRM PAYMENT',
          subtitle:`${amountXRP} XRP`,
          qr: payload.refs?.qr_png,
          deeplink: payload.next?.always,
        });
      }
      if (isMobile() && payload.next?.always){
        // On mobile, open the Xaman deep-link automatically
        window.location.href = payload.next.always;
      }

      // Wait for resolution via the PKCE SDK subscribe helper
      let resolved;
      try {
        if (typeof payload.resolved === 'object' && typeof payload.resolved.then === 'function'){
          resolved = await payload.resolved;
        } else if (typeof sdk.payload.subscribe === 'function'){
          const sub = await sdk.payload.subscribe(payload.uuid);
          resolved = await sub.resolved;
        } else if (payload.refs?.websocket_status){
          resolved = await new Promise((res, rej) => {
            const ws = new WebSocket(payload.refs.websocket_status);
            const t = setTimeout(() => rej(new Error('XUMM_TIMEOUT')), 5*60*1000);
            ws.onmessage = (msg) => {
              try {
                const d = JSON.parse(msg.data);
                if (d.signed === true){ clearTimeout(t); ws.close(); res(d); }
                else if (d.signed === false || d.cancelled || d.expired){
                  clearTimeout(t); ws.close(); rej(new Error('XUMM_CANCELLED'));
                }
              } catch(e){ /* ignore non-JSON heartbeats */ }
            };
            ws.onerror = () => { clearTimeout(t); rej(new Error('XUMM_WS_ERROR')); };
          });
        } else {
          throw new Error('XUMM_NO_POLLING');
        }
      } finally {
        if (this._xamanUI && this._xamanUI.hide) this._xamanUI.hide();
      }

      if (!resolved || resolved.signed === false){
        throw new Error('XUMM_CANCELLED');
      }
      const txid = resolved.txid || resolved.response?.txid || resolved.txblob;
      return { success:true, hash: txid || 'xumm_ok', amount: amountXRP, memo };
    }

    async _payDemo(amountXRP, memo){
      if (this.demoBalance < amountXRP) throw new Error('INSUFFICIENT_XRP');
      await new Promise(r => setTimeout(r, 120));
      this.demoBalance = Math.round((this.demoBalance - amountXRP) * 1e6) / 1e6;
      this._save();
      return {
        success:true,
        hash:'demo_' + Math.random().toString(16).slice(2,12).toUpperCase(),
        amount:amountXRP,
        memo,
      };
    }

    /* ---------- Profile / storage ---------- */
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
  window.TamaIsMobile = isMobile;
})();
