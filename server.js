const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

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
          broadcast({ type: 'SHOW_SCENE_VIEW', image: message.image, audio: message.audio || null, fogKey: message.fogKey || null }); break;
        case 'clear':
          currentSceneId = null;
          broadcast({ type: 'BLACKOUT' }); break;
        case 'play-audio':
          if (message.url) broadcast({ type: 'PLAY_AUDIO', url: message.url }); break;
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

app.post('/api/show', express.json({ limit: '50mb' }), (req, res) => {
  const { label, data } = req.body;
  currentState.nowShowing = label || '—'; currentState.content = data || '';
  broadcast({ type: 'update', content: currentState.nowShowing, data: currentState.content });
  res.json({ ok: true });
});

app.post('/api/stopaudio', (req, res) => {
  broadcast({ type: 'STOP_AUDIO' });
  res.json({ ok: true });
});

app.post('/api/blackout', (req, res) => {
  currentState.blackout = !currentState.blackout;
  broadcast({ type: 'BLACKOUT' });
  res.json({ ok: true, blackout: currentState.blackout });
});

app.post('/api/clear', (req, res) => {
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

app.post('/api/scenes', express.json({ limit: '1mb' }), (req, res) => {
  try {
    const scenes = req.body.scenes;
    if (!Array.isArray(scenes)) return res.status(400).json({ error: 'scenes must be an array' });
    fs.writeFileSync(path.join(__dirname, 'seeds', 'scenes.json'), JSON.stringify(scenes, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save scenes.json' });
  }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'dm', 'index.html')); });
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