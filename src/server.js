// Agentopolis local server: static UI, SSE world stream, hook ingestion.
// Binds 127.0.0.1 only. No network listener beyond loopback, ever.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reduce, snapshot, sweep } from './state.js';
import { normalize } from './adapter-claude.js';
import { saveCity, appendEventLog } from './persist.js';

const WEB_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const MAX_BODY = 262144;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

export function createCityServer(world, { logEvents = true, version = '0.0.0' } = {}) {
  const clients = new Set();
  let broadcastTimer = null;

  function broadcast() {
    if (broadcastTimer) return; // throttle to ≤10/s
    broadcastTimer = setTimeout(() => {
      broadcastTimer = null;
      if (clients.size === 0) return;
      const data = `event: world\ndata: ${JSON.stringify(snapshot(world))}\n\n`;
      for (const res of clients) {
        try { res.write(data); } catch { clients.delete(res); }
      }
    }, 100);
  }

  // Single ingestion path for hooks, reconciler, spool drain, and demo mode.
  function ingest(evtOrNull) {
    if (!evtOrNull) return false;
    const changed = reduce(world, evtOrNull);
    if (changed) {
      if (logEvents) appendEventLog(evtOrNull);
      saveCity(world);
      broadcast();
    }
    return changed;
  }

  function ingestHookPayload(payload) {
    let events = [];
    try {
      events = normalize(payload);
    } catch {
      return; // malformed provider payloads are ignored, never fatal
    }
    for (const e of events) ingest(e);
  }

  function readBody(req, cb) {
    let size = 0;
    const chunks = [];
    let done = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        done = true;
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (done) return;
      cb(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', () => {});
  }

  function serveStatic(req, res, urlPath) {
    const clean = path.normalize(urlPath === '/' ? '/index.html' : urlPath).replace(/^(\.\.[/\\])+/, '');
    const file = path.join(WEB_ROOT, clean);
    if (!file.startsWith(WEB_ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
      });
      res.end(buf);
    });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(`event: world\ndata: ${JSON.stringify(snapshot(world))}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/hook') {
      readBody(req, (body) => {
        res.writeHead(204);
        res.end(); // ack immediately; the bridge must never wait on us
        try { ingestHookPayload(JSON.parse(body)); } catch { /* ignore garbage */ }
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/pin') {
      readBody(req, (body) => {
        try {
          const { buildingId } = JSON.parse(body);
          const b = world.buildings.get(String(buildingId));
          if (b) {
            b.permanent = true;
            b.nameOrigin = b.nameOrigin === 'unknown' ? 'manual' : b.nameOrigin;
            world.seq++;
            saveCity(world);
            broadcast();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end('{"ok":true}');
          }
        } catch { /* fall through */ }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"ok":false}');
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        ok: true,
        version,
        sessions: world.sessions.size,
        clients: clients.size,
        providerHealth: world.providerHealth,
      }));
    }

    if (req.method === 'GET') return serveStatic(req, res, url.pathname);

    res.writeHead(405);
    res.end();
  });

  // Heartbeats keep proxies honest; sweep keeps stale state honest.
  const heartbeat = setInterval(() => {
    for (const res of clients) {
      try { res.write(':hb\n\n'); } catch { clients.delete(res); }
    }
  }, 15000);
  const sweeper = setInterval(() => { if (sweep(world)) broadcast(); }, 30000);
  if (heartbeat.unref) heartbeat.unref();
  if (sweeper.unref) sweeper.unref();

  function listen(port) {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolve(server.address().port));
    });
  }

  return { server, listen, ingest, ingestHookPayload, broadcast };
}
