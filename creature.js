/* ============================================================
   TAMAGOSCII - Creature (face-only edition)
   ------------------------------------------------------------
   The egg silhouette is now rendered by CSS (see .stage-frame
   in style.css). The creature engine only provides:

     - a deterministic colour based on the XRPL address
     - subtle egg proportions (aspect ratio variants)
     - a tiny kawaii ASCII face that changes with mood
                 ◔◡◕   ◕‿◕   ◔﹏◕   ...

   This matches the target mockup: big purple neon egg with
   a minimal white face in the middle.
============================================================ */

(function(){
  'use strict';

  /* ---------- deterministic PRNG ---------- */
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

  /* ---------- 10 unique egg colours ---------- */
  const COLORS = [
    { name:'royal-purple', main:'#b040ff', glow:'#8020ff' },
    { name:'hot-pink',     main:'#ff4b9c', glow:'#ff0066' },
    { name:'electric-cyan',main:'#40e0ff', glow:'#00b8d4' },
    { name:'neon-green',   main:'#4bf58a', glow:'#00e676' },
    { name:'sun-yellow',   main:'#ffe04b', glow:'#ffc400' },
    { name:'sunset-orange',main:'#ff8c38', glow:'#ff5722' },
    { name:'ruby-red',     main:'#ff4b6e', glow:'#f44336' },
    { name:'cobalt-blue',  main:'#4b78ff', glow:'#2962ff' },
    { name:'mint-ice',     main:'#7dffcf', glow:'#00e5cc' },
    { name:'deep-violet',  main:'#a03dff', glow:'#7b1fa2' },
  ];

  /* ---------- 4 egg proportions ---------- */
  const VARIANTS = [
    { name:'classic', aspect:1.20 }, // default slightly tall
    { name:'round',   aspect:1.08 }, // almost round
    { name:'tall',    aspect:1.32 }, // very tall/pointy
    { name:'slim',    aspect:1.26 }, // narrower
  ];

  /* ---------- kawaii faces (white, 3 chars) ----------
     Using Unicode "WHITE CIRCLE WITH XXX QUADRANT BLACK"
     characters: ◔ has a small pie cut in the upper-right,
     ◕ has it in the upper-left. On a dark background only
     the white portion is visible, giving the cute look of
     a solid circle with a tiny notch — matching the mockup. */
  const FACES = {
    content:  '◔◡◕',   // default: small smile
    happy:    '◕‿◕',   // both eyes fully open
    hungry:   '◔﹏◕',   // small frown
    sad:      '◔︵◕',   // bigger frown
    sleeping: '-‿-',   // closed eyes
    playing:  '◠‿◠',   // upside-down eyes (excited)
    dirty:    '✖‿✖',   // crossed eyes
    loved:    '♥◡♥',   // heart eyes
    angry:    '●_●',   // stern
    dead:     '×_×',   // game over
  };

  /* ---------- Creature class ---------- */
  class Creature {
    constructor(seed){
      this.setSeed(seed || 'default');
      this.mood = 'content';
    }
    setSeed(seed){
      this.seed = seed;
      const h = hashStr(seed);
      this.rng = mulberry32(h);
      this.color   = COLORS[Math.floor(this.rng()*COLORS.length)];
      this.variant = VARIANTS[Math.floor(this.rng()*VARIANTS.length)];
      this.accent  = COLORS[Math.floor(this.rng()*COLORS.length)];
    }
    getProfile(){
      return {
        color:      this.color.name,
        colorHex:   this.color.main,
        glowHex:    this.color.glow,
        accentHex:  this.accent.main,
        variant:    this.variant.name,
        aspect:     this.variant.aspect,
      };
    }
    faceFor(mood){
      return FACES[mood] || FACES.content;
    }
  }

  window.TamaCreature = Creature;
  window.TamaColors   = COLORS;
  window.TamaVariants = VARIANTS;
  window.TamaFaces    = FACES;
})();
