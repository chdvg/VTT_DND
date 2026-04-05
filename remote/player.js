// ============================================================
//  D&D Player View — player.js
// ============================================================

var sceneEl    = document.getElementById('scene');
var statusEl   = document.getElementById('status');
var tapOverlay = document.getElementById('tap-overlay');

var globalAudio    = null;
var pendingAudio   = null;   // queued until tap-overlay is dismissed
var audioUnlocked  = false;
var currentFogKey  = null;
var fogStates      = {};

// Dismiss the tap-overlay on first click/touch, then play any queued audio
document.addEventListener('click', function () {
  if (!audioUnlocked) {
    audioUnlocked = true;
    if (tapOverlay) tapOverlay.classList.add('hidden');
  }
  if (pendingAudio) {
    var url = pendingAudio;
    pendingAudio = null;
    playAudio(url);
  }
});

// ── Image display ────────────────────────────────────────────
function showImage(imageUrl, fogKey) {
  sceneEl.classList.add('fading');
  setTimeout(function () {
    sceneEl.innerHTML = '';
    var img = document.createElement('img');
    img.src = imageUrl;
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
    sceneEl.appendChild(img);
    sceneEl.classList.remove('fading');
    currentFogKey = fogKey || null;
    if (fogKey && fogStates[fogKey]) renderFogOverlay(fogStates[fogKey]);
  }, 150);
}

function clearScene() {
  sceneEl.classList.add('fading');
  setTimeout(function () {
    sceneEl.innerHTML = '';
    sceneEl.classList.remove('fading');
  }, 150);
}

// ── Fog overlay ──────────────────────────────────────────────
function renderFogOverlay(fogGrid) {
  var existing = sceneEl.querySelector('.fog-overlay');
  if (existing) existing.remove();
  if (!fogGrid || !fogGrid.length) return;
  var rows = fogGrid.length;
  var cols = fogGrid[0].length;
  var overlay = document.createElement('div');
  overlay.className = 'fog-overlay';
  overlay.style.cssText = 'position:absolute;inset:0;display:grid;' +
    'grid-template-columns:repeat(' + cols + ',1fr);' +
    'grid-template-rows:repeat(' + rows + ',1fr);pointer-events:none;';
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var cell = document.createElement('div');
      cell.style.background = fogGrid[r][c] ? 'transparent' : 'black';
      cell.style.transition = 'background 0.3s ease';
      overlay.appendChild(cell);
    }
  }
  sceneEl.appendChild(overlay);
}

// ── Audio ─────────────────────────────────────────────────────
function playAudio(url) {
  if (!audioUnlocked) {
    pendingAudio = url;
    return;
  }
  if (globalAudio) { globalAudio.pause(); globalAudio = null; }
  globalAudio = new Audio(url);
  globalAudio.loop = true;
  globalAudio.volume = 0.7;
  globalAudio.play().catch(function (err) {
    console.warn('Audio play blocked:', err);
    pendingAudio = url;
  });
}

function stopAudio() {
  pendingAudio = null;
  if (globalAudio) { globalAudio.pause(); globalAudio.src = ''; globalAudio = null; }
}

// ── Text display ──────────────────────────────────────────────
function showText(title, html) {
  sceneEl.classList.add('fading');
  setTimeout(function () {
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;padding:3rem 4rem;';
    if (title) {
      var h = document.createElement('div');
      h.className = 'text-title';
      h.textContent = title;
      wrapper.appendChild(h);
    }
    var body = document.createElement('div');
    body.className = 'text-content';
    body.style.padding = '0';
    body.innerHTML = html;
    wrapper.appendChild(body);
    sceneEl.innerHTML = '';
    sceneEl.appendChild(wrapper);
    sceneEl.classList.remove('fading');
  }, 150);
}

// ── Message handler ───────────────────────────────────────────
function handleMessage(msg) {
  statusEl.textContent = msg.type;
  switch (msg.type) {
    case 'SHOW_SCENE_VIEW':
      showImage(msg.image, msg.fogKey || null);
      if (msg.audio) playAudio(msg.audio);
      break;
    case 'UPDATE_FOG':
      if (msg.fogKey) {
        fogStates[msg.fogKey] = msg.fogGrid;
        if (msg.fogKey === currentFogKey) renderFogOverlay(msg.fogGrid);
      }
      break;
    case 'PLAY_AUDIO':
      if (msg.url) playAudio(msg.url);
      break;
    case 'STOP_AUDIO':
      stopAudio();
      break;
    case 'BLACKOUT':
      clearScene();
      stopAudio();
      currentFogKey = null;
      break;
    case 'update':
      if (msg.data) showText(msg.content || '', msg.data);
      break;
  }
}

// ── WebSocket ─────────────────────────────────────────────────
function connect() {
  var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  var ws = new WebSocket(protocol + '//' + location.host + '/ws');
  ws.onopen    = function () { statusEl.textContent = 'connected'; };
  ws.onmessage = function (e) { try { handleMessage(JSON.parse(e.data)); } catch(err) { console.error(err); } };
  ws.onclose   = function () { statusEl.textContent = 'reconnecting...'; setTimeout(connect, 2000); };
  ws.onerror   = function () { ws.close(); };
}

connect();
