// ============================================================
// Scene Builder — standalone page app
// ============================================================
var sbViews       = [];   // array of { label, image, audio, fog }
var sbAudioList   = [];   // populated from /api/audio
var sbEditingId   = null; // id of scene being edited, or null for new
var sbAllScenes   = [];   // cached full scene list
var sbSearchTerm  = '';

// ── DOM refs ─────────────────────────────────────────────────
var elSearch       = null;
var elSceneList    = null;
var elFormTitle    = null;
var elStatusMsg    = null;
var elTab          = null;
var elSceneLabel   = null;
var elViewList     = null;
var elNewSceneBtn  = null;
var elSidebarNewBtn = null;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  elSearch       = document.getElementById('sb-search');
  elSceneList    = document.getElementById('scene-list');
  elFormTitle    = document.getElementById('form-title');
  elStatusMsg    = document.getElementById('status-msg');
  elTab          = document.getElementById('sb-tab');
  elSceneLabel   = document.getElementById('sb-scene-label');
  elViewList     = document.getElementById('sb-scene-list');
  elNewSceneBtn  = document.getElementById('sb-new-scene-btn');
  elSidebarNewBtn = document.getElementById('sb-new-btn');

  elNewSceneBtn.onclick  = startNewScene;
  elSidebarNewBtn.onclick = function () {
    clearForm();
    elTab.focus();
  };

  elSearch.oninput = function () {
    sbSearchTerm = elSearch.value.toLowerCase().trim();
    renderSidebarList();
  };

  // Load audio and scene data in parallel
  Promise.all([
    fetch('/api/audio').then(function (r) { return r.json(); }),
    fetch('/api/scenes').then(function (r) { return r.json(); })
  ]).then(function (results) {
    sbAudioList  = results[0].audio      || [];
    sbAllScenes  = results[1].scenes     || [];
    renderSidebarList();

    // Auto-load scene from URL param
    var params  = new URLSearchParams(window.location.search);
    var editId  = params.get('edit');
    if (editId) {
      var scene = sbAllScenes.find(function (s) { return s.id === editId; });
      if (scene) loadSceneIntoForm(scene);
    }
  }).catch(function (e) {
    showStatus('Error loading data: ' + e.message, 'err');
  });

  renderViewList();
});

// ── Sidebar list ─────────────────────────────────────────────
function renderSidebarList() {
  if (!elSceneList) return;
  if (!sbAllScenes.length) {
    elSceneList.innerHTML = '<div class="scene-list-empty">No scenes yet.<br>Use the form to create your first scene.</div>';
    return;
  }

  // Group by tab/area
  var groups = {};
  sbAllScenes.forEach(function (s) {
    var area = s.tab || 'Uncategorized';
    if (!groups[area]) groups[area] = [];
    groups[area].push(s);
  });

  var term = sbSearchTerm;
  var html = '';
  Object.keys(groups).sort().forEach(function (area) {
    var scenes = groups[area].filter(function (s) {
      if (!term) return true;
      return (s.label || '').toLowerCase().includes(term) ||
             (s.tab || '').toLowerCase().includes(term);
    });
    if (!scenes.length) return;
    html += '<div class="scene-group-hdr">' + escHtml(area) + '</div>';
    scenes.forEach(function (s) {
      html += '<div class="scene-item" data-id="' + escHtml(s.id) + '">' +
        '<span class="scene-item-label" title="' + escHtml(s.label) + '">' + escHtml(s.label) + '</span>' +
        '<button class="btn-edit" onclick="handleEditClick(' + JSON.stringify(s.id) + ')">✏️ Edit</button>' +
        '<button class="btn-del" onclick="handleDeleteClick(' + JSON.stringify(s.id) + ')" title="Delete scene">✕</button>' +
        '</div>';
    });
  });

  if (!html) {
    elSceneList.innerHTML = '<div class="scene-list-empty">No matching scenes.</div>';
    return;
  }
  elSceneList.innerHTML = html;
}

function handleEditClick(sceneId) {
  var scene = sbAllScenes.find(function (s) { return s.id === sceneId; });
  if (!scene) return;
  loadSceneIntoForm(scene);
}

function handleDeleteClick(sceneId) {
  var scene = sbAllScenes.find(function (s) { return s.id === sceneId; });
  if (!scene) return;
  if (!confirm('Delete scene "' + scene.label + '"? This cannot be undone.')) return;

  var updated = sbAllScenes.filter(function (s) { return s.id !== sceneId; });
  fetch('/api/scenes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenes: updated })
  })
    .then(function (r) { return r.json(); })
    .then(function (resp) {
      if (!resp.ok) { showStatus('Error deleting: ' + (resp.error || 'unknown'), 'err'); return; }
      sbAllScenes = updated;
      renderSidebarList();
      // If we were editing this scene, clear the form
      if (sbEditingId === sceneId) clearForm();
      showStatus('Scene deleted.', 'ok');
    })
    .catch(function (e) { showStatus('Network error: ' + e.message, 'err'); });
}

// ── Form ─────────────────────────────────────────────────────
function clearForm() {
  sbEditingId = null;
  sbViews = [];
  elTab.value        = '';
  elSceneLabel.value = '';
  elFormTitle.textContent = 'New Scene';
  renderViewList();
}

function loadSceneIntoForm(scene) {
  sbEditingId = scene.id;
  elTab.value        = scene.tab   || '';
  elSceneLabel.value = scene.label || '';
  elFormTitle.textContent = 'Editing: ' + (scene.label || scene.id);
  sbViews = scene.views.map(function (v) {
    return { label: v.label, image: v.image, audio: v.audio || null, fog: v.fog === true };
  });
  renderViewList();
  window.scrollTo(0, 0);
}

function startNewScene() {
  var tab   = elTab.value.trim();
  var label = elSceneLabel.value.trim();
  if (!tab || !label) {
    alert('Please enter an Area name and a Scene label first.');
    return;
  }
  sbViews = [];
  renderViewList();
  addViewRow();
}

// ── View rows ─────────────────────────────────────────────────
function renderViewList() {
  var container = elViewList;
  if (!container) return;
  container.innerHTML = '';

  if (!sbViews.length) {
    container.innerHTML = '<p style="color:#555;font-size:0.85rem;">Enter an Area and Scene name above, then click <strong style="color:#ccc">+ New Map</strong> to add maps.</p>';
    return;
  }

  var tab   = elTab   ? elTab.value.trim()        : '';
  var label = elSceneLabel ? elSceneLabel.value.trim() : '';
  if (tab || label) {
    var crumb = document.createElement('div');
    crumb.style.cssText = 'font-size:0.78rem;color:#888;margin-bottom:0.75rem;';
    crumb.innerHTML = '<span style="color:#d4af37">' + escHtml(tab || '…') + '</span> › <span style="color:#d4af37">' + escHtml(label || '…') + '</span> › Maps';
    container.appendChild(crumb);
  }

  sbViews.forEach(function (view, idx) {
    var row = document.createElement('div');
    row.className = 'sb-view-row';

    // Row header
    var rowHdr = document.createElement('div');
    rowHdr.className = 'sb-row-hdr';
    var rowNum = document.createElement('span');
    rowNum.textContent = 'Map ' + (idx + 1);
    rowNum.style.cssText = 'font-size:0.75rem;color:#d4af37;font-weight:bold;';
    rowHdr.appendChild(rowNum);
    var removeBtn = document.createElement('button');
    removeBtn.textContent = '✕ Remove';
    removeBtn.className = 'btn btn-danger btn-small';
    removeBtn.onclick = (function (i) {
      return function () { sbViews.splice(i, 1); renderViewList(); };
    })(idx);
    rowHdr.appendChild(removeBtn);
    row.appendChild(rowHdr);

    // Line 1: label + image URL
    var line1 = document.createElement('div');
    line1.className = 'sb-row-line';

    var labelInput = document.createElement('input');
    labelInput.type        = 'text';
    labelInput.value       = view.label || '';
    labelInput.placeholder = 'Map label (e.g. Ground Floor)';
    labelInput.className   = 'sb-input';
    labelInput.oninput = function () { sbViews[idx].label = labelInput.value; };
    line1.appendChild(labelInput);

    var imgInput = document.createElement('input');
    imgInput.type        = 'text';
    imgInput.value       = view.image || '';
    imgInput.placeholder = 'Image URL (auto-filled below)';
    imgInput.className   = 'sb-input';
    imgInput.oninput = function () {
      sbViews[idx].image = imgInput.value;
      sbFocusedViewIdx = idx;
      updatePreview(idx);
    };
    imgInput.onfocus = function () { sbFocusedViewIdx = idx; updatePreview(idx); };
    line1.appendChild(imgInput);
    row.appendChild(line1);

    // Line 2: file picker + thumb + audio + fog
    var line2 = document.createElement('div');
    line2.className = 'sb-row-line';

    var filePicker = document.createElement('input');
    filePicker.type    = 'file';
    filePicker.accept  = '.jpg,.jpeg,.png,.webp,.gif';
    filePicker.className = 'sb-file-pick';
    filePicker.onchange = function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var url = '/assets/maps/' + file.name;
      imgInput.value     = url;
      sbViews[idx].image = url;
      thumb.src = URL.createObjectURL(file);
      sbFocusedViewIdx = idx;
      updatePreview(idx);
    };
    line2.appendChild(filePicker);

    var thumb = document.createElement('img');
    thumb.className = 'sb-thumb';
    thumb.src = view.image || '';
    line2.appendChild(thumb);

    var audioSel = document.createElement('select');
    audioSel.className = 'sb-select';
    var noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '— No ambience —';
    audioSel.appendChild(noneOpt);
    sbAudioList.forEach(function (aUrl) {
      var opt = document.createElement('option');
      opt.value = aUrl;
      opt.textContent = aUrl.split('/').pop();
      if (aUrl === view.audio) opt.selected = true;
      audioSel.appendChild(opt);
    });
    audioSel.onchange = function () { sbViews[idx].audio = audioSel.value || null; if (sbFocusedViewIdx === idx) updatePreview(idx); };
    line2.appendChild(audioSel);

    var fogLabel = document.createElement('label');
    fogLabel.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:0.78rem;color:#999;white-space:nowrap;cursor:pointer;margin:0;';
    var fogCheck = document.createElement('input');
    fogCheck.type    = 'checkbox';
    fogCheck.checked = view.fog === true;
    fogCheck.onchange = function () { sbViews[idx].fog = fogCheck.checked; if (sbFocusedViewIdx === idx) updatePreview(idx); };
    fogLabel.appendChild(fogCheck);
    fogLabel.appendChild(document.createTextNode('🌫 Fog'));
    line2.appendChild(fogLabel);

    row.appendChild(line2);
    container.appendChild(row);
  });

  // Action row
  var actionRow = document.createElement('div');
  actionRow.className = 'sb-action-row';

  var addViewBtn = document.createElement('button');
  addViewBtn.textContent = '➕ Add Map';
  addViewBtn.className   = 'btn btn-secondary btn-small';
  addViewBtn.onclick     = addViewRow;
  actionRow.appendChild(addViewBtn);

  var saveBtn = document.createElement('button');
  saveBtn.textContent = sbEditingId ? '💾 Update Scene' : '💾 Save Scene';
  saveBtn.className   = 'btn btn-primary btn-small';
  saveBtn.onclick     = saveScene;
  actionRow.appendChild(saveBtn);

  if (sbEditingId) {
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = '✕ Cancel Edit';
    cancelBtn.className   = 'btn btn-warning btn-small';
    cancelBtn.onclick = function () { clearForm(); };
    actionRow.appendChild(cancelBtn);
  }

  container.appendChild(actionRow);
}

function addViewRow() {
  sbViews.push({ label: '', image: '', audio: null, fog: false });
  renderViewList();
}

// ── Save ──────────────────────────────────────────────────────
function saveScene() {
  var tab   = elTab.value.trim();
  var label = elSceneLabel.value.trim();

  if (!tab || !label) {
    alert('Area name and Scene label are required.'); return;
  }
  var validViews = sbViews.filter(function (v) { return v.label && v.image; });
  if (!validViews.length) {
    alert('Add at least one map with a label and an image URL.'); return;
  }

  var sceneId = sbEditingId || (tab.toLowerCase().replace(/\s+/g, '-') + '-' +
    label.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now());
  var newScene = {
    id: sceneId, tab: tab, label: label,
    views: validViews.map(function (v, i) {
      return {
        id:    sceneId + '-view-' + i,
        label: v.label,
        image: v.image,
        audio: v.audio || null,
        fog:   v.fog === true
      };
    })
  };

  // Fetch current scenes, merge, then POST
  fetch('/api/scenes')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var currentScenes = data.scenes || [];
      var updated;
      if (sbEditingId) {
        updated = currentScenes.map(function (s) { return s.id === sbEditingId ? newScene : s; });
      } else {
        updated = currentScenes.concat([newScene]);
      }
      return fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes: updated })
      }).then(function (r) { return r.json().then(function (resp) { return { resp: resp, updated: updated }; }); });
    })
    .then(function (result) {
      if (!result.resp.ok) { showStatus('Error saving: ' + (result.resp.error || 'unknown'), 'err'); return; }
      sbAllScenes = result.updated;
      renderSidebarList();
      var wasEditing = !!sbEditingId;
      showStatus('✅ Scene "' + label + '" ' + (wasEditing ? 'updated!' : 'saved!'), 'ok');
      sbEditingId = null;
      elSceneLabel.value = '';
      sbViews = [];
      elFormTitle.textContent = 'New Scene';
      renderViewList();
    })
    .catch(function (e) { showStatus('Network error: ' + e.message, 'err'); });
}

// ── Helpers ───────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showStatus(msg, type) {
  if (!elStatusMsg) return;
  elStatusMsg.textContent = msg;
  elStatusMsg.className   = type === 'ok' ? 'ok' : 'err';
  elStatusMsg.style.display = 'block';
  clearTimeout(elStatusMsg._timer);
  elStatusMsg._timer = setTimeout(function () { elStatusMsg.style.display = 'none'; }, 4000);
}

// ── Preview panel ─────────────────────────────────────────────
var sbFocusedViewIdx = -1;

function updatePreview(idx) {
  var previewImg  = document.getElementById('sb-preview-img');
  var placeholder = document.getElementById('sb-preview-placeholder');
  var meta        = document.getElementById('sb-preview-meta');
  if (!previewImg || !placeholder || !meta) return;

  var view = sbViews[idx];
  if (!view || !view.image) {
    previewImg.style.display  = 'none';
    placeholder.style.display = '';
    meta.textContent = '';
    return;
  }
  previewImg.src = view.image;
  previewImg.style.display  = 'block';
  placeholder.style.display = 'none';

  var parts = [];
  if (view.label) parts.push('📍 ' + view.label);
  if (view.fog)   parts.push('🌫 Fog of War');
  if (view.audio) parts.push('🎵 ' + view.audio.split('/').pop());
  meta.textContent = parts.join('  ·  ');
}

// ── Drag-and-drop image upload ────────────────────────────────
(function () {
  var overlay = document.getElementById('sb-drop-overlay');
  if (!overlay) return;
  var dragDepth = 0;

  function isImageDrag(e) {
    return e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0;
  }

  document.body.addEventListener('dragenter', function (e) {
    if (!isImageDrag(e)) return;
    dragDepth++;
    overlay.style.display = 'flex';
    e.preventDefault();
  });
  document.body.addEventListener('dragover', function (e) {
    if (!isImageDrag(e)) return;
    e.preventDefault();
  });
  document.body.addEventListener('dragleave', function (e) {
    dragDepth--;
    if (dragDepth <= 0) { dragDepth = 0; overlay.style.display = 'none'; }
  });
  document.body.addEventListener('drop', function (e) {
    e.preventDefault();
    dragDepth = 0;
    overlay.style.display = 'none';
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    var allowed = ['.jpg','.jpeg','.png','.webp','.gif'];
    var ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (allowed.indexOf(ext) < 0) { alert('Only JPG, PNG, WebP and GIF files are supported.'); return; }

    var reader = new FileReader();
    reader.onload = function (ev) {
      fetch('/api/maps/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, data: ev.target.result })
      })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) { alert('Upload failed: ' + (d.error || 'unknown')); return; }
        var path = d.path || ('/assets/maps/' + file.name);
        // Fill the focused view row (or last row if none focused)
        var targetIdx = sbFocusedViewIdx >= 0 ? sbFocusedViewIdx : sbViews.length - 1;
        if (targetIdx >= 0 && sbViews[targetIdx]) {
          sbViews[targetIdx].image = path;
          renderViewList();
          updatePreview(targetIdx);
          showStatus('✅ Uploaded: ' + file.name, 'ok');
        }
      })
      .catch(function (e) { alert('Upload error: ' + e.message); });
    };
    reader.readAsDataURL(file);
  });
})();
