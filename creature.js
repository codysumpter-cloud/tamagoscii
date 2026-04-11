/* ============================================================
   TAMAGOSCII - Creature engine
   Generates a unique ASCII/pixel creature from an XRPL address
   and renders animated expressions.
============================================================ */

(function(){
  'use strict';

  // Deterministic PRNG from string (mulberry32)
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

  const SHAPES = [
    'circle','square','triangle','diamond','hexagon','star','heart','pentagon','cross','octagon'
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

  const PATTERNS = ['dots','stripes','solid','grid','sparkle'];

  // Faces - ASCII expressions
  const FACES = {
    happy:    ["( ^ w ^ )", "( > u < )", "( ◕ ‿ ◕ )"],
    content:  ["( ◔ ᴗ ◔ )", "( • ◡ • )", "( ⌐■_■ )"],
    hungry:   ["( ; _ ; )", "( T ^ T )", "( o m o )"],
    sad:      ["( ╥ _ ╥ )", "( ಥ _ ಥ )", "( ｡ T _ T ｡ )"],
    sleeping: ["( - _ - ) z","( u _ u ) Z","( =_= )..z"],
    playing:  ["( ^ o ^ )/","\\( > w < )/","( ^ 3 ^ )~"],
    dirty:    ["( x _ x )","( @ _ @ )","( ✖ _ ✖ )"],
    loved:    ["( ♥ w ♥ )","( ˘ ♥ ˘ )","( ˶ ❛ ꁞ ❛ ˶ )"],
    angry:    ["( ` _ ´ )","( ಠ _ ಠ )","(#`Д´ )"],
    dead:     ["( x o x )","( × _ × )","( ✝ _ ✝ )"],
  };

  // Generate an ASCII body (grid) of a given shape
  function buildShape(shape, rng){
    // We'll output a 2D array of characters
    const W = 13, H = 9; // creature size
    const grid = Array.from({length:H}, () => Array(W).fill(' '));
    const fill = '█';
    const edge = '▓';
    const inside = '░';

    const put = (x,y,ch)=>{ if(x>=0&&x<W&&y>=0&&y<H) grid[y][x] = ch; };

    if (shape === 'circle'){
      const cx=6,cy=4, rx=6, ry=4;
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        const d = ((x-cx)/rx)**2 + ((y-cy)/ry)**2;
        if (d<=1) grid[y][x] = d>0.7? edge : (d>0.35? inside : fill);
      }
    } else if (shape === 'square'){
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        if (y===0||y===H-1||x===0||x===W-1) grid[y][x]=edge;
        else grid[y][x]=inside;
      }
    } else if (shape === 'triangle'){
      for(let y=0;y<H;y++){
        const w = Math.round((y+1)*(W-1)/H);
        const start = Math.floor((W-w)/2);
        for(let x=start;x<=start+w;x++){
          if (y===H-1||x===start||x===start+w) grid[y][x]=edge;
          else grid[y][x]=inside;
        }
      }
    } else if (shape === 'diamond'){
      const cx=6,cy=4;
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        const d = Math.abs(x-cx)/6 + Math.abs(y-cy)/4;
        if (d<=1) grid[y][x] = d>0.8? edge : inside;
      }
    } else if (shape === 'hexagon'){
      for(let y=0;y<H;y++){
        const inset = Math.min(y, H-1-y) >= 2 ? 0 : 2 - Math.min(y, H-1-y);
        for(let x=inset;x<W-inset;x++){
          if (y===0||y===H-1||x===inset||x===W-1-inset) grid[y][x]=edge;
          else grid[y][x]=inside;
        }
      }
    } else if (shape === 'star'){
      const cx=6,cy=4;
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        const dx=(x-cx)/6, dy=(y-cy)/4;
        const r = Math.sqrt(dx*dx+dy*dy);
        const ang = Math.atan2(dy,dx);
        const k = 0.55 + 0.45*Math.cos(5*ang);
        if (r<=k) grid[y][x] = r>k*0.7? edge : inside;
      }
    } else if (shape === 'heart'){
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        const dx=(x-6)/6, dy=(y-3.5)/4;
        const v = (dx*dx + dy*dy - 0.6);
        const h = v*v*v - dx*dx*dy*dy*dy*0.9;
        if (h <= 0) grid[y][x] = h < -0.05? inside : edge;
      }
    } else if (shape === 'pentagon'){
      const cx=6,cy=4.5;
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        const dx=(x-cx)/6, dy=(y-cy)/4;
        const r = Math.sqrt(dx*dx+dy*dy);
        const ang = Math.atan2(dy,dx) + Math.PI/2;
        const k = 0.75/Math.max(Math.cos((((ang%(2*Math.PI/5))+2*Math.PI/5)%(2*Math.PI/5))-Math.PI/5), 0.2);
        if (r<=k) grid[y][x] = r>k*0.75? edge : inside;
      }
    } else if (shape === 'cross'){
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        const inVert = x>=5 && x<=7;
        const inHorz = y>=3 && y<=5;
        if (inVert||inHorz) grid[y][x] = (inVert&&inHorz)? fill : edge;
      }
    } else if (shape === 'octagon'){
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        const a = Math.min(x, W-1-x);
        const b = Math.min(y, H-1-y);
        if (a+b >= 2 && x>=0 && x<W){
          if (a===0||b===0||a+b===2) grid[y][x]=edge;
          else grid[y][x]=inside;
        }
      }
    }

    return grid;
  }

  // Apply a visual pattern and inject face into grid, return multiline string
  function gridToString(grid, face){
    const H = grid.length, W = grid[0].length;
    const clone = grid.map(r=>r.slice());
    const faceChars = Array.from(face); // split by Unicode code point
    // Always center face on the middle row of the full grid
    const faceRow = Math.floor(H/2);
    const fStart = Math.max(0, Math.floor((W - faceChars.length)/2));
    const fEnd   = Math.min(W, fStart + faceChars.length);
    // Clear a band above/below face to ensure readability
    const clearPad = 1;
    for(let y=faceRow-1;y<=faceRow+1;y++){
      if (y<0||y>=H) continue;
      for(let x=Math.max(0,fStart-clearPad); x<Math.min(W,fEnd+clearPad); x++){
        clone[y][x] = ' ';
      }
    }
    for(let i=0;i<faceChars.length && fStart+i<W;i++){
      clone[faceRow][fStart+i] = faceChars[i];
    }
    return clone.map(r=>r.join('')).join('\n');
  }

  function applyPattern(grid, pattern){
    const H = grid.length, W = grid[0].length;
    if (pattern === 'dots'){
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        if (grid[y][x]==='░' && (x+y)%3===0) grid[y][x]='●';
      }
    } else if (pattern === 'stripes'){
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        if (grid[y][x]==='░' && y%2===0) grid[y][x]='▒';
      }
    } else if (pattern === 'solid'){
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        if (grid[y][x]==='░') grid[y][x]='▓';
      }
    } else if (pattern === 'grid'){
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        if (grid[y][x]==='░' && (x%2===0 || y%2===0)) grid[y][x]='▒';
      }
    } else if (pattern === 'sparkle'){
      const positions = [[1,1],[11,1],[2,7],[10,7],[6,0]];
      positions.forEach(([x,y])=>{ if (y<H && x<W && grid[y][x]!==' ') grid[y][x]='✦'; });
    }
    return grid;
  }

  class Creature {
    constructor(seed){
      this.setSeed(seed || 'default');
      this.mood = 'content';
    }
    setSeed(seed){
      this.seed = seed;
      const h = hashStr(seed);
      this.rng = mulberry32(h);
      this.shape   = SHAPES[Math.floor(this.rng()*SHAPES.length)];
      this.color   = COLORS[Math.floor(this.rng()*COLORS.length)];
      this.pattern = PATTERNS[Math.floor(this.rng()*PATTERNS.length)];
      // cosmetic flourish
      this.accent  = COLORS[Math.floor(this.rng()*COLORS.length)];
    }
    getProfile(){
      return {
        shape:this.shape,
        color:this.color.name,
        colorHex:this.color.hex,
        accentHex:this.accent.hex,
        pattern:this.pattern,
      };
    }
    faceFor(mood){
      const pool = FACES[mood] || FACES.content;
      return pool[Math.floor(this.rng()*pool.length)];
    }
    render(mood){
      mood = mood || this.mood;
      const grid = buildShape(this.shape, this.rng);
      applyPattern(grid, this.pattern);
      const face = this.faceFor(mood);
      return gridToString(grid, face);
    }
  }

  window.TamaCreature = Creature;
  window.TamaColors = COLORS;
  window.TamaShapes = SHAPES;
})();
