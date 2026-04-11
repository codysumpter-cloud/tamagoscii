/* ============================================================
   TAMAGOSCII - Creature engine (egg edition)
   ------------------------------------------------------------
   Every creature is an egg (tamago). Variety comes from:
     - 10 egg body variants (proportion / silhouette)
     - 10 colors
     - 6 interior patterns
     - 10 toppers (little accessory above the egg)
     - accent color
============================================================ */

(function(){
  'use strict';

  // ---------- Deterministic PRNG ----------
  function hashStr(str){
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed){
    return function(){
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Variant tables ----------
  const VARIANTS = [
    // { name, widestY (0..1), topNarrow (0..1), aspectX, aspectY }
    { name:'classic',  widest:0.62, topNarrow:0.55, sx:5.0, sy:6.5 },
    { name:'slim',     widest:0.65, topNarrow:0.50, sx:4.2, sy:6.8 },
    { name:'round',    widest:0.58, topNarrow:0.65, sx:5.6, sy:6.2 },
    { name:'tall',     widest:0.68, topNarrow:0.48, sx:4.5, sy:7.5 },
    { name:'wide',     widest:0.60, topNarrow:0.60, sx:6.0, sy:5.8 },
    { name:'pointy',   widest:0.70, topNarrow:0.40, sx:4.8, sy:7.0 },
    { name:'chonk',    widest:0.55, topNarrow:0.70, sx:5.8, sy:6.0 },
    { name:'cosmic',   widest:0.62, topNarrow:0.55, sx:5.2, sy:6.6 },
    { name:'crystal',  widest:0.60, topNarrow:0.50, sx:5.0, sy:6.8 },
    { name:'royal',    widest:0.64, topNarrow:0.55, sx:5.2, sy:6.7 },
  ];

  const COLORS = [
    { name:'gold',    hex:'#f6e24b' },
    { name:'pink',    hex:'#ff2d7a' },
    { name:'cyan',    hex:'#36e0f5' },
    { name:'green',   hex:'#4bf58a' },
    { name:'purple',  hex:'#c66dff' },
    { name:'orange',  hex:'#ff8c38' },
    { name:'red',     hex:'#ff4b6e' },
    { name:'blue',    hex:'#4b9cff' },
    { name:'mint',    hex:'#7dffcf' },
    { name:'violet',  hex:'#9966ff' },
  ];

  const PATTERNS = ['plain','dots','stripes','cracks','sparkle','zigzag'];

  // Toppers: small accessory placed above the egg
  const TOPPERS = [
    { name:'none',   glyph:'' },
    { name:'star',   glyph:'★' },
    { name:'heart',  glyph:'♥' },
    { name:'crown',  glyph:'♛' },
    { name:'leaf',   glyph:'🌱' },
    { name:'spike',  glyph:'▲' },
    { name:'gem',    glyph:'◆' },
    { name:'spark',  glyph:'✦' },
    { name:'ring',   glyph:'○' },
    { name:'flame',  glyph:'▼' },
  ];

  // ---------- Faces (ASCII expressions) ----------
  const FACES = {
    happy:    ["( ^ w ^ )","( > u < )","( ◕ ‿ ◕ )"],
    content:  ["( ◔ ᴗ ◔ )","( • ◡ • )","( ⌐■_■ )"],
    hungry:   ["( ; _ ; )","( T ^ T )","( o m o )"],
    sad:      ["( ╥ _ ╥ )","( ಥ _ ಥ )","( T _ T )"],
    sleeping: ["( - _ - )z","( u _ u )Z","( =_= )z"],
    playing:  ["( ^ o ^ )","( > w < )","( ^ 3 ^ )"],
    dirty:    ["( x _ x )","( @ _ @ )","( ✖_✖ )"],
    loved:    ["( ♥ w ♥ )","( ˘ ♥ ˘ )","( ♥ ‿ ♥ )"],
    angry:    ["( ` _ ´ )","( ಠ _ ಠ )","( >_< )"],
    dead:     ["( x o x )","( × _ × )","( † _ † )"],
  };

  // ---------- Egg silhouette builder ----------
  // Produces an H rows × W cols grid of shaded characters forming an egg.
  // Egg profile: narrower at top, widest around `widest` of its height,
  // then curving back in toward the bottom.
  function buildEgg(variant){
    const W = 17;
    const H = 13;
    const grid = Array.from({length:H}, () => Array(W).fill(' '));
    const cx = (W - 1) / 2;
    const cy = (H - 1) * variant.widest;
    const rx = variant.sx;
    const ryTop = cy;                 // distance from top of bbox
    const ryBot = (H - 1) - cy;       // distance from bottom

    // For each row, compute the half-width of the egg at that row using
    // two half-ellipses stitched at the widest row.
    for (let y = 0; y < H; y++){
      let norm;
      if (y <= cy){
        // upper half: narrower and taller
        norm = 1 - Math.pow((cy - y) / Math.max(ryTop, 0.001), 1.7);
        // Pull the top further in to get the egg "point"
        const topPull = (1 - y / Math.max(cy, 0.001)) * variant.topNarrow;
        norm *= (1 - 0.25 * topPull);
      } else {
        // lower half: rounder
        norm = 1 - Math.pow((y - cy) / Math.max(ryBot, 0.001), 2);
      }
      if (norm <= 0) continue;
      const halfW = Math.sqrt(Math.max(0, norm)) * rx;
      for (let x = 0; x < W; x++){
        const dx = x - cx;
        if (Math.abs(dx) <= halfW){
          const edgeDist = halfW - Math.abs(dx);
          if (edgeDist < 0.7) grid[y][x] = '▓';        // edge
          else if (edgeDist < 1.9) grid[y][x] = '▒';   // inner ring
          else grid[y][x] = '░';                        // fill
        }
      }
    }
    return grid;
  }

  // ---------- Patterns (decoration overlays) ----------
  function applyPattern(grid, pattern){
    const H = grid.length, W = grid[0].length;
    if (pattern === 'plain') return grid;

    if (pattern === 'dots'){
      for (let y=0;y<H;y++) for (let x=0;x<W;x++){
        if (grid[y][x]==='░' && ((x*2 + y*3) % 7 === 0)) grid[y][x]='●';
      }
    } else if (pattern === 'stripes'){
      for (let y=0;y<H;y++) for (let x=0;x<W;x++){
        if (grid[y][x]==='░' && y % 2 === 0) grid[y][x]='═';
      }
    } else if (pattern === 'cracks'){
      // simple zigzag crack down the middle
      const cx = Math.floor(W/2);
      const trail = [ [cx,2],[cx-1,3],[cx,4],[cx+1,5],[cx,6],[cx-1,7],[cx,8] ];
      trail.forEach(([x,y])=>{
        if (y<H && x>=0 && x<W && grid[y][x] !== ' ') grid[y][x]='╱';
      });
    } else if (pattern === 'sparkle'){
      const positions = [[3,3],[W-4,4],[4,8],[W-5,9],[Math.floor(W/2),2]];
      positions.forEach(([x,y])=>{
        if (y<H && x<W && grid[y][x] !== ' ') grid[y][x]='✦';
      });
    } else if (pattern === 'zigzag'){
      for (let y=0;y<H;y++) for (let x=0;x<W;x++){
        if (grid[y][x]==='░' && ((x + y) % 4 === 0)) grid[y][x]='▚';
      }
    }
    return grid;
  }

  // ---------- Face injection ----------
  function injectFace(grid, face){
    const H = grid.length, W = grid[0].length;
    const clone = grid.map(r => r.slice());
    const faceChars = Array.from(face);
    // Place on the widest-ish middle rows
    const faceRow = Math.floor(H * 0.58);
    const fStart = Math.max(0, Math.floor((W - faceChars.length) / 2));
    // Clear a fixed wide band (almost the full row) so the face
    // has breathing room on every egg variant, including chonk/wide.
    for (let y = faceRow - 1; y <= faceRow + 1; y++){
      if (y < 0 || y >= H) continue;
      for (let x = 1; x < W - 1; x++){
        clone[y][x] = ' ';
      }
    }
    for (let i = 0; i < faceChars.length && fStart + i < W; i++){
      clone[faceRow][fStart + i] = faceChars[i];
    }
    return clone;
  }

  // ---------- Topper injection ----------
  function injectTopper(grid, topper){
    if (!topper || !topper.glyph) return grid;
    const W = grid[0].length;
    // Put the topper floating just above the egg (new row prepended)
    const row = Array(W).fill(' ');
    const cx = Math.floor(W/2);
    const gChars = Array.from(topper.glyph);
    const start = cx - Math.floor(gChars.length/2);
    gChars.forEach((c,i)=>{ if (start+i>=0 && start+i<W) row[start+i] = c; });
    return [row, ...grid];
  }

  function gridToString(grid){
    return grid.map(r => r.join('')).join('\n');
  }

  // ---------- Creature class ----------
  class Creature {
    constructor(seed){
      this.setSeed(seed || 'default');
      this.mood = 'content';
    }
    setSeed(seed){
      this.seed = seed;
      const h = hashStr(seed);
      this.rng = mulberry32(h);
      this.variant = VARIANTS[Math.floor(this.rng()*VARIANTS.length)];
      this.color   = COLORS[Math.floor(this.rng()*COLORS.length)];
      this.pattern = PATTERNS[Math.floor(this.rng()*PATTERNS.length)];
      this.topper  = TOPPERS[Math.floor(this.rng()*TOPPERS.length)];
      this.accent  = COLORS[Math.floor(this.rng()*COLORS.length)];
    }
    getProfile(){
      return {
        variant: this.variant.name,
        color: this.color.name,
        colorHex: this.color.hex,
        accentHex: this.accent.hex,
        pattern: this.pattern,
        topper: this.topper.name,
      };
    }
    faceFor(mood){
      const pool = FACES[mood] || FACES.content;
      return pool[Math.floor(this.rng()*pool.length)];
    }
    render(mood){
      mood = mood || this.mood;
      const grid   = buildEgg(this.variant);
      const patted = applyPattern(grid, this.pattern);
      const faced  = injectFace(patted, this.faceFor(mood));
      const topped = injectTopper(faced, this.topper);
      return gridToString(topped);
    }
  }

  window.TamaCreature = Creature;
  window.TamaVariants = VARIANTS;
  window.TamaColors = COLORS;
})();
