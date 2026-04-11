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
    feed:0, play:0, sleep:0, clean:0, pet:0,
  };
  // In-game actions cost SCII COINS (not XRP) so the wallet doesn't
  // pop up on every click. Only the SHOP charges real XRP.
  const ACTION_COST_COINS = {
    feed:  3,
    play:  5,
    sleep: 2,
    clean: 2,
    pet:   0,
  };
  // XRP cost is left in for logging/backwards compat but should be 0.
  const ACTION_COST_XRP = {
    feed:  PRICES.feed  || 0,
    play:  PRICES.play  || 0,
    sleep: PRICES.sleep || 0,
    clean: PRICES.clean || 0,
    pet:   PRICES.pet   || 0,
  };
  const ACTION_REWARD_COINS = {
    feed:1, play:2, sleep:1, clean:1, pet:1,
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

  // ---------- Backend sync (optional) ----------
  // If API_BASE_URL is set, POST the current state to the backend
  // so leaderboard and OG share images stay up to date. Debounced.
  let _syncTimer = null;
  function queueBackendSync(){
    const cfg = window.TAMA_CONFIG || {};
    if (!cfg.API_BASE_URL) return;
    if (!window.TamaWallet?.address) return;
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(doBackendSync, 2000);
  }
  async function doBackendSync(){
    const cfg = window.TAMA_CONFIG || {};
    if (!cfg.API_BASE_URL) return;
    const addr = window.TamaWallet?.address;
    if (!addr) return;
    try{
      await fetch(cfg.API_BASE_URL.replace(/\/$/,'') + '/api/creature/' + encodeURIComponent(addr), {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          pseudo: state.pseudo,
          score:  state.score,
          coins:  state.coins,
          level:  state.level,
          state: {
            hunger:state.hunger, happy:state.happy,
            energy:state.energy, hygiene:state.hygiene,
            mood:  state.mood,   birth: state.birth,
            creatureProfile: state.creatureProfile,
          },
        }),
      });
    }catch(e){
      // fail silently — the game still works offline
    }
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
  function spawnParticle(char, color, opts = {}){
    const container = $('#particles');
    if (!container) return;
    const p = document.createElement('div');
    p.className = 'particle';
    p.textContent = char;
    if (color) p.style.color = color;
    const rect = container.getBoundingClientRect();
    const x = (opts.x != null ? opts.x : Math.random()*rect.width*0.7 + rect.width*0.15);
    const y = (opts.y != null ? opts.y : rect.height*0.55 + Math.random()*20);
    p.style.left = x+'px';
    p.style.top = y+'px';
    const dx = (opts.dx != null ? opts.dx : (Math.random()*120 - 60));
    const dy = (opts.dy != null ? opts.dy : -(50 + Math.random()*60));
    p.style.setProperty('--dx', dx + 'px');
    p.style.setProperty('--dy', dy + 'px');
    if (opts.size) p.style.fontSize = opts.size + 'px';
    container.appendChild(p);
    setTimeout(()=>p.remove(), 1600);
  }
  /* Radial burst of particles from the centre of the stage. */
  function burstParticles(chars, colors, count = 14){
    const container = $('#particles');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    for (let i = 0; i < count; i++){
      const angle = (Math.PI * 2 * i) / count + Math.random()*0.3;
      const dist  = 60 + Math.random()*50;
      spawnParticle(
        chars[Math.floor(Math.random()*chars.length)],
        colors[Math.floor(Math.random()*colors.length)],
        {
          x: cx, y: cy,
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist - 20,
          size: 18 + Math.random()*14,
        }
      );
    }
  }
  /* Confetti rain from the top on a level-up. */
  function confettiRain(){
    const container = $('#particles');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const colors = ['#ff2d7a','#f6e24b','#36e0f5','#4bf58a','#c66dff','#ff8c38'];
    const chars  = ['★','✦','♦','♥','▲','●','✸'];
    for (let i = 0; i < 22; i++){
      const p = document.createElement('div');
      p.className = 'particle confetti';
      p.textContent = chars[Math.floor(Math.random()*chars.length)];
      p.style.color = colors[Math.floor(Math.random()*colors.length)];
      p.style.left = (Math.random()*rect.width) + 'px';
      p.style.top = (-10 - Math.random()*20) + 'px';
      p.style.setProperty('--dx', (Math.random()*80 - 40) + 'px');
      p.style.setProperty('--dy', (rect.height + 40) + 'px');
      p.style.fontSize = (16 + Math.random()*14) + 'px';
      p.style.animationDuration = (1.4 + Math.random()*0.8) + 's';
      container.appendChild(p);
      setTimeout(()=>p.remove(), 2400);
    }
  }
  /* Ripple ring at click location inside the stage. */
  function spawnRipple(x, y, color){
    const container = $('#particles');
    if (!container) return;
    const r = document.createElement('div');
    r.className = 'stage-ripple';
    r.style.left = x + 'px';
    r.style.top  = y + 'px';
    if (color) r.style.borderColor = color;
    container.appendChild(r);
    setTimeout(()=>r.remove(), 700);
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

  // Mood → colour tint that gets BLENDED with the creature's base colour
  // so the egg shifts gently when the mood changes while keeping the
  // wallet-based identity recognisable.
  const MOOD_TINTS = {
    happy:    '#ffd94b', // sunny gold
    content:  null,       // keep base
    hungry:   '#ff8c38', // warm orange
    sad:      '#4b78ff', // cold blue
    sleeping: '#5b6acf', // soft indigo
    playing:  '#ff2d7a', // vivid pink
    dirty:    '#7a5b1c', // muddy brown
    loved:    '#ff4b9c', // bright pink
    angry:    '#ff4b6e', // red
    dead:     '#555555', // desaturated grey
  };
  // Mood → the text colour of the info-row "mood" label
  const MOOD_LABEL_COLORS = {
    happy:'#4bf58a', content:'#c66dff', hungry:'#ff8c38',
    sad:'#4b9cff', sleeping:'#36e0f5', dirty:'#7a5b1c',
    angry:'#ff4b6e', dead:'#555', loved:'#ff2d7a', playing:'#f6e24b',
  };

  /* ---------- small colour helpers ---------- */
  function hexToRgb(hex){
    const n = parseInt(String(hex).replace('#',''), 16);
    return [(n>>16)&255, (n>>8)&255, n&255];
  }
  function rgbToHex(r,g,b){
    const h = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2,'0');
    return '#' + h(r) + h(g) + h(b);
  }
  function mixHex(a, b, t){
    const [ar,ag,ab] = hexToRgb(a);
    const [br,bg,bb] = hexToRgb(b);
    return rgbToHex(ar*(1-t)+br*t, ag*(1-t)+bg*t, ab*(1-t)+bb*t);
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
    const moodEl = $('#mood-label');
    if (moodEl){
      moodEl.textContent = state.mood.toUpperCase();
      moodEl.style.color = MOOD_LABEL_COLORS[state.mood] || '#c66dff';
    }

    // Creature: drive the CSS egg with a colour that BLENDS the
    // wallet-seeded base with a mood tint, so it shifts gently.
    const frame = $('#stage-frame');
    if (frame && creature && creature.color){
      const base = creature.color.main;
      const baseGlow = creature.color.glow;
      const tint = MOOD_TINTS[state.mood];
      const color = tint ? mixHex(base, tint, 0.42) : base;
      const glow  = tint ? mixHex(baseGlow, tint, 0.5) : baseGlow;
      frame.style.setProperty('--egg-color', color);
      frame.style.setProperty('--egg-glow',  glow);
      frame.style.setProperty('--egg-aspect', String(creature.variant?.aspect || 1.22));
    }
    const el = $('#creature');
    if (el) el.textContent = creature.faceFor(state.mood);

    // Profile — only pseudo, no address, no network badge
    const pseudoEl = $('#profile-pseudo');
    if (pseudoEl) pseudoEl.textContent = state.pseudo || 'GUEST';
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
    queueBackendSync();
    // Ambient reaction on poor state
    if (avg < 25) window.TamaAudio.sfx('sad');
  }

  // ---------- Emoji fly-to-egg ----------
  // Spawns a big emoji at the triggering button and flies it to the
  // centre of the egg. Used by feed/play/clean/pet to visualise each
  // action with tangible impact.
  const FOOD_EMOJI = {
    apple:'🍎', cake:'🍰', salad:'🥗', pizza:'🍕', candy:'🍬', sushi:'🍣',
  };
  const ACTION_EMOJI = {
    play:  ['🎮','⚽','🎲','🎯','🎁'],
    sleep: ['💤','🌙','⭐','😴'],
    clean: ['🧼','💩','🫧','🧽','💧'],
    pet:   ['💕','💖','💞','❤️','💝'],
  };
  function flyEmojiToEgg(emoji, fromEl){
    const egg = $('#stage-frame');
    if (!egg) return;
    const eggRect = egg.getBoundingClientRect();
    const targetX = eggRect.left + eggRect.width / 2;
    const targetY = eggRect.top + eggRect.height / 2;

    let startX, startY;
    if (fromEl){
      const r = fromEl.getBoundingClientRect();
      startX = r.left + r.width/2;
      startY = r.top + r.height/2;
    } else {
      startX = window.innerWidth / 2;
      startY = window.innerHeight - 140;
    }

    const el = document.createElement('div');
    el.className = 'fly-emoji';
    el.textContent = emoji;
    el.style.left = startX + 'px';
    el.style.top  = startY + 'px';
    el.style.setProperty('--tx', (targetX - startX) + 'px');
    el.style.setProperty('--ty', (targetY - startY) + 'px');
    document.body.appendChild(el);
    setTimeout(()=>el.remove(), 900);
  }

  // Trigger a specific egg reaction animation (eat/play/clean/pet/sleep).
  function triggerEggReaction(name){
    const frame = $('#stage-frame');
    if (!frame) return;
    frame.classList.remove('react-eat','react-play','react-clean','react-pet','react-sleep');
    void frame.offsetWidth; // force reflow so the animation restarts
    frame.classList.add('react-'+name);
    setTimeout(()=>frame.classList.remove('react-'+name), 1200);
  }

  // ---------- Actions ----------
  async function doAction(action, triggerEl){
    // Actions no longer trigger XRP payments — they cost Scii Coins.
    // This fixes the "wallet opens every click" issue because only
    // the SHOP uses real XRP payments now.
    const coinCost = ACTION_COST_COINS[action] || 0;
    if (coinCost > 0 && state.coins < coinCost){
      toast('NOT ENOUGH ⬢ SCII','#ff4b6e');
      window.TamaAudio.sfx('error');
      return;
    }
    if (coinCost > 0){
      state.coins -= coinCost;
    }

    const el = $('#creature');
    switch(action){
      case 'feed':{
        const f = FOODS[selectedFood];
        state.hunger = clamp(state.hunger + f.hunger, 0, 100);
        state.happy  = clamp(state.happy  + (f.happy||0), 0, 100);
        if (f.hygiene) state.hygiene = clamp(state.hygiene + f.hygiene, 0, 100);
        if (f.energy)  state.energy  = clamp(state.energy  + f.energy,  0, 100);
        // Fly the selected food emoji to the egg
        const selectedBtn = $('.food-item.selected') || triggerEl;
        flyEmojiToEgg(FOOD_EMOJI[selectedFood] || '🍎', selectedBtn);
        setTimeout(()=>{
          burstParticles(['✦','♦','♥','★','•'], ['#f6e24b','#ff2d7a','#ff8c38'], 14);
          triggerEggReaction('eat');
        }, 650);
        floatText('+'+f.hunger+' HUNGER','#ff2d7a');
        window.TamaAudio.sfx('feed');
        unlock('first_feed');
        break;
      }
      case 'play':{
        state.happy = clamp(state.happy + 20, 0, 100);
        state.energy = clamp(state.energy - 8, 0, 100);
        state.hygiene = clamp(state.hygiene - 3, 0, 100);
        const pool = ACTION_EMOJI.play;
        flyEmojiToEgg(pool[Math.floor(Math.random()*pool.length)], triggerEl);
        setTimeout(()=>{
          burstParticles(['★','✦','♪','♫','✸','◆'], ['#f6e24b','#36e0f5','#c66dff'], 18);
          triggerEggReaction('play');
        }, 650);
        floatText('+20 HAPPY','#f6e24b');
        window.TamaAudio.sfx('play');
        unlock('first_play');
        break;
      }
      case 'sleep':{
        state.energy = clamp(state.energy + 40, 0, 100);
        state.happy  = clamp(state.happy - 3, 0, 100);
        const pool = ACTION_EMOJI.sleep;
        for (let i=0;i<3;i++){
          setTimeout(()=>flyEmojiToEgg(pool[Math.floor(Math.random()*pool.length)], triggerEl), i*150);
        }
        setTimeout(()=>triggerEggReaction('sleep'), 650);
        floatText('+40 ENERGY','#36e0f5');
        window.TamaAudio.sfx('sleep');
        break;
      }
      case 'clean':{
        state.hygiene = clamp(state.hygiene + 40, 0, 100);
        state.happy = clamp(state.happy - 2, 0, 100);
        const pool = ACTION_EMOJI.clean;
        flyEmojiToEgg(pool[Math.floor(Math.random()*pool.length)], triggerEl);
        setTimeout(()=>{
          burstParticles(['~','*','•','✧','◌'], ['#4bf58a','#36e0f5','#7dffcf'], 14);
          triggerEggReaction('clean');
        }, 650);
        floatText('+40 HYGIENE','#4bf58a');
        window.TamaAudio.sfx('clean');
        if (state.hygiene >= 100) unlock('clean_freak');
        break;
      }
      case 'pet':{
        state.happy = clamp(state.happy + 6, 0, 100);
        petCount++;
        const pool = ACTION_EMOJI.pet;
        flyEmojiToEgg(pool[Math.floor(Math.random()*pool.length)], triggerEl);
        setTimeout(()=>{
          burstParticles(['♥','♡','❤'], ['#ff2d7a','#ff4b9c','#c66dff'], 10);
          triggerEggReaction('pet');
        }, 600);
        const frame = $('#stage-frame');
        frame?.classList.remove('pulse-happy'); void frame?.offsetWidth;
        frame?.classList.add('pulse-happy');
        floatText('+6 HAPPY','#ff2d7a');
        window.TamaAudio.sfx('pet');
        if (petCount >= 20) unlock('lover');
        break;
      }
    }

    // Small XP reward (stays the same so levelling still works)
    const caring = (state.hunger + state.happy + state.energy + state.hygiene)/4;
    let reward = ACTION_REWARD_COINS[action] || 0;
    if (caring > 70) reward = Math.round(reward * 1.5);
    if (caring > 90) reward = Math.round(reward * 2);
    if (reward > 0){
      state.coins += reward;
      state.xp    += reward;
      state.score += Math.round(reward/2);
    } else {
      // Pet has no reward but still gives score
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
      confettiRain();
      const frame = $('#stage-frame');
      frame?.classList.remove('pulse-happy'); void frame?.offsetWidth;
      frame?.classList.add('pulse-happy');
      if (state.level >= 5) unlock('lvl5');
      if (state.level >= 10) unlock('lvl10');
    }

    saveState();
    render();
    checkAchievements();
    queueBackendSync();
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
          if (btn.disabled) return;
          const item = btn.closest('.shop-item');
          const xrp = parseFloat(item.dataset.xrp);
          const coins = parseInt(item.dataset.coins, 10);
          const pack = item.dataset.pack; // pack_small | pack_medium | ...
          if (!pack){
            toast('INVALID PACK','#ff4b6e');
            return;
          }
          const originalLabel = btn.textContent;
          btn.disabled = true;
          btn.textContent = '…';
          try{
            // Dev-mode shortcut: if the connected wallet IS the
            // treasury, XRPL would refuse a self-payment. Credit
            // the pack directly without opening the wallet popup.
            if (window.TamaWallet.isSelfTreasury && window.TamaWallet.isSelfTreasury()){
              state.coins += coins;
              saveState(); render();
              window.TamaAudio.sfx('coin');
              toast('DEV +'+coins+' ⬢ (wallet = treasury)','#ffd94b');
              queueBackendSync();
              return;
            }
            // Manual-mode wallet (paste-address) cannot sign tx.
            // Credit directly with a visible "read-only" notice
            // so the user knows the shop is in demo mode.
            if (window.TamaWallet.provider === 'xaman-manual'){
              state.coins += coins;
              saveState(); render();
              window.TamaAudio.sfx('coin');
              toast('READ-ONLY +'+coins+' ⬢ (no signer)','#ffd94b');
              queueBackendSync();
              return;
            }
            const tx = await window.TamaWallet.pay(xrp, 'tamagoscii:'+pack, pack);
            state.coins += coins;
            saveState(); render();
            queueBackendSync();
            window.TamaAudio.sfx('coin');
            toast('+'+coins+' ⬢ SCII COINS','#f6e24b');
            if (tx && tx.hash && !tx.hash.startsWith('demo_') && tx.hash !== 'free'){
              setTimeout(()=>toast('TX '+tx.hash.slice(0,10)+'…','#4bf58a'), 300);
            }
          }catch(e){
            const msg = (e && e.message) || 'error';
            if (msg === 'SELF_TREASURY'){
              // Should have been handled above, but keep as fallback
              state.coins += coins;
              saveState(); render();
              toast('DEV +'+coins+' ⬢ (wallet = treasury)','#ffd94b');
            } else {
              toast('TX FAILED: '+msg,'#ff4b6e');
              window.TamaAudio.sfx('error');
            }
          }finally{
            btn.disabled = false;
            btn.textContent = originalLabel;
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
        const icon = document.createElement('span');
        icon.className = 'ach-icon';
        icon.textContent = a.icon;
        const info = document.createElement('div');
        info.className = 'ach-info';
        const name = document.createElement('span');
        name.className = 'ach-name';
        name.textContent = a.name;
        const desc = document.createElement('span');
        desc.className = 'ach-desc';
        desc.textContent = a.desc;
        info.appendChild(name);
        info.appendChild(desc);
        li.appendChild(icon);
        li.appendChild(info);
        list.appendChild(li);
      });
    });
  }

  function openMinigame(){
    openModal('tpl-minigame', node=>{
      const arena    = node.querySelector('#mg-arena');
      const timeEl   = node.querySelector('#mg-time');
      const scoreEl  = node.querySelector('#mg-score');
      const streakEl = node.querySelector('#mg-streak');
      const startBtn = node.querySelector('#mg-start');

      const TOTAL_TIME = 20;
      const SPAWN_MIN = 550;   // ms between spawns (faster at end)
      const SPAWN_MAX = 950;
      const EGG_LIFE  = 2400;  // ms before an egg hatches and disappears
      const GOLD_CHANCE = 0.12;
      const MAX_EGGS = 4;

      let score = 0;
      let streak = 0;
      let bestStreak = 0;
      let normalSmashed = 0;
      let goldSmashed = 0;
      let timeLeft = TOTAL_TIME;
      let tickInterval = null;
      let spawnTimeout = null;
      let running = false;

      function pickSpawnDelay(){
        // Get faster as time runs out
        const factor = Math.max(0.4, timeLeft / TOTAL_TIME);
        return SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN) * factor;
      }

      function spawnEgg(){
        if (!running) return;
        if (arena.querySelectorAll('.mg-egg').length >= MAX_EGGS){
          scheduleSpawn();
          return;
        }
        const egg = document.createElement('div');
        const isGold = Math.random() < GOLD_CHANCE;
        egg.className = 'mg-egg' + (isGold ? ' gold' : '');
        const body = document.createElement('div');
        body.className = 'egg-body';
        egg.appendChild(body);

        const rect = arena.getBoundingClientRect();
        const pad = 40;
        const x = pad + Math.random() * (rect.width  - pad*2);
        const y = pad + Math.random() * (rect.height - pad*2);
        egg.style.left = x + 'px';
        egg.style.top  = y + 'px';

        // Vanish timer (missed)
        const vanishTimer = setTimeout(()=>{
          if (!egg.isConnected) return;
          egg.classList.add('vanish');
          streak = 0;
          streakEl.textContent = streak;
          setTimeout(()=>egg.remove(), 400);
        }, EGG_LIFE);

        egg.addEventListener('click', (e)=>{
          e.stopPropagation();
          clearTimeout(vanishTimer);
          if (egg.classList.contains('smashed')) return;

          const points = isGold ? 5 : 1;
          score += points;
          streak += 1;
          bestStreak = Math.max(bestStreak, streak);
          if (isGold) goldSmashed++; else normalSmashed++;

          scoreEl.textContent = score;
          streakEl.textContent = streak;

          // Visual feedback
          egg.classList.add('smashed');
          spawnCrackFX(x, y, isGold);
          spawnRipple(x, y, isGold);
          spawnScorePop(x, y, '+' + points, isGold);
          window.TamaAudio.sfx(isGold ? 'levelup' : 'coin');

          setTimeout(()=>egg.remove(), 500);
        });

        arena.appendChild(egg);
        scheduleSpawn();
      }

      function scheduleSpawn(){
        if (!running) return;
        clearTimeout(spawnTimeout);
        spawnTimeout = setTimeout(spawnEgg, pickSpawnDelay());
      }

      function spawnCrackFX(x, y, gold){
        const chars = gold ? ['✦','★','✦','♦','★'] : ['✦','✸','*','•','✦'];
        for (let i = 0; i < 8; i++){
          const p = document.createElement('div');
          p.className = 'mg-crack' + (gold ? ' gold' : '');
          p.textContent = chars[Math.floor(Math.random()*chars.length)];
          p.style.left = x + 'px';
          p.style.top  = y + 'px';
          const angle = (Math.PI * 2 * i) / 8 + Math.random()*0.5;
          const dist  = 40 + Math.random()*30;
          p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
          p.style.setProperty('--dy', (Math.sin(angle) * dist - 20) + 'px');
          arena.appendChild(p);
          setTimeout(()=>p.remove(), 750);
        }
      }
      function spawnRipple(x, y, gold){
        const r = document.createElement('div');
        r.className = 'mg-ripple' + (gold ? ' gold' : '');
        r.style.left = x + 'px';
        r.style.top  = y + 'px';
        arena.appendChild(r);
        setTimeout(()=>r.remove(), 550);
      }
      function spawnScorePop(x, y, text, gold){
        const p = document.createElement('div');
        p.className = 'mg-score-pop' + (gold ? ' gold' : '');
        p.textContent = text;
        p.style.left = x + 'px';
        p.style.top  = y + 'px';
        arena.appendChild(p);
        setTimeout(()=>p.remove(), 950);
      }

      function endGame(){
        running = false;
        clearInterval(tickInterval);
        clearTimeout(spawnTimeout);
        // Clear remaining eggs
        arena.querySelectorAll('.mg-egg').forEach(e => e.remove());
        arena.classList.remove('playing');

        const reward = score * 3;
        state.coins += reward;
        saveState(); render();
        queueBackendSync();
        if (score > 0) unlock('minigame');

        // Game over overlay
        const overlay = document.createElement('div');
        overlay.className = 'mg-gameover';
        const title = document.createElement('div');
        title.className = 'mg-gameover-title';
        title.textContent = 'TIME UP!';
        const reward_el = document.createElement('div');
        reward_el.className = 'mg-gameover-reward';
        reward_el.textContent = '+' + reward + ' ⬢ SCII';
        const breakdown = document.createElement('div');
        breakdown.className = 'mg-gameover-breakdown';
        breakdown.textContent = `${normalSmashed} normal · ${goldSmashed} gold · best streak ${bestStreak}`;
        overlay.appendChild(title);
        overlay.appendChild(reward_el);
        overlay.appendChild(breakdown);
        arena.appendChild(overlay);

        startBtn.textContent = 'PLAY AGAIN';
        startBtn.disabled = false;
        startBtn.classList.remove('hidden');
        window.TamaAudio.sfx('levelup');
      }

      startBtn.addEventListener('click', ()=>{
        // Reset state
        score = 0; streak = 0; bestStreak = 0;
        normalSmashed = 0; goldSmashed = 0;
        timeLeft = TOTAL_TIME;
        scoreEl.textContent = '0';
        streakEl.textContent = '0';
        timeEl.textContent = String(TOTAL_TIME);
        arena.querySelectorAll('.mg-egg, .mg-gameover').forEach(e => e.remove());
        arena.classList.add('playing');
        startBtn.classList.add('hidden');
        running = true;
        window.TamaAudio.sfx('boot');

        tickInterval = setInterval(()=>{
          timeLeft--;
          timeEl.textContent = String(Math.max(0, timeLeft));
          if (timeLeft <= 0) endGame();
        }, 1000);
        scheduleSpawn();
      });

      // Cleanup on modal close
      const closeBtn = node.querySelector('.modal-close');
      closeBtn.addEventListener('click', ()=>{
        running = false;
        clearInterval(tickInterval);
        clearTimeout(spawnTimeout);
      });
    });
  }

  // ---------- Audio bar wiring ----------
  function renderPlaylist(){
    const audio = window.TamaAudio;
    const list = $('#playlist-items');
    const countEl = $('#playlist-count');
    if (!list) return;
    list.innerHTML = '';
    if (countEl) countEl.textContent = audio.tracks.length;
    if (!audio.tracks.length){
      const empty = document.createElement('li');
      empty.className = 'playlist-empty';
      empty.textContent = '— NO TRACKS LOADED —';
      list.appendChild(empty);
      return;
    }
    audio.tracks.forEach((t, i)=>{
      const li = document.createElement('li');
      if (i === audio.trackIndex) li.classList.add('active');
      const idx = document.createElement('span');
      idx.className = 'plist-idx';
      idx.textContent = String(i+1).padStart(2,'0');
      const title = document.createElement('span');
      title.className = 'plist-title';
      title.textContent = t.name;
      const playing = document.createElement('span');
      playing.className = 'plist-playing';
      playing.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5z"/></svg>';
      li.appendChild(idx);
      li.appendChild(title);
      li.appendChild(playing);
      li.addEventListener('click', ()=>{
        audio.trackIndex = i;
        audio.play();
        window.TamaAudio.sfx('click');
      });
      list.appendChild(li);
    });
  }

  function setupAudioBar(){
    const audio = window.TamaAudio;
    const bar = $('#audio-bar');
    const playIcon  = $('#audio-play .icon-play');
    const pauseIcon = $('#audio-play .icon-pause');
    const sfxOn  = $('#sfx-toggle .icon-sfx-on');
    const sfxOff = $('#sfx-toggle .icon-sfx-off');

    audio.onUpdate(()=>{
      const name = audio.currentTrackName();
      $('#track-title').textContent = name ? name.toUpperCase() : '— NO TRACK —';
      // Swap play/pause icons
      if (audio.playing){
        playIcon?.classList.add('hidden');
        pauseIcon?.classList.remove('hidden');
      } else {
        playIcon?.classList.remove('hidden');
        pauseIcon?.classList.add('hidden');
      }
      if (audio.audio.duration){
        const pct = (audio.audio.currentTime / audio.audio.duration) * 100;
        $('#track-progress-fill').style.width = pct+'%';
      } else {
        $('#track-progress-fill').style.width = '0%';
      }
      // Re-render playlist highlight
      const items = $('#playlist-items')?.querySelectorAll('li');
      if (items){
        items.forEach((li, i)=>{
          li.classList.toggle('active', i === audio.trackIndex);
        });
      }
    });
    $('#audio-play').addEventListener('click', ()=>audio.toggle());
    $('#audio-next').addEventListener('click', ()=>audio.next());
    $('#audio-prev').addEventListener('click', ()=>audio.prev());
    $('#sfx-toggle').addEventListener('click', ()=>{
      audio.setSfxEnabled(!audio.sfxEnabled);
      if (audio.sfxEnabled){
        sfxOn?.classList.remove('hidden');
        sfxOff?.classList.add('hidden');
      } else {
        sfxOn?.classList.add('hidden');
        sfxOff?.classList.remove('hidden');
      }
      toast('SFX '+(audio.sfxEnabled?'ON':'OFF'),'#36e0f5');
    });
    $('#audio-expand').addEventListener('click', ()=>{
      bar.classList.toggle('expanded');
      window.TamaAudio.sfx('click');
      if (bar.classList.contains('expanded')) renderPlaylist();
    });
    // Fixed default volume — users no longer control it from the UI
    audio.setVolume(0.6);
    audio._emit();
    // Render playlist once after manifest loads
    setTimeout(renderPlaylist, 1200);
  }

  // ---------- Login flow ----------
  function afterConnected(addr){
    $('#addr-preview').textContent = window.TamaShortAddr(addr);
    $('#login-actions').classList.add('hidden');
    $('#pseudo-form').classList.remove('hidden');
    const stored = window.TamaWallet.getPseudo();
    if (stored) $('#pseudo-input').value = stored;
    setTimeout(()=>$('#pseudo-input')?.focus(), 50);
    // Warn if the connected wallet is also the configured treasury
    if (window.TamaWallet.isSelfTreasury && window.TamaWallet.isSelfTreasury()){
      setTimeout(()=>{
        toast('DEV MODE: Treasury = your wallet. Packs are free.','#ffd94b');
      }, 500);
    }
  }

  // Opens the "manual Xaman" modal: a deeplink button + a text
  // input where the user can paste their XRPL address. Works on
  // 100 % of mobile browsers with zero configuration.
  function openXamanManualModal(){
    const cfg = window.TAMA_CONFIG || {};
    openModal('tpl-xaman-manual', node=>{
      const input  = node.querySelector('#xaman-addr-input');
      const submit = node.querySelector('#xaman-addr-submit');
      const hint   = node.querySelector('#xaman-addr-hint');
      const defaultHint = hint?.textContent || '';
      const openBtn = node.querySelector('#xaman-open-app');
      // Try to remember the last manual address
      const saved = window.TamaWallet.getPseudo ? null : null;
      try {
        const stored = JSON.parse(localStorage.getItem('tamagoscii:wallet') || '{}');
        if (stored && stored.provider === 'xaman-manual' && stored.address) {
          input.value = stored.address;
        }
      } catch(e){}

      // On mobile, use a universal-link form that Xaman catches.
      // xaman.app/detect/authorize opens the Xaman app if installed,
      // otherwise falls back to the app store.
      if (openBtn){
        openBtn.href = 'https://xaman.app/';
      }

      const validate = (addr) => /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(addr.trim());
      const doSubmit = async () => {
        const addr = (input.value || '').trim();
        if (!validate(addr)){
          input.classList.add('invalid');
          hint.classList.add('error');
          hint.textContent = 'Not a valid XRPL address.';
          input.focus();
          window.TamaAudio.sfx('error');
          return;
        }
        submit.disabled = true;
        submit.textContent = 'CONNECTING...';
        try{
          const connected = await window.TamaWallet.connectXamanManual(addr);
          closeModal();
          afterConnected(connected);
          toast('XAMAN CONNECTED','#4bf58a');
        }catch(err){
          submit.disabled = false;
          submit.textContent = 'CONNECT ▶';
          input.classList.add('invalid');
          hint.classList.add('error');
          hint.textContent = (err && err.message) || 'Could not connect.';
          window.TamaAudio.sfx('error');
        }
      };
      submit.addEventListener('click', doSubmit);
      input.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') doSubmit(); });
      input.addEventListener('input', ()=>{
        input.classList.remove('invalid');
        hint.classList.remove('error');
        hint.textContent = defaultHint;
      });
      setTimeout(()=>input.focus(), 100);
    });
  }

  async function doConnect(provider){
    window.TamaAudio.sfx('connect');
    const btn = document.querySelector(`.wallet-btn[data-provider="${provider}"]`);
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn){
      btn.disabled = true;
      btn.classList.add('connecting');
    }
    // Special path for Xaman on mobile:
    // - if no XAMAN_APP_KEY and no backend → open the manual modal
    //   directly instead of throwing an error.
    if (provider === 'xaman'){
      const cfg = window.TAMA_CONFIG || {};
      const hasPkce    = !!cfg.XAMAN_APP_KEY;
      const hasBackend = !!(cfg.API_BASE_URL && cfg.API_BASE_URL.trim());
      if (!hasPkce && !hasBackend){
        if (btn){
          btn.disabled = false;
          btn.classList.remove('connecting');
        }
        openXamanManualModal();
        return;
      }
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

      // For any Xaman-related error, fall back to the manual modal
      // so the user always has a way to connect.
      if (provider === 'xaman' && (
          msg === 'XAMAN_NOT_CONFIGURED' ||
          msg === 'XUMM_CANCELLED' ||
          msg === 'XUMM_TIMEOUT' ||
          msg === 'XUMM_NO_AUTH' ||
          msg === 'XUMM_NO_ACCOUNT' ||
          msg === 'XUMM_SDK_MISSING' ||
          msg === 'XUMM_SIGNIN_FAILED'
      )){
        toast('OPEN XAMAN OR ENTER YOUR ADDRESS','#36e0f5');
        openXamanManualModal();
        return;
      }

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
      } else if (msg === 'XAMAN_NOT_CONFIGURED'){
        toast(e?.userMessage || 'XAMAN NEEDS AN APP KEY','#ffd94b');
        const link = $('#install-xaman');
        if (link){
          link.href = 'https://apps.xaman.dev/';
          link.textContent = '▸ Get a Xaman App Key';
          link.classList.remove('hidden');
        }
      } else if (msg === 'XAMAN_BACKEND_REQUIRED' || msg === 'XUMM_DISABLED'){
        toast('XAMAN BACKEND NOT CONFIGURED','#ff4b6e');
        const link = $('#install-xaman');
        if (link){
          link.href = (window.TAMA_CONFIG && window.TAMA_CONFIG.XAMAN_INSTALL_URL)
            || 'https://xaman.app/';
          link.classList.remove('hidden');
        }
      } else if (msg === 'XUMM_CANCELLED'){
        toast('SIGN-IN CANCELLED','#ff4b6e');
      } else if (msg === 'XUMM_TIMEOUT'){
        toast('SIGN-IN TIMED OUT','#ff4b6e');
      } else if (msg === 'XUMM_NO_AUTH' || msg === 'XUMM_NO_ACCOUNT' || msg === 'XUMM_SDK_MISSING'){
        toast('XAMAN CONNECTION FAILED','#ff4b6e');
      } else {
        toast('CONNECTION FAILED: '+msg,'#ff4b6e');
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
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const seedParam = hashParams.get('seed');
    const sharedPseudo = hashParams.get('pseudo');
    if (sharedPseudo && !state.pseudo){
      state.pseudo = sharedPseudo;
    }
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
    // Reflect Scii Coin costs on action buttons
    $$('.action').forEach(btn=>{
      const a = btn.dataset.action;
      const coins = ACTION_COST_COINS[a] || 0;
      const label = btn.querySelector('.action-cost');
      if (label) label.textContent = (coins > 0) ? (coins + ' ⬢') : 'FREE';
    });
    // Action buttons — the food bar auto-opens/closes around FEED.
    const overlay = $('.controls-overlay');
    $$('.action').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const a = btn.dataset.action;
        if (a === 'feed'){
          // Toggle the food bar the first time; second click confirms
          // with the currently-selected food item.
          if (!overlay.classList.contains('feed-active')){
            overlay.classList.add('feed-active');
            window.TamaAudio.sfx('click');
            return;
          }
          // Already open → confirm: eat + close
          overlay.classList.remove('feed-active');
          doAction('feed', btn);
        } else {
          overlay.classList.remove('feed-active');
          doAction(a, btn);
        }
      });
    });
    // Food items: click = select the food used by the next FEED
    $$('.food-item').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.stopPropagation();
        $$('.food-item').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedFood = btn.dataset.food;
        window.TamaAudio.sfx('click');
        // Eat immediately on second click with this food
        overlay.classList.remove('feed-active');
        doAction('feed', btn);
      });
    });
    // Stage click = pet interaction
    $('#stage-frame').addEventListener('click', (e)=>{
      // Ripple at click position inside the stage
      const rect = $('#stage-frame').getBoundingClientRect();
      spawnRipple(e.clientX - rect.left, e.clientY - rect.top, creature?.color?.main || '#fff');
      doAction('pet');
    });
    // Fun buttons
    $('#btn-shop').addEventListener('click', openShop);
    $('#btn-share').addEventListener('click', openShare);
    $('#btn-achievements').addEventListener('click', openAchievements);
    $('#btn-minigame').addEventListener('click', openMinigame);
  }

  // ---------- Partner logos ----------
  async function loadPartners(){
    const list = $('#partners-list');
    const wrap = $('#partners');
    if (!list || !wrap) return;
    try{
      const res = await fetch('./logo/logos.json', { cache:'no-cache' });
      if (!res.ok) throw new Error('no manifest');
      const partners = await res.json();
      if (!Array.isArray(partners) || partners.length === 0){
        wrap.classList.add('empty');
        return;
      }
      list.innerHTML = '';
      partners.forEach(p => {
        if (!p || !p.file) return;
        const a = document.createElement('a');
        a.href = p.url || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.title = p.name || p.file;
        const img = document.createElement('img');
        img.src = './logo/' + p.file;
        img.alt = p.name || p.file;
        img.loading = 'lazy';
        a.appendChild(img);
        if (p.tagline){
          const tag = document.createElement('span');
          tag.className = 'partner-name';
          tag.textContent = p.tagline;
          a.appendChild(tag);
        }
        list.appendChild(a);
      });
      wrap.classList.remove('empty');
    }catch(e){
      wrap.classList.add('empty');
    }
  }

  // ---------- Login mascot face cycling ----------
  function startLoginMascotAnimation(){
    const faces = ['◔◡◕', '◕‿◕', '◕◡◕', '◔‿◔', '◔◡◕', '◕u◕'];
    let idx = 0;
    setInterval(() => {
      const el = document.getElementById('login-mascot-face');
      // Only animate while still on the login screen
      if (!el || !el.offsetParent) return;
      idx = (idx + 1) % faces.length;
      el.style.opacity = '0';
      setTimeout(() => {
        el.textContent = faces[idx];
        el.style.opacity = '1';
      }, 150);
    }, 2200);
  }

  // ---------- Bootstrap ----------
  function init(){
    setupAudioBar();
    startLoginMascotAnimation();
    loadPartners();

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

    // Wallet picker: on mobile we hide GemWallet entirely because
    // the GemWallet browser extension only exists on desktop.
    // On desktop both GemWallet and Xaman are offered.
    const picker = $('#wallet-picker');
    const preferred = window.TamaWallet.preferredProvider();
    const isMobile = window.TamaIsMobile && window.TamaIsMobile();
    if (picker){
      const gem   = picker.querySelector('[data-provider="gemwallet"]');
      const xaman = picker.querySelector('[data-provider="xaman"]');
      picker.innerHTML = '';
      if (isMobile){
        // Mobile → Xaman only
        if (xaman) picker.appendChild(xaman);
      } else if (preferred === 'xaman'){
        if (xaman) picker.appendChild(xaman);
        if (gem)   picker.appendChild(gem);
      } else {
        if (gem)   picker.appendChild(gem);
        if (xaman) picker.appendChild(xaman);
      }
      // Highlight the recommended wallet for this platform
      picker.querySelectorAll('.wallet-btn').forEach(btn=>{
        const badge = btn.querySelector('.wallet-badge');
        if (!badge) return;
        if (btn.dataset.provider === preferred) badge.classList.remove('hidden');
        else                                     badge.classList.add('hidden');
      });
      // Xaman is ALWAYS enabled now. Priority:
      //   1. XummPkce client-side flow (if XAMAN_APP_KEY is set)
      //   2. Backend flow (if API_BASE_URL is set)
      //   3. Manual address-paste fallback (always available —
      //      user copies their XRPL address from the Xaman app
      //      and pastes it here).
      // doConnect() handles the priority and opens the manual
      // modal whenever the auto flows aren't configured or fail.
    }

    // Preemptively wire the "Install wallet" links with their URLs and
    // show them on mobile (where people are most likely to need them).
    const tcfg = window.TAMA_CONFIG || {};
    const gemLink = $('#install-gem');
    const xamanLink = $('#install-xaman');
    if (gemLink) gemLink.href = tcfg.GEMWALLET_INSTALL_URL || 'https://gemwallet.app/';
    if (xamanLink) xamanLink.href = tcfg.XAMAN_INSTALL_URL || 'https://xaman.app/';
    if (window.TamaIsMobile && window.TamaIsMobile()){
      xamanLink?.classList.remove('hidden');
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
