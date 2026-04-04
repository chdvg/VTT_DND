let scenes = [];
let currentSceneId = null;
let currentMediaPath = null;
let currentFit = null;
let pendingChain = null;
let activated = false;
let currentFogGrid = null;

const sceneEl = document.getElementById('scene');
const cutsceneEl = document.getElementById('cutscene');
const cutsceneVideo = document.getElementById('cutscene-video');
const statusEl = document.getElementById('status');
const tapOverlay = document.getElementById('tap-overlay');

// iOS and some browsers block autoplay until user gesture. Show a tap-to-enter
// screen so the first interaction unlocks media playback for the session.
tapOverlay.addEventListener('click', () => {
  activated = true;
  tapOverlay.classList.add('hidden');
  // Flush any scene that arrived before the tap
  if (currentSceneId !== null || pendingClear) renderScene();
});

let pendingClear = false;

async function loadLayout() {
  try {
    const res = await fetch('/api/layout');
    const layout = await res.json();
    if (layout) scenes = layout.scenes ?? [];
    statusEl.textContent = 'loaded ' + scenes.length + ' scenes';
  } catch (e) {
    statusEl.textContent = 'layout error: ' + e.message;
    console.error('Failed to load layout', e);
  }
}

function renderScene() {
  if (!activated) return;

  sceneEl.classList.add('fading');
  setTimeout(() => {
    sceneEl.innerHTML = '';
    pendingClear = false;

    if (!currentSceneId) {
      sceneEl.classList.remove('fading');
      return;
    }

    const scene = scenes.find(s => s.id === currentSceneId);
    if (!scene) { console.warn('[Player] Scene not found:', currentSceneId, 'in', scenes.map(s=>s.id)); sceneEl.classList.remove('fading'); return; }

    const mediaPath = currentMediaPath ?? scene.mediaPath;
    const fit = currentFit ?? scene.options?.fit ?? 'contain';
    const src = mediaPath ? (mediaPath.startsWith('/') ? mediaPath : '/' + mediaPath) : null;

    switch (scene.type) {
      case 'map':
      case 'utility': {
        if (!src) break;
        const img = document.createElement('img');
        img.src = src;
        img.style.objectFit = fit;
        sceneEl.appendChild(img);
        // re-apply fog overlay after rendering image
        if (scene.type === 'map' && currentFogGrid) renderFogOverlay(currentFogGrid);
        break;
      }
      case 'video': {
        if (!src) break;
        const vid = document.createElement('video');
        vid.src = src;
        vid.autoplay = true;
        vid.loop = scene.options?.loop ?? false;
        vid.playsInline = true;
        vid.muted = true; // required for autoplay on iOS for looping bg video
        vid.style.objectFit = 'cover';
        sceneEl.appendChild(vid);
        vid.play().catch(() => {});
        break;
      }
      case 'text': {
        const div = document.createElement('div');
        div.className = 'text-content';
        div.textContent = scene.textContent ?? '';
        sceneEl.appendChild(div);
        break;
      }
    }

    sceneEl.classList.remove('fading');
  }, 300);
}

function renderFogOverlay(fogGrid) {
  // Remove any existing fog overlay inside sceneEl
  const existing = sceneEl.querySelector('.fog-overlay');
  if (existing) existing.remove();
  if (!fogGrid || !fogGrid.length) return;

  const rows = fogGrid.length;
  const cols = fogGrid[0].length;

  const overlay = document.createElement('div');
  overlay.className = 'fog-overlay';
  overlay.style.cssText = [
    'position:absolute', 'inset:0',
    `display:grid`,
    `grid-template-columns:repeat(${cols},1fr)`,
    `grid-template-rows:repeat(${rows},1fr)`,
    'pointer-events:none'
  ].join(';');

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.style.background = fogGrid[r][c] ? 'transparent' : 'black';
      cell.style.transition = 'background 0.3s ease';
      overlay.appendChild(cell);
    }
  }

  sceneEl.appendChild(overlay);
}

function handleCommand(msg) {
  statusEl.textContent = 'cmd: ' + msg.type + (msg.sceneId ? ' id=' + msg.sceneId : '');
  console.log('[Player] Received:', msg.type, msg);
  switch (msg.type) {
    case 'SHOW_SCENE':
      currentSceneId = msg.sceneId ?? null;
      currentMediaPath = msg.mediaPath ?? null;
      currentFit = msg.fit ?? null;
      currentFogGrid = null; // reset fog; UPDATE_FOG arrives right after if enabled
      if (activated) renderScene();
      break;

    case 'BLACKOUT':
      currentSceneId = null;
      currentMediaPath = null;
      currentFit = null;
      currentFogGrid = null;
      pendingClear = true;
      if (activated) renderScene();
      break;

    case 'PLAY_CLIP': {
      const src = msg.videoPath ?? '';
      pendingChain = msg.chainSceneId
        ? { sceneId: msg.chainSceneId, mediaPath: msg.chainMediaPath ?? null, fit: msg.chainFit ?? null }
        : null;
      cutsceneVideo.src = src;
      cutsceneEl.classList.add('active');
      cutsceneVideo.play().catch(() => {});
      cutsceneVideo.onended = () => {
        cutsceneEl.classList.remove('active');
        cutsceneVideo.src = '';
        const chain = pendingChain;
        pendingChain = null;
        if (chain) {
          currentSceneId = chain.sceneId;
          currentMediaPath = chain.mediaPath;
          currentFit = chain.fit;
          renderScene();
        }
      };
      break;
    }

    case 'STOP_CLIP':
      pendingChain = null;
      cutsceneEl.classList.remove('active');
      cutsceneVideo.pause();
      cutsceneVideo.src = '';
      break;

    case 'DATA_UPDATED':
      loadLayout();
      break;

    case 'UPDATE_FOG':
      if (msg.sceneId === currentSceneId) {
        currentFogGrid = msg.fogGrid ?? null;
        if (activated) renderFogOverlay(currentFogGrid);
      }
      break;
  }
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(protocol + '//' + location.host + '/ws');

  ws.onopen = () => {
    statusEl.textContent = 'connected';
  };

  ws.onmessage = (e) => {
    try { handleCommand(JSON.parse(e.data)); } catch (err) { console.error(err); }
  };

  ws.onclose = () => {
    statusEl.textContent = 'reconnecting...';
    setTimeout(connect, 2000);
  };

  ws.onerror = () => ws.close();
}

loadLayout().then(() => connect());
