const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname)));

let currentState = { nowShowing: '—', content: '', blackout: false };
const clients = new Set();
const dmClients = new Set();

function broadcastClientCount() {
  const count = clients.size;
  const payload = JSON.stringify({ type: 'clients', count });
  for (const dm of dmClients) {
    if (dm.readyState === WebSocket.OPEN) dm.send(payload);
  }
}

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('Client connected. Total: ' + clients.size);
  broadcastClientCount();
  ws.send(JSON.stringify({ type: 'update', content: currentState.nowShowing, data: currentState.content, blackout: currentState.blackout }));

  ws.on('message', (raw) => {
    try {
      const message = JSON.parse(raw);
      switch (message.action) {
        case 'dm-connect': dmClients.add(ws); broadcastClientCount(); break;
        case 'blackout':
          currentState.blackout = !currentState.blackout;
          broadcast({ type: 'blackout', blackout: currentState.blackout }); break;
        case 'show':
          currentState.nowShowing = message.label || '—';
          currentState.content = message.data || '';
          broadcast({ type: 'update', content: currentState.nowShowing, data: currentState.content }); break;
        case 'clear':
          currentState.nowShowing = '—'; currentState.content = '';
          broadcast({ type: 'update', content: '—', data: '' }); break;
      }
    } catch (err) { console.error('Bad message:', err); }
  });

  ws.on('close', () => {
    clients.delete(ws); dmClients.delete(ws);
    console.log('Client disconnected. Total: ' + clients.size);
    broadcastClientCount();
  });
});

function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

app.post('/api/show', express.json({ limit: '50mb' }), (req, res) => {
  const { label, data } = req.body;
  currentState.nowShowing = label || '—'; currentState.content = data || '';
  broadcast({ type: 'update', content: currentState.nowShowing, data: currentState.content });
  res.json({ ok: true });
});

app.post('/api/blackout', (req, res) => {
  currentState.blackout = !currentState.blackout;
  broadcast({ type: 'blackout', blackout: currentState.blackout });
  res.json({ ok: true, blackout: currentState.blackout });
});

app.post('/api/clear', (req, res) => {
  currentState.nowShowing = '—'; currentState.content = ''; currentState.blackout = false;
  broadcast({ type: 'update', content: '—', data: '' });
  res.json({ ok: true });
});

app.get('/api/state', (req, res) => { res.json(currentState); });

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'dm', 'index.html')); });
app.get('/remote', (req, res) => { res.sendFile(path.join(__dirname, 'remote', 'index.html')); });

const PORT = 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('D&D Remote Server running!');
  console.log('  DM Panel:  http://localhost:' + PORT);
  console.log('  Player TV: http://localhost:' + PORT + '/remote');
  console.log('');
});