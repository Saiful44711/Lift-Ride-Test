/* backend.js — cloud client (Google Apps Script web app) + an in-browser DEMO server using the same CloudLogic rules.
 * URL "demo" = fictional local server for trying the app (users: admin/admin123, demo/demo123).
 * Design & Developed by Md. Saiful Islam */
(function (root) {
  'use strict';
  var L = root.CloudLogic, KEY = 'liftmeter.cloud', DEMO_KEY = 'liftmeter.demo.cloud';
  var cfg = { url: '', token: '', user: '', name: '', role: '', exp: 0 };
  try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) Object.assign(cfg, s); } catch (e) { /* ignore */ }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ } }
  function fixedUrl() { return (root.LRM_CONFIG && root.LRM_CONFIG.cloudUrl) || ''; }
  function err(code, msg) { var e = new Error(msg); e.code = code; return e; }

  /* ---------------- DEMO server (browser only, fictional, NOT secure) ---------------- */
  var demo = null;
  function demoLoad() { try { return JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch (e) { return null; } }
  function demoSave() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(demo.db)); } catch (e) { throw new Error('Demo storage is full. Clear demo data in More.'); } }
  function weakHex(s) { // NOT cryptographic: demo only
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return ((h2 >>> 0).toString(16) + '00000000').slice(0, 8) + ((h1 >>> 0).toString(16) + '00000000').slice(0, 8);
  }
  function rnd() { var a = ''; for (var i = 0; i < 4; i++) a += Math.floor(Math.random() * 4294967296).toString(16); return a; }
  function demoServer() {
    if (demo) return demo;
    var db = demoLoad();
    if (!db) {
      db = { users: [], rows: [], files: {} };
      var mk = function (u, n, r, p) { var salt = 'demo-' + u; return { username: u, name: n, section: 'DEMO section', email: u + '@demo.invalid', role: r, status: 'active', salt: salt, hash: L.hashPassword(p, salt, weakHex), active: true, created: Date.now(), decidedBy: 'demo', decidedAt: Date.now() }; };
      db.users.push(mk('admin', 'Demo Admin', 'admin', 'admin123'), mk('demo', 'Demo User', 'user', 'demo123'), mk('rahim', 'Rahim (demo)', 'user', 'demo123'));
      db.notes = [];
    }
    var fails = {};
    demo = {
      db: db,
      S: {
        now: function () { return Date.now(); }, uuid: rnd, digestHex: weakHex, sign: function (x) { return weakHex('demo-secret' + x); },
        lock: function (fn) { return fn(); }, notify: function (kind, u) { (db.notes = db.notes || []).push({ kind: kind, user: u.username, at: Date.now() }); demoSave(); }, getFails: function (u) { return fails[u] || null; }, setFails: function (u, o) { fails[u] = o; },
        users: function () { return db.users.map(function (u) { return Object.assign({}, u); }); },
        putUser: function (u) { var i = db.users.findIndex(function (x) { return x.username === u.username; }); if (i < 0) db.users.push(Object.assign({}, u)); else db.users[i] = Object.assign({}, u); demoSave(); },
        rows: function () { return db.rows.map(function (r) { return Object.assign({}, r); }); },
        addRow: function (o) { db.rows.push(o); demoSave(); },
        delRow: function (id) { var i = db.rows.findIndex(function (r) { return r.id === id; }); if (i < 0) return null; var f = db.rows[i].fileId; db.rows.splice(i, 1); demoSave(); return f; },
        writeFile: function (id, text) { db.files[id] = text; demoSave(); return id; },
        readFile: function (fid) { return db.files[fid]; },
        trashFile: function (fid) { delete db.files[fid]; demoSave(); }
      }
    };
    return demo;
  }
  function demoSeed() { // a few fictional records from other users, so the Admin tab is not empty
    var d = demoServer();
    if (d.db.rows.length || !root.LiftCore) return Promise.resolve();
    var S = d.S, C = root.LiftCore, cases = [
      { seed: 301, up: true, height: 30, vmax: 2.0, b: 'DEMO Tower A', l: 'Lift 1', u: 'demo' },
      { seed: 302, up: false, height: 30, vmax: 2.0, b: 'DEMO Tower A', l: 'Lift 1', u: 'demo' },
      { seed: 303, up: true, height: 42, vmax: 2.5, b: 'DEMO Plaza', l: 'Lift 3', u: 'rahim' }];
    cases.forEach(function (c, i) {
      try {
        var raw = C.simulateRun({ seed: c.seed, rate: 100, up: c.up, height: c.height, vmax: c.vmax, jmax: 1.0, baro: true });
        var res = C.analyze(raw, {}), m = res.m, sum = { height: m.height, vPeak: m.vPeak, v95: m.v95, aMax: m.aMax, dMax: m.dMax, jMax: m.jMax, a95z: m.a95z, dir: m.direction, allOk: res.verdicts.every(function (v) { return v.ok; }) };
        var tk = L.makeToken(c.u, 'user', Date.now() + 1e9, S.sign);
        L.handle({ action: 'upload', token: tk, record: { clientId: 'seed-' + c.seed + '-demo', meta: { date: '2026-11-2' + (3 + i) + ' 10:0' + i, building: c.b, lift: c.l, from: c.up ? '1' : '10', to: c.up ? '10' : '1', demo: true, note: 'DEMO (fictional data)' }, summary: sum, raw: { t: L.toArray(raw.t), ax: L.toArray(raw.ax), ay: L.toArray(raw.ay), az: L.toArray(raw.az), pt: L.toArray(raw.pt || []), p: L.toArray(raw.p || []) } } }, S);
      } catch (e) { /* seeding is best-effort */ }
    });
    return Promise.resolve();
  }

  /* ---------------- client ---------------- */
  var B = {
    url: function () { return fixedUrl() || cfg.url || ''; },
    urlLocked: function () { return !!fixedUrl(); },
    configured: function () { return !!B.url(); },
    isDemo: function () { return B.url().toLowerCase() === 'demo'; },
    signedIn: function () { return !!(B.configured() && cfg.token && cfg.exp > Date.now()); },
    user: function () { return cfg.user; }, name: function () { return cfg.name; }, role: function () { return cfg.role; },
    isAdmin: function () { return B.signedIn() && cfg.role === 'admin'; },
    setUrl: function (u) {
      u = String(u || '').trim();
      if (u.toLowerCase() === 'demo') u = 'demo';
      if (u !== cfg.url) { cfg.url = u; cfg.token = ''; cfg.user = ''; cfg.name = ''; cfg.role = ''; cfg.exp = 0; persist(); }
    },
    validUrl: function (u) { u = String(u || '').trim(); return u.toLowerCase() === 'demo' || /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u) || /^https:\/\/script\.google\.com\/a\/macros\/[^/]+\/s\/[A-Za-z0-9_-]+\/exec$/.test(u); },
    resetDemo: function () { try { localStorage.removeItem(DEMO_KEY); } catch (e) { /* ignore */ } demo = null; },

    call: function (action, payload, timeoutMs) {
      var body = Object.assign({ action: action, token: cfg.token }, payload || {});
      var p;
      if (B.isDemo()) {
        p = demoSeed().then(function () { return L.handle(JSON.parse(JSON.stringify(body)), demoServer().S); });
      } else {
        var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, timer = null;
        if (ctl) timer = setTimeout(function () { ctl.abort(); }, timeoutMs || 45000);
        p = fetch(B.url(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', credentials: 'omit', signal: ctl ? ctl.signal : undefined })
          .then(function (r) { clearTimeout(timer); return r.text().then(function (t) { return { status: r.status, text: t }; }); })
          .catch(function (e) { clearTimeout(timer); throw err('NET', e && e.name === 'AbortError' ? 'The server did not answer in time. Check the internet and try again.' : 'No connection to the server. Check the internet and the cloud URL.'); })
          .then(function (x) {
            var o; try { o = JSON.parse(x.text); } catch (e) { throw err('URL', 'The URL did not return data (HTTP ' + x.status + '). It must end with /exec and the web app access must be "Anyone".'); }
            return o;
          });
      }
      return p.then(function (o) {
        if (o && o.ok) return o;
        var e = err((o && o.code) || 'SERVER', (o && o.error) || 'Server error');
        if (e.code === 'AUTH') { cfg.token = ''; cfg.exp = 0; persist(); try { root.dispatchEvent(new Event('lrm-auth')); } catch (x) { /* ignore */ } }
        throw e;
      });
    },
    login: function (user, pass) {
      return B.call('login', { user: user, pass: pass }).then(function (o) {
        cfg.token = o.token; cfg.user = o.user; cfg.name = o.name; cfg.role = o.role; cfg.exp = o.exp; persist(); return o;
      });
    },
    logout: function () { cfg.token = ''; cfg.user = ''; cfg.name = ''; cfg.role = ''; cfg.exp = 0; persist(); },
    upload: function (rec) {
      var r = rec.raw, plain = { t: L.toArray(r.t), ax: L.toArray(r.ax), ay: L.toArray(r.ay), az: L.toArray(r.az), pt: L.toArray(r.pt || []), p: L.toArray(r.p || []) };
      if (r.snd && r.snd.t && r.snd.t.length) plain.snd = { t: L.toArray(r.snd.t), l: L.toArray(r.snd.l), ref: r.snd.ref };
      return B.call('upload', { record: { clientId: rec.clientId, meta: rec.meta, summary: rec.summary, raw: plain } }, 120000);
    },
    list: function (filter) { return B.call('list', { filter: filter || {} }); },
    get: function (id) { return B.call('get', { id: id }, 90000); },
    remove: function (id) { return B.call('remove', { id: id }); },
    users: function () { return B.call('users'); },
    addUser: function (o) { return B.call('addUser', o); },
    setPassword: function (u, p) { return B.call('setPassword', { username: u, password: p }); },
    setActive: function (u, a) { return B.call('setActive', { username: u, active: a }); },
    changePassword: function (o, n) { return B.call('changePassword', { oldPass: o, newPass: n }); },
    me: function () { return B.call('me'); },
    requestAccess: function (o) { return B.call('requestAccess', o); },
    approve: function (u, role) { return B.call('approve', { username: u, role: role || 'user' }); },
    reject: function (u) { return B.call('reject', { username: u }); }
  };
  root.Backend = B;
})(typeof self !== 'undefined' ? self : this);
