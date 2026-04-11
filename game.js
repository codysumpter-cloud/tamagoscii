/* ============================================================
   TAMAGOSCII - Game logic
   Stats, actions, mood, leveling, XRPL micro-tx, Scii Coins,
   share, minigame, achievements, persistence.
============================================================ */

(function(){
  'use strict';

  // ---------- Constants ----------
  const STORAGE_STATE = 'tamagoscii:state';
  const DECAY_INTERVAL = 10_000; // 10s per tick
  const DECAY_RATES = { hunger:2, happy:1.5, energy:1, hygiene:1 };
  // Prices come from window.TAMA_CONFIG so they can be changed in one place.
  const PRICES = (window.TAMA_CONFIG && window.TAMA_CONFIG.PRICES) || {
    feed:0.01, play:0.02, sleep:0.01, clean:0.01, pet:0,
  };
  const ACTION_COST_XRP = {
    feed:PRICES.feed, play:PRICES.play, sleep:PRICES.sleep,
    clean:PRICES.clean, pet:PRICES.pet || 0,
  };
  const ACTION_REWARD_COINS = {
    feed:5, play:8, sleep:4, clean:4, pet:2,
  };
  const FOODS = {
    apple:{ hunger:15, happy:2 },
    cake:{ hunger:25, happy:8, hygiene:-4 },
    salad:{ hunger:10, happy:1, energy:3 },
    pizza:{ hunger:30, happy:5, hygiene:-5 },
    candy:{ hunger:20, happy:10, hygiene:-2 },
    sushi:{ hunger:35, happy:6 },
  };

  const ACHIEVEMENTS = [
    { id:'hatch',    name:'First Hatch',    desc:'Connect your XRPL wallet',            icon:'🥚' },
    { id:'first_feed', name:'Nom Nom',       desc:'Feed your pet for the first time',    icon:'🍎' },
    { id:'first_play', name:'Playful Soul',  desc:'Play with your pet',                  icon:'🎮' },
    { id:'lvl5',     name:'Growing Up',     desc:'Reach level 5',                       icon:'📈' },
    { id:'lvl10',    name:'Mature Scii',    desc:'Reach level 10',                      icon:'👑' },
    { id:'rich',     name:'Scii Whale',     desc:'Own 2000 Scii Coins',                 icon:'💎' },
    { id:'lover',    name:'Best Friend',    desc:'Pet 20 times',                        icon:'💕' },
    { id:'shared',   name:'Proud Parent',   desc:'Share your creature',                 icon:'↗'  },
    { id:'clean_freak', name:'Clean Freak', desc:'Reach 100 hygiene',                   icon:'🧼' },
    { id:'minigame', name:'Pixel Catcher',  desc:'Win a minigame',                      icon:'★'  },
  ];

  // ---------- State ----------
  let state = null;
  let creature = null;
  let decayTimer = null;
  let selectedFood = 'apple';
  let petCount = 0;

  function defaultState(){
    return {
      hunger:80, happy:80, energy:90, hygiene:90,
      score:100, coins:500, level:1, xp:0,
      birth: Date.now(),
      mood:'content',
      achievements:{},
      pseudo:null,
      creatureProfile:null,
    };
  }
  function loadState(){
    try{
      const s = JSON.parse(localStorage.getItem(STORAGE_STATE));
      if (s && typeof s === 'object') return Object.assign(defaultState(), s);
    }catch(e){}
    return null;
  }
  function saveState(){
    localStorage.setItem(STORAGE_STATE, JSON.stringify(state));
  }

  // ---------- Helpers ----------
  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);
  function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
  function toast(msg, color){
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    if (color) el.style.borderColor = el.style.color = color;
    document.body.appendChild(el);
    setTimeout(()=>el.remove(), 2600);
  }
  function floatText(txt, color){
    const el = $('#floating-text');
    el.textContent = txt;
    if (color) el.style.color = color;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }
  function spawnParticle(char, color){
    const container = $('#particles');
    const p = document.createElement('div');
    p.className = 'particle';
    p.textContent = char;
    if (color) p.style.color = color;
    const rect = container.getBoundingClientRect();
    const x = Math.random()*rect.width*0.7 + rect.width*0.15;
    const y = rect.height*0.6 + Math.random()*20;
    p.style.left = x+'px';
    p.style.top = y+'px';
    p.style.setProperty('--dx', (Math.random()*80-40)+'px');
    p.style.setProperty('--dy', -(40+Math.random()*50)+'px');
    container.appendChild(p);
    setTimeout(()=>p.remove(), 1600);
  }
  function formatAge(ms){
    const s = Math.floor(ms/1000);
    if (s < 60) return s+'SEC';
    const m = Math.floor(s/60);
    if (m < 60) return m+'MIN';
    const h = Math.floor(m/60);
    if (h < 24) return h+'H'+(m%60)+'M';
    const d = Math.floor(h/24);
    return d+'D'+(h%24)+'H';
  }

  // ---------- Mood ----------
  function computeMood(){
    const avg = (state.hunger + state.happy + state.energy + state.hygiene)/4;
    if (state.hunger < 20) return 'hungry';
    if (state.hygiene < 20) return 'dirty';
    if (state.energy < 20) return 'sleeping';
    if (state.happy < 20) return 'sad';
    if (avg > 85) return 'happy';
    if (avg > 60) return 'content';
    if (avg > 35) return 'sad';
    if (avg < 10) return 'dead';
    return 'angry';
  }

  // ---------- Render ----------
  function render(){
    // Bars
    const stats = ['hunger','happy','energy','hygiene'];
    stats.forEach(s=>{
      const v = Math.round(state[s]);
      $('#bar-'+s).style.width = v+'%';
      $('#val-'+s).textContent = v;
    });
    $('#score-value').textContent = state.score;
    $('#coins-value').textContent = state.coins;
    $('#level-value').textContent = state.level;
    $('#age-value').textContent = formatAge(Date.now() - state.birth);

    // Mood
    state.mood = computeMood();
    $('#mood-label').textContent = state.mood.toUpperCase();
    const moodColors = {
      happy:'#4bf58a', content:'#c66dff', hungry:'#ff8c38',
      sad:'#4b9cff', sleeping:'#36e0f5', dirty:'#7a5b1c',
      angry:'#ff4b6e', dead:'#555', loved:'#ff2d7a', playing:'#f6e24b',
    };
    $('#mood-label').style.color = moodColors[state.mood] || '#c66dff';

    // Creature
    const el = $('#creature');
    el.textContent = creature.render(state.mood);
    if (creature.color) el.style.color = creature.color.hex;

    // Profile
    $('#profile-pseudo').textContent = state.pseudo || 'GUEST';
    $('#profile-addr').textContent = window.TamaShortAddr(window.TamaWallet.address);
    const netEl = $('#profile-network');
    if (netEl){
      const p = window.TamaWallet.provider;
      const n = window.TamaWallet.network || 'mainnet';
      netEl.textContent = (p === 'gemwallet' ? '◈ '+n.toUpperCase() : '◈ DEMO');
      netEl.style.color = (p === 'gemwallet') ? '#4bf58a' : '#f6e24b';
    }
  }

  // ---------- Game ticks ----------
  function tick(){
    if (state.mood === 'dead') return;
    state.hunger  = clamp(state.hunger - DECAY_RATES.hunger,   0, 100);
    state.happy   = clamp(state.happy  - DECAY_RATES.happy,    0, 100);
    state.energy  = clamp(state.energy - DECAY_RATES.energy,   0, 100);
    state.hygiene = clamp(state.hygiene- DECAY_RATES.hygiene,  0, 100);
    // Score slowly drifts toward stats average
    const avg = (state.hunger + state.happy + state.energy + state.hygiene)/4;
    if (avg > 60) state.score += 1;
    else if (avg < 30) state.score = Math.max(0, state.score - 2);
    saveState();
    render();
    checkAchievements();
    // Ambient reaction on poor state
    if (avg < 25) window.TamaAudio.sfx('sad');
  }

  // ---------- Actions ----------
  async function doAction(action){
    const cost = ACTION_COST_XRP[action];
    try{
      if (cost > 0){
        const tx = await window.TamaWallet.pay(cost, 'tamagoscii:'+action, action);
        if (tx && tx.hash && !tx.hash.startsWith('demo_') && tx.hash !== 'free'){
          toast('TX '+tx.hash.slice(0,10)+'…','#4bf58a');
        }
      }
    }catch(e){
      toast('TX FAILED: '+(e.message||'error'), '#ff4b6e');
      window.TamaAudio.sfx('error');
      return;
    }

    const el = $('#creature');
    switch(action){
      case 'feed':{
        const f = FOODS[selectedFood];
        state.hunger = clamp(state.hunger + f.hunger, 0, 100);
        state.happy  = clamp(state.happy  + (f.happy||0), 0, 100);
        if (f.hygiene) state.hygiene = clamp(state.hygiene + f.hygiene, 0, 100);
        if (f.energy)  state.energy  = clamp(state.energy  + f.energy,  0, 100);
        spawnParticle('✦','#f6e24b'); spawnParticle('♦','#ff2d7a'); spawnParticle('♥','#ff2d7a');
        el.classList.remove('bounce'); void el.offsetWidth; el.classList.add('bounce');
        floatText('+'+f.hunger+' HUNGER','#ff2d7a');
        window.TamaAudio.sfx('feed');
        unlock('first_feed');
        break;
      }
      case 'play':{
        state.happy = clamp(state.happy + 20, 0, 100);
        state.energy = clamp(state.energy - 8, 0, 100);
        state.hygiene = clamp(state.hygiene - 3, 0, 100);
        ['★','✦','♪','♫'].forEach(c=>spawnParticle(c,'#f6e24b'));
        el.classList.remove('bounce'); void el.offsetWidth; el.classList.add('bounce');
        floatText('+20 HAPPY','#f6e24b');
        window.TamaAudio.sfx('play');
        unlock('first_play');
        break;
      }
      case 'sleep':{
        state.energy = clamp(state.energy + 40, 0, 100);
        state.happy  = clamp(state.happy - 3, 0, 100);
        ['z','Z','z'].forEach(c=>spawnParticle(c,'#36e0f5'));
        floatText('+40 ENERGY','#36e0f5');
        window.TamaAudio.sfx('sleep');
        break;
      }
      case 'clean':{
        state.hygiene = clamp(state.hygiene + 40, 0, 100);
        state.happy = clamp(state.happy - 2, 0, 100);
        ['~','*','•'].forEach(c=>spawnParticle(c,'#4bf58a'));
        floatText('+40 HYGIENE','#4bf58a');
        window.TamaAudio.sfx('clean');
        if (state.hygiene >= 100) unlock('clean_freak');
        break;
      }
      case 'pet':{
        state.happy = clamp(state.happy + 6, 0, 100);
        petCount++;
        ['♥','♥','♥'].forEach(c=>spawnParticle(c,'#ff2d7a'));
        el.classList.remove('bounce'); void el.offsetWidth; el.classList.add('bounce');
        floatText('+6 HAPPY','#ff2d7a');
        window.TamaAudio.sfx('pet');
        if (petCount >= 20) unlock('lover');
        break;
      }
    }

    // Rewards
    const caring = (state.hunger + state.happy + state.energy + state.hygiene)/4;
    let reward = ACTION_REWARD_COINS[action];
    if (caring > 70) reward = Math.round(reward * 1.5);
    if (caring > 90) reward = Math.round(reward * 2);
    if (reward > 0){
      state.coins += reward;
      state.xp    += reward;
      state.score += Math.round(reward/2);
      window.TamaAudio.sfx('coin');
    } else {
      // Pet has no cost but still gives score
      state.xp += 1;
      state.score += 1;
    }

    // Level up
    const xpNeeded = state.level * 50;
    if (state.xp >= xpNeeded){
      state.xp -= xpNeeded;
      state.level++;
      toast('LEVEL UP! LV.'+state.level,'#f6e24b');
      window.TamaAudio.sfx('levelup');
      if (state.level >= 5) unlock('lvl5');
      if (state.level >= 10) unlock('lvl10');
    }

    saveState();
    render();
    checkAchievements();
  }

  // ---------- Achievements ----------
  function unlock(id){
    if (state.achievements[id]) return;
    state.achievements[id] = Date.now();
    const ach = ACHIEVEMENTS.find(a=>a.id===id);
    if (ach){
      toast('★ '+ach.name,'#f6e24b');
      window.TamaAudio.sfx('levelup');
    }
    saveState();
  }
  function checkAchievements(){
    if (state.coins >= 2000) unlock('rich');
  }

  // ---------- Modals ----------
  function openModal(tplId, setup){
    const root = $('#modal-root');
    root.innerHTML = '';
    const tpl = document.getElementById(tplId);
    const node = tpl.content.firstElementChild.cloneNode(true);
    root.appendChild(node);
    root.classList.add('active');
    node.querySelector('.modal-close').onclick = closeModal;
    root.onclick = (e)=>{ if (e.target === root) closeModal(); };
    if (setup) setup(node);
  }
  function closeModal(){
    const root = $('#modal-root');
    root.classList.remove('active');
    root.innerHTML = '';
  }

  function openShop(){
    openModal('tpl-shop', node=>{
      node.querySelectorAll('.shop-item .buy').forEach(btn=>{
        btn.addEventListener('click', async()=>{
          const item = btn.closest('.shop-item');
          const xrp = parseFloat(item.dataset.xrp);
          const coins = parseInt(item.dataset.coins,10);
          try{
            await window.TamaWallet.pay(xrp,'tamagoscii:pack');
            state.coins += coins;
            saveState(); render();
            window.TamaAudio.sfx('coin');
            toast('+'+coins+' ⬢ SCII COINS','#f6e24b');
          }catch(e){
            toast('TX FAILED: '+e.message,'#ff4b6e');
            window.TamaAudio.sfx('error');
          }
        });
      });
    });
  }

  function openShare(){
    openModal('tpl-share', node=>{
      const url = new URL(window.location.href);
      const params = new URLSearchParams();
      params.set('seed', window.TamaWallet.address);
      if (state.pseudo) params.set('pseudo', state.pseudo);
      url.hash = params.toString();
      const shareUrl = url.toString();
      const text = encodeURIComponent(`Meet my Tamagoscii (タマゴッシー) - my ASCII pet on XRPL!`);
      const enc = encodeURIComponent(shareUrl);
      node.querySelector('#share-url').value = shareUrl;
      const actions = {
        copy: ()=>{ navigator.clipboard.writeText(shareUrl).then(()=>toast('URL COPIED','#4bf58a')); },
        twitter: ()=>window.open(`https://twitter.com/intent/tweet?text=${text}&url=${enc}`,'_blank'),
        facebook: ()=>window.open(`https://www.facebook.com/sharer/sharer.php?u=${enc}`,'_blank'),
        telegram: ()=>window.open(`https://t.me/share/url?url=${enc}&text=${text}`,'_blank'),
        whatsapp: ()=>window.open(`https://wa.me/?text=${text}%20${enc}`,'_blank'),
      };
      node.querySelectorAll('[data-share]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const k = btn.dataset.share;
          if (actions[k]) actions[k]();
          unlock('shared');
          window.TamaAudio.sfx('click');
        });
      });
    });
  }

  function openAchievements(){
    openModal('tpl-achievements', node=>{
      const list = node.querySelector('#ach-list');
      ACHIEVEMENTS.forEach(a=>{
        const li = document.createElement('li');
        if (state.achievements[a.id]) li.classList.add('unlocked');
        li.innerHTML = `
          <span class="ach-icon">${a.icon}</span>
          <div class="ach-info">
            <span class="ach-name">${a.name}</span>
            <span class="ach-desc">${a.desc}</span>
          </div>`;
        list.appendChild(li);
      });
    });
  }

  function openMinigame(){
    openModal('tpl-minigame', node=>{
      const arena = node.querySelector('#mg-arena');
      const timeEl = node.querySelector('#mg-time');
      const scoreEl = node.querySelector('#mg-score');
      const startBtn = node.querySelector('#mg-start');
      let score = 0, t = 10, tg = null, tick = null;
      function spawn(){
        arena.innerHTML = '';
        const el = document.createElement('div');
        el.className = 'mg-target';
        const rect = arena.getBoundingClientRect();
        const x = Math.random()*(rect.width-28);
        const y = Math.random()*(rect.height-28);
        el.style.left = x+'px';
        el.style.top = y+'px';
        el.onclick = (e)=>{
          e.stopPropagation();
          score++;
          scoreEl.textContent = score;
          window.TamaAudio.sfx('coin');
          spawn();
        };
        arena.appendChild(el);
      }
      startBtn.onclick = ()=>{
        score = 0; t = 10;
        timeEl.textContent = t;
        scoreEl.textContent = score;
        startBtn.disabled = true;
        spawn();
        tick = setInterval(()=>{
          t--;
          timeEl.textContent = t;
          if (t <= 0){
            clearInterval(tick);
            arena.innerHTML = '';
            startBtn.disabled = false;
            const reward = score * 3;
            state.coins += reward;
            saveState(); render();
            toast('+'+reward+' ⬢ SCII','#f6e24b');
            if (score > 0) unlock('minigame');
          }
        },1000);
      };
    });
  }

  // ---------- Audio bar wiring ----------
  function setupAudioBar(){
    const audio = window.TamaAudio;
    audio.onUpdate(()=>{
      const name = audio.currentTrackName();
      $('#track-title').textContent = name ? name.toUpperCase() : '— LOAD YOUR MUSIC (♪+) —';
      $('#audio-play').textContent = audio.playing ? '⏸' : '▶';
      if (audio.audio.duration){
        const pct = (audio.audio.currentTime / audio.audio.duration) * 100;
        $('#track-progress-fill').style.width = pct+'%';
      } else {
        $('#track-progress-fill').style.width = '0%';
      }
    });
    $('#audio-play').addEventListener('click', ()=>audio.toggle());
    $('#audio-next').addEventListener('click', ()=>audio.next());
    $('#audio-prev').addEventListener('click', ()=>audio.prev());
    $('#volume').addEventListener('input', (e)=>audio.setVolume(e.target.value/100));
    $('#audio-file').addEventListener('change', (e)=>{
      if (e.target.files?.length){
        audio.loadTracks(e.target.files);
        audio.play();
        toast('MUSIC LOADED','#4bf58a');
      }
    });
    $('#sfx-toggle').addEventListener('click', ()=>{
      audio.setSfxEnabled(!audio.sfxEnabled);
      $('#sfx-toggle').textContent = audio.sfxEnabled ? '🔊' : '🔇';
      toast('SFX '+(audio.sfxEnabled?'ON':'OFF'),'#36e0f5');
    });
    audio.setVolume(0.6);
    audio._emit();
  }

  // ---------- Login flow ----------
  function afterConnected(addr){
    $('#addr-preview').textContent = window.TamaShortAddr(addr);
    $('#login-actions').classList.add('hidden');
    $('#pseudo-form').classList.remove('hidden');
    const stored = window.TamaWallet.getPseudo();
    if (stored) $('#pseudo-input').value = stored;
    setTimeout(()=>$('#pseudo-input')?.focus(), 50);
  }

  async function doConnect(provider){
    window.TamaAudio.sfx('connect');
    const btn = document.querySelector(`.wallet-btn[data-provider="${provider}"]`);
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn){
      btn.disabled = true;
      btn.classList.add('connecting');
    }
    try{
      const addr = await window.TamaWallet.connect(provider);
      afterConnected(addr);
    }catch(e){
      if (btn){
        btn.disabled = false;
        btn.classList.remove('connecting');
        btn.innerHTML = originalHtml;
      }
      window.TamaAudio.sfx('error');
      const msg = e?.message || 'CONNECTION_FAILED';
      console.warn('[connect]', msg, e);

      if (msg === 'GEMWALLET_NOT_INSTALLED'){
        toast('GEMWALLET NOT INSTALLED','#ff4b6e');
        const link = $('#install-gem');
        if (link){
          link.href = (window.TAMA_CONFIG && window.TAMA_CONFIG.GEMWALLET_INSTALL_URL)
            || 'https://gemwallet.app/';
          link.classList.remove('hidden');
        }
      } else if (msg === 'GEMWALLET_REJECTED'){
        toast('CONNECTION REJECTED','#ff4b6e');
      } else if (msg === 'XAMAN_BACKEND_REQUIRED'){
        toast('BACKEND REQUIRED FOR XAMAN','#ff4b6e');
      } else if (msg === 'XUMM_DISABLED'){
        toast('XAMAN DISABLED ON BACKEND','#ff4b6e');
      } else if (msg === 'XUMM_CANCELLED'){
        toast('SIGN-IN CANCELLED','#ff4b6e');
      } else if (msg === 'XUMM_TIMEOUT'){
        toast('SIGN-IN TIMED OUT','#ff4b6e');
      } else {
        toast('CONNECTION FAILED','#ff4b6e');
      }
    }
  }

  async function doConnectDemo(){
    window.TamaAudio.sfx('connect');
    try{
      const addr = await window.TamaWallet.connectDemo();
      toast('DEMO MODE — NOT ON-CHAIN','#f6e24b');
      afterConnected(addr);
    }catch(e){
      toast('DEMO INIT FAILED','#ff4b6e');
    }
  }

  /* ---------- Xaman QR modal (used by wallet.js) ---------- */
  function setupXamanUI(){
    const ui = {
      _node: null,
      show({ title, subtitle, qr, deeplink }){
        const root = $('#modal-root');
        root.innerHTML = '';
        const tpl = document.getElementById('tpl-xaman');
        const node = tpl.content.firstElementChild.cloneNode(true);
        root.appendChild(node);
        root.classList.add('active');
        this._node = node;
        node.querySelector('#xaman-title').textContent = title || 'XAMAN';
        node.querySelector('#xaman-subtitle').textContent = subtitle || '';
        node.querySelector('#xaman-qr').src = qr || '';
        const dl = node.querySelector('#xaman-deeplink');
        if (deeplink){ dl.href = deeplink; dl.classList.remove('hidden'); }
        else          { dl.classList.add('hidden'); }
        node.querySelector('.modal-close').onclick = ()=>{
          closeModal();
          // we don't reject the pending promise here — let it timeout naturally
        };
      },
      update(status){
        if (!this._node) return;
        const el = this._node.querySelector('#xaman-status');
        if (!el) return;
        if (status.resolved && status.signed) el.textContent = 'SIGNED ✓';
        else if (status.cancelled)             el.textContent = 'CANCELLED';
        else if (status.expired)               el.textContent = 'EXPIRED';
        else                                   el.textContent = 'Waiting for signature…';
      },
      hide(){
        closeModal();
        this._node = null;
      },
    };
    window.TamaWallet.setXamanUI(ui);
  }

  function doConfirmPseudo(){
    const input = $('#pseudo-input');
    const p = (input.value || '').trim() || 'SCII_'+Math.floor(Math.random()*9999);
    window.TamaWallet.setPseudo(p);

    // Load or create state
    let loaded = loadState();
    if (!loaded) loaded = defaultState();
    loaded.pseudo = p;
    state = loaded;

    // Seed creature from wallet address (deterministic)
    const seedParam = (new URLSearchParams(window.location.hash.slice(1))).get('seed');
    const seed = seedParam || window.TamaWallet.address;
    creature = new window.TamaCreature(seed);
    state.creatureProfile = creature.getProfile();
    saveState();
    unlock('hatch');

    // Switch screens
    $('#login-screen').classList.remove('active');
    $('#game-screen').classList.add('active');
    window.TamaAudio.sfx('boot');

    startGame();
  }

  // ---------- Start ----------
  function startGame(){
    render();
    if (decayTimer) clearInterval(decayTimer);
    decayTimer = setInterval(tick, DECAY_INTERVAL);

    // Reflect configured prices on action buttons
    $$('.action').forEach(btn=>{
      const a = btn.dataset.action;
      const cost = ACTION_COST_XRP[a];
      const label = btn.querySelector('.action-cost');
      if (label) label.textContent = (cost > 0) ? (cost + ' XRP') : 'FREE';
    });
    // Action buttons
    $$('.action').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const a = btn.dataset.action;
        doAction(a);
      });
    });
    // Food items
    $$('.food-item').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        $$('.food-item').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedFood = btn.dataset.food;
        window.TamaAudio.sfx('click');
      });
    });
    // Stage click = pet interaction
    $('#stage-frame').addEventListener('click', ()=>doAction('pet'));
    // Fun buttons
    $('#btn-shop').addEventListener('click', openShop);
    $('#btn-share').addEventListener('click', openShare);
    $('#btn-achievements').addEventListener('click', openAchievements);
    $('#btn-minigame').addEventListener('click', openMinigame);
  }

  // ---------- Bootstrap ----------
  function init(){
    setupAudioBar();

    // Auto-load the music manifest from ./music/tracks.json (if any).
    const cfg = window.TAMA_CONFIG || {};
    if (cfg.MUSIC_MANIFEST){
      window.TamaAudio.loadManifest(cfg.MUSIC_MANIFEST, cfg.MUSIC_DIR).then(n=>{
        if (n > 0){
          toast('LOADED '+n+' TRACK'+(n>1?'S':''),'#4bf58a');
        }
      });
    }

    // Wire up the XRPL QR modal used by wallet.js for Xaman flows
    setupXamanUI();

    // Reorder wallet buttons so the recommended one for the
    // current platform comes first.
    const picker = $('#wallet-picker');
    const preferred = window.TamaWallet.preferredProvider();
    if (picker){
      const gem   = picker.querySelector('[data-provider="gemwallet"]');
      const xaman = picker.querySelector('[data-provider="xaman"]');
      picker.innerHTML = '';
      if (preferred === 'xaman'){
        if (xaman) picker.appendChild(xaman);
        if (gem)   picker.appendChild(gem);
      } else {
        if (gem)   picker.appendChild(gem);
        if (xaman) picker.appendChild(xaman);
      }
      // Only the preferred one shows the "recommended" badge
      picker.querySelectorAll('.wallet-btn').forEach(btn=>{
        const badge = btn.querySelector('.wallet-badge');
        if (!badge) return;
        if (btn.dataset.provider === preferred) badge.classList.remove('hidden');
        else                                     badge.classList.add('hidden');
      });
      // Hide Xaman option if no backend is configured
      const apiUrl = (window.TAMA_CONFIG && window.TAMA_CONFIG.API_BASE_URL) || '';
      if (!apiUrl && xaman){
        xaman.classList.add('disabled');
        xaman.title = 'Backend API required — set API_BASE_URL in config.js';
      }
    }

    document.querySelectorAll('.wallet-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        if (btn.classList.contains('disabled')) return;
        const p = btn.dataset.provider;
        doConnect(p);
      });
    });
    $('#demo-mode')?.addEventListener('click', doConnectDemo);
    $('#confirm-pseudo').addEventListener('click', doConfirmPseudo);
    $('#pseudo-input')?.addEventListener('keydown', e=>{
      if (e.key === 'Enter') doConfirmPseudo();
    });

    // Play boot sound on any first click
    const bootOnce = ()=>{
      window.TamaAudio.resume();
      window.TamaAudio.sfx('boot');
      document.removeEventListener('click', bootOnce);
      document.removeEventListener('keydown', bootOnce);
    };
    document.addEventListener('click', bootOnce);
    document.addEventListener('keydown', bootOnce);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
