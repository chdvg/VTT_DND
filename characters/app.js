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
      if (tab.dataset.tab === 'view') renderPlayerView(collectForm());
    });
  });
}

// ── Player View rendering ─────────────────────────────────────
function pvAbilityMod(val) {
  var m = Math.floor((parseInt(val) - 10) / 2);
  return (m >= 0 ? '+' : '') + m;
}
function pvSection(title, content) {
  return '<div style="margin-bottom:14px;">' +
    '<div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#d4af37;border-bottom:1px solid #d4af3733;padding-bottom:3px;margin-bottom:6px;">' + title + '</div>' +
    content + '</div>';
}
function pvRow(label, val) {
  if (!val && val !== 0) return '';
  return '<div style="display:flex;gap:6px;margin-bottom:3px;"><span style="color:#888;min-width:110px;flex:none;font-size:0.82rem;">' + escHtml(label) + '</span>' +
    '<span style="color:#e6e6e6;font-size:0.82rem;word-break:break-word;">' + escHtml(String(val)) + '</span></div>';
}
function pvBlock(label, val) {
  if (!val) return '';
  return (label ? '<div style="font-size:0.75rem;color:#888;margin-bottom:2px;">' + escHtml(label) + '</div>' : '') +
    '<div style="background:#0a0d14;border:1px solid #21262d;border-radius:4px;padding:6px 8px;font-size:0.8rem;white-space:pre-wrap;color:#ccc;margin-bottom:8px;">' + escHtml(val) + '</div>';
}

function renderPlayerView(sheet) {
  var el = document.getElementById('pane-view-content');
  if (!el) return;
  if (!sheet || !sheet.name) { el.innerHTML = '<p style="color:#555;font-size:0.85rem;">Save a character to preview it.</p>'; return; }

  var curHp = sheet.hp || 0;
  var maxHp = sheet.hp || 0;
  var hpPct = maxHp > 0 ? 100 : 100;
  var hpColor = '#4ade80';
  var html = '';

  // Header
  html += '<div style="border-bottom:2px solid #d4af37;padding-bottom:0.75rem;margin-bottom:1rem;">' +
    '<div style="font-size:1.5rem;font-weight:700;color:#d4af37;">' + escHtml(sheet.name || '') + '</div>' +
    (sheet.player && sheet.player !== sheet.name ? '<div style="font-size:0.78rem;color:#888;">Player: ' + escHtml(sheet.player) + '</div>' : '') +
    '</div>';

  // Core stats bar
  html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">';
  html += '<div style="flex:1;min-width:120px;background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:8px 10px;">' +
    '<div style="font-size:0.68rem;color:#888;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Hit Points</div>' +
    '<span style="font-size:1.3rem;font-weight:700;color:' + hpColor + ';">' + curHp + ' / ' + maxHp + '</span>' +
    '<div style="height:5px;background:#21262d;border-radius:3px;margin-top:5px;overflow:hidden;">' +
    '<div style="height:100%;width:' + hpPct + '%;background:' + hpColor + ';border-radius:3px;"></div></div></div>';

  [['ac','AC'],['speed','Speed'],['initiative','Initiative'],['profBonus','Prof. Bonus'],['passivePerc','Passive Perc.']].forEach(function(pair) {
    var v = sheet[pair[0]];
    if (!v && v !== 0) return;
    html += '<div style="background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:8px 10px;min-width:70px;text-align:center;">' +
      '<div style="font-size:1.1rem;font-weight:700;color:#e6e6e6;">' + v + '</div>' +
      '<div style="font-size:0.65rem;color:#888;text-transform:uppercase;letter-spacing:0.08em;">' + pair[1] + '</div></div>';
  });
  html += '</div>';

  // Identity
  var identity = [
    sheet.race && sheet.class ? escHtml(sheet.race + ' ' + sheet.class + (sheet.subclass ? ' (' + sheet.subclass + ')' : '') + (sheet.level ? ' — Level ' + sheet.level : '')) : '',
    sheet.background ? 'Background: ' + escHtml(sheet.background) : '',
    sheet.alignment ? 'Alignment: ' + escHtml(sheet.alignment) : '',
  ].filter(Boolean).join('<br>');
  if (identity) html += pvSection('Identity', '<div style="font-size:0.85rem;color:#ccc;line-height:1.6;">' + identity + '</div>');

  // Ability scores
  var abilities = [['str','STR'],['dex','DEX'],['con','CON'],['int','INT'],['wis','WIS'],['cha','CHA']];
  var hasAbils = abilities.some(function(a) { return sheet[a[0]]; });
  if (hasAbils) {
    html += pvSection('Ability Scores',
      '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
      abilities.map(function(ab) {
        if (!sheet[ab[0]]) return '';
        return '<div style="background:#0d1117;border:1px solid #21262d;border-radius:5px;padding:5px 8px;text-align:center;min-width:52px;">' +
          '<div style="font-size:0.65rem;color:#888;letter-spacing:0.08em;">' + ab[1] + '</div>' +
          '<div style="font-size:1rem;font-weight:700;color:#e6e6e6;">' + sheet[ab[0]] + '</div>' +
          '<div style="font-size:0.75rem;color:#a78bfa;">' + pvAbilityMod(sheet[ab[0]]) + '</div></div>';
      }).join('') + '</div>');
  }

  // Combat
  var combatRows = [
    pvRow('Saves', sheet.saves), pvRow('Skills', sheet.skills),
    pvRow('Languages', sheet.languages), pvRow('Proficiencies', sheet.proficiencies),
    pvRow('Hit Dice', sheet.hitDice), pvRow('Spell Save DC', sheet.spellSaveDC),
    pvRow('Spell Attack', sheet.spellAtk ? '+' + sheet.spellAtk : ''),
  ].filter(Boolean).join('');
  if (combatRows) html += pvSection('Skills & Proficiencies', combatRows);

  if (sheet.features)  html += pvSection('Features & Abilities', pvBlock('', sheet.features));
  if (sheet.spells)    html += pvSection('Spells', pvBlock('', sheet.spells));
  if (sheet.equipment) html += pvSection('Equipment', pvBlock('', sheet.equipment));

  var personality = [pvRow('Traits', sheet.personality), pvRow('Ideals', sheet.ideals), pvRow('Bonds', sheet.bonds), pvRow('Flaws', sheet.flaws)].filter(Boolean).join('');
  if (personality) html += pvSection('Personality', personality);
  if (sheet.backstory) html += pvSection('Backstory', pvBlock('', sheet.backstory));
  if (sheet.appearance) html += pvSection('Appearance', pvBlock('', sheet.appearance));
  if (sheet.notes)     html += pvSection('Session Notes', pvBlock('', sheet.notes));
  if (sheet.relationships) html += pvSection('Relationships', pvBlock('', sheet.relationships));

  el.innerHTML = html;
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
