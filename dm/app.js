// ============================================================
//  DM Control Panel — app.js
// ============================================================

// ── State ────────────────────────────────────────────────────
var ws            = null;
var initiative    = [];
var currentTurn   = 0;
var isBlackout    = false;
var sceneData     = [];
var currentTab    = null;
var fogGrid       = null;
var fogRows       = 20;
var fogCols       = 20;
var fogMapUrl     = null;

// Scene Builder working state
var sbViews       = [];   // array of { label, image, audio }
var sbAudioList   = [];   // populated from /api/audio
var sbEditingId   = null; // id of scene being edited, or null for new

// Search state
var sceneSearchTerm = '';
var audioSearchTerm = '';
var sbCategories    = [];   // cached from /api/audio

// ── DOM refs ─────────────────────────────────────────────────
var statusDot    = document.getElementById('status-dot');
var clientCount  = document.getElementById('client-count');
var blackoutBtn  = document.getElementById('blackout-btn');
var clearBtn     = document.getElementById('clear-btn');
var sendTextBtn  = document.getElementById('send-text-btn');
var sendImageBtn = document.getElementById('send-image-btn');
var imageFile    = document.getElementById('image-file');
var imagePreview = document.getElementById('image-preview');
var diceResult   = document.getElementById('dice-result');
var initList     = document.getElementById('init-list');

// ============================================================
// WebSocket
// ============================================================
function connectWebSocket() {
  var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(protocol + '//' + window.location.host + '/ws');
  ws.onopen = function () {
    statusDot.classList.remove('off');
    statusDot.classList.add('on');
    ws.send(JSON.stringify({ action: 'dm-connect' }));
  };
  ws.onmessage = function (event) {
    var msg = JSON.parse(event.data);
    if (msg.type === 'clients') {
      clientCount.textContent = msg.count + ' connected';
    }
    if (msg.type === 'BLACKOUT') {
      isBlackout = true;
      blackoutBtn.classList.add('active');
    }
  };
  ws.onclose = function () {
    statusDot.classList.remove('on');
    statusDot.classList.add('off');
    setTimeout(connectWebSocket, 3000);
  };
  ws.onerror = function () {};
}

function wsSend(data) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
}

// ============================================================
// Quick Actions
// ============================================================
blackoutBtn.addEventListener('click', function () {
  fetch('/api/blackout', { method: 'POST' });
});
clearBtn.addEventListener('click', function () {
  fetch('/api/clear', { method: 'POST' });
  isBlackout = false;
  blackoutBtn.classList.remove('active');
});

// ============================================================
// Send Text
// ============================================================
sendTextBtn.addEventListener('click', function () {
  var label = document.getElementById('text-label').value.trim();
  var raw   = document.getElementById('text-content').value.trim();
  if (!raw) return;
  var html = raw.replace(/\n/g, '<br>');
  fetch('/api/overlay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: label || '', data: html, duration: 15000 })
  });
});

// ============================================================
// Send Image — auto-fill URL from file picker
// ============================================================
imageFile.addEventListener('change', function (e) {
  var file = e.target.files[0];
  if (!file) return;
  document.getElementById('image-url').value = '/assets/maps/' + file.name;
  imagePreview.innerHTML = '<img src="' + URL.createObjectURL(file) + '" />';
});

sendImageBtn.addEventListener('click', function () {
  var label = document.getElementById('image-label').value.trim();
  var url   = document.getElementById('image-url').value.trim();
  if (url) {
    sendImage(label || 'Image', url);
  } else if (imageFile.files[0]) {
    var reader = new FileReader();
    reader.onload = function (ev) { sendImage(label || imageFile.files[0].name, ev.target.result); };
    reader.readAsDataURL(imageFile.files[0]);
  }
});

function sendImage(label, src) {
  var html = '<div style="text-align:center;padding:1rem;"><img src="' + src +
    '" style="max-width:100%;max-height:60vh;border-radius:8px;" /></div>';
  fetch('/api/overlay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: label || '', data: html, duration: 20000 })
  });
}

// ============================================================
// Maps & Scenes Panel
// ============================================================
function autoIcon(name) {
  var n = (name || '').toLowerCase();
  if (/cave|mine|tunnel|underground|dungeon/.test(n)) return '🪨';
  if (/forest|woods|grove|tree|jungle/.test(n)) return '🌲';
  if (/town|village|city|inn|tavern|market|phandalin|shop/.test(n)) return '🏘️';
  if (/temple|shrine|church|chapel/.test(n)) return '⛪';
  if (/battle|war|combat|siege/.test(n)) return '⚔️';
  if (/sea|coast|ocean|river|lake|water/.test(n)) return '🌊';
  if (/castle|keep|tower|fort/.test(n)) return '🏰';
  if (/camp|wilderness|road|trail/.test(n)) return '⛺';
  if (/swamp|marsh|bog/.test(n)) return '🌿';
  if (/mountain|peak|cliff/.test(n)) return '🏔️';
  return '🗺️';
}

// Renders a single scene group (title row + view rows with chain dropdown)
function renderSceneGroup(container, scene, sIdx) {
  var sceneDiv = document.createElement('div');
  sceneDiv.className = 'scene-group';

  var titleRow = document.createElement('div');
  titleRow.className = 'scene-title';
  var firstViewImg = scene.views && scene.views.length ? scene.views[0].image : '';
  if (firstViewImg) {
    var sceneThumb = document.createElement('img');
    sceneThumb.src = firstViewImg;
    sceneThumb.style.cssText = 'width:32px;height:32px;object-fit:cover;border-radius:4px;flex-shrink:0;';
    titleRow.appendChild(sceneThumb);
  }
  titleRow.appendChild(document.createTextNode(scene.label));

  var delBtn = document.createElement('button');
  delBtn.textContent = '🗑';
  delBtn.title = 'Delete scene';
  delBtn.className = 'btn btn-danger btn-small';
  delBtn.style.marginLeft = 'auto';
  delBtn.onclick = (function (id) {
    return function () {
      if (!confirm('Delete "' + scene.label + '"?')) return;
      var remaining = sceneData.filter(function (s) { return s.id !== id; });
      fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes: remaining })
      }).then(function () { currentTab = null; renderScenesPanel(); });
    };
  })(scene.id);

  var editBtn = document.createElement('button');
  editBtn.textContent = '✏️';
  editBtn.title = 'Edit scene';
  editBtn.className = 'btn btn-secondary btn-small';
  editBtn.onclick = (function (si) {
    return function () { editScene(si); };
  })(sIdx);
  titleRow.appendChild(editBtn);
  titleRow.appendChild(delBtn);
  sceneDiv.appendChild(titleRow);

  scene.views.forEach(function (view, vIdx) {
    // In search mode, views may carry _origIdx (their position in the real scene.views array)
    var realVIdx = (view._origIdx !== undefined) ? view._origIdx : vIdx;
    var row = document.createElement('div');
    row.className = 'view-row';

    // Line 1: thumb + label + audio indicator
    var rowTop = document.createElement('div');
    rowTop.className = 'view-row-top';

    var thumb = document.createElement('img');
    thumb.src = view.image;
    thumb.className = 'view-thumb';
    rowTop.appendChild(thumb);

    var lbl = document.createElement('span');
    lbl.textContent = view.label;
    lbl.className = 'view-label';
    rowTop.appendChild(lbl);

    if (view.audio) {
      var audioIcon = document.createElement('span');
      audioIcon.textContent = '🎵';
      audioIcon.title = 'Ambience: ' + view.audio.split('/').pop();
      audioIcon.style.cssText = 'cursor:help;flex-shrink:0;font-size:0.9rem;';
      rowTop.appendChild(audioIcon);

      var loopToggle = document.createElement('button');
      var isLoop = view.audioLoop !== false;
      loopToggle.textContent = isLoop ? '🔁' : '▶️';
      loopToggle.title = isLoop ? 'Ambience loops — click to play once' : 'Ambience plays once — click to loop';
      loopToggle.className = 'btn btn-small';
      loopToggle.style.cssText = 'padding:0.1rem 0.3rem;font-size:0.75rem;background:transparent;border:1px solid #555;margin-left:2px;';
      loopToggle.onclick = (function (si, vi2, btn) {
        return function (e) {
          e.stopPropagation();
          var scene = sceneData[si];
          var v = scene.views[vi2];
          v.audioLoop = !(v.audioLoop !== false);
          btn.textContent = v.audioLoop ? '🔁' : '▶️';
          btn.title = v.audioLoop ? 'Ambience loops — click to play once' : 'Ambience plays once — click to loop';
          fetch('/api/scenes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scenes: sceneData })
          });
        };
      })(sIdx, realVIdx, loopToggle);
      rowTop.appendChild(loopToggle);
    }
    row.appendChild(rowTop);

    // Line 2: Show + fit toggle + chain dropdown
    var rowBtns = document.createElement('div');
    rowBtns.className = 'view-row-btns';

    var fitModes = ['contain', 'cover', 'fill'];
    var fitLabels = { contain: '📐 Fit', cover: '🔲 Cover', fill: '⬜ Fill' };
    var curFit = view.fit || 'contain';
    var fitBtn = document.createElement('button');
    fitBtn.textContent = fitLabels[curFit];
    fitBtn.title = 'Fit: contain (letterbox) | Cover: crop to fill | Fill: stretch';
    fitBtn.className = 'btn btn-small';
    fitBtn.style.cssText = 'font-size:0.7rem;background:transparent;border:1px solid #555;flex:none;width:auto;';
    fitBtn.onclick = (function (si, vi2, btn) {
      return function (e) {
        e.stopPropagation();
        var v = sceneData[si].views[vi2];
        var idx = fitModes.indexOf(v.fit || 'contain');
        v.fit = fitModes[(idx + 1) % fitModes.length];
        btn.textContent = fitLabels[v.fit];
        fetch('/api/scenes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenes: sceneData })
        });
      };
    })(sIdx, realVIdx, fitBtn);
    rowBtns.appendChild(fitBtn);

    var showBtn = document.createElement('button');
    showBtn.textContent = '▶ Show';
    showBtn.className = 'btn btn-primary btn-small';
    showBtn.onclick = (function (si, vi) {
      return function () { showSceneView(si, vi); };
    })(sIdx, realVIdx);
    rowBtns.appendChild(showBtn);

    // Chain dropdown — only show when scene has more than one view
    // Use the full original scene.views list so chain targets are always correct
    var originalViews = sceneData[sIdx] ? sceneData[sIdx].views : scene.views;
    if (originalViews.length > 1) {
      var chainSel = document.createElement('select');
      chainSel.className = 'chain-select';
      var defOpt = document.createElement('option');
      defOpt.value = '';
      defOpt.textContent = '⛓ Chain to…';
      chainSel.appendChild(defOpt);
      originalViews.forEach(function (v, vi2) {
        if (vi2 === realVIdx) return;
        var opt = document.createElement('option');
        opt.value = vi2;
        opt.textContent = v.label || ('Map ' + (vi2 + 1));
        chainSel.appendChild(opt);
      });
      rowBtns.appendChild(chainSel);

      var goBtn = document.createElement('button');
      goBtn.textContent = '→ Go';
      goBtn.className = 'btn btn-secondary btn-small';
      goBtn.onclick = (function (si, sel) {
        return function () {
          var vi = parseInt(sel.value);
          if (!isNaN(vi) && vi >= 0) showSceneView(si, vi);
        };
      })(sIdx, chainSel);
      rowBtns.appendChild(goBtn);
    }

    row.appendChild(rowBtns);
    sceneDiv.appendChild(row);
  });

  container.appendChild(sceneDiv);
}

function renderScenesPanel() {
  var term = (sceneSearchTerm || '').toLowerCase().trim();
  fetch('/api/scenes')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      sceneData = data.scenes || [];
      var mapList = document.getElementById('map-list');
      mapList.innerHTML = '';

      if (!sceneData.length) {
        mapList.innerHTML = '<p style="color:#888;font-size:0.85rem;">No scenes yet — use the Scene Builder below.</p>';
        return;
      }

      // ── Search mode: show matching scenes/views regardless of tab ──
      if (term) {
        var hits = [];
        sceneData.forEach(function (scene, sIdx) {
          var tabMatch   = (scene.tab   || '').toLowerCase().indexOf(term) !== -1;
          var labelMatch = (scene.label || '').toLowerCase().indexOf(term) !== -1;
          // If area or scene name matches → show whole scene with all views
          if (tabMatch || labelMatch) {
            hits.push({ scene: scene, sIdx: sIdx, filteredViews: null });
            return;
          }
          // Otherwise filter to only views whose label matches
          // Attach _origIdx so renderSceneGroup uses the correct index into sceneData
          var matchingViews = [];
          (scene.views || []).forEach(function (v, origIdx) {
            if ((v.label || '').toLowerCase().indexOf(term) !== -1) {
              var copy = Object.assign({}, v, { _origIdx: origIdx });
              matchingViews.push(copy);
            }
          });
          if (matchingViews.length) {
            hits.push({ scene: scene, sIdx: sIdx, filteredViews: matchingViews });
          }
        });

        if (!hits.length) {
          mapList.innerHTML = '<p style="color:#888;font-size:0.85rem;">No results for "' + sceneSearchTerm + '"</p>';
          return;
        }
        var totalViews = hits.reduce(function (n, h) {
          return n + (h.filteredViews ? h.filteredViews.length : (h.scene.views || []).length);
        }, 0);
        var info = document.createElement('div');
        info.style.cssText = 'font-size:0.75rem;color:#888;margin-bottom:0.5rem;';
        info.textContent = totalViews + ' map' + (totalViews !== 1 ? 's' : '') + ' in ' +
          hits.length + ' scene' + (hits.length !== 1 ? 's' : '') + ' for "' + sceneSearchTerm + '"';
        mapList.appendChild(info);
        hits.forEach(function (h) {
          // For view-only hits, render a synthetic scene with just the matching views
          var sceneToRender = h.filteredViews
            ? Object.assign({}, h.scene, { views: h.filteredViews })
            : h.scene;
          renderSceneGroup(mapList, sceneToRender, h.sIdx);
        });
        return;
      }

      // ── Normal tab mode ──
      var tabs = [];
      sceneData.forEach(function (s) {
        var t = s.tab || s.label;
        if (tabs.indexOf(t) === -1) tabs.push(t);
      });
      if (!currentTab || tabs.indexOf(currentTab) === -1) currentTab = tabs[0];

      var tabBar = document.createElement('div');
      tabBar.className = 'tab-bar';
      tabs.forEach(function (tab) {
        var firstImg = '';
        sceneData.forEach(function (s) {
          if ((s.tab || s.label) === tab && !firstImg && s.views && s.views.length) firstImg = s.views[0].image;
        });
        var btn = document.createElement('button');
        btn.className = 'btn btn-small tab-btn ' + (tab === currentTab ? 'btn-primary' : 'btn-secondary');
        if (firstImg) {
          var tImg = document.createElement('img');
          tImg.src = firstImg;
          tImg.style.cssText = 'width:22px;height:22px;object-fit:cover;border-radius:3px;margin-right:5px;vertical-align:middle;flex-shrink:0;';
          btn.appendChild(tImg);
        }
        btn.appendChild(document.createTextNode(tab));
        btn.onclick = function () { currentTab = tab; renderScenesPanel(); };
        tabBar.appendChild(btn);
      });
      mapList.appendChild(tabBar);

      sceneData.forEach(function (scene, sIdx) {
        if ((scene.tab || scene.label) !== currentTab) return;
        renderSceneGroup(mapList, scene, sIdx);
      });
    })
    .catch(function (e) {
      document.getElementById('map-list').textContent = 'Error loading scenes: ' + e.message;
    });
}

function showSceneView(sceneIdx, viewIdx) {
  var scene  = sceneData[sceneIdx];
  var view   = scene.views[viewIdx];
  var fogKey = view.id || (sceneIdx + '-' + viewIdx);
  var useFog = view.fog === true;

  // Pass fogKey so player can correlate fog updates
  wsSend({ action: 'show-scene-view', image: view.image, audio: view.audio || null, audioLoop: view.audioLoop !== false, fit: view.fit || 'contain', fogKey: useFog ? fogKey : null });

  // Only show fog controls if this view has fog enabled
  var fogContainer = document.getElementById('fog-controls-container');
  if (useFog) {
    renderFogControls(view.image, fogKey);
    // Send initial fog state immediately so player screen shows fog on Show
    sendFogUpdate(fogKey);
  } else {
    fogContainer.innerHTML = '';
  }
}

// ============================================================
// Audio Panel
// ============================================================
function renderAudioPanel() {
  fetch('/api/audio')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      sbAudioList  = data.audio      || [];
      sbCategories = data.categories || [];
      applyAudioDisplay();
    })
    .catch(function (e) {
      document.getElementById('audio-list').textContent = 'Error loading audio: ' + e.message;
    });
}

function applyAudioDisplay() {
  var term = (audioSearchTerm || '').toLowerCase().trim();
  var audioList = document.getElementById('audio-list');
  audioList.innerHTML = '';

  if (!sbCategories.length) {
    audioList.textContent = 'No audio found in public/assets/audio/';
    return;
  }

  sbCategories.forEach(function (group) {
    var catMatches = !term || group.cat.toLowerCase().indexOf(term) !== -1;

    // If category name matches, show all tracks; otherwise filter by track name
    var matchingFiles = group.files.filter(function (url) {
      if (catMatches) return true;
      var name = url.split('/').pop();
      var dash = name.indexOf(' - ');
      var displayName = dash > 0 ? name.slice(dash + 3) : name;
      displayName = displayName.replace(/\.[^/.]+$/, '').toLowerCase();
      return displayName.indexOf(term) !== -1;
    });
    if (!matchingFiles.length) return;

    var hdr = document.createElement('div');
    hdr.className = 'audio-cat-hdr';
    hdr.innerHTML = '<span class="audio-cat-arrow">▼</span> ' + group.cat +
      ' <span style="color:#555;font-size:0.72rem;">(' + matchingFiles.length + ')</span>';
    audioList.appendChild(hdr);

    var section = document.createElement('div');
    section.className = 'audio-cat-body';

    matchingFiles.forEach(function (url) {
      var name = url.split('/').pop();
      var dash = name.indexOf(' - ');
      var displayName = dash > 0 ? name.slice(dash + 3) : name;
      displayName = displayName.replace(/\.[^/.]+$/, '');

      var row = document.createElement('div');
      row.className = 'audio-row';

      var lbl = document.createElement('span');
      lbl.textContent = displayName;
      lbl.className = 'audio-label';
      row.appendChild(lbl);

      var preview = document.createElement('audio');
      preview.src = url;
      preview.controls = true;
      preview.className = 'audio-preview';
      row.appendChild(preview);

      var btn = document.createElement('button');
      btn.textContent = '→ Loop';
      btn.title = 'Send to player screen (loops)';
      btn.className = 'btn btn-secondary btn-small audio-play-btn';
      btn.onclick = (function (u) {
        return function () { broadcastAudio(u, true); };
      })(url);
      row.appendChild(btn);

      var btnOnce = document.createElement('button');
      btnOnce.textContent = '→ Once';
      btnOnce.title = 'Send to player screen (plays once)';
      btnOnce.className = 'btn btn-secondary btn-small audio-play-btn';
      btnOnce.onclick = (function (u) {
        return function () { broadcastAudio(u, false); };
      })(url);
      row.appendChild(btnOnce);

      section.appendChild(row);
    });

    audioList.appendChild(section);

    hdr.addEventListener('click', function () {
      var collapsed = section.style.display === 'none';
      section.style.display = collapsed ? '' : 'none';
      hdr.querySelector('.audio-cat-arrow').textContent = collapsed ? '▼' : '▶';
    });
  });
}

function broadcastAudio(url, loop) {
  wsSend({ action: 'play-audio', url: url, loop: loop !== false });
}

document.getElementById('stop-audio-btn').addEventListener('click', function () {
  fetch('/api/stopaudio', { method: 'POST' });
  // Also stop any locally-playing audio preview elements in the DM panel
  document.querySelectorAll('#audio-list audio').forEach(function (a) {
    a.pause();
    a.currentTime = 0;
  });
});

// ============================================================
// Fog of War Controls
// ============================================================
function renderFogControls(mapUrl, fogKey) {
  fogMapUrl = mapUrl;
  if (!window.fogStates) window.fogStates = {};
  if (!window.fogStates[fogKey]) {
    window.fogStates[fogKey] = [];
    for (var r = 0; r < fogRows; r++) {
      window.fogStates[fogKey].push([]);
      for (var c = 0; c < fogCols; c++) {
        window.fogStates[fogKey][r].push(false);
      }
    }
  }
  fogGrid = window.fogStates[fogKey];

  var container = document.getElementById('fog-controls-container');
  container.innerHTML = '';

  var title = document.createElement('div');
  title.textContent = 'Fog of War — click cells to reveal (transparent) or hide (black)';
  title.style.cssText = 'margin:0.75rem 0 0.4rem;font-size:0.8rem;color:#888;';
  container.appendChild(title);

  // Map preview with fog grid overlaid
  var mapWrap = document.createElement('div');
  mapWrap.style.cssText = 'position:relative;display:inline-block;max-width:100%;margin-bottom:0.5rem;border:1px solid #444;';

  var mapImg = document.createElement('img');
  mapImg.src = mapUrl;
  mapImg.style.cssText = 'display:block;max-width:100%;max-height:340px;object-fit:contain;user-select:none;pointer-events:none;';
  mapWrap.appendChild(mapImg);

  var grid = document.createElement('div');
  grid.style.cssText = 'position:absolute;inset:0;display:grid;' +
    'grid-template-columns:repeat(' + fogCols + ',1fr);' +
    'grid-template-rows:repeat(' + fogRows + ',1fr);';

  for (var row = 0; row < fogRows; row++) {
    for (var col = 0; col < fogCols; col++) {
      (function (r, c) {
        var cell = document.createElement('div');
        cell.style.cssText = 'cursor:pointer;box-sizing:border-box;border:1px solid rgba(255,255,255,0.08);background:' +
          (fogGrid[r][c] ? 'transparent' : 'rgba(0,0,0,0.85)') + ';transition:background 0.15s;';
        cell.onclick = function () {
          fogGrid[r][c] = !fogGrid[r][c];
          cell.style.background = fogGrid[r][c] ? 'transparent' : 'rgba(0,0,0,0.85)';
          sendFogUpdate(fogKey);
        };
        grid.appendChild(cell);
      })(row, col);
    }
  }
  mapWrap.appendChild(grid);
  container.appendChild(mapWrap);

  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:0.5rem;';

  var clearFogBtn = document.createElement('button');
  clearFogBtn.textContent = 'Clear Fog';
  clearFogBtn.className = 'btn btn-warning';
  clearFogBtn.onclick = function () {
    window.fogStates[fogKey] = [];
    for (var r = 0; r < fogRows; r++) {
      window.fogStates[fogKey].push([]);
      for (var c = 0; c < fogCols; c++) window.fogStates[fogKey][r].push(false);
    }
    renderFogControls(fogMapUrl, fogKey);
    sendFogUpdate(fogKey);
  };
  btnRow.appendChild(clearFogBtn);

  var revealBtn = document.createElement('button');
  revealBtn.textContent = 'Reveal All';
  revealBtn.className = 'btn btn-secondary';
  revealBtn.onclick = function () {
    window.fogStates[fogKey] = [];
    for (var r = 0; r < fogRows; r++) {
      window.fogStates[fogKey].push([]);
      for (var c = 0; c < fogCols; c++) window.fogStates[fogKey][r].push(true);
    }
    renderFogControls(fogMapUrl, fogKey);
    sendFogUpdate(fogKey);
  };
  btnRow.appendChild(revealBtn);

  container.appendChild(btnRow);
}

function sendFogUpdate(fogKey) {
  if (ws && ws.readyState === 1 && fogMapUrl) {
    wsSend({ action: 'update-fog', mapUrl: fogMapUrl, fogGrid: fogGrid, fogKey: fogKey });
  }
}

// ============================================================
// Scene Builder
// ============================================================
function initSceneBuilder() {
  sbViews = [];
  var newSceneBtn = document.getElementById('sb-new-scene-btn');
  if (newSceneBtn) newSceneBtn.onclick = startNewScene;
  renderSceneBuilderList();
}

function startNewScene() {
  var tab   = document.getElementById('sb-tab').value.trim();
  var label = document.getElementById('sb-scene-label').value.trim();
  if (!tab || !label) {
    alert('Please enter an Area name and a Scene label first.');
    return;
  }
  sbViews = [];
  renderSceneBuilderList();
  // Immediately add first empty view row
  addViewRow();
}

function renderSceneBuilderList() {
  var container = document.getElementById('sb-scene-list');
  container.innerHTML = '';

  if (!sbViews.length) {
    container.innerHTML = '<p style="color:#888;font-size:0.85rem;margin:0.5rem 0;">Enter an Area and Scene name above, then click <strong>+ New Scene</strong> to start adding maps.</p>';
    return;
  }

  // Breadcrumb showing current area › scene
  var tab   = document.getElementById('sb-tab').value.trim();
  var label = document.getElementById('sb-scene-label').value.trim();
  if (tab || label) {
    var crumb = document.createElement('div');
    crumb.style.cssText = 'font-size:0.78rem;color:#888;margin-bottom:0.5rem;';
    crumb.innerHTML = '<span style="color:#d4af37">' + (tab || '…') + '</span> › <span style="color:#d4af37">' + (label || '…') + '</span> › Maps';
    container.appendChild(crumb);
  }

  sbViews.forEach(function (view, idx) {
    var row = document.createElement('div');
    row.className = 'sb-view-row';

    // ── Row header: Map N + remove ──────────────────────────
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
      return function () { sbViews.splice(i, 1); renderSceneBuilderList(); };
    })(idx);
    rowHdr.appendChild(removeBtn);
    row.appendChild(rowHdr);

    // ── Line 1: label + image URL ───────────────────────────
    var line1 = document.createElement('div');
    line1.className = 'sb-row-line';

    var labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = view.label || '';
    labelInput.placeholder = 'Map label (e.g. Ground Floor)';
    labelInput.className = 'sb-input';
    labelInput.oninput = function () { sbViews[idx].label = labelInput.value; };
    line1.appendChild(labelInput);

    var imgInput = document.createElement('input');
    imgInput.type = 'text';
    imgInput.value = view.image || '';
    imgInput.placeholder = 'Image URL (auto-filled below)';
    imgInput.className = 'sb-input';
    imgInput.oninput = function () { sbViews[idx].image = imgInput.value; };
    line1.appendChild(imgInput);
    row.appendChild(line1);

    // ── Line 2: file picker + thumb + audio + fog ──────────
    var line2 = document.createElement('div');
    line2.className = 'sb-row-line';

    var filePicker = document.createElement('input');
    filePicker.type = 'file';
    filePicker.accept = '.jpg,.jpeg,.png,.webp,.gif';
    filePicker.className = 'sb-file-pick';
    filePicker.onchange = function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var url = '/assets/maps/' + file.name;
      imgInput.value     = url;
      sbViews[idx].image = url;
      thumb.src = URL.createObjectURL(file);
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
    audioSel.onchange = function () { sbViews[idx].audio = audioSel.value || null; };
    line2.appendChild(audioSel);

    var fogLabel = document.createElement('label');
    fogLabel.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:0.78rem;color:#999;white-space:nowrap;cursor:pointer;margin:0;';
    var fogCheck = document.createElement('input');
    fogCheck.type = 'checkbox';
    fogCheck.checked = view.fog === true;
    fogCheck.onchange = function () { sbViews[idx].fog = fogCheck.checked; };
    fogLabel.appendChild(fogCheck);
    fogLabel.appendChild(document.createTextNode('🌫 Fog'));
    line2.appendChild(fogLabel);

    row.appendChild(line2);
    container.appendChild(row);
  });

  // Add View + Save buttons
  var actionRow = document.createElement('div');
  actionRow.className = 'sb-action-row';

  var addViewBtn = document.createElement('button');
  addViewBtn.textContent = '➕ Add Map';
  addViewBtn.className = 'btn btn-secondary btn-small';
  addViewBtn.onclick = addViewRow;
  actionRow.appendChild(addViewBtn);

  var saveBtn = document.createElement('button');
  saveBtn.textContent = sbEditingId ? '💾 Update Scene' : '💾 Save Scene';
  saveBtn.className = 'btn btn-primary btn-small';
  saveBtn.onclick = saveScene;
  actionRow.appendChild(saveBtn);

  if (sbEditingId) {
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = '✕ Cancel Edit';
    cancelBtn.className = 'btn btn-warning btn-small';
    cancelBtn.onclick = function () {
      sbEditingId = null;
      sbViews = [];
      document.getElementById('sb-scene-label').value = '';
      renderSceneBuilderList();
    };
    actionRow.appendChild(cancelBtn);
  }

  container.appendChild(actionRow);
}

function addViewRow() {
  sbViews.push({ label: '', image: '', audio: null, fog: false });
  renderSceneBuilderList();
}

function editScene(sceneIdx) {
  var scene = sceneData[sceneIdx];
  sbEditingId = scene.id;
  document.getElementById('sb-tab').value   = scene.tab   || '';
  document.getElementById('sb-scene-label').value = scene.label || '';
  // Deep-copy views so edits don't affect original until saved
  sbViews = scene.views.map(function (v) {
    return { label: v.label, image: v.image, audio: v.audio || null, fog: v.fog === true };
  });
  renderSceneBuilderList();
  // Scroll Scene Builder into view
  var sb = document.getElementById('sb-scene-list');
  if (sb) sb.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function saveScene() {
  var tab   = document.getElementById('sb-tab').value.trim();
  var label = document.getElementById('sb-scene-label').value.trim();

  if (!tab || !label) {
    alert('Area name and Scene label are required.'); return;
  }
  var validViews = sbViews.filter(function (v) { return v.label && v.image; });
  if (!validViews.length) {
    alert('Add at least one view with a label and an image URL.'); return;
  }

  // Build scene object
  var sceneId = sbEditingId || (tab.toLowerCase().replace(/\s+/g, '-') + '-' +
    label.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now());
  var newScene = {
    id: sceneId, tab: tab, label: label,
    views: validViews.map(function (v, i) {
      return {
        id: sceneId + '-view-' + i,
        label: v.label,
        image: v.image,
        audio: v.audio || null,
        fog: v.fog === true
      };
    })
  };

  var updatedScenes;
  if (sbEditingId) {
    // Replace existing scene in-place
    updatedScenes = sceneData.map(function (s) { return s.id === sbEditingId ? newScene : s; });
  } else {
    updatedScenes = sceneData.concat([newScene]);
  }

  fetch('/api/scenes')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var currentScenes = data.scenes || [];
      var updatedScenes;
      if (sbEditingId) {
        updatedScenes = currentScenes.map(function (s) { return s.id === sbEditingId ? newScene : s; });
      } else {
        updatedScenes = currentScenes.concat([newScene]);
      }
      return fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes: updatedScenes })
      });
    })
    .then(function (r) { return r.json(); })
    .then(function (resp) {
      if (!resp.ok) { alert('Error saving: ' + (resp.error || 'unknown')); return; }
      alert('✅ Scene "' + label + '" ' + (sbEditingId ? 'updated!' : 'saved!'));
      sbEditingId = null;
      // Reset builder — keep Area name so DM can add another scene to same area
      document.getElementById('sb-scene-label').value = '';
      sbViews = [];
      renderSceneBuilderList();
      // Switch to the new tab and refresh
      currentTab = tab;
      renderScenesPanel();
    })
    .catch(function (e) { alert('Network error: ' + e.message); });
}

// ============================================================
// Dice Roller
// ============================================================
document.querySelectorAll('.btn-dice').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var die  = parseInt(btn.getAttribute('data-die'));
    var roll = Math.floor(Math.random() * die) + 1;
    diceResult.textContent = 'D' + die + ': ' + roll;
    if (document.getElementById('dice-broadcast').checked) {
      var html = '<div style="text-align:center;font-size:3.5rem;padding:1rem;color:#d4af37;">🎲 d' +
        die + ': <strong>' + roll + '</strong></div>';
      fetch('/api/overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Dice Roll', data: html, duration: 8000 })
      });
    }
  });
});

// ============================================================
// Initiative Tracker
// ============================================================
document.getElementById('init-add-btn').addEventListener('click', function () {
  var name = document.getElementById('init-name').value.trim();
  var roll = parseInt(document.getElementById('init-roll').value);
  if (!name || isNaN(roll)) return;
  initiative.push({ name: name, roll: roll });
  initiative.sort(function (a, b) { return b.roll - a.roll; });
  currentTurn = 0;
  renderInitiative();
  document.getElementById('init-name').value = '';
  document.getElementById('init-roll').value = '';
});

document.getElementById('init-clear-btn').addEventListener('click', function () {
  initiative = []; currentTurn = 0; renderInitiative();
});

document.getElementById('init-next-btn').addEventListener('click', function () {
  if (!initiative.length) return;
  currentTurn = (currentTurn + 1) % initiative.length;
  renderInitiative();
  sendInitiative();
});

document.getElementById('init-send-btn').addEventListener('click', sendInitiative);

function renderInitiative() {
  var html = '';
  for (var i = 0; i < initiative.length; i++) {
    var active = i === currentTurn ? ' active-turn' : '';
    html += '<div class="init-entry' + active + '">' +
      '<span class="init-order">' + initiative[i].roll + '</span>' +
      '<span class="init-entry-name">' + initiative[i].name + '</span>' +
      '<button class="init-remove" onclick="removeInit(' + i + ')">&#x2715;</button></div>';
  }
  initList.innerHTML = html;
}

window.removeInit = function (i) {
  initiative.splice(i, 1);
  if (currentTurn >= initiative.length) currentTurn = 0;
  renderInitiative();
};

function sendInitiative() {
  if (!initiative.length) return;
  var html = '<div style="max-width:400px;margin:0 auto;">' +
    '<h2 style="text-align:center;color:#d4af37;margin-bottom:1rem;">⚔️ Initiative Order</h2>';
  for (var i = 0; i < initiative.length; i++) {
    var active = i === currentTurn;
    html += '<div style="display:flex;gap:0.75rem;padding:0.6rem 1rem;margin-bottom:0.35rem;' +
      'background:' + (active ? '#1a1a2e' : '#111') + ';border:1px solid ' +
      (active ? '#d4af37' : '#333') + ';border-radius:4px;">' +
      '<span style="color:#d4af37;font-weight:bold;min-width:30px;">' + initiative[i].roll + '</span>' +
      '<span style="flex:1;' + (active ? 'color:#d4af37;font-weight:bold;' : '') + '">' +
      initiative[i].name + (active ? ' ⬅️' : '') + '</span></div>';
  }
  html += '</div>';
  fetch('/api/overlay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Initiative Order', data: html, duration: 12000 })
  });
}

// ============================================================
// Search — Maps & Audio
// ============================================================
document.getElementById('map-search').addEventListener('input', function () {
  sceneSearchTerm = this.value.trim();
  renderScenesPanel();
});

document.getElementById('audio-search').addEventListener('input', function () {
  audioSearchTerm = this.value.trim();
  applyAudioDisplay();
});

// ============================================================
// Boot
// ============================================================
connectWebSocket();
renderScenesPanel();
renderAudioPanel();
initSceneBuilder();
