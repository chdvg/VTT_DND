'use strict';

// ── Tile definitions ──────────────────────────────────────────
const TILES = [
  { id: 'stone-floor',  label: 'Stone',    color: '#6b7280', pattern: 'grid' },
  { id: 'wood-floor',   label: 'Wood',     color: '#92400e', pattern: 'grid' },
  { id: 'dirt',         label: 'Dirt',     color: '#78350f', pattern: 'plain' },
  { id: 'grass',        label: 'Grass',    color: '#166534', pattern: 'plain' },
  { id: 'water',        label: 'Water',    color: '#1e40af', pattern: 'wave' },
  { id: 'deep-water',   label: 'Deep',     color: '#1e3a5f', pattern: 'plain' },
  { id: 'wall',         label: 'Wall',     color: '#374151', pattern: 'solid' },
  { id: 'stone-wall',   label: 'S.Wall',   color: '#1f2937', pattern: 'solid' },
  { id: 'lava',         label: 'Lava',     color: '#b45309', pattern: 'lava' },
  { id: 'sand',         label: 'Sand',     color: '#d97706', pattern: 'plain' },
  { id: 'snow',         label: 'Snow',     color: '#e5e7eb', pattern: 'plain' },
  { id: 'swamp',        label: 'Swamp',    color: '#365314', pattern: 'plain' },
  { id: 'cave',         label: 'Cave',     color: '#44403c', pattern: 'grid' },
  { id: 'road',         label: 'Road',     color: '#a8a29e', pattern: 'plain' },
  { id: 'door',         label: 'Door',     color: '#7c2d12', pattern: 'door' },
  { id: 'pit',          label: 'Pit',      color: '#0a0a0a', pattern: 'solid' },
];

// ── State ─────────────────────────────────────────────────────
let cols     = 20;
let rows     = 15;
let cellSize = 40;

// tileMap[r][c] = tile id or null
let tileMap  = [];
// tokens: { id, col, row, name, color }
let tokens   = [];
// labels: { id, col, row, text, size, color }
let labels   = [];
// background image url
let bgImage  = null;
let bgImageEl = null;

let activeTool  = 'paint';
let activeTile  = TILES[0];

// Undo stack — each entry is a snapshot of tileMap
let undoStack   = [];
const MAX_UNDO  = 40;

// Paint drag tracking
let isPainting  = false;
let paintValue  = null; // tile id being painted (null = erase)

// WebSocket
let ws = null;
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + location.host + '/ws');
  ws.onclose = () => setTimeout(connectWS, 2000);
}
connectWS();

// ── Canvas refs ───────────────────────────────────────────────
const bgCanvas     = document.getElementById('bg-canvas');
const tileCanvas   = document.getElementById('tile-canvas');
const gridCanvas   = document.getElementById('grid-canvas');
const cursorCanvas = document.getElementById('cursor-canvas');
const tokenLayer   = document.getElementById('token-layer');
const labelLayer   = document.getElementById('label-layer');
const container    = document.getElementById('canvas-container');
const coordsEl     = document.getElementById('coords');

const bgCtx     = bgCanvas.getContext('2d');
const tileCtx   = tileCanvas.getContext('2d');
const gridCtx   = gridCanvas.getContext('2d');
const cursorCtx = cursorCanvas.getContext('2d');

// ── Init ──────────────────────────────────────────────────────
function initGrid() {
  tileMap = [];
  for (let r = 0; r < rows; r++) {
    tileMap.push(new Array(cols).fill(null));
  }
  tokens = [];
  labels = [];
  undoStack = [];
  applySize();
}

function applySize() {
  const w = cols * cellSize;
  const h = rows * cellSize;
  [bgCanvas, tileCanvas, gridCanvas, cursorCanvas].forEach(c => {
    c.width  = w;
    c.height = h;
    c.style.width  = w + 'px';
    c.style.height = h + 'px';
  });
  container.style.width  = w + 'px';
  container.style.height = h + 'px';
  renderAll();
}

// ── Rendering ─────────────────────────────────────────────────
function renderAll() {
  renderBg();
  renderTiles();
  renderGrid();
  renderTokens();
  renderLabels();
}

function renderBg() {
  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  bgCtx.fillStyle = '#111';
  bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
  if (bgImageEl && bgImageEl.complete && bgImageEl.naturalWidth) {
    bgCtx.drawImage(bgImageEl, 0, 0, bgCanvas.width, bgCanvas.height);
  }
}

function renderTiles() {
  tileCtx.clearRect(0, 0, tileCanvas.width, tileCanvas.height);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tid = tileMap[r][c];
      if (!tid) continue;
      const tile = TILES.find(t => t.id === tid);
      if (!tile) continue;
      drawTile(tileCtx, tile, c * cellSize, r * cellSize, cellSize);
    }
  }
}

function drawTile(ctx, tile, x, y, size) {
  ctx.fillStyle = tile.color;
  ctx.fillRect(x, y, size, size);

  if (tile.pattern === 'grid' && size >= 12) {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    const step = Math.max(size / 4, 6);
    for (let i = 0; i <= size; i += step) {
      ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i, y + size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + i); ctx.lineTo(x + size, y + i); ctx.stroke();
    }
  } else if (tile.pattern === 'solid') {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
  } else if (tile.pattern === 'door') {
    ctx.fillStyle = '#92400e';
    ctx.fillRect(x + size * 0.2, y + size * 0.1, size * 0.6, size * 0.8);
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.arc(x + size * 0.65, y + size * 0.5, size * 0.07, 0, Math.PI * 2);
    ctx.fill();
  } else if (tile.pattern === 'wave') {
    ctx.strokeStyle = 'rgba(147,197,253,0.4)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const wy = y + size * (0.3 + i * 0.25);
      ctx.beginPath();
      ctx.moveTo(x, wy);
      ctx.bezierCurveTo(x + size/3, wy - 4, x + size*2/3, wy + 4, x + size, wy);
      ctx.stroke();
    }
  } else if (tile.pattern === 'lava') {
    const grad = ctx.createRadialGradient(x+size/2, y+size/2, 2, x+size/2, y+size/2, size/2);
    grad.addColorStop(0, '#fbbf24');
    grad.addColorStop(1, '#b45309');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, size, size);
  }
}

function renderGrid() {
  gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
  gridCtx.strokeStyle = 'rgba(255,255,255,0.08)';
  gridCtx.lineWidth = 0.5;
  for (let c = 0; c <= cols; c++) {
    gridCtx.beginPath();
    gridCtx.moveTo(c * cellSize, 0);
    gridCtx.lineTo(c * cellSize, rows * cellSize);
    gridCtx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    gridCtx.beginPath();
    gridCtx.moveTo(0, r * cellSize);
    gridCtx.lineTo(cols * cellSize, r * cellSize);
    gridCtx.stroke();
  }
}

function renderTokens() {
  tokenLayer.innerHTML = '';
  tokens.forEach(tok => {
    const el = document.createElement('div');
    el.className = 'token-el';
    el.style.left   = (tok.col * cellSize + cellSize / 2) + 'px';
    el.style.top    = (tok.row * cellSize + cellSize / 2) + 'px';
    el.style.width  = (cellSize - 6) + 'px';
    el.style.height = (cellSize - 6) + 'px';
    el.style.background = tok.color;
    el.style.fontSize = Math.max(8, cellSize * 0.22) + 'px';
    el.textContent = tok.name;
    makeDraggableToken(el, tok);
    tokenLayer.appendChild(el);
  });
}

function renderLabels() {
  labelLayer.innerHTML = '';
  labels.forEach(lbl => {
    const el = document.createElement('div');
    el.className = 'label-el';
    el.style.left     = (lbl.col * cellSize + cellSize / 2) + 'px';
    el.style.top      = (lbl.row * cellSize) + 'px';
    el.style.fontSize = lbl.size + 'px';
    el.style.color    = lbl.color;
    el.textContent    = lbl.text;
    makeDraggableLabel(el, lbl);
    labelLayer.appendChild(el);
  });
}

// ── Cursor preview ────────────────────────────────────────────
function drawCursor(col, row) {
  cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return;
  cursorCtx.strokeStyle = '#d4af37';
  cursorCtx.lineWidth = 2;
  cursorCtx.strokeRect(col * cellSize + 1, row * cellSize + 1, cellSize - 2, cellSize - 2);
}

// ── Canvas mouse interaction ──────────────────────────────────
function getCellFromEvent(e) {
  const rect = cursorCanvas.getBoundingClientRect();
  const x    = e.clientX - rect.left;
  const y    = e.clientY - rect.top;
  return {
    col: Math.floor(x / cellSize),
    row: Math.floor(y / cellSize),
  };
}

function pushUndo() {
  const snap = tileMap.map(r => [...r]);
  undoStack.push(snap);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function applyPaint(col, row) {
  if (col < 0 || row < 0 || col >= cols || row >= rows) return;
  const val = activeTool === 'erase' ? null : activeTile.id;
  if (tileMap[row][col] === val) return;
  tileMap[row][col] = val;
  // Repaint just that cell
  if (val === null) {
    tileCtx.clearRect(col * cellSize, row * cellSize, cellSize, cellSize);
  } else {
    drawTile(tileCtx, activeTile, col * cellSize, row * cellSize, cellSize);
  }
}

function floodFill(startCol, startRow, targetId, fillId) {
  if (startCol < 0 || startRow < 0 || startCol >= cols || startRow >= rows) return;
  if (targetId === fillId) return;
  const stack = [[startCol, startRow]];
  while (stack.length) {
    const [c, r] = stack.pop();
    if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
    if (tileMap[r][c] !== targetId) continue;
    tileMap[r][c] = fillId;
    stack.push([c+1,r],[c-1,r],[c,r+1],[c,r-1]);
  }
  renderTiles();
}

cursorCanvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const { col, row } = getCellFromEvent(e);

  if (activeTool === 'paint' || activeTool === 'erase') {
    pushUndo();
    isPainting = true;
    applyPaint(col, row);
  } else if (activeTool === 'fill') {
    pushUndo();
    const targetId = tileMap[row]?.[col] ?? null;
    const fillId   = activeTile.id;
    floodFill(col, row, targetId, fillId);
  } else if (activeTool === 'token') {
    placeToken(col, row);
  } else if (activeTool === 'label') {
    placeLabel(col, row);
  } else if (activeTool === 'image') {
    // handled by sidebar
  }
});

cursorCanvas.addEventListener('mousemove', e => {
  const { col, row } = getCellFromEvent(e);
  drawCursor(col, row);
  coordsEl.textContent = col + ', ' + row;
  if (isPainting && (activeTool === 'paint' || activeTool === 'erase')) {
    applyPaint(col, row);
  }
});

cursorCanvas.addEventListener('mouseup',    ()  => { isPainting = false; });
cursorCanvas.addEventListener('mouseleave', ()  => {
  isPainting = false;
  cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
  coordsEl.textContent = '';
});
// Prevent context menu interfering with right-click erase extension
cursorCanvas.addEventListener('contextmenu', e => e.preventDefault());

// Right-click = quick erase
cursorCanvas.addEventListener('mousedown', e => {
  if (e.button === 2) {
    pushUndo();
    isPainting = true;
    const { col, row } = getCellFromEvent(e);
    const prev = activeTool;
    activeTool = 'erase';
    applyPaint(col, row);
    activeTool = prev;
  }
});

// ── Token placement + drag ────────────────────────────────────
let _tokenSeq = 0;
function placeToken(col, row) {
  const name  = document.getElementById('token-name').value.trim() || '?';
  const color = document.getElementById('token-color').value;
  tokens.push({ id: ++_tokenSeq, col, row, name, color });
  renderTokens();
}

function makeDraggableToken(el, tok) {
  let dragging = false, startX, startY, origCol, origRow;

  el.addEventListener('mousedown', e => {
    if (activeTool !== 'token') return;
    e.stopPropagation();
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    origCol = tok.col; origRow = tok.row;
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    tok.col = Math.max(0, Math.min(cols - 1, origCol + Math.round(dx / cellSize)));
    tok.row = Math.max(0, Math.min(rows - 1, origRow + Math.round(dy / cellSize)));
    el.style.left = (tok.col * cellSize + cellSize / 2) + 'px';
    el.style.top  = (tok.row * cellSize + cellSize / 2) + 'px';
  });

  document.addEventListener('mouseup', () => { dragging = false; });

  // Right-click to remove
  el.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    tokens = tokens.filter(t => t.id !== tok.id);
    renderTokens();
  });
}

// ── Label placement + drag ────────────────────────────────────
let _labelSeq = 0;
function placeLabel(col, row) {
  const text  = document.getElementById('label-text').value.trim();
  if (!text) return;
  const size  = parseInt(document.getElementById('label-size').value, 10);
  const color = document.getElementById('label-color').value;
  labels.push({ id: ++_labelSeq, col, row, text, size, color });
  renderLabels();
}

function makeDraggableLabel(el, lbl) {
  let dragging = false, startX, startY, origCol, origRow;

  el.addEventListener('mousedown', e => {
    if (activeTool !== 'label') return;
    e.stopPropagation();
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    origCol = lbl.col; origRow = lbl.row;
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    lbl.col = Math.max(0, Math.min(cols - 1, origCol + Math.round(dx / cellSize)));
    lbl.row = Math.max(0, Math.min(rows - 1, origRow + Math.round(dy / cellSize)));
    el.style.left = (lbl.col * cellSize + cellSize / 2) + 'px';
    el.style.top  = (lbl.row * cellSize) + 'px';
  });

  document.addEventListener('mouseup', () => { dragging = false; });

  el.addEventListener('contextmenu', e => {
    e.preventDefault(); e.stopPropagation();
    labels = labels.filter(l => l.id !== lbl.id);
    renderLabels();
  });
}

// ── Background image ──────────────────────────────────────────
function setBgImage(url) {
  if (!url) { bgImage = null; bgImageEl = null; renderBg(); return; }
  bgImage = url;
  bgImageEl = new Image();
  bgImageEl.onload = renderBg;
  bgImageEl.src = url;
}

// Load map list into sidebar
fetch('/api/maps').then(r => r.json()).then(data => {
  const list = document.getElementById('bg-image-list');
  (data.maps || []).forEach(url => {
    const el = document.createElement('div');
    el.className = 'bg-item';
    el.textContent = url.split('/').pop();
    el.title = url;
    el.addEventListener('click', () => {
      document.getElementById('bg-image-url').value = url;
      setBgImage(url);
    });
    list.appendChild(el);
  });
}).catch(() => {});

document.getElementById('apply-bg-btn').addEventListener('click', () => {
  setBgImage(document.getElementById('bg-image-url').value.trim() || null);
});
document.getElementById('remove-bg-btn').addEventListener('click', () => {
  document.getElementById('bg-image-url').value = '';
  setBgImage(null);
});

// ── Tool buttons ──────────────────────────────────────────────
document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTool = btn.dataset.tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.getElementById('tile-palette-section').style.display =
      ['paint','erase','fill'].includes(activeTool) ? '' : 'none';
    document.getElementById('token-options').style.display  = activeTool === 'token'  ? '' : 'none';
    document.getElementById('label-options').style.display  = activeTool === 'label'  ? '' : 'none';
    document.getElementById('image-options').style.display  = activeTool === 'image'  ? '' : 'none';
    // Erase doesn't need palette
    document.getElementById('tile-palette-section').style.display =
      ['paint','fill'].includes(activeTool) ? '' : (activeTool === 'erase' ? 'none' : 'none');
  });
});

// ── Tile palette build ────────────────────────────────────────
const tileGrid = document.getElementById('tile-grid');
TILES.forEach(tile => {
  const sw = document.createElement('div');
  sw.className = 'tile-swatch' + (tile === activeTile ? ' selected' : '');
  sw.style.background = tile.color;
  sw.title = tile.label;
  const lbl = document.createElement('div');
  lbl.className = 'tile-label';
  lbl.textContent = tile.label;
  sw.appendChild(lbl);
  sw.addEventListener('click', () => {
    activeTile = tile;
    document.querySelectorAll('.tile-swatch').forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected');
  });
  tileGrid.appendChild(sw);
});

// ── Grid size controls ────────────────────────────────────────
document.getElementById('apply-grid-btn').addEventListener('click', () => {
  const newCols = parseInt(document.getElementById('grid-cols').value, 10);
  const newRows = parseInt(document.getElementById('grid-rows').value, 10);
  const newCell = parseInt(document.getElementById('cell-size').value, 10);
  if (!newCols || !newRows || !newCell) return;

  // Preserve existing tiles when expanding
  const oldMap = tileMap;
  const oldRows = rows; const oldCols = cols;
  cols = newCols; rows = newRows; cellSize = newCell;
  tileMap = [];
  for (let r = 0; r < rows; r++) {
    tileMap.push([]);
    for (let c = 0; c < cols; c++) {
      tileMap[r][c] = (r < oldRows && c < oldCols) ? oldMap[r][c] : null;
    }
  }
  applySize();
});

// ── Undo ──────────────────────────────────────────────────────
document.getElementById('undo-btn').addEventListener('click', () => {
  if (!undoStack.length) return;
  tileMap = undoStack.pop();
  renderTiles();
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    if (undoStack.length) { tileMap = undoStack.pop(); renderTiles(); }
  }
});

// ── Clear canvas ──────────────────────────────────────────────
document.getElementById('clear-canvas-btn').addEventListener('click', () => {
  if (!confirm('Clear the entire map?')) return;
  pushUndo();
  tileMap = [];
  for (let r = 0; r < rows; r++) tileMap.push(new Array(cols).fill(null));
  tokens = []; labels = [];
  renderAll();
});

// ── Composite export ──────────────────────────────────────────
function buildComposite() {
  const w = cols * cellSize;
  const h = rows * cellSize;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d');

  // 1. bg
  ctx.drawImage(bgCanvas, 0, 0);
  // 2. tiles
  ctx.drawImage(tileCanvas, 0, 0);
  // 3. tokens
  tokens.forEach(tok => {
    const r = cellSize / 2 - 3;
    const cx = tok.col * cellSize + cellSize / 2;
    const cy = tok.row * cellSize + cellSize / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = tok.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.max(8, cellSize * 0.22) + 'px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tok.name.slice(0, 4), cx, cy);
  });
  // 4. labels
  labels.forEach(lbl => {
    ctx.fillStyle = lbl.color;
    ctx.font = 'bold ' + lbl.size + 'px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.fillText(lbl.text, lbl.col * cellSize + cellSize / 2, lbl.row * cellSize);
    ctx.shadowBlur = 0;
  });
  // 5. light grid overlay
  ctx.drawImage(gridCanvas, 0, 0);
  return out;
}

// ── Send Live ─────────────────────────────────────────────────
document.getElementById('send-live-btn').addEventListener('click', () => {
  if (!ws || ws.readyState !== 1) { alert('Not connected to server.'); return; }
  const comp = buildComposite();
  const dataUrl = comp.toDataURL('image/png');
  ws.send(JSON.stringify({ action: 'show-scene-view', image: dataUrl, fit: 'contain' }));
  document.getElementById('send-live-btn').textContent = '✓ Sent!';
  setTimeout(() => { document.getElementById('send-live-btn').textContent = '📡 Send Live'; }, 2000);
});

// ── Save ──────────────────────────────────────────────────────
document.getElementById('save-btn').addEventListener('click', () => {
  document.getElementById('save-modal').classList.remove('hidden');
  document.getElementById('save-status').textContent = '';
});
document.getElementById('save-cancel-btn').addEventListener('click', () => {
  document.getElementById('save-modal').classList.add('hidden');
});
document.getElementById('save-add-scene').addEventListener('change', function() {
  document.getElementById('save-scene-opts').style.display = this.checked ? '' : 'none';
});

document.getElementById('save-confirm-btn').addEventListener('click', async () => {
  const filename = document.getElementById('save-filename').value.trim();
  if (!filename) { document.getElementById('save-status').textContent = 'Enter a filename.'; return; }
  const safeName = filename.endsWith('.png') ? filename : filename + '.png';
  const comp     = buildComposite();
  const dataUrl  = comp.toDataURL('image/png');
  const statusEl = document.getElementById('save-status');
  statusEl.textContent = 'Saving…';

  try {
    const r = await fetch('/api/map-builder/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, filename: safeName }),
    });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || 'Save failed');

    // Optionally add to scene list
    const addScene = document.getElementById('save-add-scene').checked;
    if (addScene) {
      const area  = document.getElementById('save-scene-area').value.trim()  || 'Custom';
      const label = document.getElementById('save-scene-label').value.trim() || safeName;
      const scenesR = await fetch('/api/scenes');
      const scenesJ = await scenesR.json();
      const scenes  = scenesJ.scenes || [];
      const newId   = area.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();
      // Find or create area group
      let group = scenes.find(s => s.label.toLowerCase() === area.toLowerCase());
      if (!group) {
        group = { id: newId, label: area, views: [] };
        scenes.push(group);
      }
      group.views.push({
        id: newId + '-view-0',
        label,
        image: json.webPath,
        fog: false,
      });
      await fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes }),
      });
    }

    statusEl.style.color = '#4ade80';
    statusEl.textContent = '✓ Saved to ' + json.webPath;
    setTimeout(() => document.getElementById('save-modal').classList.add('hidden'), 1800);
  } catch (err) {
    statusEl.style.color = '#ef4444';
    statusEl.textContent = 'Error: ' + err.message;
  }
});

// ── Bootstrap ─────────────────────────────────────────────────
initGrid();
