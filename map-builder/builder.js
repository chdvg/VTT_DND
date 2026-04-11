'use strict';

// ── Tile definitions ──────────────────────────────────────────
const TILES = [
  { id: 'stone-floor',  label: 'Stone',    color: '#6b7280', pattern: 'grid' },
  { id: 'wood-floor',   label: 'Wood',     color: '#92400e', pattern: 'grid' },
  { id: 'dirt',         label: 'Dirt',     color: '#78350f', pattern: 'plain' },
  { id: 'grass',        label: 'Grass',    color: '#166534', pattern: 'plain' },
  { id: 'water',        label: 'Water',    color: '#1e40af', pattern: 'wave' },
  { id: 'deep-water',   label: 'Deep',     color: '#1e3a5f', pattern: 'plain' },
  { id: 'wall',         label: 'Wall',     color: '#374151', pattern: 'solid' },
  { id: 'stone-wall',   label: 'S.Wall',   color: '#1f2937', pattern: 'solid' },
  { id: 'lava',         label: 'Lava',     color: '#b45309', pattern: 'lava' },
  { id: 'sand',         label: 'Sand',     color: '#d97706', pattern: 'plain' },
  { id: 'snow',         label: 'Snow',     color: '#e5e7eb', pattern: 'plain' },
  { id: 'swamp',        label: 'Swamp',    color: '#365314', pattern: 'plain' },
  { id: 'cave',         label: 'Cave',     color: '#44403c', pattern: 'grid' },
  { id: 'road',         label: 'Road',     color: '#a8a29e', pattern: 'plain' },
  { id: 'door',         label: 'Door',     color: '#7c2d12', pattern: 'door' },
  { id: 'pit',          label: 'Pit',      color: '#0a0a0a', pattern: 'solid' },
  { id: 'tree',         label: 'Tree',     color: '#14532d', pattern: 'tree' },
  { id: 'mountain',     label: 'Mountain', color: '#57534e', pattern: 'mountain' },
  { id: 'hill',         label: 'Hill',     color: '#65a30d', pattern: 'hill' },
  { id: 'fire',         label: 'Fire',     color: '#ea580c', pattern: 'fire' },
];

// ── Procedural tile textures ──────────────────────────────────
const _texCache  = {};
const _patByCtx  = new WeakMap();

function _rng(seed) {
  let s = (seed | 0) + 1;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

function buildTextureCanvas(tileId) {
  const sz = 64;
  const cv = document.createElement('canvas');
  cv.width = sz; cv.height = sz;
  const x = cv.getContext('2d');
  const r = _rng(tileId.split('').reduce((a, c) => a + c.charCodeAt(0), 7));
  switch (tileId) {
    case 'grass': {
      x.fillStyle = '#1a5c2e'; x.fillRect(0, 0, sz, sz);
      const gc = ['#15803d','#16a34a','#14532d','#22c55e','#4ade80','#166534'];
      for (let i = 0; i < 100; i++) {
        const px = r()*sz, py = r()*sz, len = 4 + r()*7;
        const ang = -1.3 + (r()-0.5)*1.8;
        x.strokeStyle = gc[~~(r()*gc.length)]; x.lineWidth = 1 + r()*0.5;
        x.globalAlpha = 0.55 + r()*0.45;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(ang)*len, py + Math.sin(ang)*len); x.stroke();
      }
      x.globalAlpha = 1; break;
    }
    case 'stone-floor': {
      x.fillStyle = '#505869'; x.fillRect(0, 0, sz, sz);
      [[2,2,28,18],[33,2,29,15],[2,23,19,21],[24,20,23,22],[49,18,13,24],[2,47,23,15],[28,45,21,17],[51,45,11,17]]
        .forEach(([sx,sy,sw,sh]) => {
          const s2 = 0.78 + r()*0.38;
          x.fillStyle = `rgb(${~~(88*s2)},${~~(98*s2)},${~~(114*s2)})`; x.fillRect(sx+1,sy+1,sw-2,sh-2);
          x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(sx+2,sy+2,sw-4,3);
          x.strokeStyle = '#2d3340'; x.lineWidth = 1; x.strokeRect(sx+.5,sy+.5,sw,sh);
        });
      x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 0.5;
      for (let i=0;i<8;i++){x.beginPath();x.moveTo(r()*sz,r()*sz);x.lineTo(r()*sz,r()*sz);x.stroke();}
      break;
    }
    case 'stone-wall': {
      x.fillStyle = '#2d3340'; x.fillRect(0, 0, sz, sz);
      const bh=11, mt=2;
      for (let row=0; row*bh<sz+bh; row++) {
        const oy=row*bh, off=(row%2)*15;
        for (let bx=-off; bx<sz+30; bx+=30) {
          const s2=0.72+r()*0.38;
          x.fillStyle=`rgb(${~~(45*s2)},${~~(52*s2)},${~~(63*s2)})`; x.fillRect(bx+mt,oy+mt,30-mt*2,bh-mt*2);
          x.fillStyle='rgba(255,255,255,0.05)'; x.fillRect(bx+mt,oy+mt,30-mt*2,2);
          x.fillStyle='rgba(0,0,0,0.2)';         x.fillRect(bx+mt,oy+bh-mt-1,30-mt*2,2);
        }
      }
      break;
    }
    case 'wall': {
      x.fillStyle='#2e3545'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<9;i++){x.beginPath();x.arc(r()*sz,r()*sz,3+r()*8,0,Math.PI*2);x.fillStyle=r()>.5?'#1a1f2b':'#424d60';x.globalAlpha=.5;x.fill();}
      x.globalAlpha=1; x.fillStyle='rgba(0,0,0,0.45)'; x.fillRect(5,5,sz-10,sz-10); break;
    }
    case 'water': {
      const g=x.createLinearGradient(0,0,0,sz);
      g.addColorStop(0,'#1d4ed8'); g.addColorStop(1,'#1e3a8a');
      x.fillStyle=g; x.fillRect(0,0,sz,sz);
      for(let i=0;i<14;i++){x.beginPath();x.ellipse(r()*sz,r()*sz,6+r()*14,2+r()*5,r()*Math.PI,0,Math.PI*2);x.fillStyle=`rgba(147,197,253,${.04+r()*.12})`;x.fill();}
      x.strokeStyle='rgba(191,219,254,0.35)'; x.lineWidth=1;
      for(let wy=7;wy<sz;wy+=10){x.beginPath();x.moveTo(0,wy);x.bezierCurveTo(sz*.3,wy-4,sz*.7,wy+4,sz,wy);x.stroke();}
      break;
    }
    case 'deep-water': {
      const g=x.createLinearGradient(0,0,0,sz);
      g.addColorStop(0,'#1e3a5f'); g.addColorStop(1,'#172554');
      x.fillStyle=g; x.fillRect(0,0,sz,sz);
      for(let i=0;i<7;i++){x.beginPath();x.ellipse(r()*sz,r()*sz,5+r()*10,2+r()*4,r()*Math.PI,0,Math.PI*2);x.fillStyle=`rgba(96,165,250,${.04+r()*.08})`;x.fill();}
      x.strokeStyle='rgba(96,165,250,0.15)'; x.lineWidth=.8;
      for(let wy=9;wy<sz;wy+=13){x.beginPath();x.moveTo(0,wy);x.bezierCurveTo(sz*.3,wy-3,sz*.7,wy+3,sz,wy);x.stroke();}
      break;
    }
    case 'wood-floor': {
      const pw=16;
      for(let px=0;px<sz;px+=pw){
        const s2=0.8+r()*.35, rv=~~(148*s2), gv=~~(64*s2), bv=~~(14*s2);
        x.fillStyle=`rgb(${Math.min(rv,255)},${Math.min(gv,255)},${Math.min(bv,255)})`; x.fillRect(px,0,pw,sz);
        x.strokeStyle='rgba(0,0,0,0.25)'; x.lineWidth=.5;
        for(let gl=4;gl<sz;gl+=7+~~(r()*5)){x.beginPath();x.moveTo(px+1,gl);x.bezierCurveTo(px+r()*4,gl+2,px+pw-r()*4,gl+1,px+pw-1,gl);x.stroke();}
        x.strokeStyle='rgba(0,0,0,0.3)'; x.lineWidth=1;
        x.beginPath(); x.moveTo(px,0); x.lineTo(px,sz); x.stroke();
      }
      break;
    }
    case 'dirt': {
      x.fillStyle='#78350f'; x.fillRect(0,0,sz,sz);
      const dc=['#6b2d0b','#7c3a12','#5c2409','#884010','#3e1a06'];
      for(let i=0;i<22;i++){x.beginPath();x.arc(r()*sz,r()*sz,2+r()*9,0,Math.PI*2);x.fillStyle=dc[~~(r()*dc.length)];x.globalAlpha=.45;x.fill();}
      x.globalAlpha=1;
      for(let i=0;i<10;i++){x.beginPath();x.arc(r()*sz,r()*sz,1.2,0,Math.PI*2);x.fillStyle='#a16207';x.fill();}
      break;
    }
    case 'sand': {
      x.fillStyle='#c88b09'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<50;i++){x.beginPath();x.arc(r()*sz,r()*sz,r()*3+.5,0,Math.PI*2);x.fillStyle=r()>.5?'#f59e0b':'#a16207';x.globalAlpha=.25+r()*.4;x.fill();}
      x.globalAlpha=1; x.strokeStyle='rgba(251,191,36,0.2)'; x.lineWidth=.5;
      for(let wy=8;wy<sz;wy+=9){x.beginPath();x.moveTo(0,wy);x.bezierCurveTo(sz*.3,wy-2,sz*.7,wy+2,sz,wy);x.stroke();}
      break;
    }
    case 'snow': {
      x.fillStyle='#dde3ea'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<30;i++){x.beginPath();x.arc(r()*sz,r()*sz,2+r()*5,0,Math.PI*2);x.fillStyle=r()>.5?'#f9fafb':'#c8d0da';x.globalAlpha=.4;x.fill();}
      x.globalAlpha=1; x.fillStyle='#fff';
      for(let i=0;i<15;i++){x.beginPath();x.arc(r()*sz,r()*sz,1,0,Math.PI*2);x.fill();}
      break;
    }
    case 'swamp': {
      x.fillStyle='#2d4a12'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<12;i++){x.beginPath();x.ellipse(r()*sz,r()*sz,8+r()*14,4+r()*7,r()*Math.PI,0,Math.PI*2);x.fillStyle=r()>.5?'#1a2e05':'#4d7c0f';x.globalAlpha=.5;x.fill();}
      x.globalAlpha=1;
      for(let i=0;i<5;i++){x.beginPath();x.ellipse(r()*sz,r()*sz,5+r()*9,3+r()*5,r()*Math.PI,0,Math.PI*2);x.fillStyle='rgba(30,90,40,0.4)';x.fill();}
      break;
    }
    case 'cave': {
      x.fillStyle='#3c3733'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<10;i++){x.beginPath();x.arc(r()*sz,r()*sz,4+r()*11,0,Math.PI*2);x.fillStyle=r()>.5?'#292524':'#514b47';x.globalAlpha=.5;x.fill();}
      x.globalAlpha=1; x.strokeStyle='rgba(0,0,0,0.35)'; x.lineWidth=.6;
      for(let i=0;i<7;i++){x.beginPath();x.moveTo(r()*sz,r()*sz);x.lineTo(r()*sz,r()*sz);x.stroke();}
      break;
    }
    case 'road': {
      x.fillStyle='#9c9490'; x.fillRect(0,0,sz,sz);
      for(let i=0;i<8;i++){x.beginPath();x.arc(r()*sz,r()*sz,3+r()*7,0,Math.PI*2);x.fillStyle=r()>.5?'#d6d3d1':'#6b6560';x.globalAlpha=.35;x.fill();}
      x.globalAlpha=1; x.strokeStyle='rgba(100,94,88,0.3)'; x.lineWidth=.8;
      for(let wy=9;wy<sz;wy+=16){x.beginPath();x.moveTo(0,wy);x.lineTo(sz,wy+(r()-.5)*4);x.stroke();}
      break;
    }
    case 'lava': {
      // Flowing lava — modelled after water but in fire colours
      const lg=x.createLinearGradient(0,0,0,sz);
      lg.addColorStop(0,'#b91c1c'); lg.addColorStop(1,'#7f1d1d');
      x.fillStyle=lg; x.fillRect(0,0,sz,sz);
      // Hot-spot ellipses (like water's light patches)
      for(let i=0;i<14;i++){x.beginPath();x.ellipse(r()*sz,r()*sz,6+r()*14,2+r()*5,r()*Math.PI,0,Math.PI*2);x.fillStyle=`rgba(251,146,60,${.06+r()*.18})`;x.fill();}
      // Flowing wave lines in bright orange/yellow
      x.strokeStyle='rgba(253,186,116,0.45)'; x.lineWidth=1;
      for(let wy=7;wy<sz;wy+=10){x.beginPath();x.moveTo(0,wy);x.bezierCurveTo(sz*.3,wy-4,sz*.7,wy+4,sz,wy);x.stroke();}
      break;
    }
    case 'pit': {
      const g=x.createRadialGradient(sz/2,sz/2,2,sz/2,sz/2,sz*.65);
      g.addColorStop(0,'#141414'); g.addColorStop(1,'#000');
      x.fillStyle=g; x.fillRect(0,0,sz,sz);
      x.strokeStyle='rgba(255,255,255,0.06)'; x.lineWidth=1; x.strokeRect(2,2,sz-4,sz-4); break;
    }
    case 'door': {
      x.fillStyle='#6b2210'; x.fillRect(0,0,sz,sz);
      x.fillStyle='#8a3712'; x.fillRect(~~(sz*.12),~~(sz*.05),~~(sz*.76),~~(sz*.92));
      x.strokeStyle='#4a1a08'; x.lineWidth=1.5;
      for(let i=0;i<4;i++){const ey=~~(sz*.05+i*sz*.23);x.beginPath();x.moveTo(~~(sz*.12)+2,ey+2);x.lineTo(~~(sz*.88)-2,ey+2);x.stroke();}
      x.fillStyle='#ca8a04';
      x.beginPath(); x.arc(~~(sz*.7),~~(sz*.5),~~(sz*.07)+1,0,Math.PI*2); x.fill();
      x.strokeStyle='#92400e'; x.lineWidth=1;
      x.beginPath(); x.arc(~~(sz*.7),~~(sz*.5),~~(sz*.07)+1,0,Math.PI*2); x.stroke();
      break;
    }
    case 'tree': {
      // Top-down single tree — canopy fills the tile
      const cx=sz*.5, cy=sz*.5;
      const cr=sz*.44; // canopy radius nearly fills tile
      // Ground shadow cast behind the canopy (offset slightly)
      x.beginPath(); x.ellipse(cx+sz*.06,cy+sz*.07,cr*.88,cr*.82,0,0,Math.PI*2);
      x.fillStyle='rgba(0,0,0,0.28)'; x.fill();
      // Outer canopy — darkest ring (shade underneath outer leaves)
      x.beginPath(); x.arc(cx,cy,cr,0,Math.PI*2);
      x.fillStyle='#14532d'; x.fill();
      // Mid canopy
      x.beginPath(); x.arc(cx,cy,cr*.78,0,Math.PI*2);
      x.fillStyle='#166534'; x.fill();
      // Inner canopy
      x.beginPath(); x.arc(cx,cy,cr*.56,0,Math.PI*2);
      x.fillStyle='#15803d'; x.fill();
      // Bright sunlit centre
      x.beginPath(); x.arc(cx,cy,cr*.35,0,Math.PI*2);
      x.fillStyle='#16a34a'; x.fill();
      // Highlight — upper-left bright spot (sun from upper-left)
      const hg=x.createRadialGradient(cx-cr*.22,cy-cr*.22,0,cx-cr*.22,cy-cr*.22,cr*.38);
      hg.addColorStop(0,'rgba(134,239,172,0.55)');
      hg.addColorStop(1,'rgba(134,239,172,0)');
      x.fillStyle=hg; x.fill(); // reuse last path shape
      x.beginPath(); x.arc(cx-cr*.22,cy-cr*.22,cr*.38,0,Math.PI*2); x.fillStyle=hg; x.fill();
      // Trunk dot visible at exact center
      x.beginPath(); x.arc(cx,cy,cr*.1,0,Math.PI*2);
      x.fillStyle='#78350f'; x.fill();
      x.beginPath(); x.arc(cx,cy,cr*.055,0,Math.PI*2);
      x.fillStyle='#92400e'; x.fill();
      // Leaf texture — small dark blobs around the canopy edge
      for(let i=0;i<16;i++){
        const ang=r()*Math.PI*2, dist=cr*(0.55+r()*0.42);
        x.beginPath(); x.ellipse(cx+Math.cos(ang)*dist, cy+Math.sin(ang)*dist, 2+r()*4, 2+r()*3, r()*Math.PI,0,Math.PI*2);
        x.fillStyle=`rgba(10,60,20,${0.3+r()*0.35})`; x.fill();
      }
      break;
    }
    case 'mountain': {
      // No background fill — transparent outside the triangle
      const mpx=sz*.5, mpy=sz*.05;   // peak
      const mbl=sz*.04, mbr=sz*.96, mby=sz*.93; // left foot, right foot, base y
      const mmc=sz*.5;                // base centre x (ridge foot)
      // Left face — lit side
      x.beginPath(); x.moveTo(mpx,mpy); x.lineTo(mbl,mby); x.lineTo(mmc,mby); x.closePath();
      x.fillStyle='#5c5650'; x.fill();
      // Right face — shadow side
      x.beginPath(); x.moveTo(mpx,mpy); x.lineTo(mmc,mby); x.lineTo(mbr,mby); x.closePath();
      x.fillStyle='#3a3733'; x.fill();
      // Strata lines — left face
      x.strokeStyle='rgba(0,0,0,0.22)'; x.lineWidth=0.5;
      for(let i=1;i<5;i++){const t=i/5;
        x.beginPath();
        x.moveTo(mpx+(mbl-mpx)*t, mpy+(mby-mpy)*t);
        x.lineTo(mpx+(mmc-mpx)*t, mpy+(mby-mpy)*t);
        x.stroke();}
      // Strata lines — right face
      for(let i=1;i<5;i++){const t=i/5;
        x.beginPath();
        x.moveTo(mpx+(mmc-mpx)*t, mpy+(mby-mpy)*t);
        x.lineTo(mpx+(mbr-mpx)*t, mpy+(mby-mpy)*t);
        x.stroke();}
      // Snow cap — white triangle at top ~22% of height
      const snowy=mpy+(mby-mpy)*.22;
      const snowl=mpx+(mbl-mpx)*.22, snowr=mpx+(mbr-mpx)*.22;
      x.beginPath(); x.moveTo(mpx,mpy); x.lineTo(snowl,snowy); x.lineTo(mmc,snowy); x.closePath();
      x.fillStyle='#f0ede8'; x.fill();
      x.beginPath(); x.moveTo(mpx,mpy); x.lineTo(mmc,snowy); x.lineTo(snowr,snowy); x.closePath();
      x.fillStyle='#d8d4cf'; x.fill(); // right snow face slightly dimmer
      // Crisp mountain outline
      x.strokeStyle='rgba(0,0,0,0.55)'; x.lineWidth=0.8;
      x.beginPath(); x.moveTo(mpx,mpy); x.lineTo(mbl,mby); x.lineTo(mbr,mby); x.closePath(); x.stroke();
      break;
    }
    case 'hill': {
      // Dark grass base
      x.fillStyle='#1a3d0c'; x.fillRect(0,0,sz,sz);
      const hx=sz*.5, hy=sz*.5;
      // Concentric layers from outside in — dark to light
      const hLayers=[
        {rx:sz*.48,ry:sz*.44,c:'#234f10'},
        {rx:sz*.39,ry:sz*.35,c:'#2e6b16'},
        {rx:sz*.30,ry:sz*.27,c:'#3d8a1e'},
        {rx:sz*.21,ry:sz*.19,c:'#52a828'},
        {rx:sz*.13,ry:sz*.11,c:'#6abf34'},
        {rx:sz*.06,ry:sz*.05,c:'#8fd64a'},
      ];
      hLayers.forEach(({rx,ry,c})=>{
        x.beginPath(); x.ellipse(hx,hy,rx,ry,0,0,Math.PI*2);
        x.fillStyle=c; x.fill();
      });
      // Soft highlight dot at peak
      x.beginPath(); x.ellipse(hx,hy,sz*.04,sz*.035,0,0,Math.PI*2);
      x.fillStyle='rgba(180,255,120,0.6)'; x.fill();
      // Shadow arc lower-right
      x.strokeStyle='rgba(0,0,0,0.25)'; x.lineWidth=1;
      [sz*.46,sz*.36,sz*.26].forEach(rad=>{
        x.beginPath(); x.ellipse(hx+sz*.04,hy+sz*.05,rad,rad*.9,0,Math.PI*.3,Math.PI*1.2);
        x.stroke();
      });
      // Highlight arc upper-left
      x.strokeStyle='rgba(180,255,100,0.2)'; x.lineWidth=.8;
      [sz*.36,sz*.25].forEach(rad=>{
        x.beginPath(); x.ellipse(hx-sz*.03,hy-sz*.04,rad,rad*.9,0,Math.PI*1.3,Math.PI*2.2);
        x.stroke();
      });
      break;
    }
    case 'fire': {
      // No background fill — transparent outside flame shapes
      // Outer flame — red/orange silhouette, 3 tongues, full-width base
      x.beginPath();
      x.moveTo(0, sz);
      x.bezierCurveTo(0,       sz*.52,  sz*.06,  sz*.10,  sz*.18,  sz*.05);
      x.bezierCurveTo(sz*.28,  sz*.01,  sz*.30,  sz*.38,  sz*.36,  sz*.40);
      x.bezierCurveTo(sz*.41,  sz*.42,  sz*.44,  sz*.02,  sz*.50,  sz*.01);
      x.bezierCurveTo(sz*.56,  sz*.00,  sz*.59,  sz*.40,  sz*.64,  sz*.40);
      x.bezierCurveTo(sz*.70,  sz*.40,  sz*.72,  sz*.01,  sz*.82,  sz*.05);
      x.bezierCurveTo(sz*.92,  sz*.09,  sz,      sz*.52,  sz,      sz);
      x.closePath();
      const fo=x.createLinearGradient(0,sz,0,0);
      fo.addColorStop(0,'rgba(255,215,45,0.98)');
      fo.addColorStop(0.30,'rgba(235,82,0,0.96)');
      fo.addColorStop(1,'rgba(158,14,0,0.92)');
      x.fillStyle=fo; x.fill();

      // Inner flame — orange/yellow, 3 inset tongues
      x.beginPath();
      x.moveTo(sz*.06, sz);
      x.bezierCurveTo(sz*.06, sz*.60,  sz*.14,  sz*.19,  sz*.24,  sz*.17);
      x.bezierCurveTo(sz*.33, sz*.15,  sz*.35,  sz*.48,  sz*.41,  sz*.50);
      x.bezierCurveTo(sz*.46, sz*.52,  sz*.48,  sz*.12,  sz*.50,  sz*.10);
      x.bezierCurveTo(sz*.52, sz*.08,  sz*.55,  sz*.50,  sz*.59,  sz*.50);
      x.bezierCurveTo(sz*.65, sz*.50,  sz*.68,  sz*.15,  sz*.76,  sz*.17);
      x.bezierCurveTo(sz*.86, sz*.19,  sz*.94,  sz*.60,  sz*.94,  sz);
      x.closePath();
      const fi=x.createLinearGradient(0,sz,0,0);
      fi.addColorStop(0,'rgba(255,248,110,0.97)');
      fi.addColorStop(0.26,'rgba(255,148,10,0.95)');
      fi.addColorStop(1,'rgba(215,48,0,0.88)');
      x.fillStyle=fi; x.fill();

      // Hottest base glow — clipped to outer flame so no rectangle artifact
      x.save();
      x.beginPath();
      x.moveTo(0, sz);
      x.bezierCurveTo(0,       sz*.52,  sz*.06,  sz*.10,  sz*.18,  sz*.05);
      x.bezierCurveTo(sz*.28,  sz*.01,  sz*.30,  sz*.38,  sz*.36,  sz*.40);
      x.bezierCurveTo(sz*.41,  sz*.42,  sz*.44,  sz*.02,  sz*.50,  sz*.01);
      x.bezierCurveTo(sz*.56,  sz*.00,  sz*.59,  sz*.40,  sz*.64,  sz*.40);
      x.bezierCurveTo(sz*.70,  sz*.40,  sz*.72,  sz*.01,  sz*.82,  sz*.05);
      x.bezierCurveTo(sz*.92,  sz*.09,  sz,      sz*.52,  sz,      sz);
      x.closePath();
      x.clip();
      const hg=x.createLinearGradient(0,sz,0,sz*.74);
      hg.addColorStop(0,'rgba(255,255,220,0.94)');
      hg.addColorStop(1,'rgba(255,210,40,0)');
      x.fillStyle=hg; x.fillRect(0,sz*.74,sz,sz*.26);
      x.restore();
      break;
    }
  }
  return cv;
}

function getTexturePattern(ctx, tileId) {
  let map = _patByCtx.get(ctx);
  if (!map) { map = {}; _patByCtx.set(ctx, map); }
  if (!map[tileId]) {
    if (!_texCache[tileId]) _texCache[tileId] = buildTextureCanvas(tileId);
    map[tileId] = ctx.createPattern(_texCache[tileId], 'repeat');
  }
  return map[tileId];
}

// ── State ─────────────────────────────────────────────────────
let cols     = 20;
let rows     = 15;
let cellSize = 40;

// tileMap[r][c] = tile id or null
let tileMap  = [];
// tokens: { id, col, row, name, color }
let tokens   = [];
// labels: { id, col, row, text, size, color }
let labels   = [];
// background image url
let bgImage  = null;
let bgImageEl = null;

let activeTool  = 'paint';
let activeTile  = TILES[0];

// Undo stack — each entry is a snapshot of tileMap
let undoStack   = [];
const MAX_UNDO  = 40;

// Paint drag tracking
let isPainting  = false;
let paintValue  = null; // tile id being painted (null = erase)

// Fog of War state
let fogEnabled     = false;
let fogIsPainting  = false;
let fogPaintValue  = false;
const FOG_KEY      = 'builder-live';
let fogBuilderGrid = [];   // [row][col] = true (revealed) / false (hidden)

// WebSocket
let ws = null;
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + location.host + '/ws');
  ws.onclose = () => setTimeout(connectWS, 2000);
}
connectWS();

// ── Canvas refs ───────────────────────────────────────────────
const bgCanvas     = document.getElementById('bg-canvas');
const tileCanvas   = document.getElementById('tile-canvas');
const gridCanvas   = document.getElementById('grid-canvas');
const cursorCanvas = document.getElementById('cursor-canvas');
const tokenLayer   = document.getElementById('token-layer');
const labelLayer   = document.getElementById('label-layer');
const container    = document.getElementById('canvas-container');
const coordsEl     = document.getElementById('coords');
const fogLayer     = document.getElementById('fog-layer');

const bgCtx     = bgCanvas.getContext('2d');
const tileCtx   = tileCanvas.getContext('2d');
const gridCtx   = gridCanvas.getContext('2d');
const cursorCtx = cursorCanvas.getContext('2d');

// ── Init ──────────────────────────────────────────────────────
function initGrid() {
  tileMap = [];
  for (let r = 0; r < rows; r++) {
    tileMap.push(new Array(cols).fill(null));
  }
  tokens = [];
  labels = [];
  undoStack = [];
  initFogGrid();
  applySize();
}

function applySize() {
  const w = cols * cellSize;
  const h = rows * cellSize;
  [bgCanvas, tileCanvas, gridCanvas, cursorCanvas].forEach(c => {
    c.width  = w;
    c.height = h;
    c.style.width  = w + 'px';
    c.style.height = h + 'px';
  });
  container.style.width  = w + 'px';
  container.style.height = h + 'px';
  if (fogEnabled) renderFogLayer();
  renderAll();
}

// ── Rendering ─────────────────────────────────────────────────
function renderAll() {
  renderBg();
  renderTiles();
  renderGrid();
  renderTokens();
  renderLabels();
}

function renderBg() {
  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  bgCtx.fillStyle = '#111';
  bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
  if (bgImageEl && bgImageEl.complete && bgImageEl.naturalWidth) {
    bgCtx.drawImage(bgImageEl, 0, 0, bgCanvas.width, bgCanvas.height);
  }
}

function renderTiles() {
  tileCtx.clearRect(0, 0, tileCanvas.width, tileCanvas.height);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tid = tileMap[r][c];
      if (!tid) continue;
      const tile = TILES.find(t => t.id === tid);
      if (!tile) continue;
      drawTile(tileCtx, tile, c * cellSize, r * cellSize, cellSize);
    }
  }
}

function drawTile(ctx, tile, x, y, size) {
  ctx.fillStyle = getTexturePattern(ctx, tile.id);
  ctx.fillRect(x, y, size, size);
}

function renderGrid() {
  gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
  gridCtx.strokeStyle = 'rgba(255,255,255,0.08)';
  gridCtx.lineWidth = 0.5;
  for (let c = 0; c <= cols; c++) {
    gridCtx.beginPath();
    gridCtx.moveTo(c * cellSize, 0);
    gridCtx.lineTo(c * cellSize, rows * cellSize);
    gridCtx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    gridCtx.beginPath();
    gridCtx.moveTo(0, r * cellSize);
    gridCtx.lineTo(cols * cellSize, r * cellSize);
    gridCtx.stroke();
  }
}

function renderTokens() {
  tokenLayer.innerHTML = '';
  tokens.forEach(tok => {
    const el = document.createElement('div');
    el.className = 'token-el';
    el.style.left   = (tok.col * cellSize + cellSize / 2) + 'px';
    el.style.top    = (tok.row * cellSize + cellSize / 2) + 'px';
    el.style.width  = (cellSize - 6) + 'px';
    el.style.height = (cellSize - 6) + 'px';
    el.style.background = tok.color;
    el.style.fontSize = Math.max(8, cellSize * 0.22) + 'px';
    el.textContent = tok.name;
    makeDraggableToken(el, tok);
    tokenLayer.appendChild(el);
  });
}

function renderLabels() {
  labelLayer.innerHTML = '';
  labels.forEach(lbl => {
    const el = document.createElement('div');
    el.className = 'label-el';
    el.style.left     = (lbl.col * cellSize + cellSize / 2) + 'px';
    el.style.top      = (lbl.row * cellSize) + 'px';
    el.style.fontSize = lbl.size + 'px';
    el.style.color    = lbl.color;
    el.textContent    = lbl.text;
    makeDraggableLabel(el, lbl);
    labelLayer.appendChild(el);
  });
}

// ── Cursor preview ────────────────────────────────────────────
function drawCursor(col, row) {
  cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return;
  cursorCtx.strokeStyle = '#d4af37';
  cursorCtx.lineWidth = 2;
  cursorCtx.strokeRect(col * cellSize + 1, row * cellSize + 1, cellSize - 2, cellSize - 2);
}

// ── Canvas mouse interaction ──────────────────────────────────
function getCellFromEvent(e) {
  const rect = cursorCanvas.getBoundingClientRect();
  const x    = e.clientX - rect.left;
  const y    = e.clientY - rect.top;
  return {
    col: Math.floor(x / cellSize),
    row: Math.floor(y / cellSize),
  };
}

function pushUndo() {
  const snap = tileMap.map(r => [...r]);
  undoStack.push(snap);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function applyPaint(col, row) {
  if (col < 0 || row < 0 || col >= cols || row >= rows) return;
  const val = activeTool === 'erase' ? null : activeTile.id;

  // When erasing, always remove tokens/labels on this cell first,
  // regardless of whether there is a tile underneath
  if (val === null) {
    const prevTokenCount = tokens.length;
    const prevLabelCount = labels.length;
    tokens = tokens.filter(t => !(t.col === col && t.row === row));
    labels = labels.filter(l => !(l.col === col && l.row === row));
    if (tokens.length !== prevTokenCount) renderTokens();
    if (labels.length !== prevLabelCount) renderLabels();
  }

  if (tileMap[row][col] === val) return;
  tileMap[row][col] = val;
  if (val === null) {
    tileCtx.clearRect(col * cellSize, row * cellSize, cellSize, cellSize);
  } else {
    drawTile(tileCtx, activeTile, col * cellSize, row * cellSize, cellSize);
  }
}

function floodFill(startCol, startRow, targetId, fillId) {
  if (startCol < 0 || startRow < 0 || startCol >= cols || startRow >= rows) return;
  if (targetId === fillId) return;
  const stack = [[startCol, startRow]];
  while (stack.length) {
    const [c, r] = stack.pop();
    if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
    if (tileMap[r][c] !== targetId) continue;
    tileMap[r][c] = fillId;
    stack.push([c+1,r],[c-1,r],[c,r+1],[c,r-1]);
  }
  renderTiles();
}

cursorCanvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const { col, row } = getCellFromEvent(e);

  if (activeTool === 'paint' || activeTool === 'erase') {
    pushUndo();
    isPainting = true;
    applyPaint(col, row);
  } else if (activeTool === 'fill') {
    pushUndo();
    const targetId = tileMap[row]?.[col] ?? null;
    const fillId   = activeTile.id;
    floodFill(col, row, targetId, fillId);
  } else if (activeTool === 'token') {
    placeToken(col, row);
  } else if (activeTool === 'label') {
    placeLabel(col, row);
  } else if (activeTool === 'image') {
    // handled by sidebar
  }
});

cursorCanvas.addEventListener('mousemove', e => {
  const { col, row } = getCellFromEvent(e);
  drawCursor(col, row);
  coordsEl.textContent = col + ', ' + row;
  if (isPainting && (activeTool === 'paint' || activeTool === 'erase')) {
    applyPaint(col, row);
  }
});

cursorCanvas.addEventListener('mouseup',    ()  => { isPainting = false; });
cursorCanvas.addEventListener('mouseleave', ()  => {
  isPainting = false;
  cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
  coordsEl.textContent = '';
});
// Prevent context menu interfering with right-click erase extension
cursorCanvas.addEventListener('contextmenu', e => e.preventDefault());

// Right-click = quick erase
cursorCanvas.addEventListener('mousedown', e => {
  if (e.button === 2) {
    pushUndo();
    isPainting = true;
    const { col, row } = getCellFromEvent(e);
    const prev = activeTool;
    activeTool = 'erase';
    applyPaint(col, row);
    activeTool = prev;
  }
});

// ── Token placement + drag ────────────────────────────────────
let _tokenSeq = 0;
function placeToken(col, row) {
  const name  = document.getElementById('token-name').value.trim() || '?';
  const color = document.getElementById('token-color').value;
  tokens.push({ id: ++_tokenSeq, col, row, name, color });
  renderTokens();
}

function makeDraggableToken(el, tok) {
  let dragging = false, startX, startY, origCol, origRow;

  el.addEventListener('mousedown', e => {
    if (activeTool !== 'token') return;
    e.stopPropagation();
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    origCol = tok.col; origRow = tok.row;
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    tok.col = Math.max(0, Math.min(cols - 1, origCol + Math.round(dx / cellSize)));
    tok.row = Math.max(0, Math.min(rows - 1, origRow + Math.round(dy / cellSize)));
    el.style.left = (tok.col * cellSize + cellSize / 2) + 'px';
    el.style.top  = (tok.row * cellSize + cellSize / 2) + 'px';
  });

  document.addEventListener('mouseup', () => { dragging = false; });

  // Right-click to remove
  el.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    tokens = tokens.filter(t => t.id !== tok.id);
    renderTokens();
  });
}

// ── Label placement + drag ────────────────────────────────────
let _labelSeq = 0;
function placeLabel(col, row) {
  const text  = document.getElementById('label-text').value.trim();
  if (!text) return;
  const size  = parseInt(document.getElementById('label-size').value, 10);
  const color = document.getElementById('label-color').value;
  labels.push({ id: ++_labelSeq, col, row, text, size, color });
  renderLabels();
}

function makeDraggableLabel(el, lbl) {
  let dragging = false, startX, startY, origCol, origRow;

  el.addEventListener('mousedown', e => {
    if (activeTool !== 'label') return;
    e.stopPropagation();
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    origCol = lbl.col; origRow = lbl.row;
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    lbl.col = Math.max(0, Math.min(cols - 1, origCol + Math.round(dx / cellSize)));
    lbl.row = Math.max(0, Math.min(rows - 1, origRow + Math.round(dy / cellSize)));
    el.style.left = (lbl.col * cellSize + cellSize / 2) + 'px';
    el.style.top  = (lbl.row * cellSize) + 'px';
  });

  document.addEventListener('mouseup', () => { dragging = false; });

  el.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    labels = labels.filter(l => l.id !== lbl.id);
    renderLabels();
  });
}

// ── Background image ──────────────────────────────────────────
function setBgImage(url) {
  if (!url) { bgImage = null; bgImageEl = null; renderBg(); return; }
  bgImage = url;
  bgImageEl = new Image();
  bgImageEl.onload = renderBg;
  bgImageEl.src = url;
}

// Load map list into sidebar
fetch('/api/maps').then(r => r.json()).then(data => {
  const list = document.getElementById('bg-image-list');
  (data.maps || []).forEach(url => {
    const el = document.createElement('div');
    el.className = 'bg-item';
    el.textContent = url.split('/').pop();
    el.title = url;
    el.addEventListener('click', () => {
      document.getElementById('bg-image-url').value = url;
      setBgImage(url);
    });
    list.appendChild(el);
  });
}).catch(() => {});

document.getElementById('apply-bg-btn').addEventListener('click', () => {
  setBgImage(document.getElementById('bg-image-url').value.trim() || null);
});
document.getElementById('remove-bg-btn').addEventListener('click', () => {
  document.getElementById('bg-image-url').value = '';
  setBgImage(null);
});

// ── Fog of War (Map Builder) ────────────────────────────────
function initFogGrid() {
  fogBuilderGrid = [];
  for (let r = 0; r < rows; r++) {
    fogBuilderGrid.push(new Array(cols).fill(false));
  }
}

function renderFogLayer() {
  fogLayer.innerHTML = '';
  fogLayer.style.display = 'grid';
  fogLayer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  fogLayer.style.gridTemplateRows    = `repeat(${rows}, 1fr)`;
  fogLayer.style.pointerEvents = 'auto';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      (function (row, col) {
        const cell = document.createElement('div');
        cell.style.cssText = 'cursor:crosshair;box-sizing:border-box;border:1px solid rgba(255,255,255,0.04);' +
          'background:' + (fogBuilderGrid[row][col] ? 'transparent' : 'rgba(0,0,0,0.82)') + ';transition:background 0.1s;';
        cell.addEventListener('mousedown', e => {
          e.preventDefault();
          fogIsPainting = true;
          fogPaintValue = !fogBuilderGrid[row][col];
          fogBuilderGrid[row][col] = fogPaintValue;
          cell.style.background = fogPaintValue ? 'transparent' : 'rgba(0,0,0,0.82)';
          scheduleFogSend();
        });
        cell.addEventListener('mouseenter', () => {
          if (!fogIsPainting) return;
          if (fogBuilderGrid[row][col] === fogPaintValue) return;
          fogBuilderGrid[row][col] = fogPaintValue;
          cell.style.background = fogPaintValue ? 'transparent' : 'rgba(0,0,0,0.82)';
          scheduleFogSend();
        });
        fogLayer.appendChild(cell);
      })(r, c);
    }
  }
}

document.addEventListener('mouseup', () => { fogIsPainting = false; });

let _fogSendTimer = null;
function scheduleFogSend() {
  if (_fogSendTimer) return;
  _fogSendTimer = setTimeout(() => {
    _fogSendTimer = null;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ action: 'update-fog', fogKey: FOG_KEY, fogGrid: fogBuilderGrid }));
    }
  }, 60);
}

function setFogMode(on) {
  fogEnabled = on;
  const toggleBtn = document.getElementById('fog-toggle-btn');
  const revealBtn = document.getElementById('fog-reveal-btn');
  const hideBtn   = document.getElementById('fog-hide-btn');
  toggleBtn.classList.toggle('active', fogEnabled);
  toggleBtn.textContent = fogEnabled ? '🌫 Fog ON' : '🌫 Fog';
  revealBtn.style.display = fogEnabled ? '' : 'none';
  hideBtn.style.display   = fogEnabled ? '' : 'none';
  if (!fogEnabled) {
    fogLayer.innerHTML = '';
    fogLayer.style.pointerEvents = 'none';
    fogLayer.style.display = 'none';
  } else {
    renderFogLayer();
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ action: 'update-fog', fogKey: FOG_KEY, fogGrid: fogBuilderGrid }));
    }
  }
}

document.getElementById('fog-toggle-btn').addEventListener('click', () => setFogMode(!fogEnabled));
document.getElementById('fog-reveal-btn').addEventListener('click', () => {
  for (let r = 0; r < rows; r++) fogBuilderGrid[r].fill(true);
  renderFogLayer();
  scheduleFogSend();
});
document.getElementById('fog-hide-btn').addEventListener('click', () => {
  for (let r = 0; r < rows; r++) fogBuilderGrid[r].fill(false);
  renderFogLayer();
  scheduleFogSend();
});

// ── Tool buttons ──────────────────────────────────────────────
document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTool = btn.dataset.tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.getElementById('tile-palette-section').style.display =
      ['paint','erase','fill'].includes(activeTool) ? '' : 'none';
    document.getElementById('token-options').style.display  = activeTool === 'token'  ? '' : 'none';
    document.getElementById('label-options').style.display  = activeTool === 'label'  ? '' : 'none';
    document.getElementById('image-options').style.display  = activeTool === 'image'  ? '' : 'none';
    // Erase doesn't need palette
    document.getElementById('tile-palette-section').style.display =
      ['paint','fill'].includes(activeTool) ? '' : (activeTool === 'erase' ? 'none' : 'none');
  });
});

// ── Tile palette build ────────────────────────────────────────
const tileGrid = document.getElementById('tile-grid');
TILES.forEach(tile => {
  const sw = document.createElement('div');
  sw.className = 'tile-swatch' + (tile === activeTile ? ' selected' : '');
  const _tc = _texCache[tile.id] || (_texCache[tile.id] = buildTextureCanvas(tile.id));
  sw.style.backgroundImage = `url(${_tc.toDataURL()})`;
  sw.style.backgroundSize = 'cover';
  sw.title = tile.label;
  const lbl = document.createElement('div');
  lbl.className = 'tile-label';
  lbl.textContent = tile.label;
  sw.appendChild(lbl);
  sw.addEventListener('click', () => {
    activeTile = tile;
    document.querySelectorAll('.tile-swatch').forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected');
  });
  tileGrid.appendChild(sw);
});

// ── Grid size controls ────────────────────────────────────────
document.getElementById('apply-grid-btn').addEventListener('click', () => {
  const newCols = parseInt(document.getElementById('grid-cols').value, 10);
  const newRows = parseInt(document.getElementById('grid-rows').value, 10);
  const newCell = parseInt(document.getElementById('cell-size').value, 10);
  if (!newCols || !newRows || !newCell) return;

  // Preserve existing tiles when expanding
  const oldMap = tileMap;
  const oldRows = rows; const oldCols = cols;
  cols = newCols; rows = newRows; cellSize = newCell;
  tileMap = [];
  for (let r = 0; r < rows; r++) {
    tileMap.push([]);
    for (let c = 0; c < cols; c++) {
      tileMap[r][c] = (r < oldRows && c < oldCols) ? oldMap[r][c] : null;
    }
  }
  initFogGrid();
  applySize();
});

// ── Undo ──────────────────────────────────────────────────────
document.getElementById('undo-btn').addEventListener('click', () => {
  if (!undoStack.length) return;
  tileMap = undoStack.pop();
  renderTiles();
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    if (undoStack.length) { tileMap = undoStack.pop(); renderTiles(); }
  }
});

// ── Clear canvas ──────────────────────────────────────────────
document.getElementById('clear-canvas-btn').addEventListener('click', () => {
  if (!confirm('Clear the entire map?')) return;
  pushUndo();
  tileMap = [];
  for (let r = 0; r < rows; r++) tileMap.push(new Array(cols).fill(null));
  tokens = []; labels = [];
  renderAll();
});

// ── Composite export ──────────────────────────────────────────
function buildComposite() {
  const w = cols * cellSize;
  const h = rows * cellSize;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d');

  // 1. bg
  ctx.drawImage(bgCanvas, 0, 0);
  // 2. tiles
  ctx.drawImage(tileCanvas, 0, 0);
  // 3. tokens
  tokens.forEach(tok => {
    const r = cellSize / 2 - 3;
    const cx = tok.col * cellSize + cellSize / 2;
    const cy = tok.row * cellSize + cellSize / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = tok.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.max(8, cellSize * 0.22) + 'px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tok.name.slice(0, 4), cx, cy);
  });
  // 4. labels
  labels.forEach(lbl => {
    ctx.fillStyle = lbl.color;
    ctx.font = 'bold ' + lbl.size + 'px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.fillText(lbl.text, lbl.col * cellSize + cellSize / 2, lbl.row * cellSize);
    ctx.shadowBlur = 0;
  });
  // 5. light grid overlay
  ctx.drawImage(gridCanvas, 0, 0);
  return out;
}

// ── Send Live ─────────────────────────────────────────────────
document.getElementById('send-live-btn').addEventListener('click', () => {
  if (!ws || ws.readyState !== 1) { alert('Not connected to server.'); return; }
  const comp = buildComposite();
  const dataUrl = comp.toDataURL('image/png');
  ws.send(JSON.stringify({ action: 'show-scene-view', image: dataUrl, fit: 'contain', fogKey: fogEnabled ? FOG_KEY : null }));
  if (fogEnabled) scheduleFogSend();
  document.getElementById('send-live-btn').textContent = '✓ Sent!';
  setTimeout(() => { document.getElementById('send-live-btn').textContent = '📡 Send Live'; }, 2000);
});

// ── Save ──────────────────────────────────────────────────────
document.getElementById('save-btn').addEventListener('click', () => {
  document.getElementById('save-modal').classList.remove('hidden');
  document.getElementById('save-status').textContent = '';
});
document.getElementById('save-cancel-btn').addEventListener('click', () => {
  document.getElementById('save-modal').classList.add('hidden');
});
document.getElementById('save-add-scene').addEventListener('change', function() {
  document.getElementById('save-scene-opts').style.display = this.checked ? '' : 'none';
});

document.getElementById('save-confirm-btn').addEventListener('click', async () => {
  const filename = document.getElementById('save-filename').value.trim();
  if (!filename) { document.getElementById('save-status').textContent = 'Enter a filename.'; return; }
  const safeName = filename.endsWith('.png') ? filename : filename + '.png';
  const comp     = buildComposite();
  const dataUrl  = comp.toDataURL('image/png');
  const statusEl = document.getElementById('save-status');
  statusEl.textContent = 'Saving…';

  try {
    const r = await fetch('/api/map-builder/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, filename: safeName }),
    });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || 'Save failed');

    // Optionally add to scene list
    const addScene = document.getElementById('save-add-scene').checked;
    if (addScene) {
      const area  = document.getElementById('save-scene-area').value.trim()  || 'Custom';
      const label = document.getElementById('save-scene-label').value.trim() || safeName;
      const scenesR = await fetch('/api/scenes');
      const scenesJ = await scenesR.json();
      const scenes  = scenesJ.scenes || [];
      const newId   = area.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
      // Find or create area group
      let group = scenes.find(s => s.label.toLowerCase() === area.toLowerCase());
      if (!group) {
        group = { id: newId, label: area, tab: area, views: [] };
        scenes.push(group);
      }
      group.views.push({
        id: newId + '-view-0',
        label,
        image: json.webPath,
        fog: !!document.getElementById('save-fog').checked,
      });
      await fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes }),
      });
    }

    statusEl.style.color = '#4ade80';
    statusEl.textContent = '✓ Saved to ' + json.webPath;
    setTimeout(() => document.getElementById('save-modal').classList.add('hidden'), 1800);
  } catch (err) {
    statusEl.style.color = '#ef4444';
    statusEl.textContent = 'Error: ' + err.message;
  }
});

// ── Bootstrap ─────────────────────────────────────────────────
initGrid();
