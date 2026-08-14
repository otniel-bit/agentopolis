// Agentopolis city renderer: camera, layout, worker AI, effects.
// Consumes world snapshots (docs/PROTOCOL.md §3) and nothing else.

import {
  PALETTE, workerSprite, drawProp, buildingSprite, tentSprite, drawStatusIcon,
  glowSprite, plantSprite, coolerSprite, drawBubble,
} from './sprites.js';

const YARD = 64; // grass strip below the path where agents visibly work

const BSCALE = 2;                     // buildings drawn at worker scale — cutaway offices
const PLOT_W = 160, PLOT_H = 200;
const DISTRICT_W = 4 * PLOT_W + 48;   // fits the plot spiral's first 4 columns
const DISTRICT_H = 4 * PLOT_H + 66;
const DISTRICT_GAP = 46;
const HEADER = 20;
const WALK_SPEED = 84; // px/s — unhurried, city-stroll pace

// Where an OVERFLOW worker stands outside (everyone with a desk works inside).
const STATIONS = {
  researching: [-50, 10], editing: [-18, 20], creating: [-18, 20],
  testing: [50, 10], building: [36, 24], running: [36, 24],
  version_control: [-40, 28], installing: [22, 32], planning: [-50, 24],
  delegating: [0, 34], unknown: [14, 28],
};

export function createCity(canvas, { onSelect } = {}) {
  const ctx = canvas.getContext('2d');
  let snap = null;
  let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let selectedId = null;

  const cam = { x: 0, y: 0, zoom: 1.6 };
  let userMoved = false;
  let fitted = false;

  const workers = new Map();   // agentId -> visual state
  const promoAnims = new Map(); // buildingId -> start time
  const flashes = new Map();    // buildingId -> {color, until}
  const wins = new Map();       // buildingId -> {label, until} — outcome banners
  const particles = [];
  const hits = [];              // screen-space hit rects, rebuilt per frame
  const plates = [];            // name plates drawn above workers, per frame
  const bubbles = [];           // speech bubbles, drawn above everything
  const starsFar = Array.from({ length: 140 }, (_, i) => ({
    x: (i * 733) % 1900, y: (i * 401) % 950, p: (i * 97) % 100,
  }));
  const starsNear = Array.from({ length: 26 }, (_, i) => ({
    x: (i * 947) % 1900, y: (i * 613) % 950, p: (i * 53) % 100,
  }));
  let vignette = null, vigW = 0, vigH = 0;

  // ——— geometry ———

  // Districts pack tightly: each row's x-positions accumulate real widths,
  // and each row starts below the tallest district above it. Discovery
  // order (col/row from the server) stays stable, so geography is learnable.
  let origins = new Map();
  let rowH = PLOT_H;
  function computeRowH() {
    // top-down buildings are a constant footprint height; rows are
    // building + path + a working yard below it
    const bH = 54 * BSCALE;
    rowH = Math.min(PLOT_H + 40, bH + YARD + 24);
  }
  function hasBuildings(d) {
    return snap.buildings.some((b) => b.districtId === d.id);
  }
  function relayout() {
    origins = new Map();
    if (!snap) return;
    districtById = new Map(snap.districts.map((d) => [d.id, d]));
    computeRowH();
    const rows = new Map();
    for (const d of snap.districts) {
      if (!hasBuildings(d)) continue; // empty land isn't drawn or reserved
      if (!rows.has(d.row)) rows.set(d.row, []);
      rows.get(d.row).push(d);
    }
    causeways.length = 0;
    let y = 0;
    for (const row of [...rows.keys()].sort((a, b) => a - b)) {
      const ds = rows.get(row).sort((a, b) => a.col - b.col);
      let x = 0, tallest = 0, prevEdge = null;
      for (const d of ds) {
        const e = districtExtent(d);
        origins.set(d.id, { x, y });
        if (prevEdge !== null) {
          causeways.push({
            x1: prevEdge - 5,
            x2: x + 5,
            y: y + HEADER + 20 + (rowH - YARD) - 4,
          });
        }
        prevEdge = x + e.w;
        x += e.w + DISTRICT_GAP;
        tallest = Math.max(tallest, e.h);
      }
      y += tallest + DISTRICT_GAP;
    }
  }
  const causeways = [];

  const districtPos = (d) => origins.get(d.id) || { x: 0, y: 0 };

  // Crew per building (stable order) — drives floors, desks, and seats.
  let crewMap = new Map();
  function rebuildCrewMap() {
    crewMap = new Map();
    if (!snap) return;
    const byBuilding = new Map();
    for (const a of snap.agents) {
      if (a.finishedAt || !a.buildingId) continue;
      if (!byBuilding.has(a.buildingId)) byBuilding.set(a.buildingId, []);
      byBuilding.get(a.buildingId).push(a);
    }
    for (const [bid, list] of byBuilding) {
      list.sort((x, y) => (x.spawnedAt - y.spawnedAt) || (x.id < y.id ? -1 : 1));
      crewMap.set(bid, list.map((a) => a.id));
    }
  }

  function metricsFor(b) {
    const crew = (crewMap.get(b.id) || []).length;
    const floors = Math.min(4, Math.max(2, 1 + Math.ceil(crew / 2)));
    return { floors };
  }

  // Yard choreography: agents work OUTSIDE where you can see them —
  // Pokémon-style. Spots fan out on the grass below each building's path.
  const SPOTS = [
    [-36, 26], [36, 26], [-64, 42], [64, 42], [0, 46],
    [-18, 32], [18, 32], [-50, 56], [50, 56], [0, 60],
  ];
  function yardSpot(b, i) {
    const door = buildingPos(b);
    const sp = SPOTS[((i % SPOTS.length) + SPOTS.length) % SPOTS.length];
    return { x: door.x + sp[0], y: door.y + sp[1] };
  }
  function foremanPost(b) {
    const door = buildingPos(b);
    return { x: door.x + 34, y: door.y + 16 };
  }
  function coolerPos(d) {
    const o = districtPos(d);
    const e = districtExtent(d);
    return { x: o.x + e.w - 26, y: o.y + e.h - 32 };
  }
  function coolerForBuilding(b) {
    const d = snap.districts.find((x) => x.id === b.districtId);
    return d ? coolerPos(d) : buildingPos(b);
  }
  const CHAT = {
    researching: 'hmm…', reading: 'hmm…', editing: 'tak tak tak', creating: 'tak tak',
    testing: 'run the tests…', building: 'building…', running: 'on it…',
    version_control: 'commit!', installing: 'installing…', planning: 'so the plan is…',
    delegating: 'can you take this?', unknown: '…',
  };

  // Districts are drawn only as large as their occupied plots.
  function districtExtent(d) {
    let maxX = 0, maxY = 0;
    for (const b of snap.buildings) {
      if (b.districtId !== d.id) continue;
      maxX = Math.max(maxX, b.plot.x);
      maxY = Math.max(maxY, b.plot.y);
    }
    return {
      w: Math.min(DISTRICT_W, 52 + (maxX + 1) * PLOT_W),
      h: Math.min(DISTRICT_H, HEADER + 26 + (maxY + 1) * rowH),
      rows: maxY + 1,
    };
  }

  let districtById = new Map();
  function buildingPos(b) {
    const d = districtById.get(b.districtId);
    if (!d) return { x: 0, y: 0 };
    const o = districtPos(d);
    return {
      x: o.x + 26 + b.plot.x * PLOT_W + PLOT_W / 2,
      y: o.y + HEADER + 20 + b.plot.y * rowH + (rowH - YARD) - 2, // door line, yard below
    };
  }

  function worldBounds() {
    if (!snap || snap.districts.length === 0) return { x: 0, y: 0, w: DISTRICT_W, h: DISTRICT_H };
    let maxX = 200, maxY = 150; // actual content extents, not reserved cells
    for (const d of snap.districts) {
      const o = districtPos(d);
      const e = districtExtent(d);
      maxX = Math.max(maxX, o.x + e.w);
      maxY = Math.max(maxY, o.y + e.h);
    }
    return { x: -30, y: -30, w: maxX + 60, h: maxY + 60 };
  }

  function fit() {
    const b = worldBounds();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    cam.zoom = Math.max(0.4, Math.min(2.4, Math.min(w / b.w, h / b.h) * 0.96));
    cam.x = b.x + b.w / 2;
    cam.y = b.y + b.h / 2;
    fitted = true;
  }

  const toScreen = (wx, wy) => ({
    x: (wx - cam.x) * cam.zoom + canvas.clientWidth / 2,
    y: (wy - cam.y) * cam.zoom + canvas.clientHeight / 2,
  });

  // ——— snapshot diffing → animation triggers ———

  function setSnapshot(next) {
    const prev = snap;
    snap = next;
    relayout();
    if (!fitted || (!userMoved && prev && prev.districts.length !== next.districts.length)) fit();
    if (!prev) return;

    const prevB = new Map(prev.buildings.map((b) => [b.id, b]));
    for (const b of next.buildings) {
      const was = prevB.get(b.id);
      if (was && !was.permanent && b.permanent) {
        promoAnims.set(b.id, performance.now());
        flashes.set(b.id, { color: PALETTE.ok, until: performance.now() + 1100 });
      }
      // Celebrate outcomes only: a green test run or a landed commit.
      if (was && b.lastWinAt && b.lastWinAt !== was.lastWinAt) {
        flashes.set(b.id, { color: PALETTE.ok, until: performance.now() + 900 });
        const p = buildingPos(b);
        burst({ x: p.x, y: p.y - 10 }, 14, [PALETTE.ok, '#baf5c0', '#e8ffe9']);
        wins.set(b.id, { label: b.lastWinLabel || 'done', until: performance.now() + 3200 });
      }
      if (was && was.state !== 'failed' && b.state === 'failed') {
        flashes.set(b.id, { color: PALETTE.fail, until: performance.now() + 900 });
        smoke(buildingPos(b));
      }
      if (was && was.state !== 'attention' && b.state === 'attention') {
        flashes.set(b.id, { color: PALETTE.attention, until: performance.now() + 700 });
      }
    }

    const prevA = new Map(prev.agents.map((a) => [a.id, a]));
    for (const a of next.agents) {
      const was = prevA.get(a.id);
      if (was && !was.finishedAt && a.finishedAt) {
        const w = workers.get(a.id);
        if (w) {
          if (a.state === 'done') burst({ x: w.x, y: w.y - 8 }, 10, [PALETTE.ok, '#baf5c0']);
          w.leaveAt = performance.now() + 1600; // linger, then head home
        }
      }
    }
  }

  // ——— particles ———

  function burst(pos, n, colors) {
    if (reducedMotion) return;
    for (let i = 0; i < n; i++) {
      particles.push({
        x: pos.x, y: pos.y - 20,
        vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 70 - 15,
        g: 90, life: 1.3 + Math.random() * 0.5,
        color: colors[i % colors.length], size: 2 + Math.random() * 2,
      });
    }
  }
  function smoke(pos) {
    if (reducedMotion) return;
    for (let i = 0; i < 7; i++) {
      particles.push({
        x: pos.x + (Math.random() - 0.5) * 22, y: pos.y - 26 - Math.random() * 16,
        vx: (Math.random() - 0.5) * 8, vy: -12 - Math.random() * 10,
        g: -4, life: 1.8, color: 'rgba(150,150,170,0.7)', size: 3 + Math.random() * 3,
      });
    }
  }

  // ——— worker visual state ———

  function syncWorkers(now, dt) {
    if (!snap) return;
    rebuildCrewMap();
    const alive = new Set();
    let idx = 0;
    for (const a of snap.agents) {
      const b = snap.buildings.find((x) => x.id === a.buildingId);
      if (!b) continue; // building dismantled → worker leaves with it
      alive.add(a.id);
      const door = buildingPos(b);
      let w = workers.get(a.id);
      if (!w) {
        // agents that finished before we ever saw them don't get a ghost
        // entrance — their completion already counts in the summary
        if (a.finishedAt) continue;
        w = {
          x: door.x, y: door.y - 4, tx: door.x, ty: door.y,
          phase: (a.seed * 10) % Math.PI, frame: 0, walkT: 0,
          leaveAt: null, gone: false,
        };
        workers.set(a.id, w);
        if (!a.isRoot) burst(door, 5, ['#cfd6ff']); // puff of arrival
      }

      // stage machine: emerge from the door, greet the foreman, work a
      // yard spot, report back, walk inside. Everything happens in view.
      idx++;
      const crew = crewMap.get(a.buildingId) || [];
      const slot = Math.max(0, crew.indexOf(a.id));
      const post = foremanPost(b);
      if (!w.stage) {
        w.stage = a.isRoot ? 'post' : 'emerge';
        w.stageAt = now;
      }
      const arrive = (tx, ty) => { w.tx = tx; w.ty = ty; return Math.hypot(w.x - tx, w.y - ty) < 4; };
      const say = (text, ms = 1800) => { w.bubble = { text, until: now + ms }; };

      if (a.finishedAt && w.stage !== 'report' && w.stage !== 'leave') {
        w.stage = 'report'; w.stageAt = now;
        say(a.state === 'failed' ? 'uh oh…' : 'done!');
        const rootW = workers.get(a.buildingId ? (a.id.split(':')[0] + ':root') : '');
        if (rootW && !a.isRoot) rootW.bubble = { text: 'nice ✓', until: now + 1600 };
      } else if (a.state === 'attention' && w.stage !== 'attention') {
        w.stage = 'attention'; w.stageAt = now;
      } else if (a.state !== 'attention' && w.stage === 'attention') {
        w.stage = a.isRoot ? 'post' : 'work'; w.stageAt = now;
      }

      switch (w.stage) {
        case 'post': { // the foreman holds the door-side post while working
          if (a.activity) {
            if (!b.permanent) {
              w.faceUp = arrive(door.x + 1, door.y - 2); // at the hot-desk chair
            } else {
              w.faceUp = false;
              arrive(post.x, post.y);
            }
            if (!w.nextChat || now > w.nextChat) {
              w.nextChat = now + 9000 + a.seed * 8000;
              say(CHAT[a.activity.kind] || '…', 2000);
            }
          } else {
            // idle: coffee at the cooler
            const cp = coolerForBuilding(b);
            arrive(cp.x - 10 - (idx % 3) * 9, cp.y + 4);
            if (!w.nextChat || now > w.nextChat) {
              w.nextChat = now + 12000 + a.seed * 9000;
              say('☕', 1800);
            }
          }
          break;
        }
        case 'emerge': { // step out, walk to the foreman, have a word
          if (arrive(post.x - 22, post.y + 4) && !w.greeted) {
            w.greeted = true;
            w.replyAt = now + 1500; // wait for the foreman to finish asking
            const rootW = workers.get(a.id.split(':')[0] + ':root');
            if (rootW) rootW.bubble = { text: CHAT.delegating, until: now + 1400 };
          }
          if (w.greeted && w.replyAt && now > w.replyAt) {
            say('on it!', 1400);
            w.replyAt = null;
          }
          if (w.greeted && now - w.stageAt > 3400) { w.stage = 'work'; w.stageAt = now; }
          break;
        }
        case 'work': { // visible work at an open-floor desk spot
          if (a.activity) {
            const sp = yardSpot(b, slot);
            w.atDeskSpot = arrive(sp.x, sp.y);
            if (!w.nextChat || now > w.nextChat) {
              w.nextChat = now + 8000 + a.seed * 7000;
              say(CHAT[a.activity.kind] || '…', 2000);
            }
          } else {
            w.atDeskSpot = false;
            const cp = coolerForBuilding(b);
            arrive(cp.x - 10 - (idx % 3) * 9, cp.y + 4);
          }
          break;
        }
        case 'report': { // walk to the foreman with the result
          if (arrive(post.x - 22, post.y + 4) && now - w.stageAt > 1600) {
            w.stage = 'leave'; w.stageAt = now;
          }
          if (a.isRoot) { w.stage = 'leave'; w.stageAt = now; } // foreman just heads in
          break;
        }
        case 'leave': { // through the door and gone
          if (arrive(door.x, door.y - 2)) {
            w.gone = true;
            if (!reducedMotion) burst({ x: w.x, y: w.y }, 3, ['#cfd6ff']);
          }
          break;
        }
        case 'attention': { // front and center, hand up
          arrive(door.x, door.y + 34);
          w.bubble = { text: 'need you!', until: now + 500 }; // persistent while waiting
          break;
        }
      }

      // move
      const dx = w.tx - w.x, dy = w.ty - w.y;
      const dist = Math.hypot(dx, dy);
      if (reducedMotion) {
        w.x = w.tx; w.y = w.ty; w.moving = false;
      } else if (dist > 2) {
        const step = Math.min(dist, WALK_SPEED * dt);
        w.x += (dx / dist) * step;
        w.y += (dy / dist) * step;
        w.moving = true;
        w.walkT += dt * 9;
      } else {
        w.moving = false;
      }
    }
    for (const [id, w] of workers) {
      if (!alive.has(id) || w.gone) workers.delete(id);
    }
  }

  // ——— drawing ———

  let bgLayer = null, bgW = 0, bgH = 0;
  let gridTile = null, gridStep = 0;

  // The sky and the plan grid never change between frames — bake them once and
  // blit. This is what keeps a busy city off the "significant energy" list.
  function buildBgLayer(w, h) {
    bgLayer = document.createElement('canvas');
    bgLayer.width = w; bgLayer.height = h;
    const g = bgLayer.getContext('2d');
    g.fillStyle = PALETTE.floor;
    g.fillRect(0, 0, w, h);
    for (const s2 of starsFar) {
      g.fillStyle = 'rgba(205,212,245,0.16)';
      g.fillRect((s2.x / 1900) * w, (s2.y / 950) * h, 1.2, 1.2);
    }
    bgW = w; bgH = h;
  }

  function buildGridTile(step) {
    gridTile = document.createElement('canvas');
    gridTile.width = step; gridTile.height = step;
    const g = gridTile.getContext('2d');
    g.fillStyle = 'rgba(160,170,215,0.05)';
    g.fillRect(0, 0, 1.5, 1.5);
    gridStep = step;
  }

  function drawBackground(t) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!bgLayer || bgW !== w || bgH !== h) buildBgLayer(w, h);
    ctx.drawImage(bgLayer, 0, 0);

    // world-anchored plan grid, one pattern fill
    const step = Math.round(32 * cam.zoom);
    if (step > 9) {
      if (!gridTile || gridStep !== step) buildGridTile(step);
      const offX = ((-cam.x * cam.zoom + w / 2) % step + step) % step;
      const offY = ((-cam.y * cam.zoom + h / 2) % step + step) % step;
      const pat = ctx.createPattern(gridTile, 'repeat');
      ctx.save();
      ctx.translate(offX, offY);
      ctx.fillStyle = pat;
      ctx.fillRect(-step, -step, w + step * 2, h + step * 2);
      ctx.restore();
    }

    // a handful of animated highlights, instead of twinkling all 166
    if (!reducedMotion) {
      for (const s2 of starsNear) {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t / 800 + s2.p));
        ctx.fillStyle = `rgba(230,236,255,${tw * 0.35})`;
        ctx.fillRect((s2.x / 1900) * w, (s2.y / 950) * h, 2, 2);
      }
    }
  }

  function drawVignette() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!vignette || vigW !== w || vigH !== h) {
      vigW = w; vigH = h;
      vignette = document.createElement('canvas');
      vignette.width = w; vignette.height = h;
      const g = vignette.getContext('2d');
      const grad = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.75);
      grad.addColorStop(0, 'rgba(10,11,22,0)');
      grad.addColorStop(1, 'rgba(10,11,22,0.42)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    }
    ctx.drawImage(vignette, 0, 0);
  }

  function drawCauseways() {
    const z = cam.zoom;
    for (const c of causeways) {
      const a = toScreen(c.x1, c.y - 4);
      const b = toScreen(c.x2, c.y - 4);
      // corridor floor with wall lines — an office hallway between suites
      ctx.fillStyle = PALETTE.carpetC;
      ctx.fillRect(a.x, a.y - 2 * z, b.x - a.x, 15 * z);
      ctx.fillStyle = PALETTE.wallLine;
      ctx.fillRect(a.x, a.y - 3.4 * z, b.x - a.x, 1.6 * z);
      ctx.fillRect(a.x, a.y + 12.6 * z, b.x - a.x, 1.6 * z);
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(a.x, a.y - 1 * z, b.x - a.x, 1 * z);
    }
  }

  // Each suite's floor is static furniture: carpet, texture, walls, plants,
  // the cooler, the nameplate. Bake it once per (district, extent) into an
  // offscreen layer at world scale and blit — instead of ~70 draw calls per
  // district per frame.
  const groundCache = new Map(); // districtId -> {key, canvas, w, h}

  function buildDistrictGround(d, ext) {
    const W = Math.ceil(ext.w), H = Math.ceil(ext.h);
    const c = document.createElement('canvas');
    c.width = W + 8; c.height = H + 10;
    const g = c.getContext('2d');
    const ox = 4, oy = 4;
    const seed = d.id.charCodeAt(2) + d.id.charCodeAt(3);
    const accents = ['#5b8bd9', '#5aa876', '#c5586b', '#c78f4e', '#8d6fc0'];
    const accent = accents[seed % accents.length];

    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.roundRect(ox - 2, oy + 2, W + 8, H + 6, 8); g.fill();
    g.fillStyle = PALETTE.carpetA;
    g.beginPath(); g.roundRect(ox, oy, W, H, 6); g.fill();
    g.fillStyle = `rgba(${parseInt(accent.slice(1, 3), 16)},${parseInt(accent.slice(3, 5), 16)},${parseInt(accent.slice(5, 7), 16)},0.05)`;
    g.beginPath(); g.roundRect(ox, oy, W, H, 6); g.fill();

    g.fillStyle = 'rgba(255,255,255,0.025)';
    for (let i = 0; i < 40; i++) {
      const gx = (i * 379 + seed * 131) % (ext.w - 10);
      const gy = (i * 523 + seed * 197) % (ext.h - 10);
      g.fillRect(ox + 5 + gx, oy + 5 + gy, 4, 1.2);
    }

    g.strokeStyle = PALETTE.wallLine;
    g.lineWidth = 2.4;
    g.beginPath(); g.roundRect(ox + 1.2, oy + 1.2, W - 2.4, H - 2.4, 5); g.stroke();

    for (let r = 0; r < ext.rows; r++) {
      const y = oy + (HEADER + 20 + r * rowH + (rowH - YARD) - 4);
      if (y > oy + H - 6) break;
      g.fillStyle = PALETTE.carpetB;
      g.fillRect(ox + 6, y, W - 12, 9);
      g.fillStyle = 'rgba(255,255,255,0.04)';
      g.fillRect(ox + 6, y, W - 12, 1);
    }

    g.imageSmoothingEnabled = false;
    g.drawImage(plantSprite(seed), ox + W - 32, oy + 8, 21, 27);
    if (ext.w > 220) g.drawImage(plantSprite(seed + 1), ox + 8, oy + H - 34, 21, 27);

    // water cooler, drawn at its world offset inside the layer
    const cw = ext.w - 26, ch = ext.h - 32;
    g.globalAlpha = 0.22;
    g.drawImage(glowSprite(), ox + cw - 18, ch + oy - 24, 40, 40);
    g.globalAlpha = 1;
    g.drawImage(coolerSprite(), ox + cw - 7, oy + ch - 22, 15, 24);

    g.fillStyle = 'rgba(15,17,30,0.6)';
    const label = d.name.toUpperCase();
    g.font = 'bold 9px ui-monospace, monospace';
    const tw = g.measureText(label).width;
    g.beginPath(); g.roundRect(ox + 10, oy + 5, tw + 12, 14, 4); g.fill();
    g.fillStyle = PALETTE.textDim;
    g.fillText(label, ox + 16, oy + 15.5);

    return { canvas: c, ox, oy };
  }

  function drawDistrict(d, t) {
    const o = districtPos(d);
    const p0 = toScreen(o.x, o.y);
    const z = cam.zoom;
    const ext = districtExtent(d);
    const key = `${Math.round(ext.w)}x${Math.round(ext.h)}x${ext.rows}x${d.name}`;
    let cached = groundCache.get(d.id);
    if (!cached || cached.key !== key) {
      const built = buildDistrictGround(d, ext);
      cached = { key, ...built };
      groundCache.set(d.id, cached);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      cached.canvas,
      p0.x - cached.ox * z, p0.y - cached.oy * z,
      cached.canvas.width * z, cached.canvas.height * z,
    );
  }

  function drawBuilding(b, t) {
    const pos = buildingPos(b);
    const z = cam.zoom;
    const door = toScreen(pos.x, pos.y);

    let sprite;
    if (b.permanent) {
      const m = metricsFor(b);
      const litSalt = (b.state === 'working' && !reducedMotion)
        ? Math.floor(t / 1400) % 7  // slow twinkle
        : 3;
      sprite = buildingSprite(b.id + b.name, m.floors, b.state, litSalt);
    } else {
      sprite = tentSprite(b.state);
    }

    let sw = sprite.width * BSCALE * z, sh = sprite.height * BSCALE * z;
    let yScale = 1;
    const promo = promoAnims.get(b.id);
    if (promo != null) {
      const k = (performance.now() - promo) / 900;
      if (k >= 1) promoAnims.delete(b.id);
      else yScale = reducedMotion ? 1 : 0.15 + 0.85 * (1 - Math.pow(1 - k, 3)); // rise up
    }

    const x = door.x - sw / 2;
    const y = door.y - sh * yScale + 12 * z;

    // ground shadow — light-handed, it's a hint not a stain
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(door.x, door.y + 5 * z, sw * (b.permanent ? 0.44 : 0.34), 3.5 * z, 0, 0, Math.PI * 2);
    ctx.fill();

    // warm presence glow — the "someone is home" light
    const pulse = reducedMotion ? 0 : 0.06 * Math.abs(Math.sin(t / 600));
    const glowAlpha = b.state === 'working' ? 0.2 + pulse
      : b.state === 'attention' ? 0.3 + pulse * 2
      : b.state === 'idle' || b.state === 'waiting' ? 0.1
      : 0;
    if (glowAlpha > 0) {
      const gs = Math.max(sw, sh * yScale) * 1.5;
      ctx.globalAlpha = glowAlpha;
      ctx.drawImage(glowSprite(), door.x - gs / 2, y + (sh * yScale) / 2 - gs / 2, gs, gs);
      ctx.globalAlpha = 1;
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, x, y, sw, sh * yScale);


    // state flash overlay
    const flash = flashes.get(b.id);
    if (flash) {
      if (performance.now() > flash.until) flashes.delete(b.id);
      else {
        ctx.globalAlpha = 0.28 * Math.abs(Math.sin(performance.now() / 90));
        ctx.fillStyle = flash.color;
        ctx.fillRect(x, y, sw, sh * yScale);
        ctx.globalAlpha = 1;
      }
    }

    // attention beacon: cone + icon, impossible to miss even zoomed out
    if (b.state === 'attention') {
      const pulse = reducedMotion ? 0.5 : 0.35 + 0.3 * Math.abs(Math.sin(t / 320));
      ctx.fillStyle = `rgba(255,217,122,${pulse * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(door.x, y - 26 * z);
      ctx.lineTo(door.x - 16 * z, y);
      ctx.lineTo(door.x + 16 * z, y);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.scale(Math.max(1, z), Math.max(1, z));
      drawStatusIcon(ctx, 'attention', door.x / Math.max(1, z), (y - 14 * z) / Math.max(1, z), t);
      ctx.restore();
    } else if (b.state === 'failed') {
      ctx.save();
      ctx.scale(Math.max(1, z), Math.max(1, z));
      drawStatusIcon(ctx, 'failed', door.x / Math.max(1, z), (y - 8 * z) / Math.max(1, z), t);
      ctx.restore();
    }

    // name plate rendered later as a sign over the door
    plates.push({ x: door.x, sy: y - 13 * z, name: b.name, permanent: b.permanent });

    // outcome banner: what actually landed, briefly, above the room
    const win = wins.get(b.id);
    if (win) {
      if (performance.now() > win.until) wins.delete(b.id);
      else bubbles.push({ text: '✓ ' + win.label, x: door.x, y: y - 20 * z, ok: true });
    }

    // selection ring
    if (selectedId === b.id) {
      ctx.strokeStyle = '#8fd0ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(x - 3, y - 3, sw + 6, sh * yScale + 6);
      ctx.setLineDash([]);
    }

    hits.push({ kind: 'building', id: b.id, x, y, w: sw, h: sh * yScale + 16 * z });
  }

  function drawWorker(a, t) {
    const w = workers.get(a.id);
    if (!w) return;
    const z = cam.zoom;
    const p = toScreen(w.x, w.y);
    const scale = 2 * z;

    let pose = 'idle', frame = Math.floor(t / 480) % 2;
    if (a.state === 'attention') {
      pose = 'raise'; frame = Math.floor(t / 300) % 2;
    } else if (w.moving) {
      pose = 'walk'; frame = Math.floor(w.walkT) % 4;
    } else if (a.activity && !a.activity.done) {
      pose = 'work'; frame = Math.floor(t / 260) % 2;
    }

    // facing from velocity, Pokémon-style
    if (w.moving) {
      const vdx = w.tx - w.x, vdy = w.ty - w.y;
      if (Math.abs(vdx) > Math.abs(vdy)) { w.facing = 'side'; w.flip = vdx < 0; }
      else w.facing = vdy < 0 ? 'up' : 'down';
    } else if (w.atDeskSpot || w.faceUp) {
      w.facing = 'up'; w.flip = false; // face the monitor
    } else {
      w.facing = 'down'; w.flip = false;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 15 * z, 7 * z, 2.4 * z, 0, 0, Math.PI * 2);
    ctx.fill();

    const spr = workerSprite(a.seed, a.agentType, pose, frame, w.facing);
    ctx.imageSmoothingEnabled = false;
    const fade = a.finishedAt ? Math.max(0.35, 1 - (Date.now() - a.finishedAt) / 240000) : 1;
    ctx.globalAlpha = fade;
    const bob = Math.sin(w.phase + t / 400) * (reducedMotion ? 0 : 0.8) * z;
    if (w.flip) {
      ctx.save();
      ctx.translate(p.x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(spr, -6 * scale, p.y - 8 * scale + bob, 12 * scale, 16 * scale);
      ctx.restore();
    } else {
      ctx.drawImage(spr, p.x - 6 * scale, p.y - 8 * scale + bob, 12 * scale, 16 * scale);
    }

    // speech bubble queued for the overlay pass (drawn above everything)
    if (w.bubble && (w.bubble.until > performance.now() || w.stage === 'attention')) {
      bubbles.push({ text: w.bubble.text, x: p.x, y: p.y - 20 * z });
    }

    if (pose === 'work' && a.activity && w.atDeskSpot && !w.moving) {
      // settled at an open-floor desk: face the monitor, screen shows the work
      const SCREEN = {
        researching: '#7ec3ff', reading: '#7ec3ff', editing: '#8ee6a1', creating: '#8ee6a1',
        testing: '#ffd97a', building: '#f0a860', running: '#f0a860',
        version_control: '#ffb86b', installing: '#c9a9ff', planning: '#e8e6f0',
        delegating: '#ff9ecf', unknown: '#9aa0c0',
      };
      const dy = p.y - 14 * z;
      ctx.fillStyle = PALETTE.wood;
      ctx.beginPath(); ctx.roundRect(p.x - 13 * z, dy - 8 * z, 26 * z, 9 * z, 2 * z); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(p.x - 13 * z, dy - 8 * z, 26 * z, 1.6 * z);
      ctx.fillStyle = '#23263c';
      ctx.fillRect(p.x - 4.5 * z, dy - 7 * z, 9 * z, 4.6 * z);
      const col = SCREEN[a.activity.kind] || SCREEN.unknown;
      ctx.globalAlpha = 0.75 + 0.25 * Math.abs(Math.sin(t / 210));
      ctx.fillStyle = col;
      ctx.fillRect(p.x - 3.6 * z, dy - 6.3 * z, 7.2 * z, 3.2 * z);
      ctx.globalAlpha = 1;
    } else if (pose === 'work' && a.activity) {
      // walking with the task in hand
      ctx.save();
      ctx.translate(p.x + 7 * z, p.y + 2 * z);
      ctx.scale(z * 1.4, z * 1.4);
      drawProp(ctx, a.activity.kind, 0, 0, reducedMotion ? 0 : t);
      ctx.restore();
    }

    // status icons above the head
    const iy = p.y - 20 * z;
    ctx.save();
    ctx.scale(Math.max(1, z), Math.max(1, z));
    const sx = p.x / Math.max(1, z), sy = iy / Math.max(1, z);
    if (a.state === 'attention') { /* beacon + bubble carry it */ }
    else if (a.state === 'failed') drawStatusIcon(ctx, 'failed', sx, sy, t);
    else if (a.finishedAt) drawStatusIcon(ctx, 'done', sx, sy, t);
    else if (!a.activity && !w.moving) drawStatusIcon(ctx, 'zzz', sx, sy, t);
    ctx.restore();
    ctx.globalAlpha = 1;

    if (selectedId === a.id) {
      ctx.strokeStyle = '#8fd0ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(p.x - 7 * scale, p.y - 9 * scale, 14 * scale, 19 * scale);
      ctx.setLineDash([]);
    }

    hits.push({ kind: 'agent', id: a.id, x: p.x - 7 * scale, y: p.y - 9 * scale, w: 14 * scale, h: 19 * scale });
  }

  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const s = toScreen(p.x, p.y);
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(s.x, s.y, p.size * cam.zoom, p.size * cam.zoom);
      ctx.globalAlpha = 1;
    }
  }

  // ——— main loop ———

  // A city of animated workers is the worst case for battery in this category,
  // so an idle city costs almost nothing: full rate only while something is
  // actually moving, ~8fps when the office is quiet, and nothing at all while
  // the window is hidden or the widget's popover is closed.
  let last = performance.now();
  let lastDraw = 0;
  let paused = false;
  function isBusy() {
    if (particles.length || promoAnims.size || flashes.size || wins.size) return true;
    if (!snap) return false;
    if (snap.attention && snap.attention.length) return true;
    for (const w of workers.values()) if (w.moving) return true;
    for (const a of snap.agents) if (a.activity && !a.activity.done) return true;
    return false;
  }

  function tick(now) {
    requestAnimationFrame(tick);
    if (paused || document.hidden) return;
    // Pixel art is stepped animation: 20fps reads as intentional, costs a
    // third of 60fps, and an idle office drops to 8fps. This is the single
    // biggest lever on battery for an always-on widget.
    const minFrame = isBusy() ? 48 : 120;
    if (now - lastDraw < minFrame) return;
    lastDraw = now;

    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    hits.length = 0;
    plates.length = 0;
    bubbles.length = 0;
    drawBackground(now);

    if (snap) {
      syncWorkers(now, dt);
      for (const d of snap.districts) {
        if (origins.has(d.id)) drawDistrict(d, now);
      }
      drawCauseways();
      const sortedB = [...snap.buildings].sort((a, b) => buildingPos(a).y - buildingPos(b).y);
      for (const b of sortedB) drawBuilding(b, now);
      const sortedA = [...snap.agents]
        .filter((a) => workers.has(a.id))
        .sort((a, b) => (workers.get(a.id).y - workers.get(b.id).y));
      for (const a of sortedA) drawWorker(a, now);
      const z = cam.zoom;
      for (const p of plates) {
        const name = p.name.length > 22 ? p.name.slice(0, 21) + '…' : p.name;
        ctx.font = `${Math.max(7.5, 8 * z)}px ui-monospace, monospace`;
        const tw = ctx.measureText(name).width;
        ctx.fillStyle = p.permanent ? 'rgba(15,17,30,0.7)' : 'rgba(15,17,30,0.45)';
        ctx.beginPath();
        ctx.roundRect(p.x - tw / 2 - 4 * z, p.sy, tw + 8 * z, 11.5 * z, 3 * z);
        ctx.fill();
        ctx.fillStyle = p.permanent ? PALETTE.text : PALETTE.textDim;
        ctx.fillText(name, p.x - tw / 2, p.sy + 8.5 * z);
      }
      for (const bb of bubbles) drawBubble(ctx, bb.text, bb.x, bb.y, z, bb.ok);
      bubbles.length = 0;
      drawParticles(dt);
      if (canvas.clientWidth > 620) drawVignette();
    }
  }
  requestAnimationFrame(tick);
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  // ——— input: pan, zoom, click ———

  let dragging = false, dragMoved = false, lx = 0, ly = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; dragMoved = false; lx = e.clientX; ly = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
    if (dragMoved) {
      cam.x -= dx / cam.zoom;
      cam.y -= dy / cam.zoom;
      userMoved = true;
      lx = e.clientX; ly = e.clientY;
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    if (dragMoved) return;
    // click → topmost worker first, then building
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let found = null;
    for (const hit of hits) {
      if (mx >= hit.x && mx <= hit.x + hit.w && my >= hit.y && my <= hit.y + hit.h) {
        if (!found || hit.kind === 'agent') found = hit;
      }
    }
    selectedId = found ? found.id : null;
    if (onSelect) onSelect(found ? { kind: found.kind, id: found.id } : null);
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0012);
    cam.zoom = Math.max(0.45, Math.min(4, cam.zoom * factor));
    userMoved = true;
  }, { passive: false });

  return {
    setSnapshot,
    fit: () => { userMoved = false; fit(); },
    focusBuilding(id) {
      const b = snap && snap.buildings.find((x) => x.id === id);
      if (!b) return;
      const p = buildingPos(b);
      cam.x = p.x; cam.y = p.y - 20;
      cam.zoom = Math.max(cam.zoom, 1.8);
      selectedId = id;
      userMoved = true;
    },
    select(id) { selectedId = id; },
    setReducedMotion(v) { reducedMotion = v; },
    // The menu-bar widget calls this when its popover closes, so a hidden
    // city draws nothing at all instead of animating into the void.
    setPaused(v) { paused = !!v; if (!v) last = performance.now(); },
    getSelected: () => selectedId,
  };
}
