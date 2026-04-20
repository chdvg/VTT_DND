const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// ── DM Password Auth ─────────────────────────────────────────
const DM_PASSWORD = process.env.DM_PASSWORD || 'dm1234';
const SESSION_SECRET = crypto.randomBytes(32).toString('hex'); // ephemeral per-run
const dmSessions = new Set(); // valid session tokens

function makeToken() { return crypto.randomBytes(24).toString('hex'); }
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) out[k.trim()] = v.join('=').trim();
  });
  return out;
}
function isDmAuthed(req) {
  return dmSessions.has(parseCookies(req).dm_token || '');
}

// Login page
app.get('/dm-login', (req, res) => {
  if (isDmAuthed(req)) return res.redirect('/');
  res.send(`<!DOCTYPE html><html><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>DM Login</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{background:#0d1117;color:#e6e6e6;font-family:'Segoe UI',sans-serif;height:100vh;display:flex;align-items:center;justify-content:center;}
  .box{background:#161b22;border:1px solid #30363d;border-radius:10px;padding:2.5rem 3rem;width:340px;text-align:center;}
  h1{color:#d4af37;font-size:1.6rem;margin-bottom:0.4rem;}
  p{color:#666;font-size:0.85rem;margin-bottom:1.75rem;}
  input{width:100%;padding:0.65rem 0.9rem;background:#0d1117;border:1px solid #30363d;border-radius:5px;color:#e6e6e6;font-size:1rem;margin-bottom:1rem;text-align:center;letter-spacing:0.15em;}
  input:focus{outline:none;border-color:#d4af37;}
  button{width:100%;padding:0.65rem;background:#d4af37;color:#0d1117;font-weight:bold;font-size:1rem;border:none;border-radius:5px;cursor:pointer;text-transform:uppercase;letter-spacing:1px;}
  button:hover{background:#e6c74c;}
  .err{color:#ef4444;font-size:0.85rem;margin-top:0.75rem;min-height:1.2rem;}
</style></head><body>
<div class="box">
  <h1>🎲 DM Console</h1>
  <p>Enter the DM password to continue</p>
  <form method="POST" action="/dm-login">
    <input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password"/>
    <button type="submit">Enter</button>
    <div class="err">${req.query.err ? 'Incorrect password.' : ''}</div>
  </form>
</div></body></html>`);
});

app.post('/dm-login', express.urlencoded({ extended: false }), (req, res) => {
  if (req.body.password === DM_PASSWORD) {
    const token = makeToken();
    dmSessions.add(token);
    res.setHeader('Set-Cookie', `dm_token=${token}; HttpOnly; SameSite=Strict; Path=/`);
    return res.redirect('/');
  }
  res.redirect('/dm-login?err=1');
});

app.get('/dm-logout', (req, res) => {
  dmSessions.delete(parseCookies(req).dm_token || '');
  res.setHeader('Set-Cookie', 'dm_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.redirect('/dm-login');
});

// Protect DM routes
function requireDm(req, res, next) {
  if (isDmAuthed(req)) return next();
  res.redirect('/dm-login');
}

app.use('/assets', express.static(path.join(__dirname, 'public/assets')));
// Fallback: also serve maps from subdirectories at the flat /assets/maps/ URL path.
// Scenes saved with flat filenames (e.g. /assets/maps/redbrand_hideout.png) still resolve
// even when the physical files live inside Phandalin/, Cragmaw/, etc.
const _mapsDir = path.join(__dirname, 'public/assets/maps');
if (fs.existsSync(_mapsDir)) {
  for (const _sub of fs.readdirSync(_mapsDir)) {
    const _subPath = path.join(_mapsDir, _sub);
    if (fs.statSync(_subPath).isDirectory()) {
      app.use('/assets/maps', express.static(_subPath));
    }
  }
}

// ── Block sensitive files from static serving ─────────────────
// Must come BEFORE the catch-all express.static below.
const BLOCKED_PATHS = ['/server.js', '/package.json', '/package-lock.json'];
const BLOCKED_PREFIXES = ['/seeds/', '/node_modules/', '/.git/'];
app.use(function (req, res, next) {
  const p = req.path.toLowerCase();
  if (BLOCKED_PATHS.includes(p) || BLOCKED_PREFIXES.some(function (b) { return p.startsWith(b); })) {
    return res.status(403).end();
  }
  next();
});

app.use(express.static(path.join(__dirname)));

function listFiles(dir, exts) {
  const fullDir = path.join(__dirname, dir);
  if (!fs.existsSync(fullDir)) return [];
  const urlPrefix = `/assets/${dir.split('/').pop()}/`;
  const results = [];
  (function scan(d, urlPath) {
    for (const f of fs.readdirSync(d)) {
      const fp = path.join(d, f);
      if (fs.statSync(fp).isDirectory()) {
        scan(fp, urlPath + f + '/');
      } else if (exts.some(ext => f.toLowerCase().endsWith(ext))) {
        results.push(urlPath + f);
      }
    }
  })(fullDir, urlPrefix);
  return results;
}

let currentState = { nowShowing: '—', content: '', blackout: false };
let currentSceneId = null;
let currentSceneView = null;   // full SHOW_SCENE_VIEW payload, restored on reconnect
let currentFogStates = {};     // fogKey -> fogGrid
let currentAudio = null;       // { url, loop } or null
let currentTokens = [];
let currentTokensMapKey = null;
let currentTokensShowRings = true;
let currentDrawing    = [];
let currentDrawingMapKey = null;
let currentFeatures      = [];  // feature defs for the active map
let currentFeatureStates = {};  // { featureId: 'triggered' }
const clients = new Set();
const dmClients = new Set();

function broadcastClientCount() {
  // Purge any dead connections so stale sockets don't skew the count
  for (const c of clients)   { if (c.readyState !== WebSocket.OPEN) { clients.delete(c); dmClients.delete(c); } }
  for (const d of dmClients) { if (d.readyState !== WebSocket.OPEN) dmClients.delete(d); }
  // Count only non-DM clients (player screens)
  const playerCount = clients.size - dmClients.size;
  const payload = JSON.stringify({ type: 'clients', count: playerCount });
  console.log(`broadcastClientCount: total=${clients.size} dms=${dmClients.size} players=${playerCount}`);
  for (const dm of dmClients) {
    if (dm.readyState === WebSocket.OPEN) dm.send(payload);
  }
}

// Heartbeat: push client count to all DMs every 5 seconds so it self-corrects
setInterval(() => { broadcastClientCount(); }, 5000);

function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

function sendFullState(ws) {
  // Blackout
  if (currentState.blackout) {
    ws.send(JSON.stringify({ type: 'BLACKOUT', active: true }));
    return; // nothing to render under blackout
  }
  // Current scene view (map image, fog key, fit mode)
  if (currentSceneView) {
    ws.send(JSON.stringify(currentSceneView));
  } else if (currentSceneId) {
    ws.send(JSON.stringify({ type: 'SHOW_SCENE', sceneId: currentSceneId }));
  }
  // Fog states for every key we know about
  for (const fogKey of Object.keys(currentFogStates)) {
    ws.send(JSON.stringify({ type: 'UPDATE_FOG', fogKey, fogGrid: currentFogStates[fogKey] }));
  }
  // Tokens
  if (currentTokensMapKey) {
    ws.send(JSON.stringify({ type: 'UPDATE_TOKENS', tokens: currentTokens, mapKey: currentTokensMapKey, showRings: currentTokensShowRings }));
  }
  // Annotations
  if (currentDrawingMapKey) {
    ws.send(JSON.stringify({ type: 'UPDATE_DRAWING', strokes: currentDrawing, mapKey: currentDrawingMapKey }));
  }
  // Features — send definitions first so the overlay can be built
  if (currentFeatures.length) {
    ws.send(JSON.stringify({ type: 'UPDATE_FEATURES', features: currentFeatures, mapKey: currentTokensMapKey, mapMeta: (currentSceneView && currentSceneView.mapMeta) || null }));
  }
  // Feature states — replay any triggered features to reconnecting players
  for (const [fid, fstate] of Object.entries(currentFeatureStates)) {
    if (fstate === 'triggered') {
      const feat = currentFeatures.find(f => f.id === fid);
      if (feat) ws.send(JSON.stringify({ type: 'TRIGGER_FEATURE', feature: feat, allFeatures: currentFeatures, mapKey: currentTokensMapKey, mapMeta: (currentSceneView && currentSceneView.mapMeta) || null }));
    }
  }
  // Audio — we don't restart audio on reconnect (too disruptive if it's mid-play)
}

// Ping all open connections every 25s to keep them alive through NAT/VPN
setInterval(() => {
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }
}, 25000);

wss.on('connection', (ws, req) => {
  clients.add(ws);
  const dmAuthed = isDmAuthed(req);
  if (dmAuthed) dmClients.add(ws);
  console.log(`Client connected. Total: ${clients.size} | isDM: ${dmAuthed} | dmClients: ${dmClients.size}`);
  broadcastClientCount();
  // Always push current state to newly connected clients.
  if (!dmAuthed) {
    sendFullState(ws);
  } else {
    // Send complete map state snapshot so DM panel can restore after refresh/navigation
    ws.send(JSON.stringify({
      type: 'DM_STATE_RESTORE',
      playerCount: clients.size - dmClients.size,
      sceneView: currentSceneView,
      fogStates: currentFogStates,
      tokens: currentTokens,
      tokensMapKey: currentTokensMapKey,
      drawing: currentDrawing,
      drawingMapKey: currentDrawingMapKey,
      features: currentFeatures,
      featureStates: currentFeatureStates,
      blackout: currentState.blackout
    }));
  }

  ws.on('message', (raw) => {
    try {
      const message = JSON.parse(raw);
      const isDm = dmClients.has(ws);
      // All mutating/DM-only actions require an authenticated DM connection
      const DM_ACTIONS = ['blackout','show','show-scene-view','clear','clear-scene','play-audio',
        'stop-audio','send-overlay','update-fog','set-rings','update-tokens',
        'update-drawing','dm-connect','trigger-feature','reset-feature','update-features'];
      if (DM_ACTIONS.includes(message.action) && !isDm) {
        // If a DM panel is reconnecting after a server restart the session
        // will be gone — tell it to reload so it goes through login again.
        if (message.action === 'dm-connect') {
          ws.send(JSON.stringify({ type: 'auth-required' }));
        }
        return; // silently drop — unauthenticated client
      }
      switch (message.action) {
        case 'dm-connect':
          // Legacy: clients that send dm-connect are already auto-detected above.
          // Keep for backwards compat but only reachable by already-authed clients.
          dmClients.add(ws);
          ws.send(JSON.stringify({ type: 'clients', count: clients.size - dmClients.size }));
          break;
        case 'request-sync':
          // Player explicitly asking for full state after reconnect
          sendFullState(ws);
          break;
        case 'blackout':
          currentState.blackout = !currentState.blackout;
          broadcast({ type: 'BLACKOUT', active: currentState.blackout }); break;
        case 'show':
          currentSceneId = message.sceneId || null;
          broadcast({ type: 'SHOW_SCENE', sceneId: currentSceneId }); break;
        case 'show-scene-view': {
          currentState.blackout = false;
          currentTokens = [];
          currentTokensMapKey = message.mapKey || null;
          currentDrawing = [];
          currentDrawingMapKey = message.mapKey || null;
          currentFogStates = {}; // new scene clears old fog keys
          currentFeatures = Array.isArray(message.features) ? message.features : [];
          currentFeatureStates = {};
          const sceneViewMsg = { type: 'SHOW_SCENE_VIEW', image: message.image, audio: message.audio || null, fogKey: message.fogKey || null, audioLoop: message.audioLoop !== false, fit: message.fit || 'contain', mapKey: message.mapKey || null, features: currentFeatures, mapMeta: message.mapMeta || null, label: message.label || '' };
          currentSceneView = sceneViewMsg;
          currentAudio = message.audio ? { url: message.audio, loop: message.audioLoop !== false } : null;
          broadcast(sceneViewMsg);
          broadcast({ type: 'UPDATE_TOKENS', tokens: [], mapKey: currentTokensMapKey });
          broadcast({ type: 'UPDATE_DRAWING', strokes: [], mapKey: currentDrawingMapKey }); break;
        }
        case 'clear':
          currentSceneId = null;
          currentSceneView = null;
          currentState.blackout = false;
          currentTokens = [];
          currentTokensMapKey = null;
          currentDrawing = [];
          currentDrawingMapKey = null;
          currentFogStates = {};
          currentAudio = null;
          currentFeatures = [];
          currentFeatureStates = {};
          broadcast({ type: 'CLEAR' }); break;
        case 'clear-scene':
          currentSceneView = null;
          currentTokens = [];
          currentTokensMapKey = null;
          currentDrawing = [];
          currentDrawingMapKey = null;
          currentFogStates = {};
          currentFeatures = [];
          currentFeatureStates = {};
          broadcast({ type: 'CLEAR_SCENE' }); break;
        case 'play-audio':
          if (message.url) {
            currentAudio = { url: message.url, loop: message.loop !== false };
            broadcast({ type: 'PLAY_AUDIO', url: message.url, loop: message.loop !== false });
          } break;
        case 'stop-audio':
          currentAudio = null;
          broadcast({ type: 'STOP_AUDIO' }); break;
        case 'send-overlay':
          broadcast({ type: 'OVERLAY', title: message.title || '', data: message.data || '', duration: message.duration || 10000 }); break;
        case 'update-fog':
          if (message.fogKey) {
            currentFogStates[message.fogKey] = message.fogGrid;
          }
          broadcast({ type: 'UPDATE_FOG', fogGrid: message.fogGrid, fogKey: message.fogKey }); break;
        case 'set-rings':
          currentTokensShowRings = message.showRings !== undefined ? message.showRings : true;
          broadcast({ type: 'SET_RINGS', showRings: currentTokensShowRings }); break;
        case 'update-tokens':
          currentTokens = Array.isArray(message.tokens) ? message.tokens : [];
          currentTokensMapKey = message.mapKey || null;
          currentTokensShowRings = message.showRings !== undefined ? message.showRings : true;
          broadcast({ type: 'UPDATE_TOKENS', tokens: currentTokens, mapKey: currentTokensMapKey, showRings: currentTokensShowRings }); break;
        case 'update-drawing':
          currentDrawing = Array.isArray(message.strokes) ? message.strokes : [];
          currentDrawingMapKey = message.mapKey || null;
          broadcast({ type: 'UPDATE_DRAWING', strokes: currentDrawing, mapKey: currentDrawingMapKey }); break;
        case 'trigger-feature':
          if (message.featureId) {
            currentFeatureStates[message.featureId] = 'triggered';
            // Use feature from currentFeatures, or fall back to the one the DM sent
            const feat = currentFeatures.find(f => f.id === message.featureId)
              || (message.feature || null);
            if (feat) {
              broadcast({
                type: 'TRIGGER_FEATURE',
                feature: feat,
                allFeatures: currentFeatures,
                mapKey: message.mapKey || currentTokensMapKey,
                mapMeta: (currentSceneView && currentSceneView.mapMeta) || null,
              });
            }
          } break;
        case 'reset-feature':
          if (message.featureId) {
            delete currentFeatureStates[message.featureId];
            broadcast({ type: 'RESET_FEATURE', featureId: message.featureId, mapKey: message.mapKey || currentTokensMapKey });
          } break;
        case 'update-features':
          // DM has fetched map state and is supplying feature definitions
          currentFeatures = Array.isArray(message.features) ? message.features : [];
          // Update the cached scene view so reconnects get features too
          if (currentSceneView) {
            currentSceneView.features = currentFeatures;
            if (message.mapMeta) currentSceneView.mapMeta = message.mapMeta;
          }
          // Push to all player clients so they can render the overlay
          for (const client of clients) {
            if (!dmClients.has(client) && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'UPDATE_FEATURES', features: currentFeatures, mapKey: currentTokensMapKey, mapMeta: message.mapMeta || null }));
            }
          }
          break;
      }
    } catch (err) { console.error('Bad message:', err); }
  });

  ws.on('close', () => {
    clients.delete(ws); dmClients.delete(ws);
    console.log('Client disconnected. Total: ' + clients.size);
    broadcastClientCount();
  });
});

app.post('/api/show', requireDm, express.json({ limit: '50mb' }), (req, res) => {
  const { label, data } = req.body;
  currentState.nowShowing = label || '—'; currentState.content = data || '';
  broadcast({ type: 'update', content: currentState.nowShowing, data: currentState.content });
  res.json({ ok: true });
});

app.post('/api/overlay', requireDm, express.json({ limit: '1mb' }), (req, res) => {
  const { title, data, duration } = req.body;
  broadcast({ type: 'OVERLAY', title: title || '', data: data || '', duration: duration || 10000 });
  res.json({ ok: true });
});

app.post('/api/dice-roll', requireDm, express.json({ limit: '1mb' }), (req, res) => {
  const die    = parseInt(req.body.die)    || 20;
  const result = parseInt(req.body.result) || 1;
  broadcast({ type: 'DICE_ROLL', die, result });
  res.json({ ok: true });
});

app.post('/api/stopaudio', requireDm, (req, res) => {
  broadcast({ type: 'STOP_AUDIO' });
  res.json({ ok: true });
});

app.post('/api/blackout', requireDm, (req, res) => {
  currentState.blackout = !currentState.blackout;
  broadcast({ type: 'BLACKOUT', active: currentState.blackout });
  res.json({ ok: true, blackout: currentState.blackout });
});

app.post('/api/clear', requireDm, (req, res) => {
  currentState.nowShowing = '—'; currentState.content = ''; currentState.blackout = false;
  broadcast({ type: 'CLEAR' });
  res.json({ ok: true });
});

app.post('/api/clear-scene', requireDm, (req, res) => {
  currentSceneView = null;
  currentTokens = [];
  currentTokensMapKey = null;
  currentDrawing = [];
  currentDrawingMapKey = null;
  currentFogStates = {};
  currentFeatures = [];
  currentFeatureStates = {};
  broadcast({ type: 'CLEAR_SCENE' });
  res.json({ ok: true });
});

app.get('/api/state', (req, res) => { res.json(currentState); });

app.get('/api/maps', (req, res) => {
  const maps = listFiles('public/assets/maps', ['.jpg', '.jpeg', '.png', '.webp']);
  res.json({ maps });
});

app.get('/api/audio', (req, res) => {
  const files = listFiles('public/assets/audio', ['.mp3', '.ogg', '.wav']);
  // Parse "Category - Title.ext" or fall back to "Other"
  const groups = {};
  files.forEach(f => {
    const name = f.split('/').pop();
    const dash = name.indexOf(' - ');
    const cat  = dash > 0 ? name.slice(0, dash).trim() : 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(f);
  });
  // Sort categories; flat list for backwards compat
  const audio = files;
  const categories = Object.keys(groups).sort().map(cat => ({ cat, files: groups[cat] }));
  res.json({ audio, categories });
});

app.get('/api/scenes', (req, res) => {
  try {
    const scenes = JSON.parse(fs.readFileSync(path.join(__dirname, 'seeds', 'scenes.json'), 'utf8'));
    res.json({ scenes });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load scenes.json' });
  }
});

app.post('/api/scenes', requireDm, express.json({ limit: '1mb' }), (req, res) => {
  try {
    const scenes = req.body.scenes;
    if (!Array.isArray(scenes)) return res.status(400).json({ error: 'scenes must be an array' });
    fs.writeFileSync(path.join(__dirname, 'seeds', 'scenes.json'), JSON.stringify(scenes, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save scenes.json' });
  }
});

// ── Players roster ────────────────────────────────────────────
const PLAYERS_FILE = path.join(__dirname, 'seeds', 'players.json');
function loadPlayers() {
  try { return JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8')); } catch { return []; }
}
app.get('/api/players', requireDm, (req, res) => {
  res.json({ players: loadPlayers() });
});
app.post('/api/players', requireDm, express.json({ limit: '64kb' }), (req, res) => {
  try {
    const players = req.body.players;
    if (!Array.isArray(players)) return res.status(400).json({ error: 'players must be an array' });
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(players, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save players.json' });
  }
});

// ── Map Builder ───────────────────────────────────────────────
app.get('/map-builder', requireDm, (req, res) => {
  res.sendFile(path.join(__dirname, 'map-builder', 'index.html'));
});

// Save exported map PNG from canvas dataURL (+ optional editable state JSON)
app.post('/api/map-builder/save', requireDm, express.json({ limit: '50mb' }), (req, res) => {
  try {
    const { dataUrl, filename, state } = req.body;
    if (!dataUrl || !filename) return res.status(400).json({ error: 'dataUrl and filename required' });
    const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!safeName.match(/\.(png|jpg|jpeg)$/i)) return res.status(400).json({ error: 'filename must end in .png or .jpg' });
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(base64, 'base64');
    const destDir = path.join(__dirname, 'public', 'assets', 'maps');
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, safeName), buf);
    // Also persist editable tile/token/fog state alongside the PNG
    if (state && typeof state === 'object') {
      const stateFile = safeName.replace(/\.(png|jpg|jpeg)$/i, '.map.json');
      fs.writeFileSync(path.join(destDir, stateFile), JSON.stringify(state));
    }
    res.json({ ok: true, webPath: '/assets/maps/' + safeName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List maps that have an editable state file
app.get('/api/map-builder/states', requireDm, (req, res) => {
  const destDir = path.join(__dirname, 'public', 'assets', 'maps');
  if (!fs.existsSync(destDir)) return res.json({ states: [] });
  const states = fs.readdirSync(destDir)
    .filter(f => f.endsWith('.map.json'))
    .map(f => f.replace(/\.map\.json$/, ''));
  res.json({ states });
});

// Return editable state for a named map
app.get('/api/map-builder/state', requireDm, (req, res) => {
  const name = (req.query.name || '').toString();
  if (!name) return res.status(400).json({ error: 'name required' });
  const safeName = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(__dirname, 'public', 'assets', 'maps', safeName + '.map.json');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'No editable state found for this map' });
  try {
    res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', requireDm, (req, res) => { res.sendFile(path.join(__dirname, 'dm', 'index.html')); });
app.use('/dm', requireDm);
app.get('/remote', (req, res) => { res.sendFile(path.join(__dirname, 'remote', 'index.html')); });
app.get('/remote/player', (req, res) => { res.sendFile(path.join(__dirname, 'remote', 'player.html')); });
app.get('/player', (req, res) => { res.sendFile(path.join(__dirname, 'remote', 'player.html')); });

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  // Find the LAN (Wi-Fi/Ethernet) IP for display
  let lanIp = 'localhost';
  try {
    const os = require('os');
    const ifaces = os.networkInterfaces();
    // Skip virtual/VPN/loopback interfaces — prefer physical Wi-Fi or Ethernet
    const skipNames = ['loopback', 'vethernet', 'nordlynx', 'nordtun', 'tun', 'tap', 'vpn', 'docker', 'wsl', 'virtual', 'hyper-v'];
    outer: for (const name of Object.keys(ifaces)) {
      if (skipNames.some(s => name.toLowerCase().includes(s))) continue;
      for (const iface of ifaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.')) {
          lanIp = iface.address;
          break outer;
        }
      }
    }
  } catch(_) {}
  console.log('');
  console.log('D&D Remote Server running!');
  console.log('  DM Panel:    http://localhost:' + PORT);
  console.log('  Remote:      http://localhost:' + PORT + '/remote');
  console.log('  Player View: http://localhost:' + PORT + '/remote/player.html');
  console.log('');
  console.log('  LAN access (other devices):');
  console.log('  Player View: http://' + lanIp + ':' + PORT + '/remote/player.html');
  console.log('  Remote:      http://' + lanIp + ':' + PORT + '/remote');
  console.log('');
});