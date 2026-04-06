'use strict';

// ── State ──────────────────────────────────────────────────
let ws            = null;
let scenes        = [];
let nowShowing    = null; // { label }
let initiative    = [];
let initTurn      = 0;

const statusDotEl  = document.getElementById('status-dot');
const nowShowingEl = document.getElementById('now-showing');
const contentEl    = document.getElementById('content');

// ── WebSocket ──────────────────────────────────────────────
function wsSend(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(protocol + '//' + location.host + '/ws');

  ws.onopen  = () => { statusDotEl.className = 'status-dot on'; };
  ws.onclose = () => { statusDotEl.className = 'status-dot off'; ws = null; setTimeout(connect, 2000); };
  ws.onerror = () => ws.close();

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'SHOW_SCENE_VIEW') {
        // Find which scene/view matches this image
        let found = null;
        for (const sc of scenes) {
          for (const v of (sc.views || [])) {
            if (v.image && msg.image && v.image === msg.image) { found = sc.label + (sc.views.length > 1 ? ' — ' + v.label : ''); break; }
          }
          if (found) break;
        }
        nowShowing = found || msg.image || '—';
        nowShowingEl.textContent = nowShowing;
        document.querySelectorAll('.view-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.image === msg.image);
        });
      } else if (msg.type === 'BLACKOUT') {
        if (msg.active) { nowShowingEl.textContent = '⬛ BLACKOUT'; }
        else { nowShowingEl.textContent = nowShowing || '—'; }
      } else if (msg.type === 'CLEAR') {
        nowShowingEl.textContent = nowShowing || '—';
      }
    } catch (_) {}
  };
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

// ── Render ─────────────────────────────────────────────────
function renderScenes() {
  // Group by tab (area)
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
        // Single view — just one button
        const btn = document.createElement('button');
        btn.className = 'scene-btn view-btn';
        btn.dataset.image = views[0].image || '';
        btn.innerHTML = `<span class="scene-icon">🗺</span><span class="scene-label">${sc.label}</span>`;
        btn.onclick = () => sendView(sc, views[0]);
        card.appendChild(btn);
      } else {
        // Multiple views — scene header + expandable view list
        const btn = document.createElement('button');
        btn.className = 'scene-btn';
        btn.innerHTML = `<span class="scene-icon">🗺</span><span class="scene-label">${sc.label}</span>`;

        const viewList = document.createElement('div');
        viewList.className = 'view-list hidden';

        views.forEach(v => {
          const vBtn = document.createElement('button');
          vBtn.className = 'view-btn';
          vBtn.dataset.image = v.image || '';
          vBtn.textContent = v.label || sc.label;
          vBtn.onclick = () => sendView(sc, v);
          viewList.appendChild(vBtn);
        });

        btn.onclick = () => {
          const open = viewList.classList.toggle('hidden') === false;
          btn.querySelector('.scene-label').textContent = (open ? '▾ ' : '▸ ') + sc.label;
        };
        btn.querySelector('.scene-label').textContent = '▸ ' + sc.label;

        card.appendChild(btn);
        card.appendChild(viewList);
      }

      section.appendChild(card);
    }

    contentEl.appendChild(section);
  }
}

function sendView(sc, view) {
  wsSend({
    action: 'show-scene-view',
    image: view.image || null,
    audio: view.audio || null,
    audioLoop: view.audioLoop !== false,
    fogKey: view.fog ? sc.id : null,
    fit: view.fit || 'contain'
  });
  nowShowing = sc.label + (sc.views && sc.views.length > 1 ? ' — ' + view.label : '');
  nowShowingEl.textContent = nowShowing;
  document.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.image === (view.image || ''));
  });
}

async function renderAudio() {
  const categories = await loadAudio();
  if (!categories.length) return;

  for (const { cat, files } of categories) {
    // Determine category type by name convention
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

// ── Initiative Tracker ─────────────────────────────────────
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
  header.className = 'section-header';
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
      <span style="min-width:28px;text-align:right;font-size:0.95rem;">${e.roll}</span>
      <span>${i===initTurn ? '▶ ' : ''}${e.name}</span>
    </div>`
  ).join('');
  wsSend({
    action: 'send-overlay',
    title: '⚔️ Initiative Order',
    data: rows,
    duration: 12000
  });
}

// ── Quick Actions bar (clear/stop audio) ──────────────────
function buildQuickBar() {
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:8px;padding:10px 16px;background:var(--bg2);border-bottom:1px solid var(--border);';

  const clearBtn = document.createElement('button');
  clearBtn.textContent = '🧹 Clear Popups';
  clearBtn.style.cssText = 'flex:1;padding:10px;background:var(--orange);border:1px solid var(--orange-bright);border-radius:var(--radius);color:#f0c080;font-size:0.85rem;font-weight:600;cursor:pointer;';
  clearBtn.onclick = () => wsSend({ action: 'clear' });

  const stopBtn = document.createElement('button');
  stopBtn.textContent = '⏹ Stop Audio';
  stopBtn.style.cssText = 'flex:1;padding:10px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-dim);font-size:0.85rem;font-weight:600;cursor:pointer;';
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
  connect();
})();
