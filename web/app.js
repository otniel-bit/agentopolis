// Agentopolis UI: SSE client + summary strip + inspector + attention drawer.
// Every piece of world data is rendered via textContent — never innerHTML.

import { createCity } from './city.js';

const $ = (id) => document.getElementById(id);
const canvas = $('city');

// Widget mode: compact chrome, ambient auto-framing (native panel hosts us).
const WIDGET = new URLSearchParams(location.search).has('widget');
if (WIDGET) document.body.classList.add('widget');

let snap = null;
let selected = null; // {kind:'building'|'agent', id}
let lastBuildingCount = -1;

const city = createCity(canvas, {
  onSelect(sel) {
    selected = sel;
    renderInspector();
  },
});

// ——— tiny DOM helpers (safe by construction) ———

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return `${s | 0}s ago`;
  if (s < 3600) return `${(s / 60) | 0}m ago`;
  if (s < 86400) return `${(s / 3600) | 0}h ago`;
  return `${(s / 86400) | 0}d ago`;
}

// ——— SSE ———

let es = null;
let lastSeen = 0;
let offlineTimer = null;

function connect() {
  es = new EventSource('/events');
  const alive = () => {
    if (offlineTimer) { clearTimeout(offlineTimer); offlineTimer = null; }
    $('offline').hidden = true;
    lastSeen = Date.now();
  };
  es.addEventListener('world', (e) => {
    alive();
    snap = JSON.parse(e.data);
    city.setSnapshot(snap);
    // ambient widget keeps the whole city framed as it grows and shrinks
    if (WIDGET && snap.buildings.length !== lastBuildingCount) {
      lastBuildingCount = snap.buildings.length;
      city.fit();
    }
    renderSummary();
    renderDrawer();
    renderInspector();
    renderFeed();
    renderEmptyState();
  });
  // Server pings every 15s, so a quiet city is provably not a dead one.
  es.addEventListener('ping', alive);
  es.onerror = () => {
    es.close();
    // a single dropped connection is normal; only alarm after ~12s dark
    if (!offlineTimer) {
      offlineTimer = setTimeout(() => { $('offline').hidden = false; }, 12000);
    }
    setTimeout(connect, 1500);
  };
}
connect();
setInterval(() => {
  // Two missed pings with a non-open socket = genuinely gone.
  if (lastSeen && Date.now() - lastSeen > 45000 && es.readyState !== EventSource.OPEN) {
    $('offline').hidden = false;
  }
}, 5000);

function renderEmptyState() {
  const box = $('empty');
  if (!box) return;
  const empty = !snap || snap.districts.length === 0;
  box.hidden = !empty;
  if (empty && snap && snap.providerHealth && snap.providerHealth.reconcileError) {
    $('empty-err').textContent = 'Claude Code not reachable: ' + snap.providerHealth.reconcileError;
    $('empty-err').hidden = false;
  } else if (box) {
    $('empty-err').hidden = true;
  }
}

// ——— summary strip ———

function renderSummary() {
  const s = snap.summary;
  const set = (id, v) => { $(id).querySelector('b').textContent = v; };
  set('stat-working', s.working);
  set('stat-waiting', s.waiting);
  set('stat-needsyou', s.needsYou);
  set('stat-failed', s.failed);
  set('stat-done', s.doneRecent);
  $('stat-needsyou').dataset.hot = s.needsYou > 0 ? '1' : '0';
  document.title = s.needsYou > 0 ? `(${s.needsYou}!) Agentopolis` : 'Agentopolis';
}

// ——— attention drawer ———

function renderDrawer() {
  const list = $('drawer-list');
  list.replaceChildren();
  const items = snap.attention || [];
  $('drawer-empty').hidden = items.length > 0;
  for (const att of items) {
    const b = snap.buildings.find((x) => x.id === att.buildingId);
    const li = el('li');
    li.append(
      el('span', 'k', `${(att.kind || 'input').toUpperCase()} · ${b ? b.name : 'unknown'}`),
      el('span', 's', att.summary),
      el('span', 't', `waiting ${ago(att.since)}`),
    );
    li.onclick = () => {
      city.focusBuilding(att.buildingId);
      selected = { kind: 'building', id: att.buildingId };
      renderInspector();
    };
    list.append(li);
  }
}

// ——— inspector ———

function badge(state) {
  return el('span', `badge ${state}`, state);
}

function feedFor(filter) {
  return (snap.feed || []).filter(filter).slice(-14).reverse();
}

function renderInspector() {
  const panel = $('inspector');
  if (!selected || !snap) { panel.hidden = true; return; }
  const body = $('insp-body');
  body.replaceChildren();

  if (selected.kind === 'building') {
    const b = snap.buildings.find((x) => x.id === selected.id);
    if (!b) { panel.hidden = true; return; }
    const d = snap.districts.find((x) => x.id === b.districtId);
    $('insp-title').textContent = b.name;

    const dl = el('dl');
    const row = (k, v) => { dl.append(el('dt', null, k), el('dd', null, v)); };
    row('project', d ? d.path : '—');
    row('kind', b.permanent ? 'permanent building' : 'temporary worksite');
    row('name origin', b.nameOrigin);
    dl.append(el('dt', null, 'state'));
    const dd = el('dd'); dd.append(badge(b.state)); dl.append(dd);
    row('last active', b.lastActiveAt ? ago(b.lastActiveAt) : '—');
    if (b.sessionId) row('session', b.sessionId.slice(0, 12) + '…');
    const cost = sessionCost(b.sessionId);
    if (cost) {
      row('spend', `${money(cost.cost)} · ${cost.modelLabel}`);
      row('tokens', `${compactTokens(cost.output)} out · ${compactTokens(cost.cacheRead)} cached`);
    }
    body.append(dl);

    if (b.attention) {
      const h = el('h3', null, 'NEEDS YOU');
      const p = el('div', null, `${b.attention.summary} · ${ago(b.attention.since)}`);
      p.style.color = 'var(--attn)';
      body.append(h, p);
    }

    const crew = snap.agents.filter((a) => a.buildingId === b.id);
    if (crew.length) {
      body.append(el('h3', null, `CREW (${crew.length})`));
      const ul = el('ul');
      for (const a of crew) {
        const li = el('li', 'agent-row');
        const label = a.isRoot ? 'foreman' : a.agentType;
        li.append(
          el('span', null, label),
          badge(a.state),
          el('span', 'dim', a.activity ? a.activity.label : (a.finishedAt ? 'clocked out' : 'idle')),
        );
        li.onclick = () => { selected = { kind: 'agent', id: a.id }; city.select(a.id); renderInspector(); };
        ul.append(li);
      }
      body.append(ul);
    }

    body.append(el('h3', null, 'HISTORY'));
    const ul = el('ul');
    for (const f of feedFor((f) => f.session === b.sessionId || (f.label || '').startsWith(b.name))) {
      const li = el('li');
      li.append(el('time', null, ago(f.at)), el('span', null, f.label));
      ul.append(li);
    }
    body.append(ul);

    if (!b.permanent) {
      const pin = el('button', 'act', '📌 Pin as permanent building');
      pin.onclick = async () => {
        await fetch('/api/pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ buildingId: b.id }),
        });
      };
      body.append(pin);
    }
  } else {
    const a = snap.agents.find((x) => x.id === selected.id);
    if (!a) { panel.hidden = true; return; }
    const b = snap.buildings.find((x) => x.id === a.buildingId);
    $('insp-title').textContent = a.isRoot ? `Foreman · ${b ? b.name : ''}` : `${a.agentType} worker`;

    const dl = el('dl');
    const row = (k, v) => { dl.append(el('dt', null, k), el('dd', null, v)); };
    row('building', b ? b.name : '—');
    dl.append(el('dt', null, 'state'));
    const dd = el('dd'); dd.append(badge(a.state)); dl.append(dd);
    if (a.activity) {
      row('doing', a.activity.label);
      if (a.activity.target) row('target', a.activity.target);
      row('for', ago(a.activity.startedAt));
    }
    row('on shift', ago(a.spawnedAt));
    if (a.finishedAt) row('clocked out', ago(a.finishedAt));
    body.append(dl);

    body.append(el('h3', null, 'RECENT WORK'));
    const ul = el('ul');
    const agentSuffix = a.id.split(':').pop();
    for (const f of feedFor((f) => f.session && a.id.startsWith(f.session) && (f.agent || 'root') === agentSuffix)) {
      const li = el('li');
      li.append(el('time', null, ago(f.at)), el('span', null, f.label));
      ul.append(li);
    }
    body.append(ul);
  }

  panel.hidden = false;
}

// ——— feed ticker ———

let feedShown = 0;
function renderFeed() {
  const box = $('feed');
  const items = (snap.feed || []).slice(-4);
  const latest = items[items.length - 1];
  if (!latest || latest.at <= feedShown) return;
  feedShown = latest.at;
  box.replaceChildren(...items.map((f) => el('div', null, f.label)));
}

// ——— usage & spend ———

let usage = null;

const money = (n) => (n == null ? '—' : n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n).toLocaleString()}`);
const compactTokens = (n) => {
  if (!n) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'K';
  return String(n);
};

async function pollUsage() {
  try {
    const res = await fetch('/api/usage');
    const data = await res.json();
    if (data && !data.pending) {
      usage = data;
      renderUsageChip();
      if (!$('usage').hidden) renderUsagePanel();
    }
  } catch { /* server may be restarting */ }
}
pollUsage();
setInterval(pollUsage, 30000);
// deep link: /#usage opens the spend panel straight away
if (location.hash === '#usage') {
  $('usage').hidden = false;
  renderUsagePanel();
}

function renderUsageChip() {
  const chip = $('stat-usage');
  if (!chip || !usage) return;
  chip.querySelector('b').textContent = money(usage.week.cost);
  chip.title = `${money(usage.today.cost)} today · ${money(usage.week.cost)} this week · ${money(usage.last30.cost)} last 30 days`;
}

function bar(frac) {
  const wrap = el('div', 'meter');
  const fill = el('div', 'meter-fill');
  fill.style.width = `${Math.max(2, Math.min(100, frac * 100))}%`;
  wrap.append(fill);
  return wrap;
}

function renderUsagePanel() {
  const body = $('usage-body');
  if (!body) return;
  body.replaceChildren();
  if (!usage) {
    body.append(el('p', 'dim', 'Reading your local Claude Code token history…'));
    return;
  }

  const head = el('div', 'usage-heads');
  for (const [label, t] of [['Today', usage.today], ['This week', usage.week], ['Last 30 days', usage.last30]]) {
    const card = el('div', 'usage-head');
    card.append(el('span', 'uh-label', label), el('span', 'uh-cost', money(t.cost)));
    card.append(el('span', 'uh-sub', `${compactTokens(t.output)} out · ${compactTokens(t.cacheRead)} cached · ${t.requests} calls`));
    head.append(card);
  }
  body.append(head);

  // this week by model — the "how much on Fable 5" answer
  body.append(el('h3', null, 'THIS WEEK BY MODEL'));
  const wm = usage.weekModels || [];
  if (!wm.length) body.append(el('p', 'dim', 'No usage recorded this week yet.'));
  const wmMax = Math.max(...wm.map((m) => m.cost), 0.01);
  for (const m of wm) {
    const row = el('div', 'usage-row');
    row.append(el('span', 'ur-name', m.label), el('span', 'ur-cost', money(m.cost)));
    body.append(row, bar(m.cost / wmMax));
  }
  body.append(el('p', 'dim tiny', 'Grouped by each session’s model, counted in the week it was last active.'));

  body.append(el('h3', null, 'ALL TIME BY MODEL'));
  const am = usage.models || [];
  const amMax = Math.max(...am.map((m) => m.cost), 0.01);
  for (const m of am) {
    const row = el('div', 'usage-row');
    row.append(el('span', 'ur-name', m.label), el('span', 'ur-cost', money(m.cost)));
    body.append(row, bar(m.cost / amMax));
  }

  body.append(el('h3', null, 'MOST EXPENSIVE SESSIONS'));
  const ul = el('ul');
  const priciest = [...(usage.sessions || [])].sort((a, b) => b.cost - a.cost).slice(0, 8);
  for (const s of priciest) {
    const li = el('li');
    li.append(
      el('span', 'us-proj', s.project || 'unknown project'),
      el('span', 'us-model', s.modelLabel),
      el('span', 'us-cost', money(s.cost)),
    );
    ul.append(li);
  }
  body.append(ul);
  body.append(el('p', 'dim tiny',
    'Computed locally from token counts in your own Claude Code transcripts, priced at public API rates. Nothing is uploaded. Subscription plans are billed differently — treat this as an API-equivalent estimate.'));
}

// Session cost shown inside the building inspector, joined by session id.
function sessionCost(sessionId) {
  if (!usage || !sessionId) return null;
  const s = (usage.sessions || []).find((x) => x.id === sessionId);
  return s || null;
}

// ——— controls ———

$('btn-fit').onclick = () => city.fit();
$('stat-needsyou').onclick = () => { $('drawer').hidden = !$('drawer').hidden; };
$('stat-usage').onclick = () => {
  const panel = $('usage');
  panel.hidden = !panel.hidden;
  if (!panel.hidden) { renderUsagePanel(); pollUsage(); }
};
for (const btn of document.querySelectorAll('[data-close]')) {
  btn.onclick = () => { $(btn.dataset.close).hidden = true; if (btn.dataset.close === 'inspector') { selected = null; city.select(null); } };
}

let reduced = localStorage.getItem('agentopolis-motion') === 'reduced';
if (reduced) city.setReducedMotion(true);
$('btn-motion').onclick = () => {
  reduced = !reduced;
  city.setReducedMotion(reduced);
  localStorage.setItem('agentopolis-motion', reduced ? 'reduced' : 'full');
  $('btn-motion').style.opacity = reduced ? 0.5 : 1;
};

$('search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q || !snap) return;
  const b = snap.buildings.find((x) => x.name.toLowerCase().includes(q));
  if (b) {
    city.focusBuilding(b.id);
    selected = { kind: 'building', id: b.id };
    renderInspector();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (e.key === 'f' || e.key === 'F') city.fit();
  else if (e.key === 'a' || e.key === 'A') $('drawer').hidden = !$('drawer').hidden;
  else if (e.key === 'u' || e.key === 'U') {
    const panel = $('usage');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) { renderUsagePanel(); pollUsage(); }
  }
  else if (e.key === '/') { e.preventDefault(); $('search').focus(); }
  else if (e.key === 'Escape') {
    $('inspector').hidden = true;
    $('drawer').hidden = true;
    $('usage').hidden = true;
    selected = null;
    city.select(null);
  }
});
