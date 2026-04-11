/* ============================================================
   TAMAGOSCII - Audio engine
   - Procedural 8-bit sound effects (royalty-free, synthesized)
   - Music player supporting user-uploaded audio files
============================================================ */

(function(){
  'use strict';

  class AudioEngine{
    constructor(){
      this.ctx = null;
      this.master = null;
      this.sfxEnabled = true;
      this.tracks = [];        // [{name,url}]
      this.trackIndex = -1;
      this.audio = new Audio();
      this.audio.volume = 0.6;
      this.playing = false;
      this._onUpdate = null;
    }
    _ensureCtx(){
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    resume(){
      this._ensureCtx();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }
    setSfxEnabled(b){ this.sfxEnabled = b; }

    /* ====== Sound FX (synthesized chiptune) ====== */
    beep({ freq=440, dur=0.12, type='square', attack=0.005, decay=0.12, gain=0.3, detune=0 }={}){
      if (!this.sfxEnabled) return;
      this._ensureCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.value = detune;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(gain, now+attack);
      g.gain.exponentialRampToValueAtTime(0.0001, now+attack+decay);
      osc.connect(g).connect(this.master);
      osc.start(now);
      osc.stop(now+attack+decay+0.02);
    }
    slide({ from=220, to=880, dur=0.2, type='square', gain=0.3 }={}){
      if (!this.sfxEnabled) return;
      this._ensureCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, now);
      osc.frequency.exponentialRampToValueAtTime(to, now+dur);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(gain, now+0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now+dur);
      osc.connect(g).connect(this.master);
      osc.start(now);
      osc.stop(now+dur+0.02);
    }
    noise({ dur=0.18, gain=0.25 }={}){
      if (!this.sfxEnabled) return;
      this._ensureCtx();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * dur;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      g.gain.value = gain;
      src.buffer = buffer;
      src.connect(g).connect(this.master);
      src.start(now);
      src.stop(now+dur);
    }

    /* High-level effect presets */
    sfx(name){
      this.resume();
      switch(name){
        case 'click':   this.beep({freq:880,dur:0.07,type:'square',gain:0.18}); break;
        case 'feed':    this.slide({from:440,to:880,dur:0.18,gain:0.22});
                        setTimeout(()=>this.beep({freq:1100,dur:0.1,gain:0.18}),100); break;
        case 'play':    this.beep({freq:660,dur:0.09});
                        setTimeout(()=>this.beep({freq:880,dur:0.09}),90);
                        setTimeout(()=>this.beep({freq:1320,dur:0.12}),180); break;
        case 'sleep':   this.slide({from:600,to:200,dur:0.6,type:'sine',gain:0.2}); break;
        case 'clean':   this.noise({dur:0.3,gain:0.18});
                        setTimeout(()=>this.beep({freq:1400,dur:0.1,type:'triangle'}),200); break;
        case 'pet':     this.beep({freq:800,dur:0.1,type:'triangle'});
                        setTimeout(()=>this.beep({freq:1200,dur:0.12,type:'triangle'}),90); break;
        case 'coin':    this.beep({freq:988,dur:0.08,type:'square'});
                        setTimeout(()=>this.beep({freq:1319,dur:0.15,type:'square'}),70); break;
        case 'error':   this.beep({freq:180,dur:0.15,type:'sawtooth',gain:0.25});
                        setTimeout(()=>this.beep({freq:140,dur:0.18,type:'sawtooth',gain:0.25}),140); break;
        case 'levelup': [523,659,784,1046].forEach((f,i)=>setTimeout(()=>this.beep({freq:f,dur:0.14,type:'square',gain:0.22}),i*100)); break;
        case 'sad':     this.slide({from:440,to:150,dur:0.5,type:'triangle',gain:0.25}); break;
        case 'boot':    [392,523,659,784].forEach((f,i)=>setTimeout(()=>this.beep({freq:f,dur:0.08,type:'square',gain:0.2}),i*60)); break;
        case 'connect': [523,659,784,988,1175].forEach((f,i)=>setTimeout(()=>this.beep({freq:f,dur:0.09,type:'square',gain:0.2}),i*70)); break;
        case 'deny':    this.beep({freq:160,dur:0.25,type:'square',gain:0.25}); break;
      }
    }

    /* ====== Music player ====== */
    loadTracks(fileList){
      [...fileList].forEach(f=>{
        const url = URL.createObjectURL(f);
        this.tracks.push({ name:f.name.replace(/\.[^.]+$/,''), url });
      });
      if (this.trackIndex < 0 && this.tracks.length) this.trackIndex = 0;
      this._emit();
    }
    /**
     * Load tracks from a manifest JSON file (e.g. ./music/tracks.json).
     * Manifest shape: [{ title, file }] — file is relative to MUSIC_DIR.
     */
    async loadManifest(manifestUrl, baseDir){
      try{
        const res = await fetch(manifestUrl, { cache:'no-cache' });
        if (!res.ok) return 0;
        const data = await res.json();
        if (!Array.isArray(data)) return 0;
        let added = 0;
        data.forEach(entry => {
          if (!entry || !entry.file) return;
          const url = (baseDir || '') + entry.file;
          this.tracks.push({
            name: entry.title || entry.file.replace(/\.[^.]+$/,''),
            url,
          });
          added++;
        });
        if (this.trackIndex < 0 && this.tracks.length) this.trackIndex = 0;
        this._emit();
        return added;
      }catch(e){
        return 0;
      }
    }
    play(){
      if (!this.tracks.length) return;
      if (this.trackIndex < 0) this.trackIndex = 0;
      const t = this.tracks[this.trackIndex];
      if (this.audio.src !== t.url){
        this.audio.src = t.url;
      }
      this.audio.play().then(()=>{
        this.playing = true;
        this._emit();
      }).catch(()=>{});
    }
    pause(){
      this.audio.pause();
      this.playing = false;
      this._emit();
    }
    toggle(){
      if (this.playing) this.pause(); else this.play();
    }
    next(){
      if (!this.tracks.length) return;
      this.trackIndex = (this.trackIndex + 1) % this.tracks.length;
      if (this.playing) { this.audio.src = this.tracks[this.trackIndex].url; this.audio.play().catch(()=>{}); }
      this._emit();
    }
    prev(){
      if (!this.tracks.length) return;
      this.trackIndex = (this.trackIndex - 1 + this.tracks.length) % this.tracks.length;
      if (this.playing) { this.audio.src = this.tracks[this.trackIndex].url; this.audio.play().catch(()=>{}); }
      this._emit();
    }
    setVolume(v){ this.audio.volume = Math.max(0,Math.min(1,v)); }
    currentTrackName(){
      if (this.trackIndex < 0) return null;
      return this.tracks[this.trackIndex]?.name || null;
    }
    onUpdate(cb){ this._onUpdate = cb; }
    _emit(){ if (this._onUpdate) this._onUpdate(); }
  }

  const engine = new AudioEngine();
  // wire natural events
  engine.audio.addEventListener('ended', ()=>engine.next());
  engine.audio.addEventListener('timeupdate', ()=>engine._emit());
  engine.audio.addEventListener('play', ()=>{ engine.playing = true; engine._emit(); });
  engine.audio.addEventListener('pause', ()=>{ engine.playing = false; engine._emit(); });

  window.TamaAudio = engine;
})();
