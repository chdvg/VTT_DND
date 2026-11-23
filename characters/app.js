// ============================================================
// Character Sheet Manager — app.js
// ============================================================

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

var characters = [];
var currentId  = null;
var saveTimer  = null;

// All field IDs → character object keys
var FIELDS = [
  'name','player','race','class','subclass','level','background','alignment','experience','age',
  'str','dex','con','int','wis','cha',
  'hp','ac','speed','initiative','profbonus','hitdice','passiveperc','spellsavedc','spellatk',
  'saves','skills','languages','proficiencies',
  'backstory','personality','ideals','bonds','flaws','appearance',
  'features','equipment','spells',
  'notes','relationships'
];

function fieldKey(id) {
  // map f-someField → someField (camelCase for multi-word)
  var map = {
    'profbonus':'profBonus', 'hitdice':'hitDice', 'passiveperc':'passivePerc',
    'spellsavedc':'spellSaveDC', 'spellatk':'spellAtk'
  };
  return map[id] || id;
}

function getField(id) {
  var el = document.getElementById('f-' + id);
  if (!el) return '';
  return el.value;
}

function setField(id, val) {
  var el = document.getElementById('f-' + id);
  if (!el) return;
  el.value = val !== undefined && val !== null ? val : '';
}

function abilityMod(score) {
  var n = parseInt(score, 10);
  if (isNaN(n)) return null;
  var mod = Math.floor((n - 10) / 2);
  return (mod >= 0 ? '+' : '') + mod;
}

function updateMods() {
  ['str','dex','con','int','wis','cha'].forEach(function(ab) {
    var val = getField(ab);
    var modEl = document.getElementById('mod-' + ab);
    if (modEl) modEl.textContent = val ? abilityMod(val) : '—';
  });
}

// ── Character list ────────────────────────────────────────────
function renderList() {
  var list = document.getElementById('char-list');
  if (!list) return;
  if (!characters.length) {
    list.innerHTML = '<div class="char-list-empty">No characters yet — click + New to start.</div>';
    return;
  }
  list.innerHTML = '';
  characters.forEach(function(c) {
    var item = document.createElement('div');
    item.className = 'char-item' + (c.id === currentId ? ' active' : '');
    item.dataset.id = c.id;
    var classLevel = [c.class || '', c.level ? 'Lv' + c.level : ''].filter(Boolean).join(' ');
    item.innerHTML =
      '<div class="char-item-name">' + escHtml(c.name) + '</div>' +
      '<div class="char-item-sub">' + escHtml([c.race || '', classLevel].filter(Boolean).join(' · ')) + '</div>';
    item.addEventListener('click', function() { openChar(c.id); });
    list.appendChild(item);
  });
}

// ── Open character in editor ──────────────────────────────────
function openChar(id) {
  currentId = id;
  var c = characters.find(function(x) { return x.id === id; });
  if (!c) return;

  document.getElementById('empty-state').style.display = 'none';
  var editor = document.getElementById('char-editor');
  editor.style.display = 'flex';

  FIELDS.forEach(function(f) { setField(f, c[fieldKey(f)]); });
  updateMods();

  var lu = document.getElementById('char-last-updated');
  if (lu) lu.textContent = c.updatedAt ? 'Saved ' + new Date(c.updatedAt).toLocaleString() : '';

  renderList();
}

// ── Collect form → object ─────────────────────────────────────
function collectForm() {
  var c = { id: currentId };
  FIELDS.forEach(function(f) {
    var val = getField(f);
    var key = fieldKey(f);
    var numFields = ['level','experience','str','dex','con','int','wis','cha','hp','ac','speed','initiative','profbonus','passiveperc','spellsavedc','spellatk'];
    if (numFields.indexOf(f) >= 0) {
      c[key] = val !== '' ? Number(val) : null;
    } else {
      c[key] = val;
    }
  });
  return c;
}

// ── Save ──────────────────────────────────────────────────────
function saveChar(silent) {
  if (!currentId) return;
  var c = collectForm();
  if (!c.name) return;
  fetch('/api/characters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(c)
  }).then(function(r) { return r.json(); }).then(function(res) {
    if (res.ok) {
      var idx = characters.findIndex(function(x) { return x.id === currentId; });
      c.updatedAt = new Date().toISOString();
      if (idx >= 0) characters[idx] = c;
      else characters.push(c);
      renderList();
      if (!silent) showSaveStatus();
      var lu = document.getElementById('char-last-updated');
      if (lu) lu.textContent = 'Updated ' + new Date(c.updatedAt).toLocaleString();
    }
  }).catch(function() {});
}

function showSaveStatus() {
  var el = document.getElementById('auto-save-status');
  if (!el) return;
  el.style.display = '';
  clearTimeout(el._t);
  el._t = setTimeout(function() { el.style.display = 'none'; }, 2000);
}

function scheduleAutoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function() { saveChar(true); }, 1200);
}

// ── New character ─────────────────────────────────────────────
function newChar() {
  var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  currentId = id;
  var c = { id: id, name: '' };
  characters.push(c);
  renderList();
  document.getElementById('empty-state').style.display = 'none';
  var editor = document.getElementById('char-editor');
  editor.style.display = 'flex';
  FIELDS.forEach(function(f) { setField(f, ''); });
  updateMods();
  document.getElementById('f-name').focus();
}

// ── Delete ────────────────────────────────────────────────────
function deleteChar() {
  if (!currentId) return;
  var c = characters.find(function(x) { return x.id === currentId; });
  if (!confirm('Delete ' + (c ? c.name || 'this character' : 'this character') + '?')) return;
  fetch('/api/characters/' + currentId, { method: 'DELETE' }).then(function() {
    characters = characters.filter(function(x) { return x.id !== currentId; });
    currentId = null;
    renderList();
    document.getElementById('char-editor').style.display = 'none';
    document.getElementById('empty-state').style.display = '';
  }).catch(function() {});
}

// ── Export JSON ───────────────────────────────────────────────
function exportChar() {
  if (!currentId) return;
  var c = collectForm();
  var json = JSON.stringify(c, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = (c.name || 'character').replace(/[^a-z0-9]/gi, '_') + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Import JSON ───────────────────────────────────────────────
function importChar(file) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      if (!data.name) { alert('Invalid character file — missing "name" field.'); return; }
      // Allow importing with or without an id; always generate a new one on import
      data.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      currentId = data.id;
      characters.push(data);
      renderList();
      openChar(data.id);
      saveChar(false);
    } catch (err) {
      alert('Could not parse file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ── Tab switching ─────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.char-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.char-tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.char-pane').forEach(function(p) { p.classList.remove('active'); });
      tab.classList.add('active');
      var pane = document.getElementById('pane-' + tab.dataset.tab);
      if (pane) pane.classList.add('active');
    });
  });
}

// ── Auto-save on any input change ────────────────────────────
function initAutoSave() {
  document.querySelectorAll('#char-editor input, #char-editor textarea, #char-editor select').forEach(function(el) {
    el.addEventListener('input', function() {
      if (el.classList.contains('ability-input')) updateMods();
      scheduleAutoSave();
    });
    el.addEventListener('change', scheduleAutoSave);
  });
}

// ── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  initTabs();

  fetch('/api/characters')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      characters = data.characters || [];
      renderList();
      // If only one character, open it automatically
      if (characters.length === 1) openChar(characters[0].id);
    })
    .catch(function() {});

  initAutoSave();

  document.getElementById('new-char-btn').addEventListener('click', newChar);
  document.getElementById('delete-btn').addEventListener('click', deleteChar);
  document.getElementById('export-btn').addEventListener('click', exportChar);

  document.getElementById('import-file').addEventListener('change', function(e) {
    importChar(e.target.files[0]);
    this.value = '';
  });

  document.getElementById('reload-chars-btn').addEventListener('click', function() {
    var btn = this;
    btn.textContent = '⏳';
    btn.disabled = true;
    fetch('/api/characters/reload', { method: 'POST' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        return fetch('/api/characters').then(function(r) { return r.json(); }).then(function(d) {
          characters = d.characters || [];
          renderList();
          btn.textContent = '✅';
          setTimeout(function() { btn.textContent = '🔄'; btn.disabled = false; }, 1200);
        });
      })
      .catch(function() { btn.textContent = '❌'; setTimeout(function() { btn.textContent = '🔄'; btn.disabled = false; }, 1500); });
  });
});
