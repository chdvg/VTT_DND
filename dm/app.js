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
var activeFogKey  = null;

// Token overlay state
var tokenState         = {};     // mapKey -> array of {id,x,y,color,label}
var activeTokenMapKey  = null;
var selectedTokenColor = 'red';
var selectedPlayerName = null;
var activeTokenMapUrl  = null;

// Draw / Annotation state
var drawStrokes          = {};    // mapKey -> [{color, width, erase, points:[{x,y}]}]
var activeDrawMapKey     = null;
var drawTool             = { color: '#ef4444', width: 0.006, erase: false };
var drawControlsExpanded = false;
var drawModeActive       = false; // true = annotations canvas active on token map

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
      isBlackout = msg.active;
      blackoutBtn.classList.toggle('active', !!msg.active);
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
// Send Image — populate map library dropdown
// ============================================================
(function loadMapDropdown() {
  fetch('/api/maps')
    .then(function (r) { return r.json(); })
    .catch(function () { return { maps: [] }; })
    .then(function (data) {
      var sel = document.getElementById('image-map-select');
      if (!sel) return;
      (data.maps || []).forEach(function (url) {
        var label = url.split('/').pop().replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
        var opt = document.createElement('option');
        opt.value = url;
        opt.textContent = label;
        sel.appendChild(opt);
      });
    });
})();

document.getElementById('image-map-select').addEventListener('change', function () {
  var url = this.value;
  if (!url) return;
  document.getElementById('image-url').value = url;
  imagePreview.innerHTML = '<img src="' + url + '" />';
  // Clear file picker so it doesn't conflict
  imageFile.value = '';
});

// ============================================================
// Send Image — auto-fill URL from file picker
// ============================================================
imageFile.addEventListener('change', function (e) {
  var file = e.target.files[0];
  if (!file) return;
  // Clear dropdown so it doesn't conflict
  var sel = document.getElementById('image-map-select');
  if (sel) sel.value = '';
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

  // Persist collapsed state per scene id across re-renders
  var collapseKey = 'scene-collapsed-' + (scene.id || sIdx);
  var isCollapsed = sessionStorage.getItem(collapseKey) === '1';

  var titleRow = document.createElement('div');
  titleRow.className = 'scene-title';
  titleRow.style.cursor = 'pointer';
  titleRow.title = 'Click to collapse / expand';

  // Chevron
  var chev = document.createElement('span');
  chev.style.cssText = 'font-size:0.6rem;color:#888;margin-right:4px;display:inline-block;transition:transform 0.15s;flex-shrink:0;';
  chev.textContent = '▾';
  if (isCollapsed) chev.style.transform = 'rotate(-90deg)';
  titleRow.appendChild(chev);
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
  var sceneActions = document.createElement('div');
  sceneActions.className = 'scene-actions';
  sceneActions.appendChild(editBtn);
  sceneActions.appendChild(delBtn);
  titleRow.appendChild(sceneActions);
  sceneDiv.appendChild(titleRow);

  // Views wrapper — collapsible
  var viewsWrap = document.createElement('div');
  viewsWrap.style.display = isCollapsed ? 'none' : '';

  // Toggle on title click (but not on action buttons)
  titleRow.addEventListener('click', function (e) {
    if (e.target.closest('.btn')) return;
    var nowCollapsed = viewsWrap.style.display !== 'none';
    viewsWrap.style.display = nowCollapsed ? 'none' : '';
    chev.style.transform = nowCollapsed ? 'rotate(-90deg)' : '';
    sessionStorage.setItem(collapseKey, nowCollapsed ? '1' : '0');
  });

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

    if (view.fog) {
      var fogIcon = document.createElement('span');
      fogIcon.textContent = '🌫️';
      fogIcon.title = 'Fog of War enabled';
      fogIcon.style.cssText = 'cursor:help;flex-shrink:0;font-size:0.9rem;';
      rowTop.appendChild(fogIcon);
    }

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
    viewsWrap.appendChild(row);
  });

  sceneDiv.appendChild(viewsWrap);
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
        btn.onclick = function () {
          if (activeFogKey) {
            wsSend({ action: 'update-fog', fogKey: activeFogKey, fogGrid: null });
            activeFogKey = null;
          }
          document.getElementById('fog-controls-container').innerHTML = '';
          document.getElementById('token-controls-container').innerHTML = '';
          var dcEl = document.getElementById('draw-controls-container');
          if (dcEl) dcEl.innerHTML = '';
          var mcg = document.getElementById('map-control-grid');
          if (mcg) mcg.style.display = 'none';
          var mct = document.getElementById('map-control-title');
          if (mct) mct.textContent = 'no map active';
          currentTab = tab;
          renderScenesPanel();
        };
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
  var newFogKey = useFog ? fogKey : null;

  // If switching away from a fog scene, clear the player's fog overlay
  if (activeFogKey && activeFogKey !== newFogKey) {
    wsSend({ action: 'update-fog', fogKey: activeFogKey, fogGrid: null });
  }
  activeFogKey = newFogKey;

  // Stop any playing audio before switching scene view
  wsSend({ action: 'stop-audio' });

  // Pass fogKey (fog) and mapKey (tokens) so player can correlate overlays
  wsSend({ action: 'show-scene-view', image: view.image, audio: view.audio || null, audioLoop: view.audioLoop !== false, fit: view.fit || 'contain', fogKey: useFog ? fogKey : null, mapKey: fogKey });

  // Only show fog controls if this view has fog enabled
  var fogContainer = document.getElementById('fog-controls-container');
  if (useFog) {
    renderFogControls(view.image, fogKey);
    // Send initial fog state immediately so player screen shows fog on Show
    sendFogUpdate(fogKey);
  } else {
    fogContainer.innerHTML = '';
  }

  // Always show token controls for the active map
  renderTokenControls(view.image, fogKey);
  // Immediately sync tokens for this map (may be empty, which clears any old tokens on players)
  sendTokenUpdate(fogKey);

  // Draw / annotation controls — reset collapsed state on new map
  if (activeDrawMapKey !== fogKey) { drawControlsExpanded = false; drawModeActive = false; }
  renderDrawControls(view.image, fogKey);
  sendDrawUpdate(fogKey);

  // Show the Map Control panel and label it with the view name
  var mapControlGrid  = document.getElementById('map-control-grid');
  var mapControlTitle = document.getElementById('map-control-title');
  if (mapControlGrid)  { mapControlGrid.style.display = 'grid'; }
  if (mapControlTitle) { mapControlTitle.textContent = view.label || 'Active Map'; }
}

// ============================================================
// Draw / Annotation Controls
// ============================================================
function sendDrawUpdate(mapKey) {
  wsSend({ action: 'update-drawing', strokes: drawStrokes[mapKey] || [], mapKey: mapKey });
}

function renderDrawControls(mapUrl, mapKey) {
  activeDrawMapKey = mapKey;
  if (!drawStrokes[mapKey]) drawStrokes[mapKey] = [];

  var container = document.getElementById('draw-controls-container');
  if (!container) return;
  container.innerHTML = '';

  // ── Header row with Draw Mode toggle ─────────────────────────
  var strokeCount = (drawStrokes[mapKey] || []).length;
  var headerRow = document.createElement('div');
  headerRow.style.cssText = 'display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;' +
    'padding:0.5rem 0;border-top:1px solid #21262d;';

  var strokeBadge = strokeCount
    ? '<span style="color:#facc15;font-size:0.7rem;margin-left:0.25rem;">(' + strokeCount + ' stroke' + (strokeCount !== 1 ? 's' : '') + ')</span>'
    : '';
  var headerLabel = document.createElement('span');
  headerLabel.style.cssText = 'color:#aaa;font-size:0.8rem;user-select:none;';
  headerLabel.innerHTML = '✏️ Annotations' + strokeBadge;
  headerRow.appendChild(headerLabel);

  // Draw mode toggle button — activates/deactivates the canvas on the token map
  var drawToggleBtn = document.createElement('button');
  drawToggleBtn.textContent = drawModeActive ? '🖊 Draw Mode ON' : '🖊 Draw Mode OFF';
  drawToggleBtn.style.cssText = [
    'flex:none', 'white-space:nowrap', 'padding:0.25rem 0.75rem',
    'font-size:0.78rem', 'font-weight:bold', 'border-radius:4px', 'cursor:pointer',
    'border:2px solid ' + (drawModeActive ? '#facc15' : '#555'),
    'color:' + (drawModeActive ? '#facc15' : '#888'),
    'background:' + (drawModeActive ? 'rgba(250,204,21,0.12)' : 'transparent'),
    drawModeActive ? 'box-shadow:0 0 6px rgba(250,204,21,0.4)' : ''
  ].join(';') + ';';
  drawToggleBtn.onclick = function () {
    drawModeActive = !drawModeActive;
    renderTokenControls(mapUrl, mapKey);
    renderDrawControls(mapUrl, mapKey);
  };
  headerRow.appendChild(drawToggleBtn);

  container.appendChild(headerRow);
  if (!drawModeActive) return; // tools only shown when draw mode is on

  // ── Tool row ─────────────────────────────────────────────────
  var toolRow = document.createElement('div');
  toolRow.style.cssText = 'display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.4rem;align-items:center;';

  var colorOpts = [
    { color: '#ef4444', label: '🔴 Red'    },
    { color: '#facc15', label: '🟡 Yellow' },
    { color: '#ffffff', label: '⚪ White'  },
    { color: '#38bdf8', label: '🔵 Cyan'   },
    { color: '#4ade80', label: '🟢 Green'  },
  ];
  colorOpts.forEach(function (opt) {
    var btn = document.createElement('button');
    btn.textContent = opt.label;
    var isActive = !drawTool.erase && drawTool.color === opt.color;
    btn.style.cssText = [
      'flex:none', 'white-space:nowrap', 'padding:0.25rem 0.65rem',
      'font-size:0.78rem', 'font-weight:bold', 'border-radius:4px',
      'border:2px solid ' + opt.color, 'cursor:pointer', 'color:#fff',
      'background:' + (isActive ? opt.color : 'rgba(0,0,0,0.4)'),
      isActive ? 'box-shadow:0 0 7px ' + opt.color : ''
    ].join(';') + ';';
    btn.onclick = function () { drawTool.color = opt.color; drawTool.erase = false; renderDrawControls(mapUrl, mapKey); };
    toolRow.appendChild(btn);
  });

  // Eraser
  var eraserBtn = document.createElement('button');
  eraserBtn.textContent = '🧹 Erase';
  var eraserActive = drawTool.erase;
  eraserBtn.style.cssText = [
    'flex:none', 'white-space:nowrap', 'padding:0.25rem 0.65rem',
    'font-size:0.78rem', 'font-weight:bold', 'border-radius:4px',
    'border:2px solid #888', 'cursor:pointer', 'color:#fff',
    'background:' + (eraserActive ? '#555' : 'rgba(0,0,0,0.4)'),
    eraserActive ? 'box-shadow:0 0 7px #aaa' : ''
  ].join(';') + ';';
  eraserBtn.onclick = function () { drawTool.erase = true; renderDrawControls(mapUrl, mapKey); };
  toolRow.appendChild(eraserBtn);

  var sep = document.createElement('span');
  sep.style.cssText = 'color:#444;margin:0 0.25rem;';
  sep.textContent = '|';
  toolRow.appendChild(sep);

  // Width buttons
  [{ label: '— Thin', val: 0.003 }, { label: '— Med', val: 0.007 }, { label: '— Thick', val: 0.015 }].forEach(function (w) {
    var btn = document.createElement('button');
    btn.textContent = w.label;
    var isActive = drawTool.width === w.val;
    btn.style.cssText = [
      'flex:none', 'padding:0.25rem 0.55rem', 'font-size:0.78rem',
      'border-radius:4px', 'cursor:pointer', 'color:#ccc',
      'border:1px solid ' + (isActive ? '#aaa' : '#555'),
      'background:' + (isActive ? '#374151' : 'transparent')
    ].join(';') + ';';
    btn.onclick = function () { drawTool.width = w.val; renderDrawControls(mapUrl, mapKey); };
    toolRow.appendChild(btn);
  });

  // Undo + Clear
  var undoBtn = document.createElement('button');
  undoBtn.textContent = '↩ Undo';
  undoBtn.className = 'btn btn-secondary btn-small';
  undoBtn.style.cssText = 'margin-left:auto;flex:none;white-space:nowrap;';
  undoBtn.onclick = function () {
    if (drawStrokes[mapKey] && drawStrokes[mapKey].length) {
      drawStrokes[mapKey].pop();
      sendDrawUpdate(mapKey);
      renderDrawControls(mapUrl, mapKey);
    }
  };
  toolRow.appendChild(undoBtn);

  var clearBtn = document.createElement('button');
  clearBtn.textContent = '🗑 Clear';
  clearBtn.className = 'btn btn-danger btn-small';
  clearBtn.style.cssText = 'flex:none;white-space:nowrap;';
  clearBtn.onclick = function () {
    drawStrokes[mapKey] = [];
    sendDrawUpdate(mapKey);
    renderDrawControls(mapUrl, mapKey);
  };
  toolRow.appendChild(clearBtn);
  container.appendChild(toolRow);
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
  title.textContent = 'Fog of War — click or drag to reveal/hide cells';
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

  // Paint-brush state: track whether mouse is held and what value we're painting
  var isPainting = false;
  var paintValue = true; // true = reveal, false = hide

  // Throttle WebSocket sends while dragging
  var fogSendTimer = null;
  function scheduleFogUpdate() {
    if (fogSendTimer) return;
    fogSendTimer = setTimeout(function () {
      fogSendTimer = null;
      sendFogUpdate(fogKey);
    }, 60);
  }

  function paintCell(cell, r, c) {
    if (fogGrid[r][c] === paintValue) return; // already this value, skip
    fogGrid[r][c] = paintValue;
    cell.style.background = paintValue ? 'transparent' : 'rgba(0,0,0,0.85)';
    scheduleFogUpdate();
  }

  document.addEventListener('mouseup', function () { isPainting = false; });

  for (var row = 0; row < fogRows; row++) {
    for (var col = 0; col < fogCols; col++) {
      (function (r, c) {
        var cell = document.createElement('div');
        cell.style.cssText = 'cursor:crosshair;box-sizing:border-box;border:1px solid rgba(255,255,255,0.08);background:' +
          (fogGrid[r][c] ? 'transparent' : 'rgba(0,0,0,0.85)') + ';transition:background 0.1s;';

        cell.addEventListener('mousedown', function (e) {
          e.preventDefault();
          isPainting = true;
          // Paint mode is opposite of current cell value (toggle on first touch)
          paintValue = !fogGrid[r][c];
          paintCell(cell, r, c);
        });

        cell.addEventListener('mouseenter', function () {
          if (isPainting) paintCell(cell, r, c);
        });

        grid.appendChild(cell);
      })(row, col);
    }
  }
  mapWrap.appendChild(grid);
  container.appendChild(mapWrap);

  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:0.5rem;';

  var clearFogBtn = document.createElement('button');
  clearFogBtn.textContent = 'Hide All';
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
// Mob Token Overlay
// ============================================================
function tokenCssColor(color) {
  return color === 'red' ? '#dc2626'
       : color === 'blue' ? '#2563eb'
       : color === 'green' ? '#16a34a'
       : '#ca8a04';
}

function sendTokenUpdate(mapKey) {
  wsSend({ action: 'update-tokens', tokens: tokenState[mapKey] || [], mapKey: mapKey });
}

function renderTokenControls(mapUrl, mapKey) {
  activeTokenMapKey = mapKey;
  activeTokenMapUrl = mapUrl;
  if (!tokenState[mapKey]) tokenState[mapKey] = [];

  var container = document.getElementById('token-controls-container');
  container.innerHTML = '';

  var title = document.createElement('div');
  title.style.cssText = 'margin:0.75rem 0 0.4rem;font-size:0.8rem;color:#888;';
  title.textContent = 'Mob Tokens — click map to place, click token to remove';
  container.appendChild(title);

  // Color picker buttons
  var colorRow = document.createElement('div');
  colorRow.style.cssText = 'display:flex;gap:0.5rem;margin-bottom:0.5rem;flex-wrap:wrap;';
  [
    { color: 'red',    label: '🔴 Enemy'   },
    { color: 'blue',   label: '🔵 Friend'  },
    { color: 'yellow', label: '🟡 Unknown' },
    { color: 'green',  label: '🟢 Player'  }
  ].forEach(function (opt) {
    var btn = document.createElement('button');
    btn.textContent = opt.label;
    var bg = tokenCssColor(opt.color);
    var isActive = selectedTokenColor === opt.color;
    btn.style.cssText = [
      'flex:none',
      'white-space:nowrap',
      'padding:0.35rem 0.85rem',
      'font-size:0.8rem',
      'font-weight:bold',
      'border-radius:4px',
      'border:2px solid ' + bg,
      'cursor:pointer',
      'color:#fff',
      'background:' + (isActive ? bg : 'rgba(0,0,0,0.4)'),
      'letter-spacing:0.3px',
      'transition:background 0.15s',
      isActive ? 'box-shadow:0 0 8px ' + bg : ''
    ].join(';') + ';';
    btn.onclick = function () {
      selectedTokenColor = opt.color;
      selectedPlayerName = null;
      renderTokenControls(mapUrl, mapKey);
    };
    colorRow.appendChild(btn);
  });
  container.appendChild(colorRow);

  // Player quick-place buttons (only shown when Player color is active)
  if (selectedTokenColor === 'green' && playerRoster.length) {
    var playerPickRow = document.createElement('div');
    playerPickRow.style.cssText = 'display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.5rem;' +
      'padding:0.5rem;background:#0d1117;border:1px solid #16a34a;border-radius:6px;';
    var pickLabel = document.createElement('div');
    pickLabel.textContent = 'Click a player then click the map:';
    pickLabel.style.cssText = 'width:100%;font-size:0.72rem;color:#888;margin-bottom:0.3rem;';
    playerPickRow.appendChild(pickLabel);
    playerRoster.forEach(function (p) {
      var pb = document.createElement('button');
      pb.style.cssText = [
        'flex:none',
        'white-space:nowrap',
        'padding:0.3rem 0.7rem',
        'font-size:0.78rem',
        'font-weight:bold',
        'border-radius:4px',
        'border:2px solid ' + (selectedPlayerName === p.name ? '#16a34a' : '#374151'),
        'cursor:pointer',
        'color:#fff',
        'background:' + (selectedPlayerName === p.name ? '#16a34a' : 'rgba(0,0,0,0.4)'),
        selectedPlayerName === p.name ? 'box-shadow:0 0 8px #16a34a' : ''
      ].join(';') + ';';
      pb.textContent = p.name + (p.cls ? ' · ' + p.cls : '');
      pb.onclick = function () {
        selectedPlayerName = (selectedPlayerName === p.name) ? null : p.name;
        renderTokenControls(mapUrl, mapKey);
      };
      playerPickRow.appendChild(pb);
    });
    container.appendChild(playerPickRow);
  }

  // Map preview with token overlay
  var mapWrap = document.createElement('div');
  mapWrap.style.cssText = 'position:relative;display:inline-block;max-width:100%;' +
    'margin-bottom:0.5rem;border:1px solid ' + (drawModeActive ? '#facc15' : '#444') + ';' +
    'cursor:' + (drawModeActive ? 'none' : 'crosshair') + ';';

  var mapImg = document.createElement('img');
  mapImg.src = mapUrl;
  mapImg.style.cssText = 'display:block;max-width:100%;max-height:200px;user-select:none;pointer-events:none;';
  mapWrap.appendChild(mapImg);

  // Token dots on the DM preview — draggable
  var previewOverlay = document.createElement('div');
  previewOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;';

  // ── Draw canvas layer (on top of token overlay) ──────────────
  var drawCanvas = document.createElement('canvas');
  drawCanvas.style.cssText = 'position:absolute;inset:0;z-index:20;' +
    (drawModeActive ? 'cursor:crosshair;pointer-events:auto;' : 'pointer-events:none;display:none;');

  var drawCtx = drawCanvas.getContext('2d');
  if (!drawStrokes[mapKey]) drawStrokes[mapKey] = [];

  function getDrawRect() {
    var cW = mapWrap.offsetWidth, cH = mapWrap.offsetHeight;
    var iW = mapImg.naturalWidth, iH = mapImg.naturalHeight;
    if (!iW || !iH) return { offX: 0, offY: 0, rendW: cW, rendH: cH };
    var scale = Math.min(cW / iW, cH / iH);
    var rendW = iW * scale, rendH = iH * scale;
    return { offX: (cW - rendW) / 2, offY: (cH - rendH) / 2, rendW: rendW, rendH: rendH };
  }
  function canvasToNormDraw(px, py) {
    var r = getDrawRect();
    return { x: (px - r.offX) / r.rendW, y: (py - r.offY) / r.rendH };
  }
  function normToCanvasDraw(nx, ny) {
    var r = getDrawRect();
    return { x: r.offX + nx * r.rendW, y: r.offY + ny * r.rendH };
  }
  function redrawAnnotations() {
    if (!drawCanvas.width || !drawCanvas.height) return;
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    var strokes = drawStrokes[mapKey] || [];
    var r = getDrawRect();
    strokes.forEach(function (stroke) {
      if (!stroke.points || stroke.points.length < 2) return;
      drawCtx.save();
      drawCtx.strokeStyle = stroke.erase ? 'rgba(0,0,0,1)' : stroke.color;
      drawCtx.lineWidth   = Math.max(2, stroke.width * Math.min(r.rendW, r.rendH));
      drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round';
      drawCtx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
      drawCtx.beginPath();
      var p0 = normToCanvasDraw(stroke.points[0].x, stroke.points[0].y);
      drawCtx.moveTo(p0.x, p0.y);
      for (var i = 1; i < stroke.points.length; i++) {
        var pt = normToCanvasDraw(stroke.points[i].x, stroke.points[i].y);
        drawCtx.lineTo(pt.x, pt.y);
      }
      drawCtx.stroke();
      drawCtx.restore();
    });
  }
  function sizeDrawCanvas() {
    drawCanvas.width  = mapWrap.offsetWidth;
    drawCanvas.height = mapWrap.offsetHeight;
    redrawAnnotations();
  }
  mapImg.addEventListener('load', sizeDrawCanvas);
  if (mapImg.complete && mapImg.naturalWidth) setTimeout(sizeDrawCanvas, 10);

  // Mouse drawing on the shared canvas
  var drawingActive = false;
  var currentDrawStroke = null;
  function getDrawMousePos(e) {
    var rect = drawCanvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  drawCanvas.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    e.preventDefault();
    drawingActive = true;
    var pos = getDrawMousePos(e);
    currentDrawStroke = { color: drawTool.color, width: drawTool.width, erase: drawTool.erase, points: [canvasToNormDraw(pos.x, pos.y)] };
  });
  drawCanvas.addEventListener('mousemove', function (e) {
    if (!drawingActive || !currentDrawStroke) return;
    var pos = getDrawMousePos(e);
    currentDrawStroke.points.push(canvasToNormDraw(pos.x, pos.y));
    redrawAnnotations();
    var r = getDrawRect();
    drawCtx.save();
    drawCtx.strokeStyle = currentDrawStroke.erase ? 'rgba(0,0,0,1)' : currentDrawStroke.color;
    drawCtx.lineWidth   = Math.max(2, currentDrawStroke.width * Math.min(r.rendW, r.rendH));
    drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round';
    drawCtx.globalCompositeOperation = currentDrawStroke.erase ? 'destination-out' : 'source-over';
    drawCtx.beginPath();
    var pts = currentDrawStroke.points;
    var p0 = normToCanvasDraw(pts[0].x, pts[0].y);
    drawCtx.moveTo(p0.x, p0.y);
    for (var i = 1; i < pts.length; i++) {
      var pt = normToCanvasDraw(pts[i].x, pts[i].y);
      drawCtx.lineTo(pt.x, pt.y);
    }
    drawCtx.stroke();
    drawCtx.restore();
  });
  function finishDrawStroke() {
    if (!drawingActive || !currentDrawStroke) return;
    drawingActive = false;
    if (currentDrawStroke.points.length > 1) {
      if (!drawStrokes[mapKey]) drawStrokes[mapKey] = [];
      drawStrokes[mapKey].push(currentDrawStroke);
      sendDrawUpdate(mapKey);
    }
    currentDrawStroke = null;
    redrawAnnotations();
  }
  drawCanvas.addEventListener('mouseup',    finishDrawStroke);
  drawCanvas.addEventListener('mouseleave', finishDrawStroke);

  var wasDragging = false; // prevent map click after a drag

  function makeDot(tok) {
    var dot = document.createElement('div');
    dot.style.cssText = 'position:absolute;width:20px;height:20px;border-radius:50%;' +
      'background:' + tokenCssColor(tok.color) + ';border:2px solid rgba(255,255,255,0.9);' +
      'box-shadow:0 1px 6px rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;' +
      'left:' + (tok.x * 100) + '%;top:' + (tok.y * 100) + '%;transform:translate(-50%,-50%);' +
      'cursor:move;pointer-events:auto;z-index:10;user-select:none;';
    if (tok.label) {
      var lbl = document.createElement('span');
      lbl.textContent = tok.label;
      lbl.style.cssText = 'color:#fff;font-weight:bold;font-size:8px;font-family:sans-serif;' +
        'line-height:1;user-select:none;pointer-events:none;';
      dot.appendChild(lbl);
    }
    // Stop map click from firing when clicking a dot
    dot.addEventListener('click', function (e) { e.stopPropagation(); });

    dot.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var didMove = false;

      function onMove(ev) {
        var rect = mapWrap.getBoundingClientRect();
        tok.x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        tok.y = Math.max(0, Math.min(1, (ev.clientY - rect.top)  / rect.height));
        dot.style.left = (tok.x * 100) + '%';
        dot.style.top  = (tok.y * 100) + '%';
        didMove = true;
        wasDragging = true;
        dot.style.boxShadow = '0 0 10px rgba(255,255,255,0.6)';
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        dot.style.boxShadow = '0 1px 6px rgba(0,0,0,0.9)';
        if (didMove) {
          sendTokenUpdate(mapKey);
        }
        setTimeout(function () { wasDragging = false; }, 80);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    return dot;
  }

  (tokenState[mapKey] || []).forEach(function (tok) {
    previewOverlay.appendChild(makeDot(tok));
  });
  mapWrap.appendChild(previewOverlay);
  mapWrap.appendChild(drawCanvas);

  // Click on empty map area to place a new token (token mode only)
  mapWrap.addEventListener('click', function (e) {
    if (drawModeActive) return; // draw mode — canvas handles input
    if (wasDragging) return;
    var rect = mapWrap.getBoundingClientRect();
    var x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    var y = Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height));
    var label;
    if (selectedTokenColor === 'green') {
      if (!selectedPlayerName) return; // must pick a player first
      // Only one token per player — move if already exists
      var existing = tokenState[mapKey].find(function (t) { return t.color === 'green' && t.label === selectedPlayerName; });
      if (existing) {
        existing.x = x; existing.y = y;
        sendTokenUpdate(mapKey);
        renderTokenControls(mapUrl, mapKey);
        return;
      }
      label = selectedPlayerName;
    } else {
      var prefix = { red: 'E', blue: 'F', yellow: 'U' }[selectedTokenColor] || '?';
      var count  = tokenState[mapKey].filter(function (t) { return t.color === selectedTokenColor; }).length + 1;
      label = prefix + count;
    }
    var id = 'tok-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    tokenState[mapKey].push({ id: id, x: x, y: y, color: selectedTokenColor, label: label });
    sendTokenUpdate(mapKey);
    renderTokenControls(mapUrl, mapKey);
  });

  container.appendChild(mapWrap);

  // Token list
  var tokens = tokenState[mapKey] || [];
  if (tokens.length) {
    var listDiv = document.createElement('div');
    listDiv.style.cssText = 'margin-top:0.25rem;';
    tokens.forEach(function (tok, idx) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:0.4rem;margin-bottom:0.25rem;';
      var dot = document.createElement('span');
      dot.style.cssText = 'width:14px;height:14px;border-radius:50%;flex-shrink:0;' +
        'background:' + tokenCssColor(tok.color) + ';border:2px solid rgba(255,255,255,0.4);';
      row.appendChild(dot);
      var lbl = document.createElement('span');
      lbl.style.cssText = 'flex:1;font-size:0.75rem;color:#ccc;';
      lbl.textContent = tok.label + ' (' + tok.color + ')';
      row.appendChild(lbl);
      var rmBtn = document.createElement('button');
      rmBtn.textContent = '✕';
      rmBtn.className = 'btn btn-danger btn-small';
      rmBtn.style.cssText = 'padding:0.1rem 0.4rem;min-width:0;flex:none;';
      rmBtn.onclick = (function (i) {
        return function () {
          tokenState[mapKey].splice(i, 1);
          sendTokenUpdate(mapKey);
          renderTokenControls(mapUrl, mapKey);
        };
      })(idx);
      row.appendChild(rmBtn);
      listDiv.appendChild(row);
    });

    var clearAllBtn = document.createElement('button');
    clearAllBtn.textContent = '🗑 Clear All Tokens';
    clearAllBtn.className = 'btn btn-warning btn-small';
    clearAllBtn.style.marginTop = '0.3rem';
    clearAllBtn.onclick = function () {
      tokenState[mapKey] = [];
      sendTokenUpdate(mapKey);
      renderTokenControls(mapUrl, mapKey);
    };
    listDiv.appendChild(clearAllBtn);
    container.appendChild(listDiv);
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
  document.getElementById('sb-tab').value   = scene.tab || scene.label || '';
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

// ── Section Drag & Drop ──────────────────────────────────
(function () {
  var STORAGE_KEY = 'dm-panel-order';
  var grid = document.querySelector('.panel-grid');
  var dragSrc = null;
  var dropTarget = null;
  var dragSection = null;

  function restoreOrder() {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { saved = null; }
    if (!Array.isArray(saved) || !saved.length) return;
    saved.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) grid.appendChild(el);
    });
  }

  function saveOrder() {
    var ids = Array.from(grid.querySelectorAll(':scope > section')).map(function (s) { return s.id; }).filter(Boolean);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }

  // Enable drag only while the handle is held, so child interactions (fog cells, inputs) work normally
  document.addEventListener('mousedown', function (e) {
    var handle = e.target.closest && e.target.closest('.drag-handle');
    if (handle) {
      var section = handle.closest('section');
      if (section) { section.setAttribute('draggable', 'true'); dragSection = section; }
    }
  });

  document.addEventListener('mouseup', function () {
    if (dragSection && !dragSrc) {
      // Released without starting a drag — remove draggable immediately
      dragSection.setAttribute('draggable', 'false');
      dragSection = null;
    }
  });

  grid.addEventListener('dragstart', function (e) {
    var el = e.target;
    while (el && el.tagName !== 'SECTION') el = el.parentElement;
    if (!el || !grid.contains(el) || el.getAttribute('draggable') !== 'true') {
      e.preventDefault(); return;
    }
    dragSrc = el;
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', el.id);
  });

  grid.addEventListener('dragend', function () {
    grid.querySelectorAll('section').forEach(function (s) {
      s.classList.remove('dragging');
      s.classList.remove('drag-over');
      s.setAttribute('draggable', 'false');
    });
    if (dragSrc) saveOrder();
    dragSrc = null;
    dropTarget = null;
    dragSection = null;
  });

  // dragover: just highlight the target — do NOT reorder DOM here
  grid.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragSrc) return;
    var el = e.target;
    while (el && el !== grid) {
      if (el.tagName === 'SECTION' && el !== dragSrc) break;
      el = el.parentElement;
    }
    if (!el || el === grid || el === dragSrc) return;
    if (el === dropTarget) return;
    dropTarget = el;
    grid.querySelectorAll('section').forEach(function (s) { s.classList.remove('drag-over'); });
    el.classList.add('drag-over');
  });

  grid.addEventListener('dragleave', function (e) {
    if (!grid.contains(e.relatedTarget)) {
      grid.querySelectorAll('section').forEach(function (s) { s.classList.remove('drag-over'); });
      dropTarget = null;
    }
  });

  // drop: insert the dragged section before or after the target
  grid.addEventListener('drop', function (e) {
    e.preventDefault();
    if (!dragSrc || !dropTarget) return;
    var rect = dropTarget.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      grid.insertBefore(dragSrc, dropTarget);
    } else {
      grid.insertBefore(dragSrc, dropTarget.nextSibling);
    }
    dropTarget = null;
  });

  restoreOrder();
}());

// ============================================================
// Dice Roller
// ============================================================
document.querySelectorAll('.btn-dice').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var die  = parseInt(btn.getAttribute('data-die'));
    var roll = Math.floor(Math.random() * die) + 1;
    diceResult.textContent = 'D' + die + ': ' + roll;
    if (document.getElementById('dice-broadcast').checked) {
      fetch('/api/dice-roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ die: die, result: roll })
      });
    }
  });
});

// ============================================================
// Initiative Tracker
// ============================================================

// ── Persistent player roster ──────────────────────────────────
var playerRoster = [];   // [{ name }]

function loadPlayerRoster() {
  fetch('/api/players')
    .then(function (r) { return r.json(); })
    .then(function (d) { playerRoster = d.players || []; renderPlayerRoster(); })
    .catch(function () {});
}

function savePlayerRoster() {
  fetch('/api/players', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ players: playerRoster })
  }).catch(function () {});
}

function renderPlayerRoster() {
  var list = document.getElementById('init-player-list');
  if (!list) return;
  list.innerHTML = '';
  playerRoster.forEach(function (p, idx) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:0.4rem;margin-bottom:0.25rem;flex-wrap:wrap;';

    // Name + class label
    var lbl = document.createElement('span');
    lbl.style.cssText = 'flex:1;font-size:0.85rem;color:#e6e6e6;min-width:80px;';
    lbl.textContent = p.name;
    if (p.cls) {
      var clsTag = document.createElement('span');
      clsTag.textContent = p.cls;
      clsTag.style.cssText = 'margin-left:0.4rem;font-size:0.7rem;color:#d4af37;border:1px solid #d4af37;border-radius:3px;padding:0 4px;vertical-align:middle;';
      lbl.appendChild(clsTag);
    }
    row.appendChild(lbl);

    // Roll input (per-player, cleared each round)
    var rollInput = document.createElement('input');
    rollInput.type = 'number';
    rollInput.placeholder = 'Roll';
    rollInput.min = 1; rollInput.max = 30;
    rollInput.style.cssText = 'width:54px;padding:0.2rem 0.35rem;font-size:0.8rem;background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#e6e6e6;';
    rollInput.dataset.playerIdx = idx;
    row.appendChild(rollInput);

    // Add this single player to round
    var addBtn = document.createElement('button');
    addBtn.textContent = '→';
    addBtn.title = 'Add to round';
    addBtn.className = 'btn btn-small btn-secondary';
    addBtn.style.padding = '0.18rem 0.5rem';
    addBtn.onclick = (function (player, input) {
      return function () {
        var roll = parseInt(input.value);
        if (isNaN(roll)) { input.focus(); return; }
        addToInitiative(player.name, roll, true, player.cls);
        input.value = '';
      };
    })(p, rollInput);
    row.appendChild(addBtn);

    // Remove from roster
    var delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.title = 'Remove from roster';
    delBtn.className = 'btn btn-small btn-warning';
    delBtn.style.padding = '0.18rem 0.4rem';
    delBtn.onclick = (function (i) {
      return function () {
        playerRoster.splice(i, 1);
        savePlayerRoster();
        renderPlayerRoster();
        // Refresh token controls if a map is currently showing
        if (activeTokenMapKey && activeTokenMapUrl) {
          renderTokenControls(activeTokenMapUrl, activeTokenMapKey);
        }
      };
    })(idx);
    row.appendChild(delBtn);

    list.appendChild(row);
  });
}

document.getElementById('init-player-add-btn').addEventListener('click', function () {
  var name = document.getElementById('init-player-name').value.trim();
  var cls  = document.getElementById('init-player-class').value.trim();
  if (!name) return;
  playerRoster.push({ name: name, cls: cls });
  savePlayerRoster();
  renderPlayerRoster();
  // Refresh token controls if a map is active
  if (activeTokenMapKey && activeTokenMapUrl) {
    renderTokenControls(activeTokenMapUrl, activeTokenMapKey);
  }
  document.getElementById('init-player-name').value = '';
  document.getElementById('init-player-class').value = '';
});

document.getElementById('init-add-all-btn').addEventListener('click', function () {
  // For each player that has a roll filled in, add them to the round
  var inputs = document.querySelectorAll('#init-player-list input[type=number]');
  var added = 0;
  inputs.forEach(function (input, idx) {
    var roll = parseInt(input.value);
    if (isNaN(roll)) return;
    addToInitiative(playerRoster[idx].name, roll, true, playerRoster[idx].cls);
    input.value = '';
    added++;
  });
  if (!added) alert('Enter roll values for the players you want to add.');
});

document.getElementById('init-roll-all-btn').addEventListener('click', function () {
  if (!playerRoster.length) { alert('No players in roster.'); return; }
  playerRoster.forEach(function (p) {
    var roll = Math.floor(Math.random() * 20) + 1;
    addToInitiative(p.name, roll, true, p.cls);
  });
});

// ── Round management ──────────────────────────────────────────
var INIT_STORAGE_KEY = 'dm-initiative';

function saveInitiative() {
  try {
    localStorage.setItem(INIT_STORAGE_KEY, JSON.stringify({ initiative: initiative, currentTurn: currentTurn }));
  } catch (e) {}
}

function loadInitiative() {
  try {
    var saved = JSON.parse(localStorage.getItem(INIT_STORAGE_KEY));
    if (saved && Array.isArray(saved.initiative)) {
      initiative   = saved.initiative;
      currentTurn  = saved.currentTurn || 0;
    }
  } catch (e) {}
}

function addToInitiative(name, roll, isPlayer, cls) {
  initiative.push({ name: name, roll: roll, isPlayer: !!isPlayer, cls: cls || '' });
  initiative.sort(function (a, b) { return b.roll - a.roll; });
  currentTurn = 0;
  saveInitiative();
  renderInitiative();
}

document.getElementById('init-add-btn').addEventListener('click', function () {
  var name = document.getElementById('init-name').value.trim();
  var roll = parseInt(document.getElementById('init-roll').value);
  if (!name || isNaN(roll)) return;
  addToInitiative(name, roll);
  document.getElementById('init-name').value = '';
  document.getElementById('init-roll').value = '';
});

document.getElementById('init-clear-btn').addEventListener('click', function () {
  // Remove only mobs — keep players in the round
  initiative = initiative.filter(function (e) { return e.isPlayer; });
  currentTurn = 0;
  saveInitiative();
  renderInitiative();
});

document.getElementById('init-reset-btn').addEventListener('click', function () {
  if (!confirm('Hard reset — remove ALL entries including players?')) return;
  initiative = []; currentTurn = 0;
  saveInitiative();
  renderInitiative();
});

function nextInitiativeTurn() {
  if (!initiative.length) return;
  currentTurn = (currentTurn + 1) % initiative.length;
  saveInitiative();
  renderInitiative();
  sendInitiative();
}

document.getElementById('init-next-btn').addEventListener('click', nextInitiativeTurn);
document.getElementById('init-send-btn').addEventListener('click', sendInitiative);
document.getElementById('qa-init-next-btn') && document.getElementById('qa-init-next-btn').addEventListener('click', nextInitiativeTurn);
document.getElementById('qa-init-send-btn') && document.getElementById('qa-init-send-btn').addEventListener('click', sendInitiative);

function renderInitiative() {
  var html = '';
  for (var i = 0; i < initiative.length; i++) {
    var active = i === currentTurn ? ' active-turn' : '';
    var tags = '';
    if (initiative[i].isPlayer) {
      tags += ' <span style="font-size:0.65rem;color:#4ade80;border:1px solid #4ade80;border-radius:2px;padding:0 3px;vertical-align:middle;">PC</span>';
    }
    if (initiative[i].cls) {
      tags += ' <span style="font-size:0.65rem;color:#d4af37;border:1px solid #555;border-radius:2px;padding:0 3px;vertical-align:middle;">' + initiative[i].cls + '</span>';
    }
    html += '<div class="init-entry' + active + '">' +
      '<span class="init-order">' + initiative[i].roll + '</span>' +
      '<span class="init-entry-name">' + initiative[i].name + tags + '</span>' +
      '<button class="init-remove" onclick="removeInit(' + i + ')">&#x2715;</button></div>';
  }
  initList.innerHTML = html;
}

window.removeInit = function (i) {
  initiative.splice(i, 1);
  if (currentTurn >= initiative.length) currentTurn = 0;
  saveInitiative();
  renderInitiative();
};

function sendInitiative() {
  if (!initiative.length) return;
  var html = '';
  for (var i = 0; i < initiative.length; i++) {
    var active = i === currentTurn;
    var nameHtml = initiative[i].name;
    if (initiative[i].cls) nameHtml += ' <span style="font-size:0.75rem;opacity:0.75;">(' + initiative[i].cls + ')</span>';
    html += '<div style="display:flex;align-items:center;gap:0.6rem;padding:0.45rem 0.7rem;margin-bottom:0.3rem;' +
      'background:' + (active ? 'rgba(212,175,55,0.18)' : 'rgba(0,0,0,0.18)') + ';border:1px solid ' +
      (active ? 'rgba(212,175,55,0.7)' : 'rgba(90,50,10,0.35)') + ';border-radius:3px;font-size:1rem;">' +
      '<span style="font-weight:bold;min-width:26px;font-size:0.95rem;">' + initiative[i].roll + '</span>' +
      '<span style="flex:1;' + (active ? 'font-weight:bold;' : '') + '">' +
      nameHtml + (active ? '  ◀' : '') + '</span></div>';
  }
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
loadPlayerRoster();
loadInitiative();
renderInitiative();

// ── Sidebar toggle + resize ───────────────────────────────────
(function () {
  var sidebar = document.getElementById('sidebar');
  var btn     = document.getElementById('sidebar-toggle');
  var handle  = document.getElementById('sidebar-resize');
  var inner   = sidebar ? sidebar.querySelector('.sidebar-inner') : null;
  if (!sidebar || !btn) return;

  var MIN_WIDTH = 180;
  var MAX_WIDTH = 600;
  var lastWidth = 300;

  function setWidth(w) {
    w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w));
    sidebar.style.width    = w + 'px';
    sidebar.style.minWidth = w + 'px';
    if (inner) inner.style.width = w + 'px';
    lastWidth = w;
  }

  // Toggle collapse/expand
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    sidebar.classList.add('animating');
    setTimeout(function () { sidebar.classList.remove('animating'); }, 220);
    if (sidebar.classList.contains('collapsed')) {
      sidebar.classList.remove('collapsed');
      sidebar.style.width    = lastWidth + 'px';
      sidebar.style.minWidth = lastWidth + 'px';
      if (inner) inner.style.width = lastWidth + 'px';
      btn.textContent = '‹';
    } else {
      sidebar.classList.add('collapsed');
      btn.textContent = '›';
    }
  });

  // Section collapse/expand
  document.querySelectorAll('.sb-section-hdr').forEach(function (hdr) {
    hdr.addEventListener('click', function (e) {
      if (e.target.closest('.btn')) return;
      hdr.closest('.sb-section').classList.toggle('collapsed');
    });
  });

  // Drag-to-resize
  if (!handle) return;
  var resizing = false;
  var startX   = 0;
  var startW   = 0;

  handle.addEventListener('mousedown', function (e) {
    if (sidebar.classList.contains('collapsed')) return;
    e.preventDefault();
    resizing = true;
    startX   = e.clientX;
    startW   = sidebar.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', function (e) {
    if (!resizing) return;
    setWidth(startW + (e.clientX - startX));
  });

  document.addEventListener('mouseup', function () {
    if (!resizing) return;
    resizing = false;
    handle.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  });
}());
