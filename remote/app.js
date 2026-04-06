'use strict';

// ── State ──────────────────────────────────────────────────
let ws             = null;
let wsQueue        = [];           // messages buffered while WS is connecting
let scenes         = [];
let nowShowing     = null;
let initiative     = [];
let initTurn       = 0;
let remoteFogStates = {};          // fogKey -> 2D boolean array
let currentFogKey  = null;

const FOG_ROWS = 20, FOG_COLS = 20;

const statusDotEl  = document.getElementById('status-dot');
const nowShowingEl = document.getElementById('now-showing');
const contentEl    = document.getElementById('content');

// ── WebSocket ──────────────────────────────────────────────
function wsSend(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  } else {
    wsQueue.push(obj); // buffer until open
  }
}

function flushQueue() {
  while (wsQueue.length && ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(wsQueue.shift()));
  }
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(protocol + '//' + location.host + '/ws');

  ws.onopen = () => {
    statusDotEl.className = 'status-dot on';
    flushQueue();
  };
  ws.onclose = () => {
    statusDotEl.className = 'status-dot off';
    ws = null;
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws && ws.close();

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case 'SHOW_SCENE_VIEW':
          currentFogKey = msg.fogKey || null;
          let found = null;
          for (const sc of scenes) {
            for (const v of (sc.views || [])) {
              if (v.image && msg.image && v.image === msg.image) {
                found = sc.label + (sc.views.length > 1 ? ' — ' + v.label : '');
                break;
              }
            }
            if (found) break;
          }
          nowShowing = found || msg.image || '—';
          nowShowingEl.textContent = nowShowing;
          document.querySelectorAll('.view-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.image === msg.image);
          });
          break;
        case 'UPDATE_FOG':
          if (msg.fogKey) {
            if (msg.fogGrid) {
              remoteFogStates[msg.fogKey] = msg.fogGrid;
            } else {
              delete remoteFogStates[msg.fogKey];
            }
            refreshOpenFogPanel(msg.fogKey);
          }
          break;
        case 'BLACKOUT':
          nowShowingEl.textContent = msg.active ? '⬛ BLACKOUT' : (nowShowing || '—');
          break;
        case 'CLEAR':
          nowShowingEl.textContent = nowShowing || '—';
          break;
      }
    } catch (_) {}
  };
}

// Start WS immediately on load — don't wait for content to render
connect();

// ── Fog helpers ────────────────────────────────────────────
function initFogGrid(fogKey) {
  remoteFogStates[fogKey] = Array.from({ length: FOG_ROWS }, () => new Array(FOG_COLS).fill(false));
}

function sendFogUpdate(fogKey) {
  if (remoteFogStates[fogKey]) {
    wsSend({ action: 'update-fog', fogKey, fogGrid: remoteFogStates[fogKey] });
  }
}

function refreshOpenFogPanel(fogKey) {
  const panel = document.querySelector(`.fog-panel[data-fog-key="${fogKey}"]:not(.hidden)`);
  if (panel) renderFogGridInPanel(panel, fogKey, panel.dataset.imgSrc);
}

function renderFogGridInPanel(panelEl, fogKey, imgSrc) {
  panelEl.innerHTML = '';

  if (!remoteFogStates[fogKey]) initFogGrid(fogKey);
  const grid = remoteFogStates[fogKey];
  const rows = grid.length, cols = grid[0].length;

  // Reveal All / Hide All buttons
  const actions = document.createElement('div');
  actions.className = 'fog-actions';

  const revBtn = document.createElement('button');
  revBtn.className = 'fog-action-btn reveal';
  revBtn.textContent = '☀️ Reveal All';
  revBtn.onclick = () => {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) grid[r][c] = true;
    renderFogGridInPanel(panelEl, fogKey, imgSrc);
    sendFogUpdate(fogKey);
  };

  const hideBtn = document.createElement('button');
  hideBtn.className = 'fog-action-btn hide';
  hideBtn.textContent = '⬛ Hide All';
  hideBtn.onclick = () => {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) grid[r][c] = false;
    renderFogGridInPanel(panelEl, fogKey, imgSrc);
    sendFogUpdate(fogKey);
  };

  actions.appendChild(revBtn);
  actions.appendChild(hideBtn);
  panelEl.appendChild(actions);

  // Map preview + grid overlay
  const mapWrap = document.createElement('div');
  mapWrap.style.cssText = 'position:relative;width:100%;';

  const img = document.createElement('img');
  img.src = imgSrc;
  img.className = 'fog-map-thumb';
  img.style.cssText += ';height:auto;max-height:180px;pointer-events:none;user-select:none;';
  mapWrap.appendChild(img);

  const gridEl = document.createElement('div');
  gridEl.className = 'fog-grid';
  gridEl.style.cssText = `position:absolute;inset:0;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);gap:0;`;

  let isPainting = null;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'fog-cell' + (grid[r][c] ? ' revealed' : '');
      cell.style.cssText = 'min-height:0;touch-action:none;';
      const ri = r, ci = c;

      cell.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        isPainting = !grid[ri][ci];
        grid[ri][ci] = isPainting;
        cell.className = 'fog-cell' + (isPainting ? ' revealed' : '');
        sendFogUpdate(fogKey);
      });
      cell.addEventListener('pointerenter', (e) => {
        if (isPainting === null || !(e.buttons > 0)) return;
        if (grid[ri][ci] === isPainting) return;
        grid[ri][ci] = isPainting;
        cell.className = 'fog-cell' + (isPainting ? ' revealed' : '');
        sendFogUpdate(fogKey);
      });

      gridEl.appendChild(cell);
    }
  }

  gridEl.addEventListener('pointerup',    () => { isPainting = null; });
  gridEl.addEventListener('pointerleave', () => { isPainting = null; });

  mapWrap.appendChild(gridEl);
  panelEl.appendChild(mapWrap);
}

function buildFogPanel(view) {
  const fogKey = view.id;

  const wrap = document.createElement('div');

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'fog-action-btn hide';
  toggleBtn.style.cssText = 'width:100%;margin-top:6px;font-size:0.75rem;';
  toggleBtn.textContent = '🌫️ Fog Control';

  const panel = document.createElement('div');
  panel.className = 'fog-panel hidden';
  panel.dataset.fogKey = fogKey;
  panel.dataset.imgSrc = view.image;

  toggleBtn.onclick = () => {
    const opening = panel.classList.toggle('hidden') === false;
    if (opening) {
      if (!remoteFogStates[fogKey]) initFogGrid(fogKey);
      renderFogGridInPanel(panel, fogKey, view.image);
    }
  };

  wrap.appendChild(toggleBtn);
  wrap.appendChild(panel);
  return wrap;
}

// ── Scene / audio loaders ──────────────────────────────────
async function loadScenes() {
  try {
    const res = await fetch('/api/scenes');
    const data = await res.json();
    scenes = data.scenes || [];
  } catch (_) { scenes = []; }
}

async function loadAudio() {
  try {
    const res = await fetch('/api/audio');
    const data = await res.json();
    return data.categories || [];
  } catch (_) { return []; }
}

// ── Render scenes ──────────────────────────────────────────
function renderScenes() {
  const tabs = {};
  for (const sc of scenes) {
    const tab = sc.tab || 'Scenes';
    if (!tabs[tab]) tabs[tab] = [];
    tabs[tab].push(sc);
  }

  for (const [tab, scList] of Object.entries(tabs)) {
    const section = document.createElement('section');

    const header = document.createElement('div');
    header.className = 'section-header';
    header.textContent = tab;
    section.appendChild(header);

    for (const sc of scList) {
      const views = sc.views || [];
      if (!views.length) continue;

      const card = document.createElement('div');
      card.className = 'scene-card';

      if (views.length === 1) {
        const btn = document.createElement('button');
        btn.className = 'scene-btn view-btn';
        btn.dataset.image = views[0].image || '';
        btn.innerHTML = `<span class="scene-icon">🗺</span><span class="scene-label">${sc.label}</span>`;
        btn.onclick = () => sendView(sc, views[0]);
        card.appendChild(btn);
        if (views[0].fog) card.appendChild(buildFogPanel(views[0]));
      } else {
        const btn = document.createElement('button');
        btn.className = 'scene-btn';
        btn.innerHTML = `<span class="scene-icon">🗺</span><span class="scene-label">▸ ${sc.label}</span>`;

        const viewList = document.createElement('div');
        viewList.className = 'view-list hidden';

        views.forEach(v => {
          const vWrap = document.createElement('div');

          const vBtn = document.createElement('button');
          vBtn.className = 'view-btn';
          vBtn.dataset.image = v.image || '';
          vBtn.textContent = v.label || sc.label;
          vBtn.onclick = () => sendView(sc, v);
          vWrap.appendChild(vBtn);

          if (v.fog) vWrap.appendChild(buildFogPanel(v));
          viewList.appendChild(vWrap);
        });

        btn.onclick = () => {
          const isOpen = viewList.classList.toggle('hidden') === false;
          btn.querySelector('.scene-label').textContent = (isOpen ? '▾ ' : '▸ ') + sc.label;
        };

        card.appendChild(btn);
        card.appendChild(viewList);
      }

      section.appendChild(card);
    }

    contentEl.appendChild(section);
  }
}

function sendView(sc, view) {
  const fogKey = view.fog ? view.id : null;   // match DM's fogKey (view.id)
  wsSend({
    action: 'show-scene-view',
    image: view.image || null,
    audio: view.audio || null,
    audioLoop: view.audioLoop !== false,
    fogKey,
    fit: view.fit || 'contain'
  });
  // If fog, send current fog state immediately (or init + send hidden)
  if (fogKey) {
    if (!remoteFogStates[fogKey]) initFogGrid(fogKey);
    sendFogUpdate(fogKey);
  }
  nowShowing = sc.label + (sc.views && sc.views.length > 1 ? ' — ' + view.label : '');
  nowShowingEl.textContent = nowShowing;
  document.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.image === (view.image || ''));
  });
}

// ── Render audio ───────────────────────────────────────────
async function renderAudio() {
  const categories = await loadAudio();
  if (!categories.length) return;

  for (const { cat, files } of categories) {
    const catLow = cat.toLowerCase();
    const audioType = catLow.includes('battle') || catLow.includes('music') ? 'music'
      : catLow.includes('sfx') || catLow.includes('effect') ? 'sfx'
      : 'ambience';

    const section = document.createElement('section');
    const header = document.createElement('div');
    header.className = 'section-header ' + audioType;
    header.textContent = cat;
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'audio-grid';
    files.forEach(url => {
      const name = url.split('/').pop().replace(/\.[^.]+$/, '');
      const title = name.includes(' - ') ? name.split(' - ').slice(1).join(' - ') : name;
      const btn = document.createElement('button');
      btn.className = 'audio-btn audio-' + audioType;
      btn.textContent = title;
      btn.onclick = () => wsSend({ action: 'play-audio', url, loop: audioType !== 'sfx' });
      grid.appendChild(btn);
    });
    section.appendChild(grid);

    const stopBtn = document.createElement('button');
    stopBtn.className = 'stop-btn';
    stopBtn.textContent = '■ Stop ' + cat;
    stopBtn.onclick = () => wsSend({ action: 'stop-audio' });
    section.appendChild(stopBtn);

    contentEl.appendChild(section);
  }
}

// ── Initiative ─────────────────────────────────────────────
function renderInitiativePanel() {
  const list = document.getElementById('init-list');
  if (!list) return;
  list.innerHTML = '';
  if (!initiative.length) {
    list.innerHTML = '<div class="init-empty" style="padding:8px 16px;color:#666;font-size:0.85rem;">No entries yet</div>';
    return;
  }
  initiative.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'init-entry' + (i === initTurn ? ' active' : '');
    row.innerHTML = `
      <span class="init-roll">${entry.roll}</span>
      <span class="init-name">${entry.name}</span>
      <button class="init-remove" data-i="${i}" style="background:none;border:none;color:#c0392b;font-size:1rem;cursor:pointer;margin-left:auto;">✕</button>
    `;
    row.querySelector('.init-remove').onclick = () => {
      initiative.splice(i, 1);
      if (initTurn >= initiative.length) initTurn = 0;
      renderInitiativePanel();
    };
    list.appendChild(row);
  });
}

function buildInitiativeSection() {
  const section = document.createElement('section');

  const header = document.createElement('div');
  header.className = 'section-header initiative';
  header.textContent = '⚔️ Initiative Tracker';
  section.appendChild(header);

  const form = document.createElement('div');
  form.className = 'init-form';
  form.innerHTML = `
    <input id="init-name" class="init-input" placeholder="Name" />
    <input id="init-roll" class="init-input init-input-sm" placeholder="Roll" type="number" />
    <button id="init-add-btn" class="init-action-btn add">+ Add</button>
  `;
  section.appendChild(form);

  const list = document.createElement('div');
  list.id = 'init-list';
  section.appendChild(list);

  const actions = document.createElement('div');
  actions.className = 'init-actions';
  actions.innerHTML = `
    <button id="init-send-btn" class="init-action-btn next">⚔️ Send to Players</button>
    <button id="init-next-btn" class="init-action-btn next" style="flex:0 0 auto;">⏭ Next</button>
    <button id="init-clear-btn" class="init-action-btn clear">Clear</button>
  `;
  section.appendChild(actions);

  setTimeout(() => {
    document.getElementById('init-add-btn').onclick = () => {
      const name = document.getElementById('init-name').value.trim();
      const roll = parseInt(document.getElementById('init-roll').value);
      if (!name || isNaN(roll)) return;
      initiative.push({ name, roll });
      initiative.sort((a, b) => b.roll - a.roll);
      initTurn = 0;
      document.getElementById('init-name').value = '';
      document.getElementById('init-roll').value = '';
      renderInitiativePanel();
    };
    document.getElementById('init-next-btn').onclick = () => {
      if (!initiative.length) return;
      initTurn = (initTurn + 1) % initiative.length;
      renderInitiativePanel();
      sendInitiativeOverlay();
    };
    document.getElementById('init-send-btn').onclick = sendInitiativeOverlay;
    document.getElementById('init-clear-btn').onclick = () => {
      initiative = []; initTurn = 0; renderInitiativePanel();
    };
    renderInitiativePanel();
  }, 0);

  return section;
}

function sendInitiativeOverlay() {
  if (!initiative.length) return;
  const rows = initiative.map((e, i) =>
    `<div style="display:flex;align-items:center;gap:12px;padding:6px 0;${i===initTurn?'color:#d4af37;font-weight:bold;':''}">
      <span style="min-width:28px;text-align:right;">${e.roll}</span>
      <span>${i===initTurn ? '▶ ' : ''}${e.name}</span>
    </div>`
  ).join('');
  wsSend({ action: 'send-overlay', title: '⚔️ Initiative Order', data: rows, duration: 12000 });
}

// ── Quick bar ──────────────────────────────────────────────
function buildQuickBar() {
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:8px;padding:10px 16px;background:#1a1209;border-bottom:1px solid #3a2e10;';

  const clearBtn = document.createElement('button');
  clearBtn.className = 'fog-action-btn hide';
  clearBtn.style.cssText = 'flex:1;padding:10px;font-size:0.85rem;';
  clearBtn.textContent = '🧹 Clear Popups';
  clearBtn.onclick = () => wsSend({ action: 'clear' });

  const stopBtn = document.createElement('button');
  stopBtn.className = 'fog-action-btn hide';
  stopBtn.style.cssText = 'flex:1;padding:10px;font-size:0.85rem;';
  stopBtn.textContent = '⏹ Stop Audio';
  stopBtn.onclick = () => wsSend({ action: 'stop-audio' });

  bar.appendChild(clearBtn);
  bar.appendChild(stopBtn);
  return bar;
}

// ── Boot ───────────────────────────────────────────────────
document.getElementById('blackout-btn').onclick = () => wsSend({ action: 'blackout' });

(async () => {
  await loadScenes();
  contentEl.appendChild(buildQuickBar());
  contentEl.appendChild(buildInitiativeSection());
  renderScenes();
  await renderAudio();
})();
