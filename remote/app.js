let layout = null;
let currentSceneId = null;
let currentFogGrid = null; // fog grid for the active scene
let initiativeData = { list: [], currentTurn: 0 };
let partyItemsData = [];

const nowShowingEl = document.getElementById('now-showing');
const statusDotEl  = document.getElementById('status-dot');
const contentEl    = document.getElementById('content');

// ── WebSocket ──────────────────────────────────────────────
function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(protocol + '//' + location.host + '/ws');

  ws.onopen  = () => statusDotEl.className = 'status-dot on';
  ws.onclose = () => { statusDotEl.className = 'status-dot off'; setTimeout(connect, 2000); };
  ws.onerror = () => ws.close();

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'SHOW_SCENE') {
        currentSceneId = msg.sceneId ?? null;
        currentFogGrid = null;
        updateNowShowing();
        highlightActive();
        hideFogPanel();
      } else if (msg.type === 'BLACKOUT') {
        currentSceneId = null;
        currentFogGrid = null;
        updateNowShowing();
        highlightActive();
        hideFogPanel();
      } else if (msg.type === 'UPDATE_FOG') {
        if (msg.sceneId === currentSceneId) {
          currentFogGrid = msg.fogGrid ?? null;
          const panel = document.querySelector(`.fog-panel[data-scene-id="${msg.sceneId}"]`);
          if (panel) panel.classList.remove('hidden');
          refreshFogPanel(msg.sceneId);
        }
      } else if (msg.type === 'DATA_UPDATED') {
        fetchLayout().then(render);
      } else if (msg.type === 'UPDATE_INITIATIVE') {
        initiativeData = { list: msg.list, currentTurn: msg.currentTurn };
        renderInitiativePanel();
      } else if (msg.type === 'UPDATE_ITEMS') {
        partyItemsData = msg.items;
        renderItemsPanel();
      }
    } catch (_) {}
  };
}

// ── API ────────────────────────────────────────────────────
async function api(path, body = {}) {
  try {
    await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (_) {}
}

// ── Helpers ────────────────────────────────────────────────
function updateNowShowing() {
  const scene = layout?.scenes?.find(s => s.id === currentSceneId);
  nowShowingEl.textContent = scene ? scene.label : '—';
}

function highlightActive() {
  document.querySelectorAll('.scene-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sceneId === currentSceneId);
  });
}

function typeIcon(type) {
  return { map: '🗺', video: '🎬', text: '📜', utility: '⚙️', audio: '🔊' }[type] ?? '•';
}

// ── Fog of War helpers ─────────────────────────────────────
function hideFogPanel() {
  document.querySelectorAll('.fog-panel').forEach(el => el.classList.add('hidden'));
}

function refreshFogPanel(sceneId) {
  const panel = document.querySelector(`.fog-panel[data-scene-id="${sceneId}"]`);
  if (!panel || !currentFogGrid) return;
  const cells = panel.querySelectorAll('.fog-cell');
  const cols = currentFogGrid[0]?.length ?? 0;
  cells.forEach((cell, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    cell.classList.toggle('revealed', !!(currentFogGrid[r] && currentFogGrid[r][c]));
  });
}

function buildFogPanel(scene) {
  const panel = document.createElement('div');
  panel.className = 'fog-panel hidden';
  panel.dataset.sceneId = scene.id;

  const rows = scene.fogRows ?? 8;
  const cols = scene.fogCols ?? 10;

  // Map thumbnail
  if (scene.mediaPath) {
    const src = scene.mediaPath.startsWith('/') ? scene.mediaPath : '/' + scene.mediaPath;
    const thumb = document.createElement('img');
    thumb.src = src;
    thumb.className = 'fog-map-thumb';
    panel.appendChild(thumb);
  }

  // Action buttons row
  const actions = document.createElement('div');
  actions.className = 'fog-actions';

  const revealBtn = document.createElement('button');
  revealBtn.className = 'fog-action-btn reveal';
  revealBtn.textContent = 'Reveal All';
  revealBtn.onclick = () => api('/api/fog/set-all', { sceneId: scene.id, revealed: true });

  const hideBtn = document.createElement('button');
  hideBtn.className = 'fog-action-btn hide';
  hideBtn.textContent = 'Hide All';
  hideBtn.onclick = () => api('/api/fog/set-all', { sceneId: scene.id, revealed: false });

  actions.appendChild(revealBtn);
  actions.appendChild(hideBtn);
  panel.appendChild(actions);

  // Grid
  const grid = document.createElement('div');
  grid.className = 'fog-grid';
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'fog-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.onclick = () => {
        const revealed = !cell.classList.contains('revealed');
        api('/api/fog/toggle-cell', { sceneId: scene.id, row: r, col: c, revealed });
      };
      grid.appendChild(cell);
    }
  }

  panel.appendChild(grid);
  return panel;
}

// ── Build UI ───────────────────────────────────────────────
async function fetchLayout() {
  const res = await fetch('/api/layout');
  layout = await res.json();
  return layout;
}

function makeSceneCard(scene) {
  const card = document.createElement('div');
  card.className = 'scene-card';

  const btn = document.createElement('button');
  btn.className = 'scene-btn';
  btn.dataset.sceneId = scene.id;
  btn.innerHTML = `<span class="scene-icon">${typeIcon(scene.type)}</span><span class="scene-label">${scene.label}</span>`;
  btn.onclick = () => api('/api/show-scene', { sceneId: scene.id });
  card.appendChild(btn);

  if (scene.views && scene.views.length > 0) {
    const toggle = document.createElement('button');
    toggle.className = 'views-toggle';
    toggle.textContent = '▸ ' + scene.views.length + ' view' + (scene.views.length > 1 ? 's' : '');

    const viewList = document.createElement('div');
    viewList.className = 'view-list hidden';

    scene.views.forEach(v => {
      const vBtn = document.createElement('button');
      vBtn.className = 'view-btn';
      vBtn.textContent = v.label;
      vBtn.onclick = () => api('/api/show-scene', { sceneId: scene.id, mediaPath: v.mediaPath, fit: v.fit ?? null });
      viewList.appendChild(vBtn);
    });

    toggle.onclick = () => {
      const open = viewList.classList.toggle('hidden') === false;
      toggle.textContent = (open ? '▾ ' : '▸ ') + scene.views.length + ' view' + (scene.views.length > 1 ? 's' : '');
    };

    card.appendChild(toggle);
    card.appendChild(viewList);
  }

  if (scene.type === 'map' && scene.fogEnabled) {
    card.appendChild(buildFogPanel(scene));
  }

  return card;
}

function makeAudioSection(title, scenes, audioType, cssClass) {
  if (!scenes.length) return null;

  const section = document.createElement('section');
  const header = document.createElement('h2');
  header.className = 'section-header ' + cssClass;
  header.textContent = title;
  section.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'audio-grid';
  scenes.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'audio-btn audio-' + audioType;
    btn.dataset.sceneId = s.id;
    btn.textContent = s.label;
    btn.onclick = () => api('/api/play-audio', { sceneId: s.id, audioType });
    grid.appendChild(btn);
  });
  section.appendChild(grid);

  const stopBtn = document.createElement('button');
  stopBtn.className = 'stop-btn';
  stopBtn.textContent = '■ Stop ' + title;
  stopBtn.onclick = () => api('/api/stop-audio', { audioType });
  section.appendChild(stopBtn);

  return section;
}

function render() {
  contentEl.innerHTML = '';

  if (!layout) {
    contentEl.innerHTML = '<p class="empty">No active layout found.</p>';
    return;
  }

  const visual   = layout.scenes.filter(s => ['map','video','text','utility'].includes(s.type));
  const ambience = layout.scenes.filter(s => s.type === 'audio' && s.options?.audioType === 'ambience');
  const music    = layout.scenes.filter(s => s.type === 'audio' && s.options?.audioType === 'music');
  const sfx      = layout.scenes.filter(s => s.type === 'audio' && s.options?.audioType === 'sfx');

  // ── Initiative Tracker section ──
  contentEl.appendChild(buildInitiativeSection());

  if (visual.length) {
    const section = document.createElement('section');
    const header = document.createElement('h2');
    header.className = 'section-header';
    header.textContent = 'Scenes';
    section.appendChild(header);
    visual.forEach(s => section.appendChild(makeSceneCard(s)));
    contentEl.appendChild(section);
  }

  const ambiSection = makeAudioSection('Ambience', ambience, 'ambience', 'ambience');
  if (ambiSection) contentEl.appendChild(ambiSection);

  const musicSection = makeAudioSection('Music', music, 'music', 'music');
  if (musicSection) contentEl.appendChild(musicSection);

  // SFX: no stop button needed (one-shots)
  if (sfx.length) {
    const section = document.createElement('section');
    const header = document.createElement('h2');
    header.className = 'section-header sfx';
    header.textContent = 'SFX';
    section.appendChild(header);
    const grid = document.createElement('div');
    grid.className = 'audio-grid';
    sfx.forEach(s => {
      const btn = document.createElement('button');
      btn.className = 'audio-btn audio-sfx';
      btn.textContent = s.label;
      btn.onclick = () => api('/api/play-audio', { sceneId: s.id, audioType: 'sfx' });
      grid.appendChild(btn);
    });
    section.appendChild(grid);
    contentEl.appendChild(section);
  }

  updateNowShowing();
  highlightActive();
  // Re-show fog panel for the active scene if it has fog
  if (currentSceneId && currentFogGrid) {
    const panel = document.querySelector(`.fog-panel[data-scene-id="${currentSceneId}"]`);
    if (panel) {
      panel.classList.remove('hidden');
      refreshFogPanel(currentSceneId);
    }
  }

  // ── Party Items section ──
  contentEl.appendChild(buildItemsSection());
}

// ── Initiative Panel ───────────────────────────────────────
function buildInitiativeSection() {
  const section = document.createElement('section');
  section.id = 'initiative-section';

  const header = document.createElement('h2');
  header.className = 'section-header initiative';
  header.textContent = 'Initiative Tracker';
  section.appendChild(header);

  // Add form
  const form = document.createElement('div');
  form.className = 'init-form';
  form.innerHTML = `
    <input id="init-name" class="init-input" placeholder="Name" />
    <input id="init-roll" class="init-input init-input-sm" placeholder="Roll" type="number" />
    <input id="init-hp" class="init-input init-input-sm" placeholder="HP" type="number" />
    <input id="init-maxhp" class="init-input init-input-sm" placeholder="Max" type="number" />
    <button id="init-add-btn" class="init-action-btn add">+ Add</button>
  `;
  section.appendChild(form);

  // List container
  const list = document.createElement('div');
  list.id = 'init-list';
  section.appendChild(list);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'init-actions';
  actions.innerHTML = `
    <button id="init-next-btn" class="init-action-btn next">Next Turn ▶</button>
    <button id="init-clear-btn" class="init-action-btn clear">Clear All</button>
  `;
  section.appendChild(actions);

  // Wire up events after DOM insertion
  setTimeout(() => {
    document.getElementById('init-add-btn')?.addEventListener('click', () => {
      const name = document.getElementById('init-name').value.trim();
      const roll = document.getElementById('init-roll').value;
      const hp = document.getElementById('init-hp').value;
      const maxHp = document.getElementById('init-maxhp').value;
      if (!name || !roll) return;
      const body = { name, roll: Number(roll) };
      if (hp) body.hp = Number(hp);
      if (maxHp) body.maxHp = Number(maxHp);
      api('/api/initiative/add', body);
      document.getElementById('init-name').value = '';
      document.getElementById('init-roll').value = '';
      document.getElementById('init-hp').value = '';
      document.getElementById('init-maxhp').value = '';
    });
    document.getElementById('init-next-btn')?.addEventListener('click', () => api('/api/initiative/next'));
    document.getElementById('init-clear-btn')?.addEventListener('click', () => api('/api/initiative/clear'));

    // Load current state
    fetch('/api/initiative').then(r => r.json()).then(data => {
      initiativeData = data;
      renderInitiativePanel();
    });
  }, 0);

  return section;
}

function renderInitiativePanel() {
  const list = document.getElementById('init-list');
  if (!list) return;
  list.innerHTML = '';

  if (initiativeData.list.length === 0) {
    list.innerHTML = '<div class="init-empty">No entries</div>';
    return;
  }

  initiativeData.list.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'init-entry' + (i === initiativeData.currentTurn ? ' active' : '');
    let hpHtml = '';
    if (entry.hp != null) {
      hpHtml = `<span class="init-hp">${entry.hp}${entry.maxHp != null ? '/' + entry.maxHp : ''} HP</span>`;
    }
    row.innerHTML = `
      <span class="init-roll">${entry.roll}</span>
      <span class="init-name">${entry.name}</span>
      ${hpHtml}
      <button class="init-remove" data-index="${i}">✕</button>
    `;
    row.querySelector('.init-remove').onclick = () => api('/api/initiative/remove', { index: i });
    list.appendChild(row);
  });
}

// ── Party Items Panel ──────────────────────────────────────
function buildItemsSection() {
  const section = document.createElement('section');
  section.id = 'items-section';

  const header = document.createElement('h2');
  header.className = 'section-header items';
  header.textContent = 'Party Items';
  section.appendChild(header);

  // Add form
  const form = document.createElement('div');
  form.className = 'items-form';
  form.innerHTML = `
    <input id="item-name" class="init-input" placeholder="Item name" />
    <input id="item-qty" class="init-input init-input-sm" placeholder="Qty" type="number" value="1" />
    <input id="item-notes" class="init-input" placeholder="Notes" />
    <button id="item-add-btn" class="init-action-btn add">+ Add</button>
  `;
  section.appendChild(form);

  // List container
  const list = document.createElement('div');
  list.id = 'items-list';
  section.appendChild(list);

  setTimeout(() => {
    document.getElementById('item-add-btn')?.addEventListener('click', () => {
      const name = document.getElementById('item-name').value.trim();
      const qty = document.getElementById('item-qty').value || '1';
      const notes = document.getElementById('item-notes').value.trim();
      if (!name) return;
      api('/api/items/add', { name, qty: Number(qty), notes: notes || undefined });
      document.getElementById('item-name').value = '';
      document.getElementById('item-qty').value = '1';
      document.getElementById('item-notes').value = '';
    });

    fetch('/api/items').then(r => r.json()).then(data => {
      partyItemsData = data;
      renderItemsPanel();
    });
  }, 0);

  return section;
}

function renderItemsPanel() {
  const list = document.getElementById('items-list');
  if (!list) return;
  list.innerHTML = '';

  if (partyItemsData.length === 0) {
    list.innerHTML = '<div class="init-empty">No items</div>';
    return;
  }

  partyItemsData.forEach(item => {
    const row = document.createElement('div');
    row.className = 'item-entry';
    let notesHtml = item.notes ? `<span class="item-notes">${item.notes}</span>` : '';
    row.innerHTML = `
      <span class="item-qty">${item.qty}×</span>
      <span class="item-name">${item.name}</span>
      ${notesHtml}
      <button class="item-btn plus" data-id="${item.id}">+</button>
      <button class="item-btn minus" data-id="${item.id}">−</button>
      <button class="init-remove" data-id="${item.id}">✕</button>
    `;
    row.querySelector('.plus').onclick = () => api('/api/items/update', { id: item.id, qty: item.qty + 1 });
    row.querySelector('.minus').onclick = () => {
      if (item.qty <= 1) api('/api/items/remove', { id: item.id });
      else api('/api/items/update', { id: item.id, qty: item.qty - 1 });
    };
    row.querySelector('.init-remove').onclick = () => api('/api/items/remove', { id: item.id });
    list.appendChild(row);
  });
}

// ── Init ───────────────────────────────────────────────────
document.getElementById('blackout-btn').onclick = () => api('/api/blackout');
fetchLayout().then(render);
connect();
