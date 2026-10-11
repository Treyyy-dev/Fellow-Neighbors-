// Fellow Neighbors: serves the game and relays player state between everyone in the same room.
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const MAX_ROOM = 12, MAX_MSG = 8192, MAX_PRESENCE = 6000, MAX_ROOMS = 200;

// Files are small in number, so compress each once and keep it in memory.
const cache = new Map();
function load(file) {
  const st = fs.statSync(file);
  const hit = cache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit;
  const raw = fs.readFileSync(file), ext = path.extname(file);
  const entry = { mtime: st.mtimeMs, raw, gz: /\.(html|js|css|json)$/.test(ext) ? zlib.gzipSync(raw) : null, type: TYPES[ext] || 'application/octet-stream' };
  cache.set(file, entry);
  return entry;
}

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (url === '/') url = '/index.html';
  const file = path.join(PUB, path.normalize(url));
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  let f;
  try { f = load(file); } catch (e) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
  const gz = f.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const head = { 'content-type': f.type, 'cache-control': url === '/index.html' ? 'no-cache' : 'public, max-age=3600', 'vary': 'accept-encoding' };
  if (gz) head['content-encoding'] = 'gzip';
  res.writeHead(200, head);
  res.end(gz ? f.gz : f.raw);
});

// rooms: name -> Map(peerId -> { ws, presence })
const rooms = new Map();
let nextId = 1;
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MSG });

function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }

wss.on('connection', (ws, req) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const name = String(q.get('room') || '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(name)) return ws.close(1008, 'bad room');
  let room = rooms.get(name);
  if (!room) { if (rooms.size >= MAX_ROOMS) return ws.close(1013, 'busy'); room = new Map(); rooms.set(name, room); }
  if (room.size >= MAX_ROOM) return ws.close(1013, 'room full');

  const id = 'p' + (nextId++).toString(36) + Math.random().toString(36).slice(2, 6);
  const me = { ws, presence: {} };
  const others = {};
  room.forEach((p, pid) => { others[pid] = p.presence; });
  room.set(id, me);
  send(ws, { t: 'hi', id, peers: others });
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  let budget = 60, last = Date.now();   // about 30 messages a second, with some burst
  ws.on('message', (data) => {
    const now = Date.now(); budget = Math.min(60, budget + (now - last) * 0.03); last = now;
    if (budget < 1) return; budget -= 1;
    let m; try { m = JSON.parse(data.toString()); } catch (e) { return; }
    if (!m || m.t !== 'p' || !m.d || typeof m.d !== 'object' || Array.isArray(m.d)) return;
    const next = Object.assign({}, me.presence);
    for (const k of Object.keys(m.d)) { if (k.length > 16) return; if (m.d[k] === null) delete next[k]; else next[k] = m.d[k]; }
    if (JSON.stringify(next).length > MAX_PRESENCE) return;
    me.presence = next;
    const out = JSON.stringify({ t: 'p', id, d: m.d });
    room.forEach((p, pid) => { if (pid !== id && p.ws.readyState === 1) p.ws.send(out); });
  });
  ws.on('close', () => {
    room.delete(id);
    room.forEach((p) => send(p.ws, { t: 'bye', id }));
    if (!room.size) rooms.delete(name);
  });
  ws.on('error', () => {});
});

// Drop connections that have gone silent, and keep the others from idling out.
setInterval(() => { wss.clients.forEach((ws) => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; try { ws.ping(); } catch (e) {} }); }, 25000);

server.listen(PORT, () => console.log('Fellow Neighbors on port ' + PORT));
