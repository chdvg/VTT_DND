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
app.use(express.static(path.join(__dirname)));

function listFiles(dir, exts) {
  const fullDir = path.join(__dirname, dir);
  if (!fs.existsSync(fullDir)) return [];
  return fs.readdirSync(fullDir)
    .filter(f => exts.some(ext => f.toLowerCase().endsWith(ext)))
    .map(f => `/assets/${dir.split('/').pop()}/${f}`);
}

let currentState = { nowShowing: '—', content: '', blackout: false };
let currentSceneId = null;
const clients = new Set();
const dmClients = new Set();

function broadcastClientCount() {
  // Count only non-DM clients (player screens)
  const playerCount = clients.size - dmClients.size;
  const payload = JSON.stringify({ type: 'clients', count: playerCount });
  for (const dm of dmClients) {
    if (dm.readyState === WebSocket.OPEN) dm.send(payload);
  }
}

function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('Client connected. Total: ' + clients.size);
  broadcastClientCount();
  if (currentSceneId) {
    ws.send(JSON.stringify({ type: 'SHOW_SCENE', sceneId: currentSceneId }));
  }

  ws.on('message', (raw) => {
    try {
      const message = JSON.parse(raw);
      switch (message.action) {
        case 'dm-connect':
          dmClients.add(ws);
          // Send current state immediately so DM gets accurate count right away
          ws.send(JSON.stringify({ type: 'clients', count: clients.size - dmClients.size }));
          break;
        case 'blackout':
          broadcast({ type: 'BLACKOUT' }); break;
        case 'show':
          currentSceneId = message.sceneId || null;
          broadcast({ type: 'SHOW_SCENE', sceneId: currentSceneId }); break;
        case 'show-scene-view':
          broadcast({ type: 'SHOW_SCENE_VIEW', image: message.image, audio: message.audio || null, fogKey: message.fogKey || null, audioLoop: message.audioLoop !== false, fit: message.fit || 'contain' }); break;
        case 'clear':
          currentSceneId = null;
          broadcast({ type: 'BLACKOUT' }); break;
        case 'play-audio':
          if (message.url) broadcast({ type: 'PLAY_AUDIO', url: message.url, loop: message.loop !== false }); break;
        case 'stop-audio':
          broadcast({ type: 'STOP_AUDIO' }); break;
        case 'update-fog':
          broadcast({ type: 'UPDATE_FOG', fogGrid: message.fogGrid, fogKey: message.fogKey }); break;
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

app.post('/api/stopaudio', requireDm, (req, res) => {
  broadcast({ type: 'STOP_AUDIO' });
  res.json({ ok: true });
});

app.post('/api/blackout', requireDm, (req, res) => {
  currentState.blackout = !currentState.blackout;
  broadcast({ type: 'BLACKOUT' });
  res.json({ ok: true, blackout: currentState.blackout });
});

app.post('/api/clear', requireDm, (req, res) => {
  currentState.nowShowing = '—'; currentState.content = ''; currentState.blackout = false;
  broadcast({ type: 'BLACKOUT' });
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

app.get('/', requireDm, (req, res) => { res.sendFile(path.join(__dirname, 'dm', 'index.html')); });
app.use('/dm', requireDm);
app.get('/remote', (req, res) => { res.sendFile(path.join(__dirname, 'remote', 'index.html')); });
app.get('/remote/player', (req, res) => { res.sendFile(path.join(__dirname, 'remote', 'player.html')); });
app.get('/player', (req, res) => { res.sendFile(path.join(__dirname, 'remote', 'player.html')); });

const PORT = 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('D&D Remote Server running!');
  console.log('  DM Panel:    http://localhost:' + PORT);
  console.log('  Remote:      http://localhost:' + PORT + '/remote');
  console.log('  Player View: http://localhost:' + PORT + '/remote/player.html');
  console.log('');
});