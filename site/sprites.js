// Agentopolis pixel art: palette, worker sprites, buildings, props.
// Everything is drawn procedurally onto offscreen canvases and cached —
// no image assets, no network, crisp at integer zooms.

export const PALETTE = {
  night1: '#171a2b', night2: '#1d2136',
  ground: '#2b3350', groundEdge: '#232a44', road: '#333c5e', roadLine: '#4a5480',
  grass1: '#2f4858', grass2: '#33505f',
  wall1: '#c8b89a', wall2: '#a89375', wall3: '#8f7f68',
  wallA: '#c8b89a', wallB: '#b7a2c9', wallC: '#9ec3b0', wallD: '#c9a9a0', wallE: '#a8b8cf',
  roofA: '#c5586b', roofB: '#5b8bd9', roofC: '#5aa876', roofD: '#c78f4e', roofE: '#8d6fc0',
  windowLit: '#ffd97a', windowLit2: '#ffc14d', windowDark: '#2c3152', frame: '#3a3352',
  door: '#6b4f35', doorDark: '#523c28',
  tent1: '#d9824e', tent2: '#b56438', tentPole: '#7a5a3a',
  skin1: '#f2c9a1', skin2: '#d9a878', skin3: '#a9764f', skin4: '#7d5433',
  attention: '#ffcc33', fail: '#ff5f6b', ok: '#69d58c', beacon: '#ffd97a',
  text: '#e8e6f0', textDim: '#9aa0c0',
  floor: '#1c1f2e', carpetA: '#2b2f4a', carpetB: '#333a5c', carpetC: '#303448',
  roomFloor: '#303552', wallLine: '#454b6e', wood: '#5c4430', woodDark: '#4a3626',
};

const BODY_HUES = ['#4e79c9', '#c95e79', '#4ea86b', '#c98a3e', '#8a63c9', '#3ba8a0', '#b8b04b', '#c96a4e'];
// Agent type reads from the HEADSET color now — hair stays natural.
const HAT_BY_TYPE = {
  root: '#f0d24a',
  Explore: '#5bc0eb',
  Plan: '#b678d9',
  'general-purpose': '#e0e0e0',
};
const HAT_FALLBACK = ['#ff8f5e', '#7ee081', '#e879b0', '#8fd0ff', '#d0c060'];
const HAIR = ['#3b2f2a', '#5a4632', '#1f1b26', '#8a6248', '#4a3b52', '#6e6660'];

// 12×16 worker. Chars: . none, H hat, h hat brim, S skin, E eye, B body,
// b body shade, L leg, F foot. Arms live in the body rows.
const WORKER_FRAMES = {
  idle: [
    [
      '....HHHH....',
      '...HHHHHH...',
      '..hhhhhhhh..',
      '...SSSSSS...',
      '...SESSES...',
      '...SSSSSS...',
      '....SSSS....',
      '..BBBBBBBB..',
      '.BBBBBBBBBB.',
      '.BbBBBBBBbB.',
      '.BbBBBBBBbB.',
      '..BBBBBBBB..',
      '...LL..LL...',
      '...LL..LL...',
      '...FF..FF...',
      '............',
    ],
    [
      '............',
      '....HHHH....',
      '...HHHHHH...',
      '..hhhhhhhh..',
      '...SSSSSS...',
      '...SESSES...',
      '...SSSSSS...',
      '....SSSS....',
      '..BBBBBBBB..',
      '.BBBBBBBBBB.',
      '.BbBBBBBBbB.',
      '..BBBBBBBB..',
      '...LL..LL...',
      '...LL..LL...',
      '...FF..FF...',
      '............',
    ],
  ],
  walk: [
    [
      '....HHHH....',
      '...HHHHHH...',
      '..hhhhhhhh..',
      '...SSSSSS...',
      '...SESSES...',
      '...SSSSSS...',
      '....SSSS....',
      '..BBBBBBBB..',
      '.BBBBBBBBBB.',
      '.BbBBBBBBbB.',
      '..BBBBBBBB..',
      '...LL..LL...',
      '..LL....LL..',
      '..FF....FF..',
      '............',
      '............',
    ],
    [
      '....HHHH....',
      '...HHHHHH...',
      '..hhhhhhhh..',
      '...SSSSSS...',
      '...SESSES...',
      '...SSSSSS...',
      '....SSSS....',
      '..BBBBBBBB..',
      '.BBBBBBBBBB.',
      '.BbBBBBBBbB.',
      '..BBBBBBBB..',
      '....LLLL....',
      '....LLLL....',
      '....FFFF....',
      '............',
      '............',
    ],
    [
      '....HHHH....',
      '...HHHHHH...',
      '..hhhhhhhh..',
      '...SSSSSS...',
      '...SESSES...',
      '...SSSSSS...',
      '....SSSS....',
      '..BBBBBBBB..',
      '.BBBBBBBBBB.',
      '.BbBBBBBBbB.',
      '..BBBBBBBB..',
      '...LL..LL...',
      '..LL....LL..',
      '..FF....FF..',
      '............',
      '............',
    ],
    [
      '....HHHH....',
      '...HHHHHH...',
      '..hhhhhhhh..',
      '...SSSSSS...',
      '...SESSES...',
      '...SSSSSS...',
      '....SSSS....',
      '..BBBBBBBB..',
      '.BBBBBBBBBB.',
      '.BbBBBBBBbB.',
      '..BBBBBBBB..',
      '....LLLL....',
      '...LL..LL...',
      '...FF..FF...',
      '............',
      '............',
    ],
  ],
  work: [
    [
      '....HHHH....',
      '...HHHHHH...',
      '..hhhhhhhh..',
      '...SSSSSS...',
      '...SESSES...',
      '...SSSSSS...',
      '....SSSS....',
      '..BBBBBBBBS.',
      '.BBBBBBBBBB.',
      '.BbBBBBBBbB.',
      '.BbBBBBBBbB.',
      '..BBBBBBBB..',
      '...LL..LL...',
      '...LL..LL...',
      '...FF..FF...',
      '............',
    ],
    [
      '....HHHH....',
      '...HHHHHH...',
      '..hhhhhhhh..',
      '...SSSSSS...',
      '...SESSES...',
      '...SSSSSS...',
      '....SSSSS...',
      '..BBBBBBBB..',
      '.BBBBBBBBBB.',
      '.BbBBBBBBbB.',
      '.BbBBBBBBbB.',
      '..BBBBBBBB..',
      '...LL..LL...',
      '...LL..LL...',
      '...FF..FF...',
      '............',
    ],
  ],
  raise: [ // one arm up: "I need a human!"
    [
      '.........S..',
      '....HHHH.S..',
      '...HHHHHHS..',
      '..hhhhhhhh..',
      '...SSSSSS...',
      '...SESSES...',
      '...SSSSSS...',
      '....SSSS....',
      '..BBBBBBBB..',
      '.BBBBBBBBBB.',
      '.BbBBBBBBbB.',
      '..BBBBBBBB..',
      '...LL..LL...',
      '...LL..LL...',
      '...FF..FF...',
      '............',
    ],
    [
      '....HHHH.S..',
      '...HHHHHHS..',
      '..hhhhhhhS..',
      '...SSSSSS...',
      '...SESSES...',
      '...SSSSSS...',
      '....SSSS....',
      '..BBBBBBBB..',
      '.BBBBBBBBBB.',
      '.BbBBBBBBbB.',
      '..BBBBBBBB..',
      '...LL..LL...',
      '...LL..LL...',
      '...FF..FF...',
      '............',
      '............',
    ],
  ],
};

// Facing-direction variants are derived from the down-facing grids:
// up = same silhouette, no face; side = drawn profile, left is a mirror.
const SIDE_FRAMES = [
  [
    '....HHHH....',
    '...HHHHHH...',
    '..hhhhhhh...',
    '...SSSSS....',
    '...SSSES....',
    '...SSSSS....',
    '....SSS.....',
    '...BBBBB....',
    '..BBBBBBB...',
    '..BbBBBbB...',
    '..BBBBBBB...',
    '...BBBBB....',
    '...LL.LL....',
    '..LL...LL...',
    '..FF...FF...',
    '............',
  ],
  [
    '....HHHH....',
    '...HHHHHH...',
    '..hhhhhhh...',
    '...SSSSS....',
    '...SSSES....',
    '...SSSSS....',
    '....SSS.....',
    '...BBBBB....',
    '..BBBBBBB...',
    '..BbBBBbB...',
    '..BBBBBBB...',
    '....LLL.....',
    '....LLL.....',
    '....FFF.....',
    '............',
    '............',
  ],
];

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) * f | 0));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) * f | 0));
  const b = Math.min(255, Math.max(0, (n & 255) * f | 0));
  return `rgb(${r},${g},${b})`;
}

// Blend two hex colors; t=0 → a, t=1 → b.
function mix(a, b, t) {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((na >> sh) & 255) * (1 - t) + ((nb >> sh) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

const spriteCache = new Map();

// Pre-rendered worker frame for a given seed + agentType + facing.
// seed picks body color + skin tone; agentType picks hat. facing:
// 'down' | 'up' | 'side' (side faces right; the renderer mirrors for left).
export function workerSprite(seed, agentType, pose, frame, facing = 'down') {
  const body = BODY_HUES[Math.floor(seed * BODY_HUES.length) % BODY_HUES.length];
  const skins = [PALETTE.skin1, PALETTE.skin2, PALETTE.skin3, PALETTE.skin4];
  const skin = skins[Math.floor(seed * 7919) % skins.length];
  const hat = HAIR[Math.floor(seed * 6151) % HAIR.length];
  const headset = HAT_BY_TYPE[agentType] ||
    HAT_FALLBACK[Math.floor(seed * 104729) % HAT_FALLBACK.length];
  let frames = WORKER_FRAMES[pose] || WORKER_FRAMES.idle;
  if (facing === 'side' && pose === 'walk') frames = SIDE_FRAMES;
  let grid = frames[frame % frames.length];
  const key = `${body}|${skin}|${hat}|${pose}|${frame % frames.length}|${facing}`;
  if (spriteCache.has(key)) return spriteCache.get(key);

  const c = document.createElement('canvas');
  c.width = 12; c.height = 16;
  const g = c.getContext('2d');
  const colors = {
    H: hat, h: shade(hat, 0.7), S: skin, E: '#26243a',
    B: body, b: shade(body, 0.72), L: shade(body, 0.55), F: '#3a3040',
  };
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      let ch = grid[y][x];
      if (facing === 'up' && ch === 'E') ch = 'S'; // no face from behind
      if (ch === '.' || !colors[ch]) continue;
      g.fillStyle = colors[ch];
      g.fillRect(x, y, 1, 1);
    }
  }
  if (facing === 'up') { // hair covers the head from behind
    g.fillStyle = shade(hat, 0.85);
    g.fillRect(3, 3, 6, 2);
  }
  // headset: thin band over the hair + ear pads in the agent-type color
  const hy = grid[0].includes('H') ? 1 : 2; // matches the bob frame offset
  g.fillStyle = headset;
  g.fillRect(3, hy + 1.2, 6, 1);
  g.fillRect(2.4, hy + 2.2, 1.4, 2.6);
  g.fillRect(8.2, hy + 2.2, 1.4, 2.6);
  spriteCache.set(key, c);
  return c;
}

// Speech bubble with a short glyph or word. Drawn in screen space above a
// worker's head; text stays legible when zoomed, decorative when tiny.
export function drawBubble(g, text, x, y, z, ok = false) {
  g.save();
  const fs = Math.max(7, 7.5 * z);
  g.font = `bold ${fs}px ui-monospace, monospace`;
  const tw = g.measureText(text).width;
  const pad = 4 * z;
  const w = tw + pad * 2, h = fs + pad * 1.2;
  const bx = x - w / 2, by = y - h - 6 * z;
  g.fillStyle = ok ? 'rgba(196,247,208,0.97)' : 'rgba(248,248,255,0.96)';
  g.beginPath();
  g.roundRect(bx, by, w, h, 4 * z);
  g.fill();
  g.beginPath(); // tail
  g.moveTo(x - 2.5 * z, by + h);
  g.lineTo(x + 2.5 * z, by + h);
  g.lineTo(x, by + h + 4 * z);
  g.closePath();
  g.fill();
  g.fillStyle = ok ? '#1c4a2b' : '#23263c';
  g.fillText(text, bx + pad, by + h - pad * 0.9);
  g.restore();
}

// Tiny prop drawn beside a working sprite, one per activity kind.
export function drawProp(g, kind, x, y, t) {
  g.save();
  g.translate(x, y);
  switch (kind) {
    case 'researching': { // magnifier
      g.strokeStyle = '#cfd6ff'; g.lineWidth = 1;
      g.beginPath(); g.arc(2, -2, 2.4, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(4, 0); g.lineTo(6, 2); g.stroke();
      break;
    }
    case 'editing': case 'creating': { // hammer swings
      const a = Math.sin(t / 130) * 0.9;
      g.rotate(a);
      g.fillStyle = '#8a6a48'; g.fillRect(0, -6, 1.6, 7);
      g.fillStyle = '#b9bece'; g.fillRect(-2, -8, 6, 3);
      break;
    }
    case 'testing': { // bubbling flask
      g.fillStyle = '#7ee081'; g.fillRect(0, -3, 4, 4);
      g.fillStyle = '#cfd6ff'; g.fillRect(1, -6, 2, 3);
      const bob = (t / 200) % 4;
      g.fillStyle = '#baf5c0'; g.fillRect(1.5, -7 - bob, 1, 1);
      break;
    }
    case 'building': case 'running': { // spinning gear
      g.strokeStyle = '#c9cfe8'; g.lineWidth = 1.4;
      const a = t / 300;
      for (let i = 0; i < 4; i++) {
        const ang = a + (i * Math.PI) / 2;
        g.beginPath();
        g.moveTo(Math.cos(ang) * 1.5 + 2, Math.sin(ang) * 1.5 - 2);
        g.lineTo(Math.cos(ang) * 3.6 + 2, Math.sin(ang) * 3.6 - 2);
        g.stroke();
      }
      g.beginPath(); g.arc(2, -2, 1.4, 0, Math.PI * 2); g.stroke();
      break;
    }
    case 'version_control': { // branch glyph
      g.fillStyle = '#ffb86b';
      g.fillRect(0, -6, 1.4, 7);
      g.fillRect(0, -4, 4, 1.4);
      g.fillRect(3.4, -6, 1.6, 1.6);
      g.fillRect(-0.2, -7, 1.8, 1.8);
      break;
    }
    case 'installing': { // package box
      g.fillStyle = '#c78f4e'; g.fillRect(0, -4, 5, 5);
      g.fillStyle = '#e8d29a'; g.fillRect(0, -2.2, 5, 1);
      break;
    }
    case 'planning': { // clipboard
      g.fillStyle = '#d9d9e8'; g.fillRect(0, -6, 4.6, 6);
      g.fillStyle = '#6b7396';
      g.fillRect(0.8, -4.8, 3, 0.8); g.fillRect(0.8, -3.2, 3, 0.8); g.fillRect(0.8, -1.6, 2, 0.8);
      break;
    }
    case 'delegating': { // megaphone
      g.fillStyle = '#ffd97a';
      g.beginPath(); g.moveTo(0, -2); g.lineTo(5, -5); g.lineTo(5, 1); g.closePath(); g.fill();
      break;
    }
  }
  g.restore();
}

// ——— cutaway office buildings ———
// The building is a dollhouse: rooms visible, desks drawn separately by the
// renderer so workers can sit BEHIND them. Geometry contract:
export const FLOOR_H = 16;   // sprite px per office floor
export const BASE_H = 6;
export const ROOF_Y = 10;    // body starts below the roof slab
export const SPRITE_PAD_X = 6, SPRITE_PAD_Y = 12;

export function officeWidth(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return [46, 54, 62][(h >>> 0) % 3];
}

// Desk anchor points in sprite-local px (feet line of a seated worker).
// Ground floor: lobby — door right, one desk left. Upper floors: two desks.
export function deskAnchors(W, floors) {
  const anchors = [];
  const groundTop = SPRITE_PAD_Y + ROOF_Y + (floors - 1) * FLOOR_H;
  anchors.push({ x: SPRITE_PAD_X + 13, y: groundTop + FLOOR_H - 2 });
  for (let f = 1; f < floors; f++) {
    const top = SPRITE_PAD_Y + ROOF_Y + (floors - 1 - f) * FLOOR_H;
    anchors.push({ x: SPRITE_PAD_X + 13, y: top + FLOOR_H - 2 });
    anchors.push({ x: SPRITE_PAD_X + W - 21, y: top + FLOOR_H - 2 });
  }
  return anchors;
}

// The desk itself — drawn AFTER the worker so they sit behind it. Screen
// color reflects the activity kind; a subtle flicker sells "in use".
const SCREEN_COLORS = {
  researching: '#7ec3ff', reading: '#7ec3ff',
  editing: '#8ee6a1', creating: '#8ee6a1',
  testing: '#ffd97a', building: '#f0a860', running: '#f0a860',
  version_control: '#ffb86b', installing: '#c9a9ff',
  planning: '#e8e6f0', delegating: '#ff9ecf', unknown: '#9aa0c0',
};
// Drawn at a worker's feet line. The worker stays VISIBLE behind the desk:
// monitor sits to one side at chest height (dir=1 monitor left, -1 right),
// chair back on the other side, mug and papers on the table.
export function drawDesk(g, kind, cx, feetY, t, scale, dir = 1) {
  g.save();
  g.translate(cx, feetY);
  g.scale(scale, scale);
  const X = (v) => v * dir;
  const off = kind === 'off' || !kind;

  // chair back + seat hint behind the worker
  g.fillStyle = '#4a3a52';
  g.fillRect(X(8), -14, 2.2, 9);
  g.fillRect(dir > 0 ? 5 : -10, -6, 5, 1.6);

  // table top + legs
  g.fillStyle = '#5c4430';
  g.fillRect(-13, -7, 26, 2.6);
  g.fillStyle = '#4a3626';
  g.fillRect(-12, -4.4, 2, 4.4);
  g.fillRect(10, -4.4, 2, 4.4);

  // monitor to the side, screen facing the worker
  g.fillStyle = '#23263c';
  g.fillRect(X(-11.5), -15.5, 8.6, 7);
  const col = off ? '#252a49' : (SCREEN_COLORS[kind] || SCREEN_COLORS.unknown);
  g.globalAlpha = off ? 1 : 0.72 + 0.28 * Math.abs(Math.sin(t / 210 + cx));
  g.fillStyle = col;
  g.fillRect(X(-11.5) + 0.8, -14.7, 7, 5.4);
  g.globalAlpha = 1;
  if (!off) { // moving "content" lines
    g.fillStyle = 'rgba(20,22,40,0.55)';
    const lines = Math.floor((t / 400 + cx) % 3) + 2;
    for (let i = 0; i < lines; i++) {
      g.fillRect(X(-11.5) + 1.6, -13.8 + i * 1.6, 4 + ((i * 37 + cx) % 2.5), 0.8);
    }
    // soft glow from the screen onto the worker
    g.globalAlpha = 0.14;
    g.fillStyle = col;
    g.fillRect(X(-3), -14, 8, 8);
    g.globalAlpha = 1;
  }
  g.fillStyle = '#3a3352';
  g.fillRect(X(-8.4), -8.6, 1.8, 1.6); // monitor stand

  // coffee mug + papers (muted on unstaffed desks)
  g.globalAlpha = off ? 0.45 : 1;
  g.fillStyle = '#c5586b';
  g.fillRect(X(3.6), -9.4, 2.4, 2.4);
  g.fillStyle = '#e8e6f0';
  g.fillRect(X(6.8), -8.2, 3.6, 1.2);
  if (!off) { // steam curling off the coffee
    const s1 = Math.sin(t / 350 + cx) * 0.8;
    g.globalAlpha = 0.4 + 0.2 * Math.sin(t / 500 + cx);
    g.fillStyle = '#cfd6ff';
    g.fillRect(X(4.2) + s1, -11.4, 0.9, 0.9);
    g.fillRect(X(4.6) - s1, -13, 0.9, 0.9);
  }
  g.globalAlpha = 1;
  g.restore();
}

// Building rendered onto a cached canvas; keyed by everything that affects
// pixels. Room lights twinkle via litSalt so the cache still gets reuse.
const buildingCache = new Map();
export function buildingSprite(seedStr, floors, state, litSalt) {
  const key = `${seedStr}|${floors}|${state}|${litSalt}`;
  if (buildingCache.has(key)) return buildingCache.get(key);
  if (buildingCache.size > 400) {
    // Evict the oldest quarter (Map preserves insertion order) — a full
    // clear() re-renders every visible sprite in one frame and hitches.
    let i = 0;
    for (const k of buildingCache.keys()) {
      buildingCache.delete(k);
      if (++i >= 100) break;
    }
  }

  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rand = (n) => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000 * n; };

  // ——— floor-plan view: a meeting room seen straight from above ———
  const accents = [PALETTE.roofA, PALETTE.roofB, PALETTE.roofC, PALETTE.roofD, PALETTE.roofE];
  const accent = accents[rand(accents.length) | 0];
  const W = [56, 64, 72][Math.max(0, Math.min(2, floors - 2))]; // crew grows the room
  const H = 44;
  const c = document.createElement('canvas');
  c.width = W + 10;
  c.height = H + 10;
  const g = c.getContext('2d');
  const ox = 5, oy = 5;
  const dim = state === 'closed';

  // room floor, subtly tinted by the room's accent
  g.fillStyle = dim ? '#252840' : (state === 'working' || state === 'attention')
    ? mix('#3d4368', accent, 0.1)
    : mix('#343a5c', accent, 0.08);
  g.fillRect(ox, oy, W, H);
  // floor texture
  g.fillStyle = 'rgba(255,255,255,0.025)';
  for (let i = 0; i < 14; i++) {
    g.fillRect(ox + ((i * 53) % (W - 6)) + 3, oy + ((i * 37) % (H - 6)) + 3, 3, 1.4);
  }

  // walls with a door gap on the bottom edge
  const doorW = 12, doorX = ox + W / 2 - doorW / 2;
  g.fillStyle = dim ? shade(PALETTE.wallLine, 0.7) : PALETTE.wallLine;
  g.fillRect(ox - 2, oy - 2, W + 4, 2.6);                     // top
  g.fillRect(ox - 2, oy - 2, 2.6, H + 4);                     // left
  g.fillRect(ox + W - 0.6, oy - 2, 2.6, H + 4);               // right
  g.fillRect(ox - 2, oy + H - 0.6, doorX - ox + 2, 2.6);      // bottom left of door
  g.fillRect(doorX + doorW, oy + H - 0.6, ox + W - doorX - doorW + 2, 2.6); // bottom right
  if (dim) { // closed room: door shut
    g.fillStyle = shade(PALETTE.wood, 0.8);
    g.fillRect(doorX, oy + H - 1, doorW, 2.6);
  } else { // door swing hint
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(doorX, oy + H, doorW * 0.9, -Math.PI / 2, 0);
    g.stroke();
  }

  // whiteboard on the top wall, with scribbles
  g.fillStyle = '#e8e6f0';
  g.fillRect(ox + 8, oy + 1.6, 18, 4);
  g.fillStyle = '#c5586b'; g.fillRect(ox + 10, oy + 2.6, 6, 0.9);
  g.fillStyle = '#5b8bd9'; g.fillRect(ox + 10, oy + 4, 9, 0.9);

  // conference table with chairs
  const tw = W * 0.46, th = 12;
  const tx = ox + W / 2 - tw / 2, ty = oy + H / 2 - th / 2 + 2;
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(tx + 1, ty + th, tw, 2);
  g.fillStyle = dim ? shade(PALETTE.wood, 0.7) : PALETTE.wood;
  g.beginPath(); g.roundRect(tx, ty, tw, th, 3); g.fill();
  g.fillStyle = shade(PALETTE.wood, 1.2);
  g.beginPath(); g.roundRect(tx, ty, tw, 2.4, 3); g.fill();
  g.fillStyle = '#3a3352';
  for (const cx of [tx + 4, tx + tw - 8]) { // chairs above + below
    g.fillRect(cx, ty - 5, 4.5, 3.4);
    g.fillRect(cx, ty + th + 2, 4.5, 3.4);
  }
  if (!dim && (state === 'working' || state === 'attention')) {
    // a laptop open on the table, screen glinting
    g.fillStyle = '#23263c';
    g.fillRect(tx + tw / 2 - 3.4, ty + 3, 7, 5);
    g.fillStyle = state === 'attention' ? PALETTE.attention : '#8ee6a1';
    g.fillRect(tx + tw / 2 - 2.6, ty + 3.8, 5.4, 3.4);
  }

  // corner plant + filing cabinet
  g.fillStyle = '#c78f4e'; g.fillRect(ox + W - 9, oy + 4, 4, 3.4);
  g.fillStyle = dim ? shade('#5aa876', 0.6) : '#5aa876';
  g.fillRect(ox + W - 10, oy + 1.4, 6, 3.4);
  g.fillStyle = '#4a5480';
  g.fillRect(ox + 3, oy + H - 10, 6, 7);
  g.fillStyle = '#5a628c';
  g.fillRect(ox + 4, oy + H - 8.6, 4, 1); g.fillRect(ox + 4, oy + H - 6, 4, 1);

  buildingCache.set(key, c);
  return c;
}

// (legacy cutaway body kept out of the build — top-down replaced it)
function _legacyCutaway(seedStr, floors, state, litSalt, rand, walls, roofs) {
  const wall = walls[0], roof = roofs[0];
  const W = officeWidth(seedStr);
  const H = ROOF_Y + floors * FLOOR_H + BASE_H;
  const c = document.createElement('canvas');
  c.width = W + SPRITE_PAD_X * 2;
  c.height = SPRITE_PAD_Y + H + 4;
  const g = c.getContext('2d');
  const ox = SPRITE_PAD_X, oy = SPRITE_PAD_Y;
  const dim = state === 'closed';

  // structural shell: side walls the cutaway sits inside
  g.fillStyle = dim ? shade(wall, 0.55) : wall;
  g.fillRect(ox - 3, oy + ROOF_Y - 2, 3, H - ROOF_Y - 2);
  g.fillRect(ox + W, oy + ROOF_Y - 2, 3, H - ROOF_Y - 2);
  g.fillStyle = shade(wall, 0.72);
  g.fillRect(ox + W + 1.4, oy + ROOF_Y - 2, 1.6, H - ROOF_Y - 2);

  // roof slab with depth
  g.fillStyle = dim ? shade(roof, 0.6) : roof;
  g.fillRect(ox - 4, oy + 4, W + 8, 6);
  g.fillStyle = shade(roof, 0.72);
  g.fillRect(ox - 4, oy + 8, W + 8, 2);
  g.fillStyle = shade(roof, dim ? 0.7 : 1.18);
  g.fillRect(ox - 4, oy + 4, W + 8, 1.4);

  // roof furniture: antenna / water tank / AC — plus chimney
  g.fillStyle = shade(wall, 0.6);
  g.fillRect(ox + W - 12, oy - 2, 5, 8);
  if (roofProp === 0) {
    g.fillStyle = '#4a5480';
    g.fillRect(ox + 6, oy - 8, 1.6, 12);
    g.fillRect(ox + 3, oy - 5, 8, 1.4);
    g.fillStyle = dim ? '#5a628c' : PALETTE.fail;
    g.fillRect(ox + 5.6, oy - 10, 2.4, 2.4);
  } else if (roofProp === 1) {
    g.fillStyle = shade(wall, 0.8);
    g.fillRect(ox + 5, oy - 5, 9, 9);
    g.fillStyle = shade(wall, 0.6);
    g.fillRect(ox + 4, oy - 6, 11, 2);
    g.fillRect(ox + 6, oy + 3, 1.4, 3); g.fillRect(ox + 11.6, oy + 3, 1.4, 3);
  } else {
    g.fillStyle = '#9aa0c0';
    g.fillRect(ox + 6, oy - 1, 8, 5);
    g.fillStyle = '#6b7396';
    g.fillRect(ox + 7.5, oy + 0.4, 5, 2.2);
  }

  // cutaway rooms, top floor first
  const litChance = state === 'working' ? 0.92 : state === 'attention' ? 0.8
    : state === 'idle' || state === 'waiting' ? 0.5 : state === 'failed' ? 0.7 : 0.08;
  let salt = litSalt;
  for (let row = 0; row < floors; row++) {
    const top = oy + ROOF_Y + row * FLOOR_H;
    const isLobby = row === floors - 1;
    salt = (salt * 1103515245 + 12345) & 0x7fffffff;
    const lit = (salt / 0x7fffffff) < litChance;

    // room interior: warm when lit (tinted by the building's own wall color
    // so each office has its character), cold blue when dark
    g.fillStyle = lit && !dim ? mix('#5f4d44', wall, 0.22) : '#262b47';
    g.fillRect(ox, top, W, FLOOR_H - 2);
    if (lit && !dim) { // warm gradient band near the ceiling lamp
      g.fillStyle = mix('#6d594c', wall, 0.22);
      g.fillRect(ox, top, W, 4);
    }
    // floor strip inside the room
    g.fillStyle = lit && !dim ? '#43362f' : '#1d2136';
    g.fillRect(ox, top + FLOOR_H - 4, W, 2);
    // floor slab between storeys
    g.fillStyle = shade(wall, dim ? 0.5 : 0.85);
    g.fillRect(ox - 3, top + FLOOR_H - 2, W + 6, 2);

    // ceiling lamp
    g.fillStyle = '#3a3352';
    g.fillRect(ox + W / 2 - 2.4, top, 4.8, 1.6);
    g.fillStyle = lit && !dim ? PALETTE.windowLit : '#3a4166';
    g.fillRect(ox + W / 2 - 1.6, top + 1.6, 3.2, 1.6);

    // back-wall dressing per room (seeded): picture / shelf / clock / whiteboard
    const propPick = salt % 4;
    const px = ox + W / 2 - 6;
    if (propPick === 0) { // picture
      g.fillStyle = '#3a3352'; g.fillRect(px, top + 3.4, 6, 5);
      g.fillStyle = lit ? '#8fd0ff' : '#4a5480'; g.fillRect(px + 1, top + 4.4, 4, 3);
    } else if (propPick === 1) { // shelf with books
      g.fillStyle = '#5c4430'; g.fillRect(px - 2, top + 5.4, 12, 1.4);
      for (let bIdx = 0; bIdx < 4; bIdx++) {
        g.fillStyle = ['#c5586b', '#5b8bd9', '#5aa876', '#c78f4e'][bIdx];
        g.fillRect(px - 1 + bIdx * 2.6, top + 2.4, 1.8, 3);
      }
    } else if (propPick === 2) { // wall clock
      g.fillStyle = '#e8e6f0'; g.beginPath(); g.arc(px + 3, top + 5, 2.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#23263c'; g.fillRect(px + 2.7, top + 3.2, 0.7, 2);
    } else { // whiteboard with scribbles
      g.fillStyle = '#e8e6f0'; g.fillRect(px - 1, top + 3, 9, 5.4);
      g.fillStyle = '#c5586b'; g.fillRect(px, top + 4, 4, 0.8);
      g.fillStyle = '#5b8bd9'; g.fillRect(px, top + 5.6, 6, 0.8);
    }

    // corner plant on some floors
    if ((salt >> 3) % 3 === 0) {
      const plantX = isLobby ? ox + W - 30 : ox + W - 8;
      g.fillStyle = '#c78f4e'; g.fillRect(plantX, top + FLOOR_H - 7, 3.4, 3);
      g.fillStyle = '#5aa876';
      g.fillRect(plantX + 0.4, top + FLOOR_H - 10, 2.6, 3.4);
      g.fillRect(plantX - 1, top + FLOOR_H - 8.6, 2, 2);
      g.fillRect(plantX + 2.6, top + FLOOR_H - 8.6, 2, 2);
    }

    // lobby: entry door on the right, welcome mat, coat rack
    if (isLobby) {
      g.fillStyle = PALETTE.doorDark;
      g.fillRect(ox + W - 14, top + 2, 11, FLOOR_H - 4);
      g.fillStyle = PALETTE.door;
      g.fillRect(ox + W - 13, top + 3, 9, FLOOR_H - 5);
      g.fillStyle = dim ? shade('#8a6a48', 0.6) : '#d8b25e';
      g.fillRect(ox + W - 6.4, top + FLOOR_H / 2, 1.4, 1.4);
      if (!dim) { // door lamp
        g.fillStyle = PALETTE.windowLit;
        g.fillRect(ox + W - 16.4, top + 3, 1.8, 1.8);
      }
      // welcome mat in front of the door
      g.fillStyle = dim ? '#4a3d31' : '#8a5f3f';
      g.fillRect(ox + W - 15, top + FLOOR_H - 3.4, 13, 1.6);
      // coat rack beside the door with a hat + coat hanging
      g.fillStyle = '#5c4430';
      g.fillRect(ox + W - 19, top + 3, 1.4, FLOOR_H - 7);
      g.fillRect(ox + W - 21, top + 3.6, 5.4, 1);
      g.fillStyle = '#f0d24a';
      g.fillRect(ox + W - 21.4, top + 2, 2.4, 1.8); // spare hard hat
      g.fillStyle = '#4e79c9';
      g.fillRect(ox + W - 17.4, top + 4.6, 2.6, 4.6); // hanging coat
    }
  }

  // base/foundation
  g.fillStyle = shade(wall, 0.5);
  g.fillRect(ox - 3, oy + H - BASE_H, W + 6, BASE_H - 2);

  buildingCache.set(key, c);
  return c;
}

// Temporary worksite: a site-office trailer — one cutaway room with a desk,
// on skids, flying the company flag. Still obviously temporary, but an office.
export const TRAILER_W = 44;
export function trailerDeskAnchor() {
  // sprite-local feet line of the seated worker inside the trailer
  return { x: 6 + 13, y: 10 + 4 + FLOOR_H - 2 };
}
const tentCache = new Map();
export function tentSprite(state) {
  const key = 'hotdesk|' + state;
  if (tentCache.has(key)) return tentCache.get(key);
  const c = document.createElement('canvas');
  c.width = 52; c.height = 40;
  const g = c.getContext('2d');
  const dim = state === 'closed';

  // floor mat marking the temporary workspace
  g.fillStyle = dim ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)';
  g.beginPath(); g.roundRect(4, 6, 44, 30, 4); g.fill();

  // desk from above with a monitor on its far edge
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(13, 24, 26, 2);
  g.fillStyle = dim ? shade(PALETTE.wood, 0.7) : PALETTE.wood;
  g.beginPath(); g.roundRect(12, 12, 28, 12, 2); g.fill();
  g.fillStyle = shade(PALETTE.wood, 1.2);
  g.fillRect(12, 12, 28, 2);
  g.fillStyle = '#23263c';
  g.fillRect(22, 13.4, 9, 4.6); // monitor (screen faces the chair below)
  g.fillStyle = dim ? PALETTE.windowDark : PALETTE.windowLit;
  g.fillRect(23, 14.2, 7, 3);
  g.fillStyle = '#e8e6f0'; g.fillRect(33.4, 15, 4, 2.6); // papers
  g.fillStyle = '#c5586b'; g.fillRect(15, 15, 2.6, 2.6); // mug
  // chair below the desk
  g.fillStyle = '#3a3352';
  g.beginPath(); g.roundRect(23, 27, 6.5, 5.5, 1.5); g.fill();
  // "temporary" cone marker
  g.fillStyle = dim ? shade(PALETTE.tent1, 0.6) : PALETTE.tent1;
  g.beginPath(); g.moveTo(7, 32); g.lineTo(9.4, 26); g.lineTo(11.8, 32); g.closePath(); g.fill();
  g.fillStyle = '#e8e6f0'; g.fillRect(7.8, 29.4, 3.2, 1.1);

  tentCache.set(key, c);
  return c;
}

// water cooler — where idle agents drift for a chat
let coolerCanvas = null;
export function coolerSprite() {
  if (coolerCanvas) return coolerCanvas;
  const c = document.createElement('canvas');
  c.width = 10; c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#dfe3f4';
  g.fillRect(2, 6, 6, 9);
  g.fillStyle = '#8fd0ff';
  g.fillRect(2.6, 1.4, 4.8, 5);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(3.2, 2, 1.4, 3.4);
  g.fillStyle = '#3a3352';
  g.fillRect(2, 14.4, 6, 1.6);
  coolerCanvas = c;
  return c;
}

// potted office plant (replaces outdoor trees on the floor plan)
const plantCache = new Map();
export function plantSprite(variant) {
  const key = 'plant' + (variant % 3);
  if (plantCache.has(key)) return plantCache.get(key);
  const c = document.createElement('canvas');
  c.width = 14; c.height = 18;
  const g = c.getContext('2d');
  const leaf = ['#5aa876', '#4e9a6c', '#63b381'][variant % 3];
  g.fillStyle = '#c78f4e';
  g.fillRect(4, 12, 6, 5);
  g.fillStyle = shade('#c78f4e', 0.75);
  g.fillRect(4, 15.4, 6, 1.6);
  g.fillStyle = leaf;
  g.beginPath(); g.arc(7, 8, 4.6, 0, Math.PI * 2); g.fill();
  g.fillStyle = shade(leaf, 1.25);
  g.beginPath(); g.arc(5.4, 6.4, 2.2, 0, Math.PI * 2); g.fill();
  g.fillRect(8, 4, 1.6, 3.4);
  plantCache.set(key, c);
  return c;
}

// ——— world dressing: moon, glow, trees, lamps ———

let moonCanvas = null;
export function moonSprite() {
  if (moonCanvas) return moonCanvas;
  const c = document.createElement('canvas');
  c.width = 56; c.height = 56;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(28, 28, 10, 28, 28, 28);
  grad.addColorStop(0, 'rgba(235,238,255,0.28)');
  grad.addColorStop(1, 'rgba(235,238,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 56, 56);
  g.fillStyle = '#dfe3f4';
  g.beginPath(); g.arc(28, 28, 13, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c3c9e2';
  for (const [x, y, r] of [[23, 24, 3], [33, 31, 2.2], [29, 20, 1.6], [24, 33, 1.8]]) {
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  moonCanvas = c;
  return c;
}

// One cached warm radial glow, tinted at draw time via globalAlpha.
let glowCanvas = null;
export function glowSprite() {
  if (glowCanvas) return glowCanvas;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,214,130,0.55)');
  grad.addColorStop(0.5, 'rgba(255,196,100,0.18)');
  grad.addColorStop(1, 'rgba(255,196,100,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowCanvas = c;
  return c;
}

const treeCache = new Map();
export function treeSprite(variant) {
  const key = 'tree' + (variant % 3);
  if (treeCache.has(key)) return treeCache.get(key);
  const c = document.createElement('canvas');
  c.width = 18; c.height = 24;
  const g = c.getContext('2d');
  const leaf1 = ['#2f6b4f', '#33755a', '#2a5f46'][variant % 3];
  const leaf2 = shade(leaf1, 1.25);
  g.fillStyle = '#6b4f35';
  g.fillRect(8, 16, 3, 7);
  g.fillStyle = leaf1;
  g.beginPath(); g.arc(9.5, 10, 7, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(5.5, 13, 4.5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(13.5, 13, 4.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = leaf2;
  g.beginPath(); g.arc(7.5, 8.5, 3, 0, Math.PI * 2); g.fill();
  g.fillRect(11, 11, 2, 2);
  treeCache.set(key, c);
  return c;
}

let lampCanvas = null;
export function lampSprite() {
  if (lampCanvas) return lampCanvas;
  const c = document.createElement('canvas');
  c.width = 8; c.height = 20;
  const g = c.getContext('2d');
  g.fillStyle = '#3a4166';
  g.fillRect(3, 4, 2, 15);
  g.fillRect(1, 18, 6, 2);
  g.fillStyle = '#2c3152';
  g.fillRect(1, 1, 6, 5);
  g.fillStyle = PALETTE.windowLit;
  g.fillRect(2, 2, 4, 3);
  lampCanvas = c;
  return c;
}

// Small status icon above heads / buildings (color-independent shapes).
export function drawStatusIcon(g, kind, x, y, t) {
  g.save();
  g.translate(x, y + Math.sin(t / 260) * 1.5);
  if (kind === 'attention' || kind === 'permission' || kind === 'input' || kind === 'question') {
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(0, 0, 5.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1d2136';
    g.fillRect(-1, -3.4, 2, 4.4); g.fillRect(-1, 2, 2, 1.6);
  } else if (kind === 'failed') {
    g.fillStyle = PALETTE.fail;
    g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-2.2, -2.2); g.lineTo(2.2, 2.2);
    g.moveTo(2.2, -2.2); g.lineTo(-2.2, 2.2); g.stroke();
  } else if (kind === 'done') {
    g.fillStyle = PALETTE.ok;
    g.beginPath(); g.arc(0, 0, 5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-2.4, 0); g.lineTo(-0.6, 2); g.lineTo(2.6, -2); g.stroke();
  } else if (kind === 'zzz') {
    g.fillStyle = PALETTE.textDim;
    g.font = 'bold 7px monospace';
    g.fillText('z', 0, 0); g.fillText('z', 3, -4);
  }
  g.restore();
}
