// ============================================================
//  DM Control Panel — app.js
// ============================================================

// ── Security: HTML escape helper ─────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
var lastSceneViewPayload = null; // cached for re-sync when server restarts
var lastMapPayload       = null; // last actual map/scene (not Send Image)
var lastSceneWasSentImage = false; // true when Send Image (not a real map) was last sent

// Token overlay state
var tokenState         = {};     // mapKey -> array of {id,x,y,color,label,mobType?}
var activeTokenMapKey  = null;
var selectedTokenColor  = 'red';
var autoAddToInit       = true;  // toggle: auto-add tokens to initiative
var showPlayerRings     = true;  // toggle: show condition rings on player screen
var fogDeferredInit     = {};    // mapKey -> [{label, roll}] waiting for fog reveal
var selectedMobType     = '';    // current mob type name for token labels
var selectedPlayerName = null;
var addPartyMode       = false; // place entire party on one click
var activeTokenMapUrl  = null;

// ── Mob icons & colours ───────────────────────────────────────
var MOB_ICONS = {
  Bandit: '🗡️', Bugbear: '🐻', Cultist: '🕯️', Dragon: '🐉',
  Drow: '🕷️', 'Gelatinous Cube': '🫧', Ghoul: '👻', Giant: '🏔️',
  Gnoll: '🦴', Goblin: '👺', Guard: '💂', Hobgoblin: '⚔️',
  Kobold: '🦎', Mimic: '📦', Ogre: '🪨', Orc: '🪓',
  Owlbear: '🦉', Skeleton: '💀', Spy: '🕵️', Thug: '👊',
  Troll: '🌲', Vampire: '🧛', Werewolf: '🐺', Wolf: '🐕', Zombie: '🧟',
};
var MOB_COLORS = {
  Bandit: '#92400e', Bugbear: '#7c3aed', Cultist: '#450a0a', Dragon: '#b91c1c',
  Drow: '#312e81', 'Gelatinous Cube': '#4d7c0f', Ghoul: '#374151', Giant: '#6b7280',
  Gnoll: '#78350f', Goblin: '#15803d', Guard: '#1e40af', Hobgoblin: '#9b1c1c',
  Kobold: '#b45309', Mimic: '#854d0e', Ogre: '#6b21a8', Orc: '#14532d',
  Owlbear: '#713f12', Skeleton: '#4b5563', Spy: '#0f766e', Thug: '#b45309',
  Troll: '#44403c', Vampire: '#7f1d1d', Werewolf: '#292524', Wolf: '#44403c', Zombie: '#3d6b47',
};
// ── Player class icons & colours ──────────────────────────────
var MOB_ICONS_CLASS = {
  Rogue: '🗡️', Priest: '✝️', Cleric: '✝️', Sorcerer: '🔮',
  Wizard: '🪄', Fighter: '🛡️', Paladin: '⚔️', Druid: '🌿',
  Ranger: '🏹', Bard: '🎵', Monk: '👊', Barbarian: '💢', FatChub: '🐷',
};
var CLASS_COLORS_DM = {
  Rogue: '#7c3aed', Priest: '#0ea5e9', Cleric: '#0ea5e9', Sorcerer: '#6366f1',
  Wizard: '#4f46e5', Fighter: '#ea580c', Paladin: '#d4af37', Druid: '#16a34a',
  Ranger: '#22c55e', Bard: '#ec4899', Monk: '#f97316', Barbarian: '#dc2626', FatChub: '#ef4444',
};

// Draw / Annotation state
var drawStrokes          = {};    // mapKey -> [{color, width, erase, points:[{x,y}]}]
var activeDrawMapKey     = null;
var drawTool             = { color: '#ef4444', width: 0.006, erase: false };
var drawControlsExpanded = false;
var drawModeActive       = false; // true = annotations canvas active on token map
var tokenMapExpanded     = false; // true = token map shown at full height
var fogMapExpanded       = false; // true = fog of war map shown at full height

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
var resendMapBtn = document.getElementById('resend-map-btn');
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
    // Re-push scene state so server has it for any newly connecting players.
    // This handles server restarts where in-memory state is lost.
    if (lastSceneViewPayload) {
      wsSend(lastSceneViewPayload);
      if (activeFogKey) sendFogUpdate(activeFogKey);
      if (activeTokenMapKey) { sendTokenUpdate(activeTokenMapKey); sendDrawUpdate(activeTokenMapKey); }
    }
  };
  ws.onmessage = function (event) {
    var msg = JSON.parse(event.data);
    if (msg.type === 'auth-required') {
      // Session expired (server restarted). Reload so requireDm redirects to login.
      location.reload();
      return;
    }
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
  isBlackout = false;
  blackoutBtn.classList.remove('active');
  if (lastSceneWasSentImage) {
    // Clear the scene image from players, then also clear overlays
    fetch('/api/clear-scene', { method: 'POST' });
    fetch('/api/clear', { method: 'POST' });
    lastSceneViewPayload = null;
    lastSceneWasSentImage = false;
  } else {
    fetch('/api/clear', { method: 'POST' });
  }
});
resendMapBtn.addEventListener('click', function () {
  if (!lastMapPayload) return;
  wsSend(lastMapPayload);
  if (activeFogKey) sendFogUpdate(activeFogKey);
  if (activeTokenMapKey) { sendTokenUpdate(activeTokenMapKey); sendDrawUpdate(activeTokenMapKey); }
});

document.getElementById('send-text-popup-btn').addEventListener('click', function () {
  showSendTextPopup(this);
});
document.getElementById('send-image-popup-btn').addEventListener('click', function () {
  showSendImagePopup(this);
});

// ============================================================
// Send Text (hidden panel — kept for element ID compatibility)
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
  // Show the image full-screen on the player view (same as a scene map, no fog/tokens/audio)
  lastSceneViewPayload = { action: 'show-scene-view', image: src, fit: 'contain', audio: null, fogKey: null, mapKey: null, audioLoop: false };
  lastSceneWasSentImage = true;
  wsSend(lastSceneViewPayload);
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
          mapList.innerHTML = '<p style="color:#888;font-size:0.85rem;">No results for &ldquo;' + escHtml(sceneSearchTerm) + '&rdquo;</p>';
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
          var fcEl = document.getElementById('feature-controls-container');
          if (fcEl) fcEl.innerHTML = '';
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
  lastSceneViewPayload = { action: 'show-scene-view', image: view.image, audio: view.audio || null, audioLoop: view.audioLoop !== false, fit: view.fit || 'contain', fogKey: useFog ? fogKey : null, mapKey: fogKey };
  lastSceneWasSentImage = false;
  lastMapPayload = lastSceneViewPayload;
  wsSend(lastSceneViewPayload);

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

  // Feature controls — async fetch map state to get saved features
  var featureContainer = document.getElementById('feature-controls-container');
  if (featureContainer) featureContainer.innerHTML = '';
  var mapBaseName = (view.image || '').replace(/.*\//, '').replace(/\.[^.]+$/, '');
  if (mapBaseName) {
    fetch('/api/map-builder/state?name=' + encodeURIComponent(mapBaseName))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (state) {
        var mapFeatures = (state && Array.isArray(state.features)) ? state.features : [];
        var mapMeta = state ? { cols: state.cols, rows: state.rows } : null;
        // Push feature definitions to server so reconnecting players receive them
        if (mapFeatures.length > 0) {
          wsSend({ action: 'update-features', features: mapFeatures, mapKey: fogKey, mapMeta: mapMeta });
        }
        renderFeatureControls(fogKey, mapFeatures, mapMeta);
      })
      .catch(function () { /* no state file — map may not be from builder */ });
  }
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
    hdr.innerHTML = '<span class="audio-cat-arrow">▼</span> ' + escHtml(group.cat) +
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

      // Hidden audio element for DM local preview
      var audio = document.createElement('audio');
      audio.src = url;
      audio.style.display = 'none';
      row.appendChild(audio);

      // ▶/⏸ preview toggle
      var playBtn = document.createElement('button');
      playBtn.className = 'audio-preview-btn';
      playBtn.title = 'Preview locally';
      playBtn.innerHTML = '▶';
      playBtn.onclick = function () {
        // Pause all other previews in the panel
        document.querySelectorAll('#audio-list audio').forEach(function (a) {
          if (a !== audio) { a.pause(); a.currentTime = 0; }
        });
        document.querySelectorAll('.audio-preview-btn').forEach(function (b) {
          if (b !== playBtn) b.innerHTML = '▶';
        });
        if (audio.paused) {
          audio.play();
          playBtn.innerHTML = '⏸';
        } else {
          audio.pause();
          audio.currentTime = 0;
          playBtn.innerHTML = '▶';
        }
      };
      audio.addEventListener('ended', function () { playBtn.innerHTML = '▶'; });
      row.appendChild(playBtn);

      var lbl = document.createElement('span');
      lbl.textContent = displayName;
      lbl.className = 'audio-label';
      row.appendChild(lbl);

      var btn = document.createElement('button');
      btn.innerHTML = '⟳ LOOP';
      btn.title = 'Send to player screen (loops)';
      btn.className = 'audio-send-btn audio-send-loop';
      btn.onclick = (function (u) {
        return function () { broadcastAudio(u, true); };
      })(url);
      row.appendChild(btn);

      var btnOnce = document.createElement('button');
      btnOnce.innerHTML = '▶ ONCE';
      btnOnce.title = 'Send to player screen (plays once)';
      btnOnce.className = 'audio-send-btn audio-send-once';
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
// Map Feature Controls
// ============================================================
function renderFeatureControls(mapKey, feats, mapMeta) {
  var container = document.getElementById('feature-controls-container');
  if (!container) return;
  container.innerHTML = '';
  if (!feats || feats.length === 0) return;

  var ANIM_LABELS = {
    'shake-reveal': 'Shake & Reveal',
    'flash-red':    'Red Flash',
    'pulse-gold':   'Gold Pulse',
    'fade-in':      'Fade In',
    'flash-white':  'White Flash',
  };
  var FEAT_ICONS = { pit: '⬛', trap: '💥', puzzle: '🧩', reveal: '👁', effect: '✨' };

  var header = document.createElement('div');
  header.style.cssText = 'border-top:1px solid #21262d;padding-top:0.6rem;margin-top:0.25rem;';
  var hLabel = document.createElement('span');
  hLabel.style.cssText = 'color:#aaa;font-size:0.8rem;font-weight:bold;';
  hLabel.textContent = '🎯 Map Features';
  header.appendChild(hLabel);
  container.appendChild(header);

  // Track per-feature triggered state client-side for button toggling
  var triggeredSet = {};

  var grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.4rem;';
  container.appendChild(grid);

  feats.forEach(function (feat) {
    var card = document.createElement('div');
    card.id = 'feat-card-' + feat.id;
    card.style.cssText = 'background:#1f2937;border-radius:5px;padding:0.4rem 0.6rem;' +
      'border-left:3px solid ' + (feat.color || '#c0392b') + ';min-width:160px;max-width:220px;flex:1;';

    var nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-size:0.82rem;font-weight:bold;color:#e6e6e6;margin-bottom:0.25rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    nameEl.textContent = (FEAT_ICONS[feat.type] || '?') + ' ' + feat.name;
    nameEl.title = feat.description || feat.name;
    card.appendChild(nameEl);

    var animEl = document.createElement('div');
    animEl.style.cssText = 'font-size:0.72rem;color:#6b7280;margin-bottom:0.35rem;';
    animEl.textContent = (ANIM_LABELS[feat.animation] || feat.animation) + ' • ' + (feat.cells || []).length + ' cells';
    card.appendChild(animEl);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:0.3rem;';

    var trigBtn = document.createElement('button');
    trigBtn.className = 'btn btn-small btn-danger';
    trigBtn.textContent = '⚡ Trigger';
    trigBtn.style.cssText += 'flex:1;font-size:0.78rem;white-space:nowrap;';
    trigBtn.onclick = function () {
      triggeredSet[feat.id] = true;
      wsSend({ action: 'trigger-feature', featureId: feat.id, mapKey: mapKey, feature: feat });
      trigBtn.disabled = true;
      trigBtn.textContent = '✓ Triggered';
      trigBtn.style.opacity = '0.55';
      resetBtn.disabled = false;
      resetBtn.style.opacity = '1';
    };
    btnRow.appendChild(trigBtn);

    var resetBtn = document.createElement('button');
    resetBtn.className = 'btn btn-small btn-secondary';
    resetBtn.textContent = '↩ Reset';
    resetBtn.disabled = true;
    resetBtn.style.cssText += 'flex:none;font-size:0.78rem;opacity:0.4;';
    resetBtn.onclick = function () {
      delete triggeredSet[feat.id];
      wsSend({ action: 'reset-feature', featureId: feat.id, mapKey: mapKey });
      trigBtn.disabled = false;
      trigBtn.textContent = '⚡ Trigger';
      trigBtn.style.opacity = '1';
      resetBtn.disabled = true;
      resetBtn.style.opacity = '0.4';
    };
    btnRow.appendChild(resetBtn);
    card.appendChild(btnRow);
    grid.appendChild(card);
  });
}

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

  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:0.5rem;margin-bottom:0.5rem;';

  var clearFogBtn = document.createElement('button');
  clearFogBtn.textContent = 'Hide All';
  clearFogBtn.className = 'btn btn-warning btn-small';
  clearFogBtn.style.cssText = 'flex:none;min-width:0;padding:0.25rem 0.9rem;font-size:0.75rem;';
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
  revealBtn.className = 'btn btn-secondary btn-small';
  revealBtn.style.cssText = 'flex:none;min-width:0;padding:0.25rem 0.9rem;font-size:0.75rem;';
  revealBtn.onclick = function () {
    window.fogStates[fogKey] = [];
    for (var r = 0; r < fogRows; r++) {
      window.fogStates[fogKey].push([]);
      for (var c = 0; c < fogCols; c++) window.fogStates[fogKey][r].push(true);
    }
    // Flush all deferred initiative entries for this map
    if (fogDeferredInit[fogKey] && fogDeferredInit[fogKey].length) {
      fogDeferredInit[fogKey].forEach(function (entry) {
        var alreadyIn = initiative.some(function (e) { return e.name === entry.label; });
        if (!alreadyIn) addToInitiative(entry.label, entry.roll, false, '');
      });
      fogDeferredInit[fogKey] = [];
    }
    renderFogControls(fogMapUrl, fogKey);
    sendFogUpdate(fogKey);
  };
  btnRow.appendChild(revealBtn);
  container.appendChild(btnRow);

  // Fog of War map header with expand button
  var fogHeaderRow = document.createElement('div');
  fogHeaderRow.style.cssText = 'display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;';
  var title = document.createElement('div');
  title.textContent = '🌫️ Fog of War';
  title.style.cssText = 'font-size:0.7rem;font-weight:bold;text-transform:uppercase;letter-spacing:0.08em;color:#555;flex:1;';
  fogHeaderRow.appendChild(title);
  var fogExpandBtn = document.createElement('button');
  fogExpandBtn.style.cssText = 'font-size:0.72rem;padding:0.18rem 0.5rem;border-radius:4px;cursor:pointer;border:1px solid #30363d;background:#0d1117;color:#888;white-space:nowrap;';
  fogExpandBtn.textContent = fogMapExpanded ? '⊟ Shrink' : '⊞ Expand';
  fogExpandBtn.title = 'Toggle fog map zoom level';
  fogExpandBtn.onclick = function () {
    fogMapExpanded = !fogMapExpanded;
    mapImg.style.maxHeight = fogMapExpanded ? 'none' : '340px';
    fogExpandBtn.textContent = fogMapExpanded ? '⊟ Shrink' : '⊞ Expand';
  };
  fogHeaderRow.appendChild(fogExpandBtn);
  container.appendChild(fogHeaderRow);

  // Map preview with fog grid overlaid
  var mapWrap = document.createElement('div');
  mapWrap.style.cssText = 'position:relative;display:inline-block;max-width:100%;margin-bottom:0.5rem;border:1px solid #444;';

  var mapImg = document.createElement('img');
  mapImg.src = mapUrl;
  mapImg.style.cssText = 'display:block;max-width:100%;max-height:' + (fogMapExpanded ? 'none' : '340px') + ';object-fit:contain;user-select:none;pointer-events:none;';
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
    // If revealing a cell, flush any deferred initiative entries at this position
    if (paintValue === true && fogDeferredInit[fogKey]) {
      var remaining = [];
      fogDeferredInit[fogKey].forEach(function (entry) {
        if (entry.fr === r && entry.fc === c) {
          var alreadyIn = initiative.some(function (e) { return e.name === entry.label; });
          if (!alreadyIn) addToInitiative(entry.label, entry.roll, false, '');
        } else {
          remaining.push(entry);
        }
      });
      fogDeferredInit[fogKey] = remaining;
    }
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
function tokenBgColor(tok) {
  if (tok.type === 'player' && tok.cls && CLASS_COLORS_DM[tok.cls]) return CLASS_COLORS_DM[tok.cls];
  if (tok.mobType && MOB_COLORS[tok.mobType]) return MOB_COLORS[tok.mobType];
  return tokenCssColor(tok.color);
}

// ── Condition ring box-shadow ─────────────────────────────────
// Buff = green ring, Debuff = red ring, stacked 4px per condition outward
function makeConditionShadow(tok) {
  var conds = tok.conditions || [];
  if (!conds.length) return '0 1px 6px rgba(0,0,0,0.9)';
  var shadows = [];
  conds.forEach(function (c, i) {
    var r = (i + 1) * 4;
    shadows.push('0 0 0 ' + r + 'px ' + (c.type === 'buff' ? '#22c55e' : '#ef4444'));
  });
  shadows.push('0 2px 8px rgba(0,0,0,0.9)');
  return shadows.join(',');
}

// ── Token condition picker popup ──────────────────────────────
function sendTokenUpdate(mapKey) {
  // Enrich tokens with conditions from initiative tracker before broadcasting
  var enriched = (tokenState[mapKey] || []).map(function (tok) {
    var entry = initiative.find(function (e) { return e.name === tok.label; });
    var t = Object.assign({}, tok);
    t.conditions = entry ? (entry.conditions || []) : [];
    return t;
  });
  wsSend({ action: 'update-tokens', tokens: enriched, mapKey: mapKey, showRings: showPlayerRings });
}

function renderTokenControls(mapUrl, mapKey) {
  activeTokenMapKey = mapKey;
  activeTokenMapUrl = mapUrl;
  if (!tokenState[mapKey]) tokenState[mapKey] = [];

  var container = document.getElementById('token-controls-container');
  container.innerHTML = '';
  var mapContainer = document.getElementById('token-map-container');
  if (mapContainer) mapContainer.innerHTML = '';

  // Color picker buttons — appended directly into the flex header container
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
      'padding:0.3rem 0.75rem',
      'font-size:0.78rem',
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
      addPartyMode = false;
      renderTokenControls(mapUrl, mapKey);
    };
    container.appendChild(btn);
  });

  // Auto-add to initiative toggle
  var initToggleBtn = document.createElement('button');
  initToggleBtn.style.cssText = 'flex:none;font-size:0.75rem;padding:0.28rem 0.6rem;border-radius:4px;cursor:pointer;white-space:nowrap;' +
    'border:1px solid ' + (autoAddToInit ? '#4ade80' : '#555') + ';' +
    'background:' + (autoAddToInit ? 'rgba(74,222,128,0.15)' : 'rgba(0,0,0,0.3)') + ';' +
    'color:' + (autoAddToInit ? '#4ade80' : '#666') + ';';
  initToggleBtn.textContent = (autoAddToInit ? '⚔️ Auto-Init: ON' : '⚔️ Auto-Init: OFF');
  initToggleBtn.title = 'Toggle whether placing a token automatically adds it to the initiative tracker';
  initToggleBtn.onclick = function () {
    autoAddToInit = !autoAddToInit;
    renderTokenControls(mapUrl, mapKey);
  };
  container.appendChild(initToggleBtn);

  // Condition rings on player screen toggle
  var ringsToggleBtn = document.createElement('button');
  ringsToggleBtn.style.cssText = 'flex:none;font-size:0.75rem;padding:0.28rem 0.6rem;border-radius:4px;cursor:pointer;white-space:nowrap;' +
    'border:1px solid ' + (showPlayerRings ? '#818cf8' : '#555') + ';' +
    'background:' + (showPlayerRings ? 'rgba(129,140,248,0.15)' : 'rgba(0,0,0,0.3)') + ';' +
    'color:' + (showPlayerRings ? '#818cf8' : '#666') + ';';
  ringsToggleBtn.textContent = showPlayerRings ? '💫 Rings: ON' : '💫 Rings: OFF';
  ringsToggleBtn.title = 'Toggle condition rings on the player/projector screen';
  ringsToggleBtn.onclick = function () {
    showPlayerRings = !showPlayerRings;
    wsSend({ action: 'set-rings', showRings: showPlayerRings });
    if (activeTokenMapKey) sendTokenUpdate(activeTokenMapKey);
    renderTokenControls(mapUrl, mapKey);
  };
  container.appendChild(ringsToggleBtn);

  // Mob type picker (non-green only)
  if (selectedTokenColor !== 'green') {
    var MOB_TYPES = ['Bandit','Bugbear','Cultist','Dragon','Drow','Gelatinous Cube',
      'Ghoul','Giant','Gnoll','Goblin','Guard','Hobgoblin','Kobold','Mimic',
      'Ogre','Orc','Owlbear','Skeleton','Spy','Thug','Troll','Vampire',
      'Werewolf','Wolf','Zombie'];
    var mobRow = document.createElement('div');
    mobRow.style.cssText = 'display:flex;gap:0.4rem;align-items:center;flex-wrap:nowrap;';
    var mobLbl = document.createElement('span');
    mobLbl.textContent = 'Mob Type:';
    mobLbl.style.cssText = 'font-size:0.75rem;color:#888;white-space:nowrap;';
    mobRow.appendChild(mobLbl);
    var mobSel = document.createElement('select');
    mobSel.style.cssText = 'background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#e6e6e6;' +
      'padding:0.22rem 0.4rem;font-size:0.77rem;flex:1;min-width:100px;';
    var blankOpt = document.createElement('option');
    blankOpt.value = '';
    blankOpt.textContent = '— Generic (E1, F1…)';
    mobSel.appendChild(blankOpt);
    MOB_TYPES.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t;
      o.textContent = t;
      if (t === selectedMobType) o.selected = true;
      mobSel.appendChild(o);
    });
    if (selectedMobType && !MOB_TYPES.includes(selectedMobType)) mobSel.value = '';
    mobSel.onchange = function () {
      selectedMobType = mobSel.value;
      customMobInput.value = '';
      if (selectedMobType) fetchMonsterByName(selectedMobType);
    };
    mobRow.appendChild(mobSel);
    var customMobInput = document.createElement('input');
    customMobInput.type = 'text';
    customMobInput.placeholder = 'Custom…';
    customMobInput.value = (selectedMobType && !MOB_TYPES.includes(selectedMobType)) ? selectedMobType : '';
    customMobInput.style.cssText = 'background:#0d1117;border:1px solid #30363d;border-radius:4px;color:#e6e6e6;' +
      'padding:0.22rem 0.4rem;font-size:0.77rem;width:80px;';
    customMobInput.oninput = function () {
      selectedMobType = customMobInput.value.trim();
      if (selectedMobType) mobSel.value = '';
    };
    mobRow.appendChild(customMobInput);
    container.appendChild(mobRow);
  }

  // Player quick-place buttons (only shown when Player color is active)
  if (selectedTokenColor === 'green' && playerRoster.length) {
    var playerPickRow = document.createElement('div');
    playerPickRow.style.cssText = 'display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.5rem;' +
      'padding:0.5rem;background:#0d1117;border:1px solid #16a34a;border-radius:6px;';
    var pickLabel = document.createElement('div');
    pickLabel.textContent = 'Click a player then click the map:';
    pickLabel.style.cssText = 'width:100%;font-size:0.72rem;color:#888;margin-bottom:0.3rem;';
    playerPickRow.appendChild(pickLabel);

    // Add Party button
    var addPartyBtn = document.createElement('button');
    addPartyBtn.textContent = addPartyMode ? '👥 Add Party: ON' : '👥 Add Party';
    addPartyBtn.style.cssText = [
      'flex:none', 'white-space:nowrap', 'padding:0.3rem 0.9rem',
      'font-size:0.78rem', 'font-weight:bold', 'border-radius:4px', 'cursor:pointer', 'color:#fff',
      'border:2px solid ' + (addPartyMode ? '#facc15' : '#374151'),
      'background:' + (addPartyMode ? 'rgba(250,204,21,0.2)' : 'rgba(0,0,0,0.4)'),
      addPartyMode ? 'box-shadow:0 0 8px #facc15' : ''
    ].join(';') + ';';
    addPartyBtn.title = 'Click then click the map to drop all party members in a cluster';
    addPartyBtn.onclick = function () {
      addPartyMode = !addPartyMode;
      if (addPartyMode) selectedPlayerName = null;
      renderTokenControls(mapUrl, mapKey);
    };
    playerPickRow.appendChild(addPartyBtn);

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
        addPartyMode = false;
        selectedPlayerName = (selectedPlayerName === p.name) ? null : p.name;
        renderTokenControls(mapUrl, mapKey);
      };
      playerPickRow.appendChild(pb);
    });
    if (addPartyMode) {
      var hint = document.createElement('div');
      hint.style.cssText = 'width:100%;font-size:0.72rem;color:#facc15;margin-top:0.3rem;';
      hint.textContent = '⬆ Click anywhere on the map to place all ' + playerRoster.length + ' party members in a cluster.';
      playerPickRow.appendChild(hint);
    }
    container.appendChild(playerPickRow);
  }

  // Map preview with token overlay — goes into the grid map container
  var mapTarget = (document.getElementById('token-map-container') || container);

  // Expand/collapse header row for the token map
  var mapHeaderRow = document.createElement('div');
  mapHeaderRow.style.cssText = 'display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;';
  var mapLabel = document.createElement('div');
  mapLabel.textContent = '🪬 Token Placement';
  mapLabel.style.cssText = 'font-size:0.7rem;font-weight:bold;text-transform:uppercase;letter-spacing:0.08em;color:#555;flex:1;';
  mapHeaderRow.appendChild(mapLabel);

  var expandBtn = document.createElement('button');
  expandBtn.style.cssText = 'font-size:0.72rem;padding:0.18rem 0.5rem;border-radius:4px;cursor:pointer;border:1px solid #30363d;' +
    'background:#0d1117;color:#888;white-space:nowrap;';
  expandBtn.textContent = tokenMapExpanded ? '⊟ Shrink' : '⊞ Expand';
  expandBtn.title = 'Toggle map zoom level';
  expandBtn.onclick = function () {
    tokenMapExpanded = !tokenMapExpanded;
    mapImg.style.maxHeight = tokenMapExpanded ? 'none' : '340px';
    expandBtn.textContent  = tokenMapExpanded ? '⊟ Shrink' : '⊞ Expand';
    // Redraw canvas sizing
    if (mapImg.complete) { drawCanvas.width = mapWrap.offsetWidth; drawCanvas.height = mapWrap.offsetHeight; redrawAnnotations(); }
  };
  mapHeaderRow.appendChild(expandBtn);
  mapTarget.appendChild(mapHeaderRow);

  var mapWrap = document.createElement('div');
  mapWrap.style.cssText = 'position:relative;display:inline-block;max-width:100%;' +
    'margin-bottom:0.5rem;border:1px solid ' + (drawModeActive ? '#facc15' : '#444') + ';' +
    'cursor:' + (drawModeActive ? 'none' : 'crosshair') + ';';

  var mapImg = document.createElement('img');
  mapImg.src = mapUrl;
  mapImg.style.cssText = 'display:block;max-width:100%;max-height:' + (tokenMapExpanded ? 'none' : '340px') + ';object-fit:contain;user-select:none;pointer-events:none;';
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
    // Look up initiative entry to get current conditions for ring display
    var initEntry = initiative.find(function (e) { return e.name === tok.label; });
    var dispConds = initEntry ? (initEntry.conditions || []) : [];
    var dispTok   = Object.assign({}, tok, { conditions: dispConds });

    var dot = document.createElement('div');
    dot.style.cssText = 'position:absolute;width:20px;height:20px;border-radius:50%;' +
      'background:' + tokenBgColor(tok) + ';' +
      'border:2px solid ' + (tok.mobType ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.9)') + ';' +
      'box-shadow:' + makeConditionShadow(dispTok) + ';display:flex;align-items:center;justify-content:center;' +
      'flex-direction:column;overflow:hidden;' +
      'left:' + (tok.x * 100) + '%;top:' + (tok.y * 100) + '%;transform:translate(-50%,-50%);' +
      'cursor:move;pointer-events:auto;z-index:10;user-select:none;';

    // Build tooltip with conditions
    var titleParts = [tok.label || ''];
    if (dispConds.length) titleParts.push(dispConds.map(function (c) { return c.icon + ' ' + c.name; }).join(', '));
    dot.title = titleParts.join(' | ');

    if (tok.type === 'player' && tok.cls && MOB_ICONS_CLASS[tok.cls]) {
      var iconEl = document.createElement('span');
      iconEl.textContent = MOB_ICONS_CLASS[tok.cls];
      iconEl.style.cssText = 'font-size:11px;line-height:1;display:block;pointer-events:none;';
      dot.appendChild(iconEl);
      var nmEl = document.createElement('span');
      nmEl.textContent = tok.label;
      nmEl.style.cssText = 'color:#fff;font-weight:bold;font-size:6px;line-height:1;' +
        'font-family:sans-serif;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.9);' +
        'white-space:nowrap;overflow:hidden;max-width:18px;';
      dot.appendChild(nmEl);
    } else if (tok.mobType && MOB_ICONS[tok.mobType]) {
      var iconEl = document.createElement('span');
      iconEl.textContent = MOB_ICONS[tok.mobType];
      iconEl.style.cssText = 'font-size:11px;line-height:1;display:block;pointer-events:none;';
      dot.appendChild(iconEl);
      var num = tok.label ? tok.label.replace(tok.mobType, '').trim() : '';
      if (num) {
        var numEl = document.createElement('span');
        numEl.textContent = num;
        numEl.style.cssText = 'color:#fff;font-weight:bold;font-size:7px;line-height:1;' +
          'font-family:sans-serif;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.9);';
        dot.appendChild(numEl);
      }
    } else if (tok.label) {
      var lbl = document.createElement('span');
      lbl.textContent = tok.label;
      lbl.style.cssText = 'color:#fff;font-weight:bold;font-size:8px;font-family:sans-serif;' +
        'line-height:1;user-select:none;pointer-events:none;';
      dot.appendChild(lbl);
    }
    // Stop map click from firing when clicking a dot
    dot.addEventListener('click', function (e) { e.stopPropagation(); });

    // Drop target: drag a condition row onto this token dot
    dot.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      dot.style.outline = '3px dashed #d4af37';
    });
    dot.addEventListener('dragleave', function () { dot.style.outline = ''; });
    dot.addEventListener('drop', function (e) {
      e.preventDefault();
      dot.style.outline = '';
      var raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      var cond; try { cond = JSON.parse(raw); } catch(ex) { return; }
      var entry = initiative.find(function (en) { return en.name === tok.label; });
      if (entry) {
        showCondDropPopup(e.clientX, e.clientY, cond, function (rounds) {
          if (!entry.conditions) entry.conditions = [];
          entry.conditions.push({ name: cond.name, icon: cond.icon, type: cond.type, rounds: rounds });
          saveInitiative();
          renderInitiative();
          sendTokenUpdate(mapKey);
          renderTokenControls(mapUrl, mapKey);
        });
      } else {
        // Token not in initiative — show brief flash on dot
        dot.style.outline = '3px solid #ef4444';
        setTimeout(function () { dot.style.outline = ''; }, 800);
      }
    });

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
        dot.style.boxShadow = makeConditionShadow(dispTok);
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
    // ── Add Party mode: place all party members in a grid around click ──
    if (selectedTokenColor === 'green' && addPartyMode && playerRoster.length) {
      var n = playerRoster.length;
      var cols2 = Math.ceil(Math.sqrt(n));
      var rows2 = Math.ceil(n / cols2);
      var spacing = 0.05; // normalized spacing between tokens
      var totalW = (cols2 - 1) * spacing;
      var totalH = (rows2 - 1) * spacing;
      var startX = x - totalW / 2;
      var startY = y - totalH / 2;
      playerRoster.forEach(function (p, i) {
        var col2 = i % cols2;
        var row2 = Math.floor(i / cols2);
        var tx = Math.max(0.01, Math.min(0.99, startX + col2 * spacing));
        var ty = Math.max(0.01, Math.min(0.99, startY + row2 * spacing));
        var existing2 = tokenState[mapKey].find(function (t) { return t.color === 'green' && t.label === p.name; });
        if (existing2) {
          existing2.x = tx; existing2.y = ty;
        } else {
          var tid = 'tok-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
          var nt = { id: tid, x: tx, y: ty, color: 'green', label: p.name, type: 'player', cls: p.cls || '' };
          tokenState[mapKey].push(nt);
          if (autoAddToInit) {
            var alreadyIn = initiative.some(function (e) { return e.name === p.name; });
            if (!alreadyIn) addToInitiative(p.name, Math.floor(Math.random() * 20) + 1, false, '');
          }
        }
      });
      sendTokenUpdate(mapKey);
      addPartyMode = false;
      renderTokenControls(mapUrl, mapKey);
      return;
    }

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
      if (selectedMobType) {
        var typeCount = tokenState[mapKey].filter(function (t) {
          return t.label.startsWith(selectedMobType + ' ');
        }).length + 1;
        label = selectedMobType + ' ' + typeCount;
      } else {
        var prefix = { red: 'E', blue: 'F', yellow: 'U' }[selectedTokenColor] || '?';
        var count  = tokenState[mapKey].filter(function (t) { return t.color === selectedTokenColor; }).length + 1;
        label = prefix + count;
      }
    }
    var id = 'tok-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    var newTok = { id: id, x: x, y: y, color: selectedTokenColor, label: label };
    if (selectedTokenColor === 'green') {
      var rp = playerRoster.find(function (p) { return p.name === selectedPlayerName; });
      if (rp) { newTok.type = 'player'; newTok.cls = rp.cls; }
    } else if (selectedMobType) {
      newTok.mobType = selectedMobType;
    }
    tokenState[mapKey].push(newTok);
    sendTokenUpdate(mapKey);
    renderTokenControls(mapUrl, mapKey);
    // Auto-add to initiative if toggle is on and not already present
    if (autoAddToInit && selectedTokenColor !== 'green') {
      var alreadyInInit = initiative.some(function (e) { return e.name === label; });
      if (!alreadyInInit) {
        // Check if the token's map cell is still fogged
        var fogKey2 = activeFogKey;
        var isFogged = false;
        if (fogKey2 && window.fogStates && window.fogStates[fogKey2]) {
          var fr = Math.min(fogRows - 1, Math.floor(y * fogRows));
          var fc = Math.min(fogCols - 1, Math.floor(x * fogCols));
          isFogged = !window.fogStates[fogKey2][fr][fc];
        }
        if (isFogged) {
          // Defer — add when that cell is revealed
          if (!fogDeferredInit[mapKey]) fogDeferredInit[mapKey] = [];
          fogDeferredInit[mapKey].push({ label: label, roll: Math.floor(Math.random() * 20) + 1, fr: fr, fc: fc });
        } else {
          addToInitiative(label, Math.floor(Math.random() * 20) + 1, false, '');
        }
      }
    }
  });

  mapTarget.appendChild(mapWrap);

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
        'background:' + tokenBgColor(tok) + ';border:2px solid rgba(255,255,255,0.4);' +
        'display:inline-flex;align-items:center;justify-content:center;font-size:8px;';
      if (tok.type === 'player' && tok.cls && MOB_ICONS_CLASS[tok.cls]) dot.textContent = MOB_ICONS_CLASS[tok.cls];
      else if (tok.mobType && MOB_ICONS[tok.mobType]) dot.textContent = MOB_ICONS[tok.mobType];
      row.appendChild(dot);
      var lbl = document.createElement('span');
      lbl.style.cssText = 'flex:1;font-size:0.75rem;color:#ccc;';
      lbl.textContent = tok.label + ' (' + tok.color + ')';
      row.appendChild(lbl);
      // Show conditions from initiative tracker
      var initEntry = initiative.find(function (e) { return e.name === tok.label; });
      if (initEntry && initEntry.conditions && initEntry.conditions.length) {
        var condWrap = document.createElement('span');
        condWrap.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;align-items:center;max-width:160px;';
        initEntry.conditions.forEach(function (c) {
          var badge = document.createElement('span');
          badge.title = c.type;
          var roundLabel = c.rounds === null ? '∞' : c.rounds + 'r';
          badge.textContent = (c.icon || '') + ' ' + c.name + ' ' + roundLabel;
          badge.style.cssText = 'font-size:0.65rem;line-height:1.3;padding:1px 4px;border-radius:3px;white-space:nowrap;' +
            'background:' + (c.type === 'buff' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)') + ';' +
            'border:1px solid ' + (c.type === 'buff' ? '#22c55e' : '#ef4444') + ';' +
            'color:' + (c.type === 'buff' ? '#4ade80' : '#f87171') + ';';
          condWrap.appendChild(badge);
        });
        row.appendChild(condWrap);
      }
      var rmBtn = document.createElement('button');
      rmBtn.textContent = '✕';
      rmBtn.className = 'btn btn-danger btn-small';
      rmBtn.style.cssText = 'padding:0.1rem 0.4rem;min-width:0;flex:none;';
      rmBtn.onclick = (function (i, tok) {
        return function () {
          // Remove from initiative tracker if present
          initiative = initiative.filter(function (e) { return e.name !== tok.label; });
          // Remove from fog deferred queue too
          if (fogDeferredInit[mapKey]) {
            fogDeferredInit[mapKey] = fogDeferredInit[mapKey].filter(function (d) { return d.label !== tok.label; });
          }
          renderInitiative();
          tokenState[mapKey].splice(i, 1);
          sendTokenUpdate(mapKey);
          renderTokenControls(mapUrl, mapKey);
        };
      })(idx, tok);
      row.appendChild(rmBtn);
      listDiv.appendChild(row);
    });

    var clearAllBtn = document.createElement('button');
    clearAllBtn.textContent = '🗑 Clear All Tokens';
    clearAllBtn.className = 'btn btn-warning btn-small';
    clearAllBtn.style.marginTop = '0.3rem';
    clearAllBtn.onclick = function () {
      // Remove all non-player tokens from initiative
      var removedLabels = (tokenState[mapKey] || []).filter(function (t) { return t.color !== 'green'; }).map(function (t) { return t.label; });
      initiative = initiative.filter(function (e) { return !removedLabels.includes(e.name); });
      fogDeferredInit[mapKey] = [];
      renderInitiative();
      tokenState[mapKey] = [];
      sendTokenUpdate(mapKey);
      renderTokenControls(mapUrl, mapKey);
    };
    listDiv.appendChild(clearAllBtn);
    mapTarget.appendChild(listDiv);
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
  // Expand Scene Builder section and scroll it into view
  var sbSection = document.getElementById('section-scene-builder');
  if (sbSection) {
    var details = sbSection.querySelector('details');
    if (details) details.open = true;
  }
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

// ── Section Drag & Drop — DOM reorder ──────────────────────────────────
(function () {
  var ORDER_KEY = 'dm-panel-order';
  var grid = document.querySelector('.panel-grid');
  var dragSrc = null;
  var dragSection = null;
  var dropTarget = null;

  // Clear any broken explicit positions from the old ghost system
  localStorage.removeItem('dm-panel-positions');
  grid.querySelectorAll(':scope > section.panel').forEach(function (s) {
    s.style.gridColumn = '';
    s.style.gridRow = '';
  });

  function restoreOrder() {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(ORDER_KEY)); } catch (e) { saved = null; }
    if (!Array.isArray(saved) || !saved.length) return;
    saved.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentElement === grid) grid.appendChild(el);
    });
  }

  function saveOrder() {
    var ids = Array.from(grid.querySelectorAll(':scope > section')).map(function (s) { return s.id; }).filter(Boolean);
    localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
  }

  document.addEventListener('mousedown', function (e) {
    var handle = e.target.closest && e.target.closest('.drag-handle');
    if (handle) {
      var section = handle.closest('section');
      if (section) { section.setAttribute('draggable', 'true'); dragSection = section; }
    }
  });

  document.addEventListener('mouseup', function () {
    if (dragSection && !dragSrc) {
      dragSection.setAttribute('draggable', 'false');
      dragSection = null;
    }
  });

  grid.addEventListener('dragstart', function (e) {
    var el = e.target;
    while (el && el.tagName !== 'SECTION') el = el.parentElement;
    if (!el || !grid.contains(el) || el.getAttribute('draggable') !== 'true') { e.preventDefault(); return; }
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

  grid.addEventListener('drop', function (e) {
    e.preventDefault();
    if (!dragSrc || !dropTarget) return;
    var rect = dropTarget.getBoundingClientRect();
    if (e.clientX < rect.left + rect.width / 2) {
      grid.insertBefore(dragSrc, dropTarget);
    } else {
      grid.insertBefore(dragSrc, dropTarget.nextSibling);
    }
    dropTarget = null;
  });

  restoreOrder();
}());

// ── Panel Width Controls ──────────────────────────────────────
(function () {
  var COL_CLASSES = ['col-1','col-2','col-3','col-4','col-5','col-6'];
  var WIDTH_KEY = 'dm-panel-widths';

  function currentColNum(el) {
    for (var i = 0; i < COL_CLASSES.length; i++) {
      if (el.classList.contains(COL_CLASSES[i])) return i + 1;
    }
    return 2;
  }

  function saveWidths() {
    var map = {};
    document.querySelectorAll('.panel-grid section.panel[id]').forEach(function (s) {
      map[s.id] = currentColNum(s);
    });
    localStorage.setItem(WIDTH_KEY, JSON.stringify(map));
  }

  function restoreWidths() {
    var saved;
    try { saved = JSON.parse(localStorage.getItem(WIDTH_KEY)); } catch (e) { saved = null; }
    if (!saved) return;
    Object.keys(saved).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      COL_CLASSES.forEach(function (c) { el.classList.remove(c); });
      el.classList.add('col-' + saved[id]);
    });
  }

  function adjustWidth(section, delta) {
    var cur = currentColNum(section);
    var next = Math.max(1, Math.min(6, cur + delta));
    if (next === cur) return;
    COL_CLASSES.forEach(function (c) { section.classList.remove(c); });
    section.classList.add('col-' + next);
    var lbl = section.querySelector('.pw-label');
    if (lbl) lbl.textContent = next;
    saveWidths();
  }

  function injectControls() {
    document.querySelectorAll('.panel-grid section.panel[id]').forEach(function (section) {
      if (section.querySelector('.panel-width-ctrl')) return;
      var handle = section.querySelector('.drag-handle');
      if (!handle) return;
      var cur = currentColNum(section);
      var ctrl = document.createElement('span');
      ctrl.className = 'panel-width-ctrl';
      ctrl.innerHTML =
        '<button class="pw-btn pw-minus" title="Narrower">&#9664;</button>' +
        '<span class="pw-label">' + cur + '</span>' +
        '<button class="pw-btn pw-plus" title="Wider">&#9654;</button>';
      ctrl.querySelector('.pw-minus').addEventListener('click', function (e) {
        e.stopPropagation(); adjustWidth(section, -1);
      });
      ctrl.querySelector('.pw-plus').addEventListener('click', function (e) {
        e.stopPropagation(); adjustWidth(section, +1);
      });
      handle.parentNode.insertBefore(ctrl, handle.nextSibling);
    });
  }

  restoreWidths();
  injectControls();
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
  initiative.push({ name: name, roll: roll, isPlayer: !!isPlayer, cls: cls || '', conditions: [] });
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
  // Tick down conditions for the combatant whose turn is ending
  var expiredForIdx = -1;
  var entry = initiative[currentTurn];
  if (entry && entry.conditions && entry.conditions.length) {
    var had = entry.conditions.length;
    entry.conditions = entry.conditions.filter(function (c) {
      if (c.rounds === null) return true; // permanent
      c.rounds--;
      return c.rounds > 0;
    });
    if (entry.conditions.length < had) expiredForIdx = currentTurn;
  }
  currentTurn = (currentTurn + 1) % initiative.length;
  saveInitiative();
  renderInitiative();
  sendInitiative();
  if (activeTokenMapKey) {
    sendTokenUpdate(activeTokenMapKey);
    renderTokenControls(activeTokenMapUrl, activeTokenMapKey);
  }
  // Flash entry whose conditions just expired (after re-render so node is fresh)
  if (expiredForIdx >= 0) {
    var el = document.querySelector('#init-list .init-entry:nth-child(' + (expiredForIdx + 1) + ')');
    if (el) {
      el.style.outline = '2px solid #f97316';
      setTimeout(function () { el.style.outline = ''; }, 1400);
    }
  }
}

document.getElementById('init-next-btn').addEventListener('click', nextInitiativeTurn);
document.getElementById('init-send-btn').addEventListener('click', sendInitiative);
document.getElementById('qa-init-next-btn') && document.getElementById('qa-init-next-btn').addEventListener('click', nextInitiativeTurn);
document.getElementById('qa-init-send-btn') && document.getElementById('qa-init-send-btn').addEventListener('click', sendInitiative);

// ── Conditions preset list ────────────────────────────────────
var CONDITIONS = [
  { name: 'Advantage',       type: 'buff',   icon: '🎯', plus: 'Roll 2d20, keep the higher',                minus: '' },
  { name: 'Disadvantage',    type: 'debuff', icon: '🎲', plus: '',                                            minus: 'Roll 2d20, keep the lower' },
  { name: 'Blessed',         type: 'buff',   icon: '✨', plus: '+d4 to attacks & saving throws',              minus: 'Concentration' },
  { name: 'Haste',           type: 'buff',   icon: '💨', plus: '+2 AC, double speed, extra action',           minus: 'Lethargy 1 turn on end' },
  { name: 'Inspired',        type: 'buff',   icon: '🎵', plus: '+Inspiration die to any roll',                minus: '' },
  { name: 'Raging',          type: 'buff',   icon: '😡', plus: '+Rage dmg, resist physical damage',          minus: 'No spellcasting' },
  { name: 'Invisible',       type: 'buff',   icon: '👻', plus: 'Adv attacks; enemies disadv vs you',         minus: 'Ends on attack or spell cast' },
  { name: 'Flying',          type: 'buff',   icon: '🦅', plus: 'Gain fly speed',                             minus: 'Fall if incapacitated' },
  { name: 'Shield of Faith', type: 'buff',   icon: '🛡️', plus: '+2 AC',                                      minus: 'Concentration' },
  { name: 'Concentrating',   type: 'buff',   icon: '🧠', plus: 'Maintaining a concentration spell',          minus: 'Con save DC10+ on taking damage' },
  { name: 'Poisoned',        type: 'debuff', icon: '☠️', plus: '',                                            minus: 'Disadv on attacks & ability checks' },
  { name: 'Frightened',      type: 'debuff', icon: '😨', plus: '',                                            minus: "Disadv attacks if source visible; can't move closer" },
  { name: 'Prone',           type: 'debuff', icon: '⬇️', plus: '',                                            minus: 'Disadv attacks; melee vs you = adv, ranged = disadv; half speed to stand' },
  { name: 'Restrained',      type: 'debuff', icon: '🔗', plus: '',                                            minus: 'Speed 0; disadv attacks; adv attacks vs you' },
  { name: 'Stunned',         type: 'debuff', icon: '💫', plus: '',                                            minus: 'Incapacitated; auto-fail Str/Dex saves; adv attacks vs you' },
  { name: 'Blinded',         type: 'debuff', icon: '🙈', plus: '',                                            minus: 'Disadv attacks; adv attacks vs you' },
  { name: 'Deafened',        type: 'debuff', icon: '🔇', plus: '',                                            minus: "Can't hear; auto-fail sound-based checks" },
  { name: 'Paralyzed',       type: 'debuff', icon: '🧊', plus: '',                                            minus: 'Incapacitated; auto-fail Str/Dex saves; adv attacks vs you (crit if within 5ft)' },
  { name: 'Incapacitated',   type: 'debuff', icon: '💀', plus: '',                                            minus: 'No actions or reactions' },
  { name: 'Charmed',         type: 'debuff', icon: '💜', plus: '',                                            minus: "Can't attack charmer; charmer has adv on social checks vs you" },
  { name: 'Grappled',        type: 'debuff', icon: '✊', plus: '',                                            minus: 'Speed 0' },
  { name: 'Burning',         type: 'debuff', icon: '🔥', plus: '',                                            minus: '1d6 fire dmg/turn; action to douse' },
  { name: 'Exhaustion',      type: 'debuff', icon: '😴', plus: '',                                            minus: 'Levels 1-6: disadv checks → slow → no actions → unconscious → death' }
];

// ── Custom reference entries (DM-editable, persisted) ────────
var conditionRefs = JSON.parse(localStorage.getItem('dnd-cond-refs') || '[]');
function saveConditionRefs() { localStorage.setItem('dnd-cond-refs', JSON.stringify(conditionRefs)); }

var openCondPanel = null; // index of entry with open cond panel

function renderInitiative() {
  var list = document.getElementById('init-list');
  list.innerHTML = '';
  for (var i = 0; i < initiative.length; i++) {
    var entry  = initiative[i];
    var active = i === currentTurn;

    var div = document.createElement('div');
    div.className = 'init-entry' + (active ? ' active-turn' : '');
    div.dataset.initIdx = i;

    // Drop target: drag a condition row onto this entry
    // Use e.currentTarget (not the closed-over `div`) to avoid the closure-in-loop bug
    div.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      e.currentTarget.classList.add('cond-drop-hover');
    });
    div.addEventListener('dragleave', function (e) { e.currentTarget.classList.remove('cond-drop-hover'); });
    div.addEventListener('drop', function (e) {
      e.preventDefault();
      var self = e.currentTarget;
      self.classList.remove('cond-drop-hover');
      var raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      var cond; try { cond = JSON.parse(raw); } catch(ex) { return; }
      var idx = parseInt(self.dataset.initIdx);
      if (!initiative[idx]) return;
      showCondDropPopup(e.clientX, e.clientY, cond, function (rounds) {
        if (!initiative[idx].conditions) initiative[idx].conditions = [];
        initiative[idx].conditions.push({ name: cond.name, icon: cond.icon, type: cond.type, rounds: rounds });
        saveInitiative();
        renderInitiative();
        if (activeTokenMapKey) { sendTokenUpdate(activeTokenMapKey); renderTokenControls(activeTokenMapUrl, activeTokenMapKey); }
      });
    });

    // ── Top row: roll | name | tags | cond-btn | remove ──
    var top = document.createElement('div');
    top.className = 'init-entry-top';

    var order = document.createElement('span');
    order.className = 'init-order';
    order.textContent = entry.roll;
    top.appendChild(order);

    var nameSpan = document.createElement('span');
    nameSpan.className = 'init-entry-name';
    nameSpan.textContent = entry.name;
    if (entry.isPlayer) {
      nameSpan.innerHTML += ' <span style="font-size:0.65rem;color:#4ade80;border:1px solid #4ade80;border-radius:2px;padding:0 3px;vertical-align:middle;">PC</span>';
    }
    if (entry.cls) {
      nameSpan.innerHTML += ' <span style="font-size:0.65rem;color:#d4af37;border:1px solid #555;border-radius:2px;padding:0 3px;vertical-align:middle;">' + escHtml(entry.cls) + '</span>';
    }
    top.appendChild(nameSpan);

    // Conditions button
    var condBtn = document.createElement('button');
    condBtn.className = 'init-cond-btn';
    condBtn.title = 'Add/manage conditions';
    condBtn.textContent = '+ cond';
    condBtn.onclick = (function (idx) {
      return function (e) {
        e.stopPropagation();
        openCondPanel = (openCondPanel === idx) ? null : idx;
        renderInitiative();
      };
    })(i);
    top.appendChild(condBtn);

    // Remove button
    var rmBtn = document.createElement('button');
    rmBtn.className = 'init-remove';
    rmBtn.innerHTML = '&#x2715;';
    rmBtn.onclick = (function (idx) { return function () { removeInit(idx); }; })(i);
    top.appendChild(rmBtn);

    div.appendChild(top);

    // ── Condition badges ──
    if (entry.conditions && entry.conditions.length) {
      var badges = document.createElement('div');
      badges.className = 'init-conditions';
      entry.conditions.forEach(function (c, ci) {
        var badge = document.createElement('span');
        badge.className = 'cond-badge ' + c.type;
        var roundLabel = c.rounds === null ? '∞' : c.rounds + 'r';
        badge.innerHTML = escHtml(c.icon) + ' ' + escHtml(c.name) + ' <span class="init-round-badge">' + escHtml(roundLabel) + '</span>';
        var rm = document.createElement('button');
        rm.className = 'cond-remove';
        rm.innerHTML = '✕';
        rm.title = 'Remove condition';
        rm.onclick = (function (entryIdx, condIdx) {
          return function (e) {
            e.stopPropagation();
            initiative[entryIdx].conditions.splice(condIdx, 1);
            saveInitiative();
            renderInitiative();
            if (activeTokenMapKey) { sendTokenUpdate(activeTokenMapKey); renderTokenControls(activeTokenMapUrl, activeTokenMapKey); }
          };
        })(i, ci);
        badge.appendChild(rm);
        badges.appendChild(badge);
      });
      div.appendChild(badges);
    }

    // ── Condition panel (inline, shown when open) ──
    if (openCondPanel === i) {
      var panel = document.createElement('div');
      panel.className = 'init-cond-panel';

      // Preset select
      var sel = document.createElement('select');
      var defOpt = document.createElement('option');
      defOpt.value = '';
      defOpt.textContent = 'Pick condition…';
      sel.appendChild(defOpt);
      CONDITIONS.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.icon + ' ' + c.name + ' (' + c.type + ')';
        opt.dataset.type = c.type;
        opt.dataset.icon = c.icon;
        sel.appendChild(opt);
      });
      if (conditionRefs.length) {
        var sepOpt = document.createElement('option');
        sepOpt.disabled = true;
        sepOpt.textContent = '── Custom ──';
        sel.appendChild(sepOpt);
        conditionRefs.forEach(function (c) {
          var opt = document.createElement('option');
          opt.value = c.name;
          opt.textContent = c.icon + ' ' + c.name + ' (' + c.type + ')';
          opt.dataset.type = c.type;
          opt.dataset.icon = c.icon;
          sel.appendChild(opt);
        });
      }
      panel.appendChild(sel);

      // Custom name input
      var customInput = document.createElement('input');
      customInput.type = 'text';
      customInput.placeholder = 'Custom name…';
      customInput.style.marginLeft = '0.3rem';
      customInput.style.width = '100px';
      panel.appendChild(customInput);

      // Rounds input
      var roundsInput = document.createElement('input');
      roundsInput.type = 'number';
      roundsInput.min = 1;
      roundsInput.max = 99;
      roundsInput.placeholder = 'Rounds';
      roundsInput.style.marginLeft = '0.3rem';
      roundsInput.style.width = '60px';
      panel.appendChild(roundsInput);

      // Type toggle for custom
      var typeToggle = document.createElement('select');
      typeToggle.style.marginLeft = '0.3rem';
      ['buff', 'debuff'].forEach(function (t) {
        var o = document.createElement('option');
        o.value = t;
        o.textContent = t;
        typeToggle.appendChild(o);
      });
      typeToggle.value = 'debuff';
      panel.appendChild(typeToggle);

      // Permanent checkbox
      var permLabel = document.createElement('label');
      permLabel.style.cssText = 'margin-left:0.4rem;font-size:0.72rem;color:#888;white-space:nowrap;';
      var permCheck = document.createElement('input');
      permCheck.type = 'checkbox';
      permCheck.style.marginRight = '3px';
      permLabel.appendChild(permCheck);
      permLabel.appendChild(document.createTextNode('∞ Perm'));
      panel.appendChild(permLabel);

      // Add button
      var addCondBtn = document.createElement('button');
      addCondBtn.textContent = '+ Add';
      addCondBtn.className = 'btn btn-small btn-primary';
      addCondBtn.style.marginLeft = '0.3rem';
      addCondBtn.onclick = (function (entryIdx, selEl, custEl, rndEl, typeEl, permEl) {
        return function () {
          var preset = CONDITIONS.concat(conditionRefs).find(function (c) { return c.name === selEl.value; });
          var name  = custEl.value.trim() || (preset ? preset.name : '');
          var icon  = preset ? preset.icon : '⚡';
          var type  = preset ? preset.type : typeEl.value;
          var rounds = permEl.checked ? null : (parseInt(rndEl.value) || 1);
          if (!name) return;
          if (!initiative[entryIdx].conditions) initiative[entryIdx].conditions = [];
          initiative[entryIdx].conditions.push({ name: name, type: type, icon: icon, rounds: rounds });
          openCondPanel = null;
          saveInitiative();
          renderInitiative();
          if (activeTokenMapKey) { sendTokenUpdate(activeTokenMapKey); renderTokenControls(activeTokenMapUrl, activeTokenMapKey); }
        };
      })(i, sel, customInput, roundsInput, typeToggle, permCheck);
      panel.appendChild(addCondBtn);

      // Auto-fill type when preset selected
      sel.onchange = function () {
        var preset = CONDITIONS.concat(conditionRefs).find(function (c) { return c.name === sel.value; });
        if (preset) typeToggle.value = preset.type;
      };

      div.appendChild(panel);
    }

    list.appendChild(div);
  }
  renderReference();
}

window.removeInit = function (i) {
  initiative.splice(i, 1);
  if (currentTurn >= initiative.length) currentTurn = 0;
  if (openCondPanel === i) openCondPanel = null;
  saveInitiative();
  renderInitiative();
};

function sendInitiative() {
  if (!initiative.length) return;
  var html = '';
  for (var i = 0; i < initiative.length; i++) {
    var active = i === currentTurn;
    var entry  = initiative[i];
    var nameHtml = entry.name;
    if (entry.cls) nameHtml += ' <span style="font-size:0.75rem;opacity:0.75;">(' + entry.cls + ')</span>';

    // Condition badges
    var condHtml = '';
    if (entry.conditions && entry.conditions.length) {
      condHtml = '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:3px;">';
      entry.conditions.forEach(function (c) {
        var rounds = c.rounds === null ? '∞' : c.rounds + 'r';
        var color  = c.type === 'buff' ? '#4ade80' : '#ef4444';
        var bg     = c.type === 'buff' ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)';
        condHtml += '<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.65rem;' +
          'padding:1px 5px;border-radius:3px;border:1px solid ' + color + ';background:' + bg + ';color:' + color + ';">' +
          c.icon + ' ' + c.name + ' <span style="opacity:0.7;">' + rounds + '</span></span>';
      });
      condHtml += '</div>';
    }

    html += '<div style="display:flex;align-items:flex-start;gap:0.6rem;padding:0.45rem 0.7rem;margin-bottom:0.3rem;' +
      'background:' + (active ? 'rgba(212,175,55,0.18)' : 'rgba(0,0,0,0.18)') + ';border:1px solid ' +
      (active ? 'rgba(212,175,55,0.7)' : 'rgba(90,50,10,0.35)') + ';border-radius:3px;font-size:1rem;">' +
      '<span style="font-weight:bold;min-width:26px;font-size:0.95rem;padding-top:2px;">' + entry.roll + '</span>' +
      '<div style="flex:1;' + (active ? 'font-weight:bold;' : '') + '">' +
      nameHtml + (active ? '  ◀' : '') + condHtml + '</div></div>';
  }
  fetch('/api/overlay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Initiative Order', data: html, duration: 12000 })
  });
}

// ── Reference Panel ──────────────────────────────────────────

// ── Condition-drop rounds popup ───────────────────────────────
// Shows a small floating dialog at (x,y) asking for rounds, calls onConfirm(rounds)
// rounds === null means permanent (∞)
function showCondDropPopup(x, y, cond, onConfirm) {
  // Remove any existing popup
  var old = document.getElementById('cond-drop-popup');
  if (old) old.remove();

  var popup = document.createElement('div');
  popup.id = 'cond-drop-popup';
  popup.style.cssText = 'position:fixed;z-index:9999;background:#1c2128;border:1px solid #d4af37;' +
    'border-radius:6px;padding:0.6rem 0.75rem;box-shadow:0 4px 18px rgba(0,0,0,0.7);' +
    'display:flex;flex-direction:column;gap:0.4rem;min-width:180px;font-size:0.82rem;' +
    'left:' + Math.min(x, window.innerWidth - 210) + 'px;' +
    'top:'  + Math.min(y, window.innerHeight - 160) + 'px;';

  var title = document.createElement('div');
  title.style.cssText = 'color:#d4af37;font-weight:bold;font-size:0.85rem;';
  title.textContent   = cond.icon + ' ' + cond.name;
  popup.appendChild(title);

  var row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:0.5rem;';

  var rndLabel = document.createElement('label');
  rndLabel.textContent = 'Rounds:';
  rndLabel.style.cssText = 'color:#aaa;white-space:nowrap;';
  row.appendChild(rndLabel);

  var rndInput = document.createElement('input');
  rndInput.type  = 'number';
  rndInput.min   = 1;
  rndInput.max   = 99;
  rndInput.value = 1;
  rndInput.style.cssText = 'width:52px;';
  row.appendChild(rndInput);

  var permLabel = document.createElement('label');
  permLabel.style.cssText = 'display:flex;align-items:center;gap:3px;color:#aaa;cursor:pointer;white-space:nowrap;';
  var permCheck = document.createElement('input');
  permCheck.type = 'checkbox';
  permCheck.onchange = function () {
    rndInput.disabled = permCheck.checked;
    rndInput.style.opacity = permCheck.checked ? '0.35' : '1';
  };
  permLabel.appendChild(permCheck);
  permLabel.appendChild(document.createTextNode('∞ Perm'));
  row.appendChild(permLabel);
  popup.appendChild(row);

  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:0.4rem;justify-content:flex-end;';

  var cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className   = 'btn btn-small btn-secondary';
  cancelBtn.onclick     = function () { popup.remove(); };
  btnRow.appendChild(cancelBtn);

  var applyBtn = document.createElement('button');
  applyBtn.textContent = 'Apply';
  applyBtn.className   = 'btn btn-small btn-primary';
  applyBtn.onclick     = function () {
    var rounds = permCheck.checked ? null : (parseInt(rndInput.value) || 1);
    popup.remove();
    onConfirm(rounds);
  };
  btnRow.appendChild(applyBtn);
  popup.appendChild(btnRow);

  document.body.appendChild(popup);
  rndInput.focus();
  rndInput.select();

  // Enter key confirms, Escape cancels
  popup.addEventListener('keydown', function (e) {
    if (e.key === 'Enter')  { e.preventDefault(); applyBtn.click(); }
    if (e.key === 'Escape') { e.preventDefault(); popup.remove(); }
  });

  // Click outside cancels
  setTimeout(function () {
    document.addEventListener('mousedown', function outsideClick(ev) {
      if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener('mousedown', outsideClick); }
    });
  }, 50);
}

// ============================================================
// Send Text — floating popup
// ============================================================
function showSendTextPopup(anchorBtn) {
  var old = document.getElementById('send-text-popup');
  if (old) { old.remove(); return; } // toggle off on second click

  var rect  = anchorBtn.getBoundingClientRect();
  var popup = document.createElement('div');
  popup.id  = 'send-text-popup';
  popup.style.cssText =
    'position:fixed;z-index:9999;background:#1c2128;border:1px solid #d4af37;' +
    'border-radius:6px;padding:0.75rem;box-shadow:0 4px 18px rgba(0,0,0,0.7);' +
    'display:flex;flex-direction:column;gap:0.5rem;width:300px;font-size:0.82rem;' +
    'left:' + Math.min(rect.left, window.innerWidth - 320) + 'px;' +
    'top:'  + Math.min(rect.bottom + 4, window.innerHeight - 240) + 'px;';

  var hdr = document.createElement('div');
  hdr.textContent = '📜 Send Text Overlay';
  hdr.style.cssText = 'color:#d4af37;font-weight:bold;';
  popup.appendChild(hdr);

  var labelIn = document.createElement('input');
  labelIn.type = 'text';
  labelIn.placeholder = 'Label (e.g. Room Description)';
  popup.appendChild(labelIn);

  var textArea = document.createElement('textarea');
  textArea.rows = 5;
  textArea.placeholder = 'Type content here…';
  textArea.style.resize = 'vertical';
  popup.appendChild(textArea);

  var sendBtn = document.createElement('button');
  sendBtn.textContent = '📜 Send';
  sendBtn.className = 'btn btn-primary';
  sendBtn.onclick = function () {
    var raw = textArea.value.trim();
    if (!raw) return;
    fetch('/api/overlay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: labelIn.value.trim(), data: raw.replace(/\n/g, '<br>'), duration: 15000 })
    });
    popup.remove();
  };
  popup.appendChild(sendBtn);
  document.body.appendChild(popup);
  labelIn.focus();

  popup.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); popup.remove(); }
  });
  setTimeout(function () {
    document.addEventListener('mousedown', function outsideClick(ev) {
      if (!popup.contains(ev.target) && ev.target !== anchorBtn) {
        popup.remove();
        document.removeEventListener('mousedown', outsideClick);
      }
    });
  }, 50);
}

// ============================================================
// Send Image — floating popup
// ============================================================
function showSendImagePopup(anchorBtn) {
  var old = document.getElementById('send-image-popup');
  if (old) { old.remove(); return; } // toggle off on second click

  var rect  = anchorBtn.getBoundingClientRect();
  var popup = document.createElement('div');
  popup.id  = 'send-image-popup';
  popup.style.cssText =
    'position:fixed;z-index:9999;background:#1c2128;border:1px solid #d4af37;' +
    'border-radius:6px;padding:0.75rem;box-shadow:0 4px 18px rgba(0,0,0,0.7);' +
    'display:flex;flex-direction:column;gap:0.45rem;width:300px;font-size:0.82rem;' +
    'left:' + Math.min(rect.left, window.innerWidth - 320) + 'px;' +
    'top:'  + Math.min(rect.bottom + 4, window.innerHeight - 360) + 'px;';

  var hdr = document.createElement('div');
  hdr.textContent = '🖼 Send Image';
  hdr.style.cssText = 'color:#d4af37;font-weight:bold;';
  popup.appendChild(hdr);

  var labelIn = document.createElement('input');
  labelIn.type = 'text';
  labelIn.placeholder = 'Label (e.g. Battle Map)';
  popup.appendChild(labelIn);

  var urlIn = document.createElement('input');
  urlIn.type = 'text';
  urlIn.placeholder = 'Image URL';
  popup.appendChild(urlIn);

  var div1 = document.createElement('div');
  div1.textContent = '— or choose from library —';
  div1.style.cssText = 'color:#888;text-align:center;font-size:0.75rem;';
  popup.appendChild(div1);

  var mapSel = document.createElement('select');
  var defOpt = document.createElement('option');
  defOpt.value = '';
  defOpt.textContent = '— loading… —';
  mapSel.appendChild(defOpt);
  fetch('/api/maps')
    .then(function (r) { return r.json(); })
    .catch(function () { return { maps: [] }; })
    .then(function (data) {
      defOpt.textContent = '— Select a map —';
      (data.maps || []).forEach(function (url) {
        var lbl = url.split('/').pop().replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
        var opt = document.createElement('option');
        opt.value = url; opt.textContent = lbl;
        mapSel.appendChild(opt);
      });
    });
  mapSel.onchange = function () {
    if (!this.value) return;
    urlIn.value = this.value;
    fileIn.value = '';
    preview.innerHTML = '<img src="' + this.value + '" style="max-width:100%;max-height:110px;border-radius:4px;margin-top:2px;" />';
  };
  popup.appendChild(mapSel);

  var div2 = document.createElement('div');
  div2.textContent = '— or pick a file —';
  div2.style.cssText = 'color:#888;text-align:center;font-size:0.75rem;';
  popup.appendChild(div2);

  var fileIn = document.createElement('input');
  fileIn.type = 'file';
  fileIn.accept = 'image/*';
  fileIn.onchange = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    mapSel.value = '';
    urlIn.value = '/assets/maps/' + file.name;
    preview.innerHTML = '<img src="' + URL.createObjectURL(file) + '" style="max-width:100%;max-height:110px;border-radius:4px;margin-top:2px;" />';
  };
  popup.appendChild(fileIn);

  var preview = document.createElement('div');
  popup.appendChild(preview);

  var sendBtn = document.createElement('button');
  sendBtn.textContent = '🖼 Send Image';
  sendBtn.className = 'btn btn-primary';
  sendBtn.onclick = function () {
    var url   = urlIn.value.trim();
    var label = labelIn.value.trim() || 'Image';
    if (url) {
      sendImage(label, url);
      popup.remove();
    } else if (fileIn.files[0]) {
      var reader = new FileReader();
      reader.onload = function (ev) { sendImage(label, ev.target.result); };
      reader.readAsDataURL(fileIn.files[0]);
      popup.remove();
    }
  };
  popup.appendChild(sendBtn);
  document.body.appendChild(popup);
  labelIn.focus();

  popup.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); popup.remove(); }
  });
  setTimeout(function () {
    document.addEventListener('mousedown', function outsideClick(ev) {
      if (!popup.contains(ev.target) && ev.target !== anchorBtn) {
        popup.remove();
        document.removeEventListener('mousedown', outsideClick);
      }
    });
  }, 50);
}

document.querySelectorAll('.ref-tab').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.ref-tab').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.ref-pane').forEach(function (p) { p.style.display = 'none'; });
    btn.classList.add('active');
    var pane = document.getElementById('ref-pane-' + btn.dataset.tab);
    if (pane) pane.style.display = '';
  });
});

// ── Rules tab: add send buttons to each static section ────────
(function () {
  var rulesPane = document.getElementById('ref-pane-rules');
  if (!rulesPane) return;
  rulesPane.querySelectorAll('.ref-section-hdr').forEach(function (hdr) {
    var sendBtn = document.createElement('button');
    sendBtn.className = 'ref-card-send';
    sendBtn.title = 'Send to player screen';
    sendBtn.textContent = '\uD83D\uDCDC Send';
    sendBtn.style.cssText = 'margin-left:0.5rem;vertical-align:middle;';
    hdr.appendChild(sendBtn);
    sendBtn.addEventListener('click', function () {
      // Collect all table rows in this section (up to next h3)
      var rows = [];
      var el = hdr.nextElementSibling;
      while (el && el.tagName !== 'H3') {
        if (el.tagName === 'TABLE') {
          el.querySelectorAll('tbody tr').forEach(function (tr) {
            var cells = Array.from(tr.querySelectorAll('td')).map(function (td) { return td.textContent.trim(); });
            rows.push(cells.join(' — '));
          });
        }
        el = el.nextElementSibling;
      }
      var dataHtml = rows.length
        ? '<ul style="margin:0;padding-left:1.2em;line-height:1.7;">' +
          rows.map(function (r) { return '<li>' + escHtml(r) + '</li>'; }).join('') +
          '</ul>'
        : '<em style="color:#666;">No data.</em>';
      fetch('/api/overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: hdr.textContent.replace('\uD83D\uDCDC Send','').trim(), data: dataHtml, duration: 20000 })
      });
    });
  });
})();

// ── Condition filter ─────────────────────────────────────────
document.getElementById('ref-cond-filter').addEventListener('input', function () {
  renderReference(this.value.trim().toLowerCase());
});

function renderReference(filterText) {
  var chartEl = document.getElementById('ref-active-chart');
  var dictEl  = document.getElementById('ref-dict-list');
  if (!chartEl || !dictEl) return;

  // Active Conditions Chart
  var active = initiative.filter(function (e) { return e.conditions && e.conditions.length; });
  if (!active.length) {
    chartEl.innerHTML = '<p class="ref-empty">No active conditions in initiative.</p>';
  } else {
    var chartRows = active.map(function (e) {
      var badges = e.conditions.map(function (c) {
        var rounds = c.rounds === null ? '∞' : c.rounds + 'r';
        return '<span class="cond-badge ' + c.type + '">' + c.icon + ' ' + c.name +
          ' <span class="init-round-badge">' + rounds + '</span></span>';
      }).join(' ');
      return '<tr><td class="ref-chart-name">' + e.name + '</td><td>' + badges + '</td></tr>';
    }).join('');
    chartEl.innerHTML = '<table class="ref-chart-table"><thead><tr><th>Combatant</th>' +
      '<th>Active Conditions</th></tr></thead><tbody>' + chartRows + '</tbody></table>';
  }

  // Condition Dictionary (built-in CONDITIONS + custom conditionRefs), with optional filter
  var filter = (filterText || '').toLowerCase();
  var allRefs = CONDITIONS.map(function (c) {
    return { name: c.name, type: c.type, icon: c.icon, plus: c.plus || '', minus: c.minus || '', builtin: true };
  }).concat(conditionRefs.map(function (r) {
    return { name: r.name, type: r.type, icon: r.icon, plus: r.plus || '', minus: r.minus || '', builtin: false };
  }));

  if (filter) {
    allRefs = allRefs.filter(function (r) {
      return r.name.toLowerCase().indexOf(filter) !== -1 ||
             r.plus.toLowerCase().indexOf(filter) !== -1 ||
             r.minus.toLowerCase().indexOf(filter) !== -1;
    });
  }

  var drows = allRefs.map(function (r, ri) {
    var realIdx = r.builtin ? -1 : conditionRefs.indexOf(conditionRefs.filter(function(x){return !r.builtin;})[ri - CONDITIONS.length]);
    var delBtn = r.builtin ? '' :
      '<button class="ref-del-btn" data-name="' + r.name.replace(/"/g, '&quot;') + '" title="Remove">✕</button>';
    var plusCell  = r.plus  ? r.plus  : '<span style="color:#444">—</span>';
    var minusCell = r.minus ? r.minus : '<span style="color:#444">—</span>';
    var sendBtn = '<button class="ref-row-send" ' +
      'data-name="' + r.name.replace(/"/g, '&quot;') + '" ' +
      'data-icon="' + r.icon.replace(/"/g, '&quot;') + '" ' +
      'data-plus="' + r.plus.replace(/"/g, '&quot;') + '" ' +
      'data-minus="' + r.minus.replace(/"/g, '&quot;') + '" ' +
      'title="Send to player screen">📜</button>';
    return '<tr class="ref-row ' + r.type + ' ref-row-draggable" draggable="true" ' +
      'data-cond-name="' + r.name.replace(/"/g, '&quot;') + '" ' +
      'data-cond-icon="' + r.icon.replace(/"/g, '&quot;') + '" ' +
      'data-cond-type="' + r.type + '" ' +
      'title="Drag onto a token or initiative entry to apply">' +
      '<td class="ref-icon-cell">' + r.icon + '</td>' +
      '<td><span class="cond-badge ' + r.type + '">' + r.name + '</span></td>' +
      '<td class="ref-plus-cell">'  + plusCell  + '</td>' +
      '<td class="ref-minus-cell">' + minusCell + '</td>' +
      '<td style="white-space:nowrap;">' + sendBtn + delBtn + '</td></tr>';
  }).join('');

  dictEl.innerHTML = allRefs.length
    ? '<table class="ref-dict-table"><thead><tr><th></th><th>Condition</th>' +
      '<th class="ref-plus-hdr">+ Benefit</th>' +
      '<th class="ref-minus-hdr">– Penalty</th><th></th></tr></thead>' +
      '<tbody>' + drows + '</tbody></table>'
    : '<p class="ref-empty">No matching conditions.</p>';

  dictEl.querySelectorAll('.ref-del-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var name = btn.dataset.name;
      var idx  = conditionRefs.findIndex(function (r) { return r.name === name; });
      if (idx !== -1) { conditionRefs.splice(idx, 1); saveConditionRefs(); renderReference(); }
    });
  });

  dictEl.querySelectorAll('.ref-row-send').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var plus  = (btn.dataset.plus  || '').trim();
      var minus = (btn.dataset.minus || '').trim();
      var dataHtml =
        (plus  ? '<div style="margin-bottom:0.3rem;"><b style="color:#4ade80;">Benefit:</b> ' + escHtml(plus)  + '</div>' : '') +
        (minus ? '<div><b style="color:#ef4444;">Penalty:</b> ' + escHtml(minus) + '</div>' : '') ||
        '<em style="color:#666;">No description.</em>';
      fetch('/api/overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: btn.dataset.icon + ' ' + btn.dataset.name, data: dataHtml, duration: 15000 })
      });
    });
  });

  // Drag start: encode condition into dataTransfer
  dictEl.querySelectorAll('.ref-row-draggable').forEach(function (row) {
    row.addEventListener('dragstart', function (e) {
      e.stopPropagation(); // prevent grid section-reorder handler from cancelling this drag
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', JSON.stringify({
        name: row.dataset.condName,
        icon: row.dataset.condIcon,
        type: row.dataset.condType
      }));
      // Create a visible ghost image so the user sees what they're dragging
      var ghost = document.createElement('div');
      ghost.textContent = row.dataset.condIcon + ' ' + row.dataset.condName;
      ghost.style.cssText = 'position:fixed;top:-999px;left:-999px;background:#1c2128;color:#d4af37;' +
        'border:1px solid #d4af37;border-radius:4px;padding:4px 10px;font-size:0.82rem;pointer-events:none;white-space:nowrap;';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 0);
      setTimeout(function () { ghost.remove(); }, 0);
    });
  });
}

document.getElementById('ref-add-btn').addEventListener('click', function () {
  var icon  = document.getElementById('ref-add-icon').value.trim() || '⚡';
  var name  = document.getElementById('ref-add-name').value.trim();
  var type  = document.getElementById('ref-add-type').value;
  var plus  = document.getElementById('ref-add-plus').value.trim();
  var minus = document.getElementById('ref-add-minus').value.trim();
  if (!name) return;
  conditionRefs.push({ name: name, type: type, icon: icon, plus: plus, minus: minus });
  saveConditionRefs();
  ['ref-add-name', 'ref-add-icon', 'ref-add-plus', 'ref-add-minus'].forEach(function (id) {
    document.getElementById(id).value = '';
  });
  renderReference();
});

// ── Reference API helpers ─────────────────────────────────────
var _refCache = {};
var _open5eBase = 'https://api.open5e.com/v1/';
var _dnd5eBase  = 'https://www.dnd5eapi.co/api/';

function refFetch(url, cb) {
  if (_refCache[url]) { cb(null, _refCache[url]); return; }
  fetch(url)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) { _refCache[url] = data; cb(null, data); })  // only cache successes
    .catch(function (e) { cb(e, null); });  // do NOT cache failures
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function makeCard(title, metaItems, desc) {
  var metaHtml = metaItems.filter(Boolean).map(function (m) {
    return '<span>' + escHtml(m) + '</span>';
  }).join('');
  var id = 'rc-' + Math.random().toString(36).slice(2);
  var shortDesc = escHtml(desc || '').slice(0, 400);
  var full      = escHtml(desc || '');
  var needsMore = full.length > shortDesc.length;
  return '<div class="ref-card">' +
    '<div class="ref-card-header"><div class="ref-card-title">' + escHtml(title) + '</div>' +
    '<button class="ref-card-send" title="Send to player screen">📜 Send</button></div>' +
    (metaHtml ? '<div class="ref-card-meta">' + metaHtml + '</div>' : '') +
    '<div class="ref-card-desc" id="' + id + '">' + shortDesc + (needsMore ? '…' : '') + '</div>' +
    (needsMore ? '<button class="ref-card-toggle" data-id="' + id + '" data-full="' + full.replace(/"/g,'&quot;') + '">▼ Show more</button>' : '') +
    '</div>';
}

function bindCardToggles(el) {
  el.querySelectorAll('.ref-card-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var d = document.getElementById(btn.dataset.id);
      if (d.classList.contains('expanded')) {
        d.classList.remove('expanded');
        d.textContent = btn.dataset.full.slice(0, 400) + '…';
        btn.textContent = '▼ Show more';
      } else {
        d.classList.add('expanded');
        d.textContent = btn.dataset.full;
        btn.textContent = '▲ Show less';
      }
    });
  });
  el.querySelectorAll('.ref-card-send').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card    = btn.closest('.ref-card');
      var title   = card.querySelector('.ref-card-title').textContent;
      var metaEl  = card.querySelector('.ref-card-meta');
      var toggleEl = card.querySelector('.ref-card-toggle');
      var descEl  = card.querySelector('.ref-card-desc');
      // data-full holds the HTML-escaped full description
      var fullDesc = toggleEl ? toggleEl.dataset.full : escHtml(descEl.textContent);
      var dataHtml =
        (metaEl ? '<div style="color:#aaa;font-size:0.82em;margin-bottom:0.5rem;">' + escHtml(metaEl.textContent) + '</div>' : '') +
        '<div style="line-height:1.5;">' + fullDesc.replace(/\n/g, '<br>') + '</div>';
      fetch('/api/overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title, data: dataHtml, duration: 20000 })
      });
    });
  });
}

// ── Spells ────────────────────────────────────────────────────
function searchSpells() {
  var q     = document.getElementById('ref-spell-q').value.trim();
  var level = document.getElementById('ref-spell-level').value;
  var el    = document.getElementById('ref-spell-results');
  if (!q && level === '') { el.innerHTML = '<p class="ref-empty">Enter a spell name or pick a level.</p>'; return; }
  el.innerHTML = '<p class="ref-loading">Searching Open5e…</p>';
  var url = _open5eBase + 'spells/?limit=50';
  if (q) url += '&name__icontains=' + encodeURIComponent(q);
  if (level !== '') url += '&spell_level=' + level;
  refFetch(url, function (err, data) {
    if (err || !data || !data.results) { el.innerHTML = '<p class="ref-error">Failed to load spells. Check internet connection.</p>'; return; }
    if (!data.results.length) { el.innerHTML = '<p class="ref-empty">No spells found.</p>'; return; }
    var html = data.results.map(function (s) {
      var levelStr = s.spell_level === 0 ? 'Cantrip' : s.spell_level + (s.spell_level===1?'st':s.spell_level===2?'nd':s.spell_level===3?'rd':'th') + ' level';
      var source = s.document__title ? '📖 ' + s.document__title : '';
      return makeCard(s.name,
        [levelStr, s.school, s.casting_time, 'Range: ' + s.range, 'Duration: ' + s.duration, s.concentration ? 'Concentration' : '', s.ritual ? 'Ritual' : '', source],
        s.desc);
    }).join('');
    el.innerHTML = html;
    bindCardToggles(el);
  });
}
document.getElementById('ref-spell-btn').addEventListener('click', searchSpells);
document.getElementById('ref-spell-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') searchSpells(); });

// ── Items ─────────────────────────────────────────────────────
function searchItems() {
  var q    = document.getElementById('ref-item-q').value.trim();
  var type = document.getElementById('ref-item-type').value;
  var el   = document.getElementById('ref-item-results');
  if (!q) { el.innerHTML = '<p class="ref-empty">Enter an item name.</p>'; return; }
  el.innerHTML = '<p class="ref-loading">Searching Open5e…</p>';

  if (type === 'magic') {
    var url = _open5eBase + 'magicitems/?limit=30&name__icontains=' + encodeURIComponent(q);
    refFetch(url, function (err, data) {
      if (err || !data || !data.results) { el.innerHTML = '<p class="ref-error">Failed: ' + (err ? err.message : 'unexpected response') + '</p>'; return; }
      if (!data.results.length) { el.innerHTML = '<p class="ref-empty">No magic items found.</p>'; return; }
      var html = data.results.map(function (it) {
        var src = it.document__title ? '📖 ' + it.document__title : '';
        return makeCard(it.name, [it.type, it.rarity, it.requires_attunement ? 'Requires attunement' : '', src], it.desc);
      }).join('');
      el.innerHTML = html;
      bindCardToggles(el);
    });
    return;
  }

  // Equipment: search weapons + armor in parallel, merge results
  var enc = encodeURIComponent(q);
  var weaponUrl = _open5eBase + 'weapons/?limit=20&name__icontains=' + enc;
  var armorUrl  = _open5eBase + 'armor/?limit=10&name__icontains=' + enc;
  var results = {};
  var done = 0;

  function onBoth() {
    done++;
    if (done < 2) return;
    var weapons = (results.weapons && results.weapons.results) ? results.weapons.results : [];
    var armor   = (results.armor   && results.armor.results)   ? results.armor.results   : [];
    var all = weapons.concat(armor);
    if (!all.length) { el.innerHTML = '<p class="ref-empty">No equipment found for "' + escHtml(q) + '".</p>'; return; }
    var html = all.map(function (it) {
      if (it.damage_dice) {
        // Weapon
        var props = (it.properties || []).join(', ');
        var src   = it.document__title ? '📖 ' + it.document__title : '';
        return makeCard(it.name,
          [it.category, 'Cost: ' + (it.cost || '—'), 'Dmg: ' + it.damage_dice + ' ' + (it.damage_type || ''), 'Wt: ' + (it.weight || '—'), src],
          props ? 'Properties: ' + props : '');
      } else {
        // Armor
        var src2 = it.document__title ? '📖 ' + it.document__title : '';
        return makeCard(it.name,
          [it.category, 'Cost: ' + (it.cost || '—'), it.ac_string || '', 'Wt: ' + (it.weight || '—'),
           it.stealth_disadvantage ? '⚠️ Stealth disadv.' : '', src2],
          it.strength_requirement ? 'Requires STR ' + it.strength_requirement : '');
      }
    }).join('');
    el.innerHTML = html;
    bindCardToggles(el);
  }

  refFetch(weaponUrl, function (err, data) {
    results.weapons = (err || !data) ? { results: [] } : data;
    if (err) console.warn('Weapons fetch error:', err.message);
    onBoth();
  });
  refFetch(armorUrl, function (err, data) {
    results.armor = (err || !data) ? { results: [] } : data;
    if (err) console.warn('Armor fetch error:', err.message);
    onBoth();
  });
}
document.getElementById('ref-item-btn').addEventListener('click', searchItems);
document.getElementById('ref-item-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') searchItems(); });

// ── Feats ─────────────────────────────────────────────────────
function searchFeats() {
  var q  = document.getElementById('ref-feat-q').value.trim();
  var el = document.getElementById('ref-feat-results');
  if (!q) { el.innerHTML = '<p class="ref-empty">Enter a feat name.</p>'; return; }
  el.innerHTML = '<p class="ref-loading">Searching Open5e…</p>';
  var url = _open5eBase + 'feats/?limit=30&name__icontains=' + encodeURIComponent(q);
  refFetch(url, function (err, data) {
    if (err || !data || !data.results) {
      // Fallback: D&D 5e SRD API
      refFetch(_dnd5eBase + 'feats?name=' + encodeURIComponent(q), function (err2, data2) {
        if (err2 || !data2 || !data2.results) { el.innerHTML = '<p class="ref-error">Failed to load feats. Check internet connection.</p>'; return; }
        if (!data2.results.length) { el.innerHTML = '<p class="ref-empty">No feats found.</p>'; return; }
        // Fetch full detail for each
        var cards = []; var done = 0;
        data2.results.slice(0, 15).forEach(function (r, i) {
          refFetch(_dnd5eBase + r.url.replace('/api/', ''), function (err3, feat) {
            cards[i] = feat ? makeCard(feat.name, [feat.prerequisite ? 'Prerequisite: ' + feat.prerequisite : ''],
              (feat.desc || []).join('\n')) : '';
            if (++done === Math.min(data2.results.length, 15)) {
              el.innerHTML = cards.filter(Boolean).join('') || '<p class="ref-empty">No feats found.</p>';
              bindCardToggles(el);
            }
          });
        });
      });
      return;
    }
    if (!data.results.length) { el.innerHTML = '<p class="ref-empty">No feats found.</p>'; return; }
    var html = data.results.map(function (f) {
      return makeCard(f.name,
        [f.prerequisite ? 'Prerequisite: ' + f.prerequisite : ''],
        f.desc);
    }).join('');
    el.innerHTML = html;
    bindCardToggles(el);
  });
}
document.getElementById('ref-feat-btn').addEventListener('click', searchFeats);
document.getElementById('ref-feat-q').addEventListener('keydown', function (e) { if (e.key === 'Enter') searchFeats(); });

// ── Global search bar ─────────────────────────────────────────
document.getElementById('ref-global-search-btn').addEventListener('click', function () {
  var q   = document.getElementById('ref-global-search').value.trim();
  var cat = document.getElementById('ref-global-cat').value;
  if (!q) return;
  var el = document.getElementById('ref-global-results');
  el.style.marginBottom = '0.5rem';

  // Switch to the matching tab and pre-fill its search, then trigger it
  var tabBtn = document.querySelector('.ref-tab[data-tab="' + cat + '"]');
  if (tabBtn) {
    document.querySelectorAll('.ref-tab').forEach(function(b){b.classList.remove('active');});
    document.querySelectorAll('.ref-pane').forEach(function(p){p.style.display='none';});
    tabBtn.classList.add('active');
    var pane = document.getElementById('ref-pane-' + cat);
    if (pane) pane.style.display = '';
  }
  el.innerHTML = '';

  if (cat === 'spells') {
    document.getElementById('ref-spell-q').value = q;
    searchSpells();
  } else if (cat === 'items') {
    document.getElementById('ref-item-q').value = q;
    searchItems();
  } else if (cat === 'feats') {
    document.getElementById('ref-feat-q').value = q;
    searchFeats();
  } else if (cat === 'conditions') {
    document.getElementById('ref-cond-filter').value = q;
    renderReference(q.toLowerCase());
  }
});
document.getElementById('ref-global-search').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') document.getElementById('ref-global-search-btn').click();
});

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
// Monster Lookup  (Open5e API)
// ============================================================
var _monsterCache = {};

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function modStr(score) {
  var m = Math.floor((score - 10) / 2);
  return (m >= 0 ? '+' : '') + m;
}

function fetchMonsterByName(name) {
  var slug = slugify(name);
  if (_monsterCache[slug]) { renderMonsterStatBlock(_monsterCache[slug]); return; }
  var statEl = document.getElementById('monster-stat-block');
  statEl.className = 'msb-loading';
  statEl.textContent = 'Loading ' + name + '…';
  document.getElementById('monster-results-list').innerHTML = '';
  fetch('https://api.open5e.com/v1/monsters/?name__icontains=' + encodeURIComponent(name) + '&limit=20')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.results || !data.results.length) {
        statEl.className = 'msb-loading';
        statEl.textContent = 'No results for "' + name + '".';
        return;
      }
      if (data.results.length === 1) {
        _monsterCache[slug] = data.results[0];
        renderMonsterStatBlock(data.results[0]);
      } else {
        statEl.className = 'hidden';
        statEl.textContent = '';
        var listEl = document.getElementById('monster-results-list');
        listEl.innerHTML = '';
        data.results.forEach(function (m) {
          var btn = document.createElement('button');
          btn.className = 'monster-result-btn';
          btn.textContent = m.name;
          btn.onclick = function () {
            _monsterCache[slugify(m.name)] = m;
            renderMonsterStatBlock(m);
            listEl.querySelectorAll('.monster-result-btn').forEach(function (b) {
              b.classList.toggle('monster-result-active', b === btn);
            });
          };
          listEl.appendChild(btn);
        });
      }
    })
    .catch(function () {
      statEl.className = 'msb-loading';
      statEl.textContent = 'Error fetching monster data. Check your network.';
    });
}

function renderMonsterStatBlock(m) {
  var el = document.getElementById('monster-stat-block');
  el.className = '';

  function prop(label, val) {
    if (!val && val !== 0) return '';
    return '<div class="msb-prop-line"><strong>' + label + '</strong> ' + val + '</div>';
  }

  var scores = [['STR',m.strength],['DEX',m.dexterity],['CON',m.constitution],
                ['INT',m.intelligence],['WIS',m.wisdom],['CHA',m.charisma]];
  var scoresHtml = scores.map(function (s) {
    return '<div class="msb-score-box"><div class="msb-score-label">' + s[0] + '</div>' +
      '<div class="msb-score-val">' + (s[1] || '—') + '</div>' +
      '<div class="msb-score-mod">' + (s[1] ? modStr(s[1]) : '') + '</div></div>';
  }).join('');

  var actionsHtml = '';
  function renderActionGroup(label, arr) {
    if (!arr || !arr.length) return '';
    var rows = arr.map(function (a) {
      return '<div class="msb-action"><span class="msb-action-name">' + a.name + '.</span> ' +
        (a.desc || '') + '</div>';
    }).join('');
    return '<div class="msb-actions-hdr">' + label + '</div>' + rows;
  }
  actionsHtml += renderActionGroup('Actions', m.actions);
  actionsHtml += renderActionGroup('Bonus Actions', m.bonus_actions);
  actionsHtml += renderActionGroup('Reactions', m.reactions);
  actionsHtml += renderActionGroup('Legendary Actions', m.legendary_actions);

  var saves = [];
  ['strength_save','dexterity_save','constitution_save','intelligence_save','wisdom_save','charisma_save']
    .forEach(function (k) {
      if (m[k] !== null && m[k] !== undefined) {
        saves.push(k.replace('_save','').slice(0,3).toUpperCase() + ' +' + m[k]);
      }
    });

  el.innerHTML =
    '<div class="msb-name">' + m.name + '</div>' +
    '<div class="msb-meta">' + (m.size||'') + ' ' + (m.type||'') + (m.subtype ? ' (' + m.subtype + ')' : '') +
      ', ' + (m.alignment||'') + '</div>' +
    '<hr class="msb-divider">' +
    prop('Armor Class', m.armor_class + (m.armor_desc ? ' (' + m.armor_desc + ')' : '')) +
    prop('Hit Points', m.hit_points + ' (' + (m.hit_dice||'') + ')') +
    prop('Speed', m.speed ? Object.entries(m.speed).filter(function(e){return e[1];}).map(function(e){return e[0]+' '+e[1];}).join(', ') : '') +
    prop('Challenge', m.challenge_rating + (m.cr ? '' : '') + (m.xp ? ' (' + m.xp.toLocaleString() + ' XP)' : '')) +
    '<hr class="msb-divider">' +
    '<div class="msb-scores">' + scoresHtml + '</div>' +
    '<hr class="msb-divider">' +
    (saves.length ? prop('Saving Throws', saves.join(', ')) : '') +
    prop('Skills', m.skills ? Object.entries(m.skills).map(function(e){return e[0]+' +'+e[1];}).join(', ') : '') +
    prop('Damage Immunities', m.damage_immunities) +
    prop('Damage Resistances', m.damage_resistances) +
    prop('Damage Vulnerabilities', m.damage_vulnerabilities) +
    prop('Condition Immunities', m.condition_immunities) +
    prop('Senses', m.senses) +
    prop('Languages', m.languages) +
    (m.special_abilities && m.special_abilities.length ?
      '<hr class="msb-divider"><div class="msb-actions-hdr">Special Traits</div>' +
      m.special_abilities.map(function(a){
        return '<div class="msb-action"><span class="msb-action-name">' + a.name + '.</span> ' + (a.desc||'') + '</div>';
      }).join('') : '') +
    actionsHtml +
    '<button id="monster-send-btn" class="btn btn-secondary" style="margin-top:0.75rem;font-size:0.72rem;width:100%;">📜 Send to Players</button>';

  document.getElementById('monster-send-btn').addEventListener('click', function () {
    var scores = [['STR',m.strength],['DEX',m.dexterity],['CON',m.constitution],
                  ['INT',m.intelligence],['WIS',m.wisdom],['CHA',m.charisma]];
    var scoreRow = scores.map(function(s){
      return '<span style="margin-right:0.6rem;"><b>' + s[0] + '</b> ' + (s[1]||'—') + (s[1] ? ' (' + modStr(s[1]) + ')' : '') + '</span>';
    }).join('');
    var speed = m.speed ? Object.entries(m.speed).filter(function(e){return e[1];}).map(function(e){return e[0]+' '+e[1];}).join(', ') : '—';
    var dataHtml =
      '<div style="color:#aaa;font-style:italic;margin-bottom:0.4rem;">' +
        escHtml((m.size||'') + ' ' + (m.type||'') + (m.subtype?' ('+m.subtype+')':'') + ', ' + (m.alignment||'')) +
      '</div>' +
      '<div style="margin-bottom:0.3rem;"><b>AC</b> ' + escHtml(String(m.armor_class||'—')) + (m.armor_desc?' ('+escHtml(m.armor_desc)+')':'') +
        ' &nbsp;|&nbsp; <b>HP</b> ' + escHtml(String(m.hit_points||'—')) + ' (' + escHtml(m.hit_dice||'') + ')' +
        ' &nbsp;|&nbsp; <b>Speed</b> ' + escHtml(speed) + '</div>' +
      '<div style="margin-bottom:0.4rem;"><b>CR</b> ' + escHtml(String(m.challenge_rating||'—')) +
        (m.xp ? ' (' + m.xp.toLocaleString() + ' XP)' : '') + '</div>' +
      '<div style="margin-bottom:0.4rem;">' + scoreRow + '</div>';
    fetch('/api/overlay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: m.name, data: dataHtml, duration: 20000 })
    });
  });
}

document.getElementById('monster-search-btn').addEventListener('click', function () {
  var q = document.getElementById('monster-search-input').value.trim();
  if (q) fetchMonsterByName(q);
});
document.getElementById('monster-search-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { var q = this.value.trim(); if (q) fetchMonsterByName(q); }
});
document.getElementById('monster-clear-btn').addEventListener('click', function () {
  document.getElementById('monster-search-input').value = '';
  document.getElementById('monster-results-list').innerHTML = '';
  var sb = document.getElementById('monster-stat-block');
  sb.innerHTML = ''; sb.className = 'hidden';
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
      lastWidth = sidebar.offsetWidth || lastWidth;
      sidebar.classList.add('collapsed');
      sidebar.style.width    = '32px';
      sidebar.style.minWidth = '32px';
      if (inner) inner.style.width = '32px';
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

// ── Right Sidebar drag-to-resize ──────────────────────────────
(function () {
  var sidebar = document.getElementById('sidebar-right');
  var handle  = document.getElementById('sidebar-right-resize');
  if (!sidebar || !handle) return;

  var MIN_WIDTH = 200;
  var MAX_WIDTH = 700;
  var resizing  = false;
  var startX    = 0;
  var startW    = 0;

  handle.addEventListener('mousedown', function (e) {
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
    var newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW - (e.clientX - startX)));
    sidebar.style.width    = newW + 'px';
    sidebar.style.minWidth = newW + 'px';
  });

  document.addEventListener('mouseup', function () {
    if (!resizing) return;
    resizing = false;
    handle.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  });
}());
