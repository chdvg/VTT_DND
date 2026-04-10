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
var currentTokens  = [];
var currentDrawing = [];
var currentMapKey  = null;
var currentImageUrl = null;

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
  var existingImg = sceneEl.querySelector('img');
  // If the same image is already loaded, skip the fade/reload entirely.
  // This prevents a long blank screen on WiFi reconnect when state is replayed.
  // Overlays are cleared by the caller (SHOW_SCENE_VIEW) and will be re-applied
  // by the UPDATE_TOKENS / UPDATE_DRAWING messages that follow immediately.
  if (existingImg && existingImg.naturalWidth && currentImageUrl === imageUrl) {
    currentFogKey = fogKey || null;
    existingImg.style.objectFit = fit || 'contain';
    if (fogKey && fogStates[fogKey]) {
      renderFogOverlay(fogStates[fogKey], existingImg);
    }
    return;
  }
  currentImageUrl = imageUrl;
  sceneEl.classList.add('fading');
  setTimeout(function () {
    sceneEl.innerHTML = '';
    var img = document.createElement('img');
    img.style.cssText = 'width:100%;height:100%;object-fit:' + (fit || 'contain') + ';display:block;';
    sceneEl.appendChild(img);
    sceneEl.classList.remove('fading');
    currentFogKey = fogKey || null;

    function afterLoad() {
      if (fogKey && fogStates[fogKey]) {
        renderFogOverlay(fogStates[fogKey], img);
      }
      if (currentTokens.length) {
        renderTokenOverlay(currentTokens);
      }
      if (currentDrawing.length) {
        renderDrawOverlay(currentDrawing, img);
      }
    }

    if (img.complete && img.naturalWidth) {
      afterLoad();
    } else {
      img.onload = afterLoad;
    }
    img.src = imageUrl;
  }, 150);
}

function clearScene() {
  currentImageUrl = null;
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
    'grid-template-rows:repeat(' + rows + ',1fr);pointer-events:none;overflow:hidden;z-index:20;';

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

// ── Token overlay ─────────────────────────────────────────────
var TOKEN_COLORS = { red: '#dc2626', blue: '#2563eb', yellow: '#ca8a04', green: '#16a34a' };

function renderTokenOverlay(tokens) {
  var existing = sceneEl.querySelector('.token-overlay');
  if (existing) existing.remove();
  if (!tokens || !tokens.length) return;

  var overlay = document.createElement('div');
  overlay.className = 'token-overlay';
  overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:10;';

  // Calc rendered image rect (same letterbox logic as fog)
  var imgEl = sceneEl.querySelector('img');
  var offX = 0, offY = 0, rendW, rendH;
  if (imgEl && imgEl.naturalWidth && imgEl.naturalHeight) {
    var cW = sceneEl.offsetWidth;
    var cH = sceneEl.offsetHeight;
    var fitMode = imgEl.style.objectFit || 'contain';
    var scale = fitMode === 'cover'
      ? Math.max(cW / imgEl.naturalWidth, cH / imgEl.naturalHeight)
      : Math.min(cW / imgEl.naturalWidth, cH / imgEl.naturalHeight);
    rendW = imgEl.naturalWidth  * scale;
    rendH = imgEl.naturalHeight * scale;
    offX  = (cW - rendW) / 2;
    offY  = (cH - rendH) / 2;
  } else {
    rendW = sceneEl.offsetWidth;
    rendH = sceneEl.offsetHeight;
  }

  var tokenSize = Math.round(Math.min(rendW, rendH) * 0.05);
  tokenSize = Math.max(20, Math.min(tokenSize, 60));
  var fontSize = Math.max(9, Math.round(tokenSize * 0.42));

  tokens.forEach(function (tok) {
    var left  = offX + tok.x * rendW;
    var top   = offY + tok.y * rendH;
    var color = TOKEN_COLORS[tok.color] || '#888';

    var dot = document.createElement('div');
    dot.style.cssText = [
      'position:absolute',
      'width:'  + tokenSize + 'px',
      'height:' + tokenSize + 'px',
      'border-radius:50%',
      'background:' + color,
      'border:3px solid rgba(255,255,255,0.85)',
      'box-shadow:0 2px 10px rgba(0,0,0,0.9)',
      'left:'   + left + 'px',
      'top:'    + top  + 'px',
      'transform:translate(-50%,-50%)',
      'display:flex',
      'align-items:center',
      'justify-content:center'
    ].join(';') + ';';

    if (tok.label) {
      var lbl = document.createElement('span');
      lbl.textContent = tok.label;
      lbl.style.cssText = 'color:rgba(255,255,255,0.97);font-weight:bold;font-size:' +
        fontSize + 'px;font-family:sans-serif;user-select:none;line-height:1;text-shadow:0 1px 3px rgba(0,0,0,0.8);';
      dot.appendChild(lbl);
    }
    overlay.appendChild(dot);
  });

  sceneEl.appendChild(overlay);
}

// ── Draw overlay ──────────────────────────────────────────
function renderDrawOverlay(strokes, imgEl) {
  var existing = sceneEl.querySelector('.draw-overlay');
  if (existing) existing.remove();
  if (!strokes || !strokes.length) return;

  var cW = sceneEl.offsetWidth;
  var cH = sceneEl.offsetHeight;
  var drawCanvas = document.createElement('canvas');
  drawCanvas.className = 'draw-overlay';
  drawCanvas.width  = cW;
  drawCanvas.height = cH;
  drawCanvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:30;';

  // Letterbox rect (same math as fog/token)
  var offX = 0, offY = 0, rendW = cW, rendH = cH;
  var el = imgEl || sceneEl.querySelector('img');
  if (el && el.naturalWidth && el.naturalHeight) {
    var fitMode = el.style.objectFit || 'contain';
    var scale = fitMode === 'cover'
      ? Math.max(cW / el.naturalWidth, cH / el.naturalHeight)
      : Math.min(cW / el.naturalWidth, cH / el.naturalHeight);
    rendW = el.naturalWidth  * scale;
    rendH = el.naturalHeight * scale;
    offX  = (cW - rendW) / 2;
    offY  = (cH - rendH) / 2;
  }

  var ctx = drawCanvas.getContext('2d');
  strokes.forEach(function (stroke) {
    if (!stroke.points || stroke.points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = stroke.erase ? 'rgba(0,0,0,1)' : (stroke.color || '#ef4444');
    ctx.lineWidth   = Math.max(2, (stroke.width || 0.006) * Math.min(rendW, rendH));
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
    ctx.beginPath();
    var p0 = stroke.points[0];
    ctx.moveTo(offX + p0.x * rendW, offY + p0.y * rendH);
    for (var i = 1; i < stroke.points.length; i++) {
      var p = stroke.points[i];
      ctx.lineTo(offX + p.x * rendW, offY + p.y * rendH);
    }
    ctx.stroke();
    ctx.restore();
  });

  sceneEl.appendChild(drawCanvas);
}

// ── Dice roll animation (3D cube) ────────────────────────────
var _diceHideTimer   = null;
var _diceNumInterval = null;

function showDiceRoll(die, result) {
  var overlay  = document.getElementById('dice-overlay');
  var cube     = document.getElementById('dice-3d');
  var wrapper  = document.getElementById('dice-wrapper');
  var allFaces = cube.querySelectorAll('.dice-face');
  var frontEl  = cube.querySelector('.dice-face.front');
  var labelEl  = document.getElementById('dice-result-label');

  // Cancel any in-progress roll
  if (_diceHideTimer)   { clearTimeout(_diceHideTimer);    _diceHideTimer   = null; }
  if (_diceNumInterval) { clearInterval(_diceNumInterval); _diceNumInterval = null; }
  cube.classList.remove('rolling');
  wrapper.classList.remove('settling');
  frontEl.classList.remove('settled');
  labelEl.className = '';

  // Seed all faces with random numbers
  allFaces.forEach(function(f) { f.textContent = Math.floor(Math.random() * die) + 1; });

  // Force reflow so removed classes fully reset before re-adding
  void cube.offsetWidth;
  void wrapper.offsetWidth;

  overlay.className = 'visible';
  cube.classList.add('rolling');

  // Keep cycling numbers on all faces while tumbling
  _diceNumInterval = setInterval(function() {
    allFaces.forEach(function(f) { f.textContent = Math.floor(Math.random() * die) + 1; });
  }, 75);

  // When tumble CSS animation ends: land and reveal
  cube.addEventListener('animationend', function onTumbleEnd() {
    clearInterval(_diceNumInterval);
    _diceNumInterval = null;

    // Set result on the front face and glow it
    frontEl.textContent = result;
    frontEl.classList.add('settled');

    // Bounce the wrapper (separate element so it doesn't reset the rotation)
    void wrapper.offsetWidth;
    wrapper.classList.add('settling');

    // Label below the die
    if (die === 20 && result === 20) {
      labelEl.textContent = '\u2694\ufe0f  NATURAL 20!';
    } else if (die === 20 && result === 1) {
      labelEl.textContent = '\ud83d\udc80  CRITICAL FAIL';
    } else {
      labelEl.textContent = 'd' + die + '  \u00b7  ' + result;
    }
    labelEl.className = 'visible';

    // Auto-dismiss after 3.5 s
    _diceHideTimer = setTimeout(function() {
      overlay.className = 'hiding';
      labelEl.className = '';
      setTimeout(function() {
        overlay.className = '';
        cube.classList.remove('rolling');
        wrapper.classList.remove('settling');
        frontEl.classList.remove('settled');
      }, 620);
      _diceHideTimer = null;
    }, 3500);
  }, { once: true });
}

// ── Overlay popup (dice, initiative) ─────────────────────────
function showOverlay(title, html, duration) {
  if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
  var inner = '';
  if (title) inner += '<div style="font-family:Georgia,serif;font-size:1.5rem;font-weight:bold;color:#d4af37;text-align:center;margin-bottom:1rem;">' + title + '</div>';
  inner += '<div style="color:#f0e6c8;font-family:Georgia,serif;font-size:1.1rem;text-align:center;max-width:100%;">' + html + '</div>';
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
      document.getElementById('blackout-overlay').style.display = 'none';
      // Immediately clear fog if the fog key is changing or cleared
      if ((msg.fogKey || null) !== currentFogKey) {
        var oldFog = sceneEl.querySelector('.fog-overlay');
        if (oldFog) oldFog.remove();
        currentFogKey = msg.fogKey || null;
      }
      // Clear tokens when switching maps
      currentMapKey  = msg.mapKey || null;
      currentTokens  = [];
      currentDrawing = [];
      var oldTok = sceneEl.querySelector('.token-overlay');
      if (oldTok) oldTok.remove();
      var oldDraw = sceneEl.querySelector('.draw-overlay');
      if (oldDraw) oldDraw.remove();
      showImage(msg.image, msg.fogKey || null, msg.fit || 'contain');
      if (msg.audio) playAudio(msg.audio, msg.audioLoop !== false);
      break;
    case 'UPDATE_TOKENS':
      if (msg.mapKey === currentMapKey || !currentMapKey) {
        currentTokens = msg.tokens || [];
        var imgEl2 = sceneEl.querySelector('img');
        if (imgEl2 && imgEl2.naturalWidth) {
          renderTokenOverlay(currentTokens);
        } else if (imgEl2) {
          var prevOnload = imgEl2.onload;
          imgEl2.onload = function () {
            if (prevOnload) prevOnload.call(this);
            renderTokenOverlay(currentTokens);
          };
        }
      }
      break;
    case 'UPDATE_DRAWING':
      if (msg.mapKey === currentMapKey || !currentMapKey) {
        currentDrawing = msg.strokes || [];
        var imgElD = sceneEl.querySelector('img');
        if (imgElD && imgElD.naturalWidth) {
          renderDrawOverlay(currentDrawing, imgElD);
        } else if (imgElD) {
          var prevOnloadD = imgElD.onload;
          imgElD.onload = function () {
            if (prevOnloadD) prevOnloadD.call(this);
            renderDrawOverlay(currentDrawing, imgElD);
          };
        }
      }
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
      document.getElementById('blackout-overlay').style.display = msg.active ? 'block' : 'none';
      if (msg.active) stopAudio();
      break;
    case 'CLEAR':
      document.getElementById('blackout-overlay').style.display = 'none';
      if (popupTimer) { clearTimeout(popupTimer); popupTimer = null; }
      popupEl.classList.remove('visible');
      break;
    case 'OVERLAY':
      showOverlay(msg.title, msg.data, msg.duration);
      break;
    case 'DICE_ROLL':
      showDiceRoll(msg.die, msg.result);
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
var _retryDelay = 1000;
var _firstConnect = true;

function connect() {
  var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  var ws = new WebSocket(protocol + '//' + location.host + '/ws');

  ws.onopen = function () {
    statusEl.textContent = 'connected';
    _retryDelay = 1000; // reset backoff on successful connect
    if (_firstConnect) {
      // Server already calls sendFullState automatically on connection — no need to request again
      _firstConnect = false;
    } else {
      // Reconnect: ask the server to replay full state
      ws.send(JSON.stringify({ action: 'request-sync' }));
    }
  };

  ws.onmessage = function (e) {
    try { handleMessage(JSON.parse(e.data)); } catch(err) { console.error(err); }
  };

  ws.onclose = function () {
    statusEl.textContent = 'reconnecting...';
    setTimeout(connect, _retryDelay);
    _retryDelay = Math.min(_retryDelay * 1.5, 10000); // cap at 10s
  };

  ws.onerror = function () { ws.close(); };
}

connect();
