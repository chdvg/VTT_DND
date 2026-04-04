var ws = null;
var initiative = [];
var currentTurn = 0;
var isBlackout = false;

var statusDot = document.getElementById('status-dot');
var clientCount = document.getElementById('client-count');
var blackoutBtn = document.getElementById('blackout-btn');
var clearBtn = document.getElementById('clear-btn');
var sendTextBtn = document.getElementById('send-text-btn');
var sendImageBtn = document.getElementById('send-image-btn');
var imageFile = document.getElementById('image-file');
var imagePreview = document.getElementById('image-preview');
var diceResult = document.getElementById('dice-result');

function connectWebSocket() {
  var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(protocol + '//' + window.location.host + '/ws');
  ws.onopen = function() {
    statusDot.classList.remove('off');
    statusDot.classList.add('on');
    ws.send(JSON.stringify({ action: 'dm-connect' }));
  };
  ws.onmessage = function(event) {
    var msg = JSON.parse(event.data);
    if (msg.type === 'clients') clientCount.textContent = msg.count + ' connected';
    if (msg.type === 'blackout') {
      isBlackout = msg.blackout;
      if (isBlackout) blackoutBtn.classList.add('active');
      else blackoutBtn.classList.remove('active');
    }
  };
  ws.onclose = function() {
    statusDot.classList.remove('on');
    statusDot.classList.add('off');
    setTimeout(connectWebSocket, 3000);
  };
  ws.onerror = function() {};
}

blackoutBtn.addEventListener('click', function() { fetch('/api/blackout', { method: 'POST' }); });
clearBtn.addEventListener('click', function() { fetch('/api/clear', { method: 'POST' }); });

sendTextBtn.addEventListener('click', function() {
  var label = document.getElementById('text-label').value.trim();
  var raw = document.getElementById('text-content').value.trim();
  if (!raw) return;
  var html = '<div style="font-size:1.2rem;line-height:1.8;padding:1rem;">' + raw.replace(/\n/g, '<br>') + '</div>';
  fetch('/api/show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: label || 'Text', data: html }) });
});

imageFile.addEventListener('change', function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) { imagePreview.innerHTML = '<img src="' + ev.target.result + '" />'; };
  reader.readAsDataURL(file);
});

sendImageBtn.addEventListener('click', function() {
  var label = document.getElementById('image-label').value.trim();
  var url = document.getElementById('image-url').value.trim();
  var file = imageFile.files[0];
  if (url) sendImage(label || 'Image', url);
  else if (file) {
    var reader = new FileReader();
    reader.onload = function(ev) { sendImage(label || file.name, ev.target.result); };
    reader.readAsDataURL(file);
  }
});

function sendImage(label, src) {
  var html = '<div style="text-align:center;padding:1rem;"><img src="' + src + '" style="max-width:100%;max-height:80vh;border-radius:8px;" /></div>';
  fetch('/api/show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: label, data: html }) });
}

document.querySelectorAll('.btn-dice').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var die = parseInt(btn.getAttribute('data-die'));
    var roll = Math.floor(Math.random() * die) + 1;
    diceResult.textContent = 'D' + die + ': ' + roll;
    if (document.getElementById('dice-broadcast').checked) {
      var html = '<div style="text-align:center;font-size:4rem;padding:2rem;color:#d4af37;">🎲 d' + die + ': <strong>' + roll + '</strong></div>';
      fetch('/api/show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Dice Roll', data: html }) });
    }
  });
});

var initList = document.getElementById('init-list');
document.getElementById('init-add-btn').addEventListener('click', function() {
  var name = document.getElementById('init-name').value.trim();
  var roll = parseInt(document.getElementById('init-roll').value);
  if (!name || isNaN(roll)) return;
  initiative.push({ name: name, roll: roll });
  initiative.sort(function(a, b) { return b.roll - a.roll; });
  currentTurn = 0;
  renderInitiative();
  document.getElementById('init-name').value = '';
  document.getElementById('init-roll').value = '';
});

document.getElementById('init-clear-btn').addEventListener('click', function() { initiative = []; currentTurn = 0; renderInitiative(); });
document.getElementById('init-next-btn').addEventListener('click', function() {
  if (initiative.length === 0) return;
  currentTurn = (currentTurn + 1) % initiative.length;
  renderInitiative();
  sendInitiative();
});
document.getElementById('init-send-btn').addEventListener('click', sendInitiative);

function renderInitiative() {
  var html = '';
  for (var i = 0; i < initiative.length; i++) {
    var active = i === currentTurn ? ' active-turn' : '';
    html += '<div class="init-entry' + active + '"><span class="init-order">' + initiative[i].roll + '</span><span class="init-entry-name">' + initiative[i].name + '</span><button class="init-remove" onclick="removeInit(' + i + ')">&#x2715;</button></div>';
  }
  initList.innerHTML = html;
}

window.removeInit = function(i) {
  initiative.splice(i, 1);
  if (currentTurn >= initiative.length) currentTurn = 0;
  renderInitiative();
};

function sendInitiative() {
  if (initiative.length === 0) return;
  var html = '<div style="max-width:400px;margin:0 auto;"><h2 style="text-align:center;color:#d4af37;margin-bottom:1rem;">⚔️ Initiative Order</h2>';
  for (var i = 0; i < initiative.length; i++) {
    var active = i === currentTurn;
    html += '<div style="display:flex;gap:0.75rem;padding:0.6rem 1rem;margin-bottom:0.35rem;background:' + (active ? '#1a1a2e' : '#111') + ';border:1px solid ' + (active ? '#d4af37' : '#333') + ';border-radius:4px;"><span style="color:#d4af37;font-weight:bold;min-width:30px;">' + initiative[i].roll + '</span><span style="flex:1;' + (active ? 'color:#d4af37;font-weight:bold;' : '') + '">' + initiative[i].name + (active ? ' ⬅️' : '') + '</span></div>';
  }
  html += '</div>';
  fetch('/api/show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Initiative Order', data: html }) });
}

connectWebSocket();
