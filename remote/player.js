// ============================================================
//  D&D Player View — player.js
// ============================================================

var sceneEl     = document.getElementById('scene');
var statusEl    = document.getElementById('status');
var tapOverlay  = document.getElementById('tap-overlay');
var popupEl     = document.getElementById('popup-overlay');
var popupTimer  = null;

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
    var p = pendingAudio;
    pendingAudio = null;
    playAudio(p.url, p.loop);
  }
});

// ── Image display ────────────────────────────────────────────
function showImage(imageUrl, fogKey, fit) {
  sceneEl.classList.add('fading');
  setTimeout(function () {
    sceneEl.innerHTML = '';
    var img = document.createElement('img');
    img.style.cssText = 'width:100%;height:100%;object-fit:' + (fit || 'contain') + ';display:block;';
    sceneEl.appendChild(img);
    sceneEl.classList.remove('fading');
    currentFogKey = fogKey || null;
    if (fogKey && fogStates[fogKey]) {
      // Wait for image to load so we know its natural dimensions
      if (img.complete && img.naturalWidth) {
        renderFogOverlay(fogStates[fogKey], img);
      } else {
        img.onload = function () { renderFogOverlay(fogStates[fogKey], img); };
      }
    }
    img.src = imageUrl;
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
// imgEl is optional – when provided the overlay is sized/positioned to match
// the actual rendered image area (handles object-fit:contain letterboxing).
function renderFogOverlay(fogGrid, imgEl) {
  var existing = sceneEl.querySelector('.fog-overlay');
  if (existing) existing.remove();
  if (!fogGrid || !fogGrid.length) return;
  var rows = fogGrid.length;
  var cols = fogGrid[0].length;
  var overlay = document.createElement('div');
  overlay.className = 'fog-overlay';

  // Calculate the exact pixel rect of the rendered image inside sceneEl
  var posStyle;
  var el = imgEl || sceneEl.querySelector('img');
  if (el && el.naturalWidth && el.naturalHeight) {
    var cW = sceneEl.offsetWidth;
    var cH = sceneEl.offsetHeight;
    var fitMode = el.style.objectFit || 'contain';
    var scale = fitMode === 'cover'
      ? Math.max(cW / el.naturalWidth, cH / el.naturalHeight)
      : Math.min(cW / el.naturalWidth, cH / el.naturalHeight);
    var rendW = el.naturalWidth  * scale;
    var rendH = el.naturalHeight * scale;
    var offX  = (cW - rendW) / 2;
    var offY  = (cH - rendH) / 2;
    posStyle = 'position:absolute;' +
      'left:' + offX + 'px;top:' + offY + 'px;' +
      'width:' + rendW + 'px;height:' + rendH + 'px;';
  } else {
    posStyle = 'position:absolute;inset:0;';
  }

  overlay.style.cssText = posStyle + 'display:grid;' +
    'grid-template-columns:repeat(' + cols + ',1fr);' +
    'grid-template-rows:repeat(' + rows + ',1fr);pointer-events:none;overflow:hidden;';

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

// ── Overlay popup (dice, initiative) ─────────────────────────
function showOverlay(title, html, duration) {
  if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
  var inner = '';
  if (title) inner += '<div style="font-family:Georgia,serif;font-size:1.5rem;font-weight:bold;color:#d4af37;text-align:center;margin-bottom:1rem;">' + title + '</div>';
  inner += '<div style="color:#f0e6c8;font-family:Georgia,serif;font-size:1.1rem;">' + html + '</div>';
  popupEl.innerHTML = inner;
  popupEl.classList.add('visible');
  popupTimer = setTimeout(function () {
    popupEl.classList.remove('visible');
    popupTimer = null;
  }, duration || 10000);
}

// ── Audio ─────────────────────────────────────────────────────
function playAudio(url, loop) {
  if (!audioUnlocked) {
    pendingAudio = { url: url, loop: !!loop };
    return;
  }
  if (globalAudio) { globalAudio.pause(); globalAudio = null; }
  globalAudio = new Audio(url);
  globalAudio.loop = !!loop;
  globalAudio.volume = 0.7;
  globalAudio.play().catch(function (err) {
    console.warn('Audio play blocked:', err);
    pendingAudio = { url: url, loop: !!loop };
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
      showImage(msg.image, msg.fogKey || null, msg.fit || 'contain');
      if (msg.audio) playAudio(msg.audio, msg.audioLoop !== false);
      break;
    case 'UPDATE_FOG':
      if (msg.fogKey) {
        fogStates[msg.fogKey] = msg.fogGrid;
        if (msg.fogKey === currentFogKey) renderFogOverlay(msg.fogGrid, sceneEl.querySelector('img'));
      }
      break;
    case 'PLAY_AUDIO':
      if (msg.url) playAudio(msg.url, msg.loop === true);
      break;
    case 'STOP_AUDIO':
      stopAudio();
      break;
    case 'BLACKOUT':
      clearScene();
      stopAudio();
      currentFogKey = null;
      break;
    case 'OVERLAY':
      showOverlay(msg.title, msg.data, msg.duration);
      break;
    case 'update':
      if (msg.data) showText(msg.content || '', msg.data);
      break;
  }
}

// ── Fullscreen button ─────────────────────────────────────────
(function () {
  var btn = document.getElementById('fullscreen-btn');
  if (!btn) return;
  var hideTimer = null;

  function showBtn() {
    btn.classList.remove('hidden');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { btn.classList.add('hidden'); }, 4000);
  }

  // Show on any mouse/touch movement
  document.addEventListener('mousemove', showBtn);
  document.addEventListener('touchstart', showBtn);

  btn.addEventListener('click', function (e) {
    e.stopPropagation(); // don't trigger the tap-overlay dismiss
    var doc = document.documentElement;
    if (!document.fullscreenElement) {
      (doc.requestFullscreen || doc.webkitRequestFullscreen || doc.mozRequestFullScreen || doc.msRequestFullscreen).call(doc);
      btn.textContent = '✕';
      btn.title = 'Exit fullscreen';
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen).call(document);
      btn.textContent = '⛶';
      btn.title = 'Toggle fullscreen';
    }
  });

  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement) {
      btn.textContent = '⛶';
      btn.title = 'Toggle fullscreen';
    }
  });

  // Start hidden; appears on first mouse move
  btn.classList.add('hidden');
}());

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
