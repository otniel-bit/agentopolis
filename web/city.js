// Agentopolis city renderer: camera, layout, worker AI, effects.
// Consumes world snapshots (docs/PROTOCOL.md §3) and nothing else.

import {
  PALETTE, workerSprite, drawProp, buildingSprite, tentSprite, drawStatusIcon,
} from './sprites.js';

const PLOT_W = 64, PLOT_H = 58;
const DISTRICT_W = 4 * PLOT_W + 48;   // fits the plot spiral's first 4 columns
const DISTRICT_H = 4 * PLOT_H + 66;
const DISTRICT_GAP = 46;
const HEADER = 20;
const WALK_SPEED = 34; // px/s — unhurried, city-stroll pace

// Where a worker stands, relative to its building's door, per activity.
const STATIONS = {
  researching: [-28, 6], editing: [-10, 12], creating: [-10, 12],
  testing: [28, 6], building: [20, 14], running: [20, 14],
  version_control: [-22, 16], installing: [12, 18], planning: [-28, 14],
  delegating: [0, 20], unknown: [8, 16],
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
  const particles = [];
  const hits = [];              // screen-space hit rects, rebuilt per frame
  const plates = [];            // name plates drawn above workers, per frame
  const stars = Array.from({ length: 90 }, (_, i) => ({
    x: (i * 733) % 1900, y: (i * 401) % 700, p: (i * 97) % 100,
  }));

  // ——— geometry ———

  // Districts pack tightly: each row's x-positions accumulate real widths,
  // and each row starts below the tallest district above it. Discovery
  // order (col/row from the server) stays stable, so geography is learnable.
  let origins = new Map();
  function relayout() {
    origins = new Map();
    if (!snap) return;
    const rows = new Map();
    for (const d of snap.districts) {
      if (!rows.has(d.row)) rows.set(d.row, []);
      rows.get(d.row).push(d);
    }
    let y = 0;
    for (const row of [...rows.keys()].sort((a, b) => a - b)) {
      const ds = rows.get(row).sort((a, b) => a.col - b.col);
      let x = 0, tallest = 0;
      for (const d of ds) {
        const e = districtExtent(d);
        origins.set(d.id, { x, y });
        x += e.w + DISTRICT_GAP;
        tallest = Math.max(tallest, e.h);
      }
      y += tallest + DISTRICT_GAP;
    }
  }

  const districtPos = (d) => origins.get(d.id) || { x: 0, y: 0 };

  // Districts are drawn only as large as their occupied plots.
  function districtExtent(d) {
    let maxX = 1, maxY = 0;
    for (const b of snap.buildings) {
      if (b.districtId !== d.id) continue;
      maxX = Math.max(maxX, b.plot.x);
      maxY = Math.max(maxY, b.plot.y);
    }
    return {
      w: Math.min(DISTRICT_W, 52 + (maxX + 1) * PLOT_W),
      h: Math.min(DISTRICT_H, HEADER + 26 + (maxY + 1) * PLOT_H),
      rows: maxY + 1,
    };
  }

  function buildingPos(b) {
    const d = snap.districts.find((x) => x.id === b.districtId);
    if (!d) return { x: 0, y: 0 };
    const o = districtPos(d);
    return {
      x: o.x + 26 + b.plot.x * PLOT_W + PLOT_W / 2,
      y: o.y + HEADER + 20 + b.plot.y * PLOT_H + PLOT_H - 12, // door line
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
    cam.zoom = Math.max(0.5, Math.min(2.4, Math.min(w / b.w, h / b.h) * 0.92));
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
        burst(buildingPos(b), 26, [PALETTE.attention, PALETTE.ok, '#8fd0ff', '#e879b0']);
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
    const alive = new Set();
    let idx = 0;
    for (const a of snap.agents) {
      const b = snap.buildings.find((x) => x.id === a.buildingId);
      if (!b) continue; // building dismantled → worker leaves with it
      alive.add(a.id);
      const door = buildingPos(b);
      let w = workers.get(a.id);
      if (!w) {
        w = {
          x: door.x, y: door.y - 4, tx: door.x, ty: door.y,
          phase: (a.seed * 10) % Math.PI, frame: 0, walkT: 0,
          leaveAt: null, gone: false,
        };
        workers.set(a.id, w);
        if (!a.isRoot) burst(door, 5, ['#cfd6ff']); // puff of arrival
      }

      // pick a destination
      const spread = 1 + (idx++ % 3);
      if (a.finishedAt && w.leaveAt && now > w.leaveAt) {
        w.tx = door.x; w.ty = door.y - 2; // walk back inside
        if (Math.hypot(w.x - w.tx, w.y - w.ty) < 3) w.gone = true;
      } else if (a.state === 'attention') {
        w.tx = door.x; w.ty = door.y + 26;
      } else if (a.activity) {
        const st = STATIONS[a.activity.kind] || STATIONS.unknown;
        w.tx = door.x + st[0] + (a.isRoot ? 0 : spread * 6 - 9);
        w.ty = door.y + st[1] + (a.isRoot ? 0 : (spread % 2) * 7);
      } else {
        // idle: gentle wander near the door
        if (!w.wanderUntil || now > w.wanderUntil) {
          w.wanderUntil = now + 2600 + Math.random() * 3600;
          w.tx = door.x + (Math.random() - 0.5) * 44;
          w.ty = door.y + 10 + Math.random() * 16;
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

  function drawBackground(t) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, PALETTE.night1);
    grad.addColorStop(1, PALETTE.night2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    for (const s of stars) {
      const tw = reducedMotion ? 0.6 : 0.35 + 0.5 * Math.abs(Math.sin(t / 900 + s.p));
      ctx.fillStyle = `rgba(220,225,255,${tw * 0.5})`;
      ctx.fillRect((s.x / 1900) * w, (s.y / 700) * h * 0.5, 1.6, 1.6);
    }
  }

  function drawDistrict(d, t) {
    const o = districtPos(d);
    const p0 = toScreen(o.x, o.y);
    const z = cam.zoom;
    const ext = districtExtent(d);
    const W = ext.w * z, H = ext.h * z;

    // ground plate
    ctx.fillStyle = PALETTE.groundEdge;
    ctx.beginPath();
    ctx.roundRect(p0.x - 4 * z, p0.y - 4 * z, W + 8 * z, H + 8 * z, 10 * z);
    ctx.fill();
    ctx.fillStyle = PALETTE.ground;
    ctx.beginPath();
    ctx.roundRect(p0.x, p0.y, W, H, 8 * z);
    ctx.fill();

    // grass texture dots (deterministic)
    ctx.fillStyle = 'rgba(120,200,170,0.06)';
    for (let i = 0; i < 60; i++) {
      const gx = ((i * 379 + d.col * 131) % ext.w) * z;
      const gy = ((i * 523 + d.row * 197) % ext.h) * z;
      ctx.fillRect(p0.x + gx, p0.y + gy, 2 * z, 1.2 * z);
    }

    // roads between plot rows
    ctx.fillStyle = PALETTE.road;
    for (let r = 0; r < ext.rows; r++) {
      const y = p0.y + (HEADER + 20 + r * PLOT_H + PLOT_H - 6) * z;
      if (y > p0.y + H - 6 * z) break;
      ctx.fillRect(p0.x + 8 * z, y, W - 16 * z, 7 * z);
      ctx.fillStyle = PALETTE.roadLine;
      for (let x = 0; x < W - 30 * z; x += 18 * z) {
        ctx.fillRect(p0.x + (14 * z) + x, y + 3 * z, 8 * z, 1 * z);
      }
      ctx.fillStyle = PALETTE.road;
    }

    // district label
    ctx.fillStyle = 'rgba(15,17,30,0.75)';
    const label = d.name.toUpperCase();
    ctx.font = `bold ${Math.max(9, 10 * z)}px ui-monospace, monospace`;
    const tw = ctx.measureText(label).width;
    ctx.beginPath();
    ctx.roundRect(p0.x + 10 * z, p0.y + 6 * z, tw + 14 * z, 16 * z, 4 * z);
    ctx.fill();
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText(label, p0.x + 17 * z, p0.y + (6 + 12) * z);
  }

  function drawBuilding(b, t) {
    const pos = buildingPos(b);
    const z = cam.zoom;
    const door = toScreen(pos.x, pos.y);

    let sprite;
    let floors = 2;
    if (b.permanent) {
      floors = 2 + (b.name.length % 3);
      const litSalt = (b.state === 'working' && !reducedMotion)
        ? Math.floor(t / 1400) % 7  // slow twinkle
        : 3;
      sprite = buildingSprite(b.id + b.name, floors, b.state, litSalt);
    } else {
      sprite = tentSprite(b.state);
    }

    let sw = sprite.width * 1.15 * z, sh = sprite.height * 1.15 * z;
    let yScale = 1;
    const promo = promoAnims.get(b.id);
    if (promo != null) {
      const k = (performance.now() - promo) / 900;
      if (k >= 1) promoAnims.delete(b.id);
      else yScale = reducedMotion ? 1 : 0.15 + 0.85 * (1 - Math.pow(1 - k, 3)); // rise up
    }

    const x = door.x - sw / 2;
    const y = door.y - sh * yScale + 6 * z;

    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(door.x, door.y + 5 * z, sw * 0.46, 5 * z, 0, 0, Math.PI * 2);
    ctx.fill();

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

    // name plate rendered later, above workers, so it stays legible
    plates.push({ x: door.x, y: door.y, name: b.name, permanent: b.permanent });

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

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 15 * z, 7 * z, 2.4 * z, 0, 0, Math.PI * 2);
    ctx.fill();

    const spr = workerSprite(a.seed, a.agentType, pose, frame);
    ctx.imageSmoothingEnabled = false;
    const fade = a.finishedAt ? Math.max(0.35, 1 - (Date.now() - a.finishedAt) / 240000) : 1;
    ctx.globalAlpha = fade;
    ctx.drawImage(spr, p.x - 6 * scale, p.y - 8 * scale + Math.sin(w.phase + t / 400) * (reducedMotion ? 0 : 0.8) * z, 12 * scale, 16 * scale);

    // activity prop next to working sprite
    if (pose === 'work' && a.activity) {
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
    if (a.state === 'attention') drawStatusIcon(ctx, 'attention', sx, sy, t);
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

  let last = performance.now();
  function tick(now) {
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
    drawBackground(now);

    if (snap) {
      syncWorkers(now, dt);
      for (const d of snap.districts) drawDistrict(d, now);
      const sortedB = [...snap.buildings].sort((a, b) => buildingPos(a).y - buildingPos(b).y);
      for (const b of sortedB) drawBuilding(b, now);
      const sortedA = [...snap.agents]
        .filter((a) => workers.has(a.id))
        .sort((a, b) => (workers.get(a.id).y - workers.get(b.id).y));
      for (const a of sortedA) drawWorker(a, now);
      const z = cam.zoom;
      for (const p of plates) {
        const name = p.name.length > 22 ? p.name.slice(0, 21) + '…' : p.name;
        ctx.font = `${Math.max(8, 8.5 * z)}px ui-monospace, monospace`;
        const tw = ctx.measureText(name).width;
        ctx.fillStyle = p.permanent ? 'rgba(15,17,30,0.85)' : 'rgba(15,17,30,0.55)';
        ctx.beginPath();
        ctx.roundRect(p.x - tw / 2 - 5 * z, p.y + 9 * z, tw + 10 * z, 13 * z, 3 * z);
        ctx.fill();
        ctx.fillStyle = p.permanent ? PALETTE.text : PALETTE.textDim;
        ctx.fillText(name, p.x - tw / 2, p.y + (9 + 9.5) * z);
      }
      drawParticles(dt);
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

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
    getSelected: () => selectedId,
  };
}
