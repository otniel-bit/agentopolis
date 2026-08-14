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
};

const BODY_HUES = ['#4e79c9', '#c95e79', '#4ea86b', '#c98a3e', '#8a63c9', '#3ba8a0', '#b8b04b', '#c96a4e'];
const HAT_BY_TYPE = {
  root: '#f0d24a',      // the foreman wears the yellow hard hat
  Explore: '#5bc0eb',
  Plan: '#b678d9',
  'general-purpose': '#e0e0e0',
};
const HAT_FALLBACK = ['#ff8f5e', '#7ee081', '#e879b0', '#8fd0ff', '#d0c060'];

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

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) * f | 0));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) * f | 0));
  const b = Math.min(255, Math.max(0, (n & 255) * f | 0));
  return `rgb(${r},${g},${b})`;
}

const spriteCache = new Map();

// Pre-rendered worker frame for a given seed + agentType. seed picks body
// color + skin tone; agentType picks hat. Deterministic and cached.
export function workerSprite(seed, agentType, pose, frame) {
  const body = BODY_HUES[Math.floor(seed * BODY_HUES.length) % BODY_HUES.length];
  const skins = [PALETTE.skin1, PALETTE.skin2, PALETTE.skin3, PALETTE.skin4];
  const skin = skins[Math.floor(seed * 7919) % skins.length];
  const hat = HAT_BY_TYPE[agentType] ||
    HAT_FALLBACK[Math.floor(seed * 104729) % HAT_FALLBACK.length];
  const frames = WORKER_FRAMES[pose] || WORKER_FRAMES.idle;
  const grid = frames[frame % frames.length];
  const key = `${body}|${skin}|${hat}|${pose}|${frame % frames.length}`;
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
      const ch = grid[y][x];
      if (ch === '.' || !colors[ch]) continue;
      g.fillStyle = colors[ch];
      g.fillRect(x, y, 1, 1);
    }
  }
  spriteCache.set(key, c);
  return c;
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

// Building rendered onto a cached canvas; keyed by everything that affects
// pixels. Lit windows twinkle via litSalt so the cache still gets reuse.
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

  const walls = [PALETTE.wallA, PALETTE.wallB, PALETTE.wallC, PALETTE.wallD, PALETTE.wallE];
  const roofs = [PALETTE.roofA, PALETTE.roofB, PALETTE.roofC, PALETTE.roofD, PALETTE.roofE];
  const wall = walls[rand(walls.length) | 0];
  const roof = roofs[rand(roofs.length) | 0];
  const W = [36, 44, 52][rand(3) | 0];         // silhouette variety
  const cols = Math.max(2, Math.floor((W - 8) / 10));
  const roofProp = rand(3) | 0;                 // antenna / water tank / AC
  const floorH = 12, base = 6;
  const H = 10 + floors * floorH + base;
  const c = document.createElement('canvas');
  c.width = W + 12; c.height = H + 14;
  const g = c.getContext('2d');
  const ox = 6, oy = 12;
  const dim = state === 'closed';

  // body + side shade + left highlight
  g.fillStyle = dim ? shade(wall, 0.55) : wall;
  g.fillRect(ox, oy + 8, W, H - 8);
  g.fillStyle = shade(wall, 0.72);
  g.fillRect(ox + W - 6, oy + 8, 6, H - 8);
  g.fillStyle = shade(wall, dim ? 0.62 : 1.12);
  g.fillRect(ox, oy + 8, 2, H - 8);

  // roof slab with depth
  g.fillStyle = dim ? shade(roof, 0.6) : roof;
  g.fillRect(ox - 2, oy + 4, W + 4, 6);
  g.fillStyle = shade(roof, 0.72);
  g.fillRect(ox - 2, oy + 8, W + 4, 2);
  g.fillStyle = shade(roof, dim ? 0.7 : 1.18);
  g.fillRect(ox - 2, oy + 4, W + 4, 1.4);

  // roof furniture (by seed): antenna / water tank / AC unit — plus chimney
  g.fillStyle = shade(wall, 0.6);
  g.fillRect(ox + W - 12, oy - 2, 5, 8);
  if (roofProp === 0) { // antenna with blinking-style tip
    g.fillStyle = '#4a5480';
    g.fillRect(ox + 6, oy - 8, 1.6, 12);
    g.fillRect(ox + 3, oy - 5, 8, 1.4);
    g.fillStyle = dim ? '#5a628c' : PALETTE.fail;
    g.fillRect(ox + 5.6, oy - 10, 2.4, 2.4);
  } else if (roofProp === 1) { // water tank
    g.fillStyle = shade(wall, 0.8);
    g.fillRect(ox + 5, oy - 5, 9, 9);
    g.fillStyle = shade(wall, 0.6);
    g.fillRect(ox + 4, oy - 6, 11, 2);
    g.fillRect(ox + 6, oy + 3, 1.4, 3); g.fillRect(ox + 11.6, oy + 3, 1.4, 3);
  } else { // AC unit
    g.fillStyle = '#9aa0c0';
    g.fillRect(ox + 6, oy - 1, 8, 5);
    g.fillStyle = '#6b7396';
    g.fillRect(ox + 7.5, oy + 0.4, 5, 2.2);
  }

  // windows: lit ratio depends on state
  const litChance = state === 'working' ? 0.85 : state === 'attention' ? 0.7
    : state === 'idle' || state === 'waiting' ? 0.4 : state === 'failed' ? 0.6 : 0.06;
  let salt = litSalt;
  const winSpan = (W - 8) / cols;
  for (let f = 0; f < floors; f++) {
    for (let wx = 0; wx < cols; wx++) {
      const x = ox + 5 + wx * winSpan, y = oy + 13 + f * floorH;
      salt = (salt * 1103515245 + 12345) & 0x7fffffff;
      const lit = (salt / 0x7fffffff) < litChance;
      g.fillStyle = PALETTE.frame;
      g.fillRect(x - 1, y - 1, 7, 9);
      g.fillStyle = lit ? ((salt & 1) ? PALETTE.windowLit : PALETTE.windowLit2) : PALETTE.windowDark;
      g.fillRect(x, y, 5, 7);
      if (lit) { // sill glow — makes lit windows feel warm, not painted
        g.fillStyle = 'rgba(255,217,122,0.25)';
        g.fillRect(x - 1, y + 7, 7, 1.6);
      }
    }
  }

  // door with striped awning + lamp
  const doorX = ox + W / 2 - 4;
  const doorTop = oy + H - base - 13;
  g.fillStyle = PALETTE.doorDark;
  g.fillRect(doorX - 1, doorTop, 10, 13 + base - 2);
  g.fillStyle = PALETTE.door;
  g.fillRect(doorX, doorTop + 1, 8, 12 + base - 2);
  g.fillStyle = dim ? shade('#8a6a48', 0.6) : '#d8b25e';
  g.fillRect(doorX + 5.6, doorTop + 7, 1.6, 1.6); // handle
  for (let a = 0; a < 5; a++) { // awning
    g.fillStyle = a % 2 === 0 ? (dim ? shade(roof, 0.5) : roof) : '#e8e6f0';
    g.fillRect(doorX - 3 + a * 3, doorTop - 3, 3, 3);
  }
  if (!dim) { // door lamp
    g.fillStyle = PALETTE.windowLit;
    g.fillRect(doorX - 4, doorTop + 2, 2, 2);
  }

  // base/foundation
  g.fillStyle = shade(wall, 0.5);
  g.fillRect(ox - 1, oy + H - base, W + 2, base - 2);

  buildingCache.set(key, c);
  return c;
}

// Temporary worksite: a striped tent with a job sign and a little fence.
const tentCache = new Map();
export function tentSprite(state) {
  const key = 'tent|' + state;
  if (tentCache.has(key)) return tentCache.get(key);
  const c = document.createElement('canvas');
  c.width = 52; c.height = 44;
  const g = c.getContext('2d');
  const t1 = state === 'closed' ? shade(PALETTE.tent1, 0.55) : PALETTE.tent1;
  const t2 = state === 'closed' ? shade(PALETTE.tent2, 0.55) : PALETTE.tent2;

  // tent body
  for (let y = 0; y < 22; y++) {
    const half = (y / 22) * 20;
    g.fillStyle = (Math.floor(y / 4) % 2 === 0) ? t1 : t2;
    g.fillRect(26 - half, 12 + y, half * 2, 1);
  }
  // opening
  g.fillStyle = '#2a2438';
  g.beginPath();
  g.moveTo(26, 20); g.lineTo(31, 34); g.lineTo(21, 34); g.closePath();
  g.fill();
  // pole + flag
  g.fillStyle = PALETTE.tentPole; g.fillRect(25, 4, 2, 9);
  g.fillStyle = PALETTE.attention; g.fillRect(27, 4, 7, 4);
  // fence posts
  g.fillStyle = PALETTE.tentPole;
  for (const x of [2, 10, 42, 50]) g.fillRect(x, 30, 2, 7);
  g.fillRect(2, 32, 10, 1.5); g.fillRect(42, 32, 10, 1.5);
  tentCache.set(key, c);
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
