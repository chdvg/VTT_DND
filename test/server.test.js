'use strict';
// Integration tests — spawn a real server on port 3099 with an isolated data dir.
const { test, before, after, describe } = require('node:test');
const assert  = require('node:assert/strict');
const http    = require('http');
const path    = require('path');
const fs      = require('fs');
const { spawn } = require('child_process');
const WebSocket  = require('ws');

const PORT     = 3099;
const DM_PASS  = 'testpass123';
const DATA_DIR = path.join(__dirname, '..', 'data', 'test-run');
const ROOT     = path.join(__dirname, '..');

let proc;
let dmCookie;

// ── HTTP helper ───────────────────────────────────────────────
function httpReq({ method = 'GET', p, body, cookie, ct = 'application/json' } = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: PORT, path: p, method,
      headers: { 'Content-Type': ct, ...(cookie ? { Cookie: cookie } : {}) },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function dmPost(p, body) {
  return httpReq({ method: 'POST', p, body: JSON.stringify(body), cookie: dmCookie });
}

// ── WS helper with message queue (avoids race conditions) ─────
function makeWs(cookie) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  const queue   = [];   // received messages not yet claimed
  const waiters = [];   // pending next() promises

  ws.on('message', raw => {
    const msg = JSON.parse(raw.toString());
    const idx = waiters.findIndex(w => !w.type || w.type === msg.type);
    if (idx >= 0) {
      const { resolve, timer } = waiters[idx];
      clearTimeout(timer);
      waiters.splice(idx, 1);
      resolve(msg);
    } else {
      queue.push(msg);
    }
  });

  return {
    ws,
    open() {
      return new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
    },
    next(type, ms = 4000) {
      const qIdx = queue.findIndex(m => !type || m.type === type);
      if (qIdx >= 0) return Promise.resolve(queue.splice(qIdx, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const i = waiters.findIndex(w => w.resolve === resolve);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error(`Timeout waiting for "${type}"`));
        }, ms);
        waiters.push({ type, resolve, timer });
      });
    },
    send(msg) { ws.send(JSON.stringify(msg)); },
    close() { return new Promise(r => { ws.on('close', r); ws.close(); }); },
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Setup / Teardown ──────────────────────────────────────────
before(async () => {
  if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true });

  proc = spawn('node', [path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DM_PASSWORD: DM_PASS, DATA_DIR },
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: ROOT,
  });
  proc.stderr.on('data', d => process.stderr.write('SRV: ' + d));

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server startup timeout')), 15000);
    proc.stdout.on('data', d => {
      if (d.toString().includes('running')) { clearTimeout(timer); resolve(); }
    });
    proc.on('exit', code => reject(new Error(`Server exited with code ${code}`)));
  });

  // Obtain DM session cookie
  const r = await httpReq({
    method: 'POST', p: '/dm-login',
    body: `password=${DM_PASS}`, ct: 'application/x-www-form-urlencoded',
  });
  const sc = r.headers['set-cookie'];
  if (!sc) throw new Error('Login failed — no cookie');
  dmCookie = sc[0].split(';')[0];
});

after(async () => {
  proc.kill('SIGTERM');
  await sleep(600);
  if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true });
});

// ── Health ────────────────────────────────────────────────────
describe('Health endpoints', () => {
  test('GET /healthz returns {status:ok}', async () => {
    const r = await httpReq({ p: '/healthz' });
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.body), { status: 'ok' });
  });

  test('GET /readyz returns client counts and scene', async () => {
    const r = await httpReq({ p: '/readyz' });
    assert.equal(r.status, 200);
    const b = JSON.parse(r.body);
    assert.equal(b.status, 'ok');
    assert.ok('clients' in b && 'dms' in b && 'blackout' in b);
  });
});

// ── Auth ──────────────────────────────────────────────────────
describe('DM auth', () => {
  test('wrong password redirects with err=1', async () => {
    const r = await httpReq({
      method: 'POST', p: '/dm-login',
      body: 'password=badpass', ct: 'application/x-www-form-urlencoded',
    });
    assert.equal(r.status, 302);
    assert.ok(r.headers.location?.includes('err=1'));
  });

  test('correct password sets dm_token cookie', async () => {
    const r = await httpReq({
      method: 'POST', p: '/dm-login',
      body: `password=${DM_PASS}`, ct: 'application/x-www-form-urlencoded',
    });
    assert.equal(r.status, 302);
    assert.ok(r.headers['set-cookie']?.[0]?.startsWith('dm_token='));
  });

  test('protected route redirects without cookie', async () => {
    const r = await httpReq({ p: '/' });
    assert.equal(r.status, 302);
    assert.ok(r.headers.location?.includes('/dm-login'));
  });

  test('protected API accessible with valid cookie', async () => {
    const r = await httpReq({ p: '/api/sessions', cookie: dmCookie });
    assert.equal(r.status, 200);
  });
});

// ── WS auth enforcement ───────────────────────────────────────
describe('WebSocket: auth enforcement', () => {
  test('dm-connect without DM cookie returns auth-required', async () => {
    const c = makeWs(); // no cookie
    await c.open();
    c.send({ action: 'dm-connect' });
    const msg = await c.next('auth-required');
    assert.equal(msg.type, 'auth-required');
    await c.close();
  });

  test('DM-only action from unauthenticated socket is silently dropped', async () => {
    const c = makeWs();
    await c.open();
    c.send({ action: 'blackout' });
    await sleep(300);
    // Verify server state is unchanged — blackout still false
    const r = await httpReq({ p: '/api/state', cookie: dmCookie });
    assert.equal(JSON.parse(r.body).blackout, false);
    await c.close();
  });
});

// ── Scene + token flow ────────────────────────────────────────
describe('WebSocket: scene and token flow', () => {
  test('show-scene-view broadcasts to all clients and clears tokens', async () => {
    const dm  = makeWs(dmCookie);
    const pla = makeWs();
    await Promise.all([dm.open(), pla.open()]);
    await dm.next('DM_STATE_RESTORE');

    dm.send({ action: 'show-scene-view', image: '/assets/maps/test.png', mapKey: 'sv-test', label: 'Test Room' });

    const plaMsg = await pla.next('SHOW_SCENE_VIEW');
    assert.equal(plaMsg.mapKey, 'sv-test');
    assert.equal(plaMsg.label, 'Test Room');

    // Tokens should be cleared for new scene
    const tokMsg = await pla.next('UPDATE_TOKENS');
    assert.equal(tokMsg.tokens.length, 0);

    await Promise.all([dm.close(), pla.close()]);
  });

  test('update-tokens broadcasts and sendFullState replays on reconnect', async () => {
    const dm = makeWs(dmCookie);
    await dm.open();
    await dm.next('DM_STATE_RESTORE');

    const tokens = [{ id: 'g1', type: 'mob', label: 'Goblin', x: 0.3, y: 0.4, color: 'red' }];
    dm.send({ action: 'update-tokens', tokens, mapKey: 'sv-test' });
    await dm.next('UPDATE_TOKENS');

    // New player connects — sendFullState should replay tokens
    const pla = makeWs();
    await pla.open();
    const sync = await pla.next('UPDATE_TOKENS');
    assert.equal(sync.tokens.length, 1);
    assert.equal(sync.tokens[0].label, 'Goblin');

    await Promise.all([dm.close(), pla.close()]);
  });

  test('clear resets tokens, HP state, and broadcasts CLEAR', async () => {
    const dm = makeWs(dmCookie);
    await dm.open();
    await dm.next('DM_STATE_RESTORE');

    dm.send({ action: 'update-hp', name: 'ClearTestMob', hp: 10, maxHp: 20 });
    await dm.next('HP_UPDATE');

    dm.send({ action: 'clear' });
    await dm.next('CLEAR');

    // Reconnect — HP state should be absent
    const pla = makeWs();
    await pla.open();
    // Collect any messages for 600ms; none should be HP_UPDATE for ClearTestMob
    const received = [];
    pla.ws.on('message', raw => received.push(JSON.parse(raw)));
    await sleep(600);
    const hpMsg = received.find(m => m.type === 'HP_UPDATE' && m.name === 'ClearTestMob');
    assert.equal(hpMsg, undefined, 'HP state should be cleared after clear action');

    await Promise.all([dm.close(), pla.close()]);
  });
});

// ── HP tracking ───────────────────────────────────────────────
describe('WebSocket: HP tracking', () => {
  test('update-hp broadcasts HP_UPDATE to all clients', async () => {
    const dm  = makeWs(dmCookie);
    const pla = makeWs();
    await Promise.all([dm.open(), pla.open()]);
    await dm.next('DM_STATE_RESTORE');

    dm.send({ action: 'update-hp', name: 'Thorin', hp: 35, maxHp: 50 });

    const [dmMsg, plaMsg] = await Promise.all([dm.next('HP_UPDATE'), pla.next('HP_UPDATE')]);
    assert.equal(dmMsg.name, 'Thorin');
    assert.equal(dmMsg.hp, 35);
    assert.equal(dmMsg.maxHp, 50);
    assert.equal(plaMsg.name, 'Thorin');
    assert.equal(plaMsg.hp, 35);

    await Promise.all([dm.close(), pla.close()]);
  });

  test('sendFullState replays HP state to reconnecting client', async () => {
    const dm = makeWs(dmCookie);
    await dm.open();
    await dm.next('DM_STATE_RESTORE');

    dm.send({ action: 'update-hp', name: 'Thorin', hp: 20, maxHp: 50 });
    await dm.next('HP_UPDATE');

    const pla = makeWs();
    await pla.open();
    const hpMsg = await pla.next('HP_UPDATE');
    assert.equal(hpMsg.name, 'Thorin');
    assert.equal(hpMsg.hp, 20);

    await Promise.all([dm.close(), pla.close()]);
  });
});

// ── Blackout ──────────────────────────────────────────────────
describe('WebSocket: blackout', () => {
  test('lifting blackout sends full scene to players', async () => {
    const dm = makeWs(dmCookie);
    await dm.open();
    await dm.next('DM_STATE_RESTORE');

    dm.send({ action: 'show-scene-view', image: '/assets/maps/test.png', mapKey: 'bk-test', label: 'BK Room' });
    await dm.next('SHOW_SCENE_VIEW');

    dm.send({ action: 'blackout' });
    await dm.next('BLACKOUT');

    const pla = makeWs();
    await pla.open();
    const bkMsg = await pla.next('BLACKOUT');
    assert.equal(bkMsg.active, true);

    // Lift blackout — player should receive scene
    dm.send({ action: 'blackout' });
    const liftMsg = await dm.next('BLACKOUT');
    assert.equal(liftMsg.active, false);
    const sceneMsg = await pla.next('SHOW_SCENE_VIEW');
    assert.equal(sceneMsg.mapKey, 'bk-test');

    await Promise.all([dm.close(), pla.close()]);
  });
});

// ── Rate limiting ─────────────────────────────────────────────
describe('WebSocket: rate limiting', () => {
  test('server remains healthy after message burst', async () => {
    const dm = makeWs(dmCookie);
    await dm.open();
    await dm.next('DM_STATE_RESTORE');

    // 70 messages — 60/s limit means 10 should be dropped
    for (let i = 0; i < 70; i++) {
      dm.send({ action: 'toggle-grid' });
    }
    await sleep(400);

    const r = await httpReq({ p: '/healthz' });
    assert.equal(r.status, 200);
    assert.equal(JSON.parse(r.body).status, 'ok');

    await dm.close();
  });
});

// ── Sessions ──────────────────────────────────────────────────
describe('REST: session lifecycle', () => {
  test('save → list → load → delete', async () => {
    let r = await dmPost('/api/sessions/save', { name: 'IntegTest Session', initiative: [], currentTurn: 0 });
    assert.equal(r.status, 200);
    assert.ok(JSON.parse(r.body).ok);

    r = await httpReq({ p: '/api/sessions', cookie: dmCookie });
    const list = JSON.parse(r.body).sessions;
    assert.ok(list.some(s => s.name === 'IntegTest Session'));

    r = await dmPost('/api/sessions/load', { name: 'IntegTest Session' });
    assert.equal(r.status, 200);
    assert.ok(JSON.parse(r.body).ok);

    r = await httpReq({ method: 'DELETE', p: '/api/sessions/IntegTest%20Session', cookie: dmCookie });
    assert.equal(r.status, 200);

    r = await httpReq({ p: '/api/sessions', cookie: dmCookie });
    assert.ok(!JSON.parse(r.body).sessions.some(s => s.name === 'IntegTest Session'));
  });
});

// ── Encounters ────────────────────────────────────────────────
describe('REST: encounter lifecycle', () => {
  test('save → list → deploy → delete', async () => {
    // Need an active map for deploy
    const dm = makeWs(dmCookie);
    await dm.open();
    await dm.next('DM_STATE_RESTORE');
    dm.send({ action: 'show-scene-view', image: '/test.png', mapKey: 'enc-map' });
    await dm.next('SHOW_SCENE_VIEW');
    await dm.close();

    const tokens = [{ type: 'mob', label: 'Goblin', color: 'red', mobType: 'Goblin' }];
    let r = await dmPost('/api/encounters/save', { name: 'IntegTest Encounter', tokens });
    assert.equal(r.status, 200);

    r = await httpReq({ p: '/api/encounters', cookie: dmCookie });
    const enc = JSON.parse(r.body).encounters.find(e => e.name === 'IntegTest Encounter');
    assert.ok(enc);
    assert.equal(enc.count, 1);

    r = await dmPost('/api/encounters/deploy', { name: 'IntegTest Encounter' });
    assert.equal(r.status, 200);
    assert.equal(JSON.parse(r.body).deployed, 1);

    r = await httpReq({ method: 'DELETE', p: '/api/encounters/IntegTest%20Encounter', cookie: dmCookie });
    assert.equal(r.status, 200);

    r = await httpReq({ p: '/api/encounters', cookie: dmCookie });
    assert.ok(!JSON.parse(r.body).encounters.some(e => e.name === 'IntegTest Encounter'));
  });
});

// ── Scene bundles ─────────────────────────────────────────────
describe('REST: scene bundle lifecycle', () => {
  test('save → list → load → delete', async () => {
    // Need active scene
    const dm = makeWs(dmCookie);
    await dm.open();
    await dm.next('DM_STATE_RESTORE');
    dm.send({ action: 'show-scene-view', image: '/assets/maps/test.png', mapKey: 'bndl-map', label: 'Bundle Map' });
    await dm.next('SHOW_SCENE_VIEW');
    await dm.close();

    let r = await dmPost('/api/scene-bundles/save', { name: 'IntegTest Bundle' });
    assert.equal(r.status, 200);

    r = await httpReq({ p: '/api/scene-bundles', cookie: dmCookie });
    assert.ok(JSON.parse(r.body).bundles.some(b => b.name === 'IntegTest Bundle'));

    r = await dmPost('/api/scene-bundles/load', { name: 'IntegTest Bundle' });
    assert.equal(r.status, 200);

    r = await httpReq({ method: 'DELETE', p: '/api/scene-bundles/IntegTest%20Bundle', cookie: dmCookie });
    assert.equal(r.status, 200);

    r = await httpReq({ p: '/api/scene-bundles', cookie: dmCookie });
    assert.ok(!JSON.parse(r.body).bundles.some(b => b.name === 'IntegTest Bundle'));
  });
});

// ── State persistence ─────────────────────────────────────────
describe('State persistence', () => {
  test('state.json is written after mutation with correct content', async () => {
    const dm = makeWs(dmCookie);
    await dm.open();
    await dm.next('DM_STATE_RESTORE');

    dm.send({ action: 'update-hp', name: 'PersistTest', hp: 7, maxHp: 15 });
    await dm.next('HP_UPDATE');
    await sleep(300);

    const stateFile = path.join(DATA_DIR, 'state.json');
    assert.ok(fs.existsSync(stateFile), 'state.json must exist');
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.ok(saved.currentHpState?.PersistTest, 'HP should be in state.json');
    assert.equal(saved.currentHpState.PersistTest.hp, 7);
    assert.equal(saved.currentHpState.PersistTest.maxHp, 15);

    await dm.close();
  });

  test('state.backup.json is created on second save', async () => {
    const dm = makeWs(dmCookie);
    await dm.open();
    await dm.next('DM_STATE_RESTORE');

    dm.send({ action: 'update-hp', name: 'BkpA', hp: 1, maxHp: 10 });
    await dm.next('HP_UPDATE');
    await sleep(200);
    dm.send({ action: 'update-hp', name: 'BkpA', hp: 2, maxHp: 10 });
    await dm.next('HP_UPDATE');
    await sleep(200);

    assert.ok(fs.existsSync(path.join(DATA_DIR, 'state.backup.json')), 'backup must exist after second save');
    await dm.close();
  });
});
