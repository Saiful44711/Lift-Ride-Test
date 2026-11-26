/* Lift Ride Test Cloud backend — Google Apps Script.  Design & Developed by Md. Saiful Islam
 * GENERATED FILE: do not edit the CloudLogic part here. Source: www/js/cloudlogic.js + backend/gas.js (node scripts/build-backend.js) */

/* cloudlogic.js — shared server logic for Lift Ride Test Cloud.
 * Used by (1) the Google Apps Script backend (backend/Code.gs is built from this file + backend/gas.js),
 *         (2) the in-browser DEMO backend (backend.js) and (3) the Node tests.
 * All permission checks live HERE, once. The platform adapter `S` only stores data.
 * Design & Developed by Md. Saiful Islam */
(function (root) {
  'use strict';

  var MAX_SAMPLES = 80000;      // about 6 minutes at 200 Hz
  var PW_ITER = 300;            // salted, iterated SHA-256 (Apps Script has no bcrypt/argon2)
  var TOKEN_DAYS = 30;
  var MAX_FAILS = 5, LOCK_MS = 10 * 60 * 1000;
  var COLS = ['id', 'clientId', 'uploadedAt', 'user', 'date', 'building', 'lift', 'from', 'to', 'dir', 'height', 'vPeak', 'v95', 'aMax', 'dMax', 'jMax', 'a95z', 'allOk', 'demo', 'fileId', 'metaJson'];
  var USER_COLS = ['username', 'name', 'section', 'email', 'role', 'status', 'salt', 'hash', 'created', 'decidedBy', 'decidedAt'];
  var MAX_PENDING = 200;
  var STATUS = ['pending', 'active', 'disabled', 'rejected'];

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function fail(code, error) { return { ok: false, code: code, error: error }; }
  function r4(x) { return Math.round(x * 1e4) / 1e4; }
  function str(x, n) { return String(x === undefined || x === null ? '' : x).slice(0, n || 200); }

  function sameText(a, b) { // constant-time-ish comparison
    a = String(a); b = String(b); if (a.length !== b.length) return false;
    var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }

  var L = {
    VERSION: '2.2.0', COLS: COLS, USER_COLS: USER_COLS, MAX_SAMPLES: MAX_SAMPLES,

    cleanUser: function (u) { return String(u || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32); },
    validPassword: function (p) { return typeof p === 'string' && p.length >= 6 && p.length <= 64; },
    validEmail: function (e) { return typeof e === 'string' && e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); },
    publicUser: function (x) { return { username: x.username, name: x.name, section: x.section || '', email: x.email || '', role: x.role, status: x.status, created: x.created, decidedBy: x.decidedBy || '', decidedAt: x.decidedAt || '' }; },

    hashPassword: function (pass, salt, digestHex) {
      var x = digestHex(salt + ':' + pass);
      for (var i = 0; i < PW_ITER; i++) x = digestHex(x + salt + pass);
      return x;
    },
    makeToken: function (user, role, expMs, sign) { var body = user + '|' + role + '|' + expMs; return body + '|' + sign(body); },
    parseToken: function (token, sign, now) {
      var p = String(token || '').split('|');
      if (p.length !== 4) return null;
      var body = p[0] + '|' + p[1] + '|' + p[2];
      if (!sameText(sign(body), p[3])) return null;
      if (!(Number(p[2]) > now)) return null;
      return { user: p[0], role: p[1], exp: Number(p[2]) };
    },

    /* ---- upload validation / packing ---- */
    validateUpload: function (rec) {
      if (!rec || typeof rec !== 'object') return 'Missing record';
      if (!/^[A-Za-z0-9._-]{6,80}$/.test(String(rec.clientId || ''))) return 'Bad clientId';
      if (!rec.meta || typeof rec.meta !== 'object') return 'Missing meta';
      if (JSON.stringify(rec.meta).length > 20000) return 'Meta too large';
      if (!rec.summary || typeof rec.summary !== 'object') return 'Missing summary';
      var raw = rec.raw;
      if (!raw || !Array.isArray(raw.t) || !Array.isArray(raw.ax) || !Array.isArray(raw.ay) || !Array.isArray(raw.az)) return 'Missing raw samples';
      var n = raw.t.length;
      if (n < 50) return 'Too few samples (' + n + ')';
      if (n > MAX_SAMPLES) return 'Recording too long (max about 6 minutes)';
      if (raw.ax.length !== n || raw.ay.length !== n || raw.az.length !== n) return 'Axis length mismatch';
      var arrs = [raw.t, raw.ax, raw.ay, raw.az], i, k;
      for (k = 0; k < arrs.length; k++) for (i = 0; i < n; i++) if (!isNum(arrs[k][i])) return 'Non-numeric sample';
      var pt = raw.pt || [], p = raw.p || [];
      if (pt.length !== p.length || pt.length > MAX_SAMPLES) return 'Pressure length mismatch';
      for (i = 0; i < pt.length; i++) if (!isNum(pt[i]) || !isNum(p[i])) return 'Non-numeric pressure';
      if (raw.snd) { // v2.2 sound levels (optional)
        var sd = raw.snd;
        if (!Array.isArray(sd.t) || !Array.isArray(sd.l) || sd.t.length !== sd.l.length || sd.t.length > 8000) return 'Bad sound data';
        for (i = 0; i < sd.t.length; i++) if (!isNum(sd.t[i]) || !isNum(sd.l[i])) return 'Non-numeric sound level';
      }
      return null;
    },
    packRaw: function (raw) {
      function rr(a, f) { var o = new Array(a.length); for (var i = 0; i < a.length; i++) o[i] = Math.round(a[i] * f) / f; return o; }
      var o = { t: rr(raw.t, 1e4), ax: rr(raw.ax, 1e4), ay: rr(raw.ay, 1e4), az: rr(raw.az, 1e4), pt: rr(raw.pt || [], 1e4), p: rr(raw.p || [], 1e3) };
      if (raw.snd && raw.snd.t && raw.snd.t.length) o.snd = { t: rr(raw.snd.t, 1e3), l: rr(raw.snd.l, 100), ref: raw.snd.ref === 'spl' ? 'spl' : 'dbfs' };
      return o;
    },
    toArray: function (a) { var o = new Array(a.length); for (var i = 0; i < a.length; i++) o[i] = a[i]; return o; },

    rowToObj: function (arr) { var o = {}; for (var i = 0; i < COLS.length; i++) o[COLS[i]] = arr[i]; return o; },
    objToRow: function (o) { return COLS.map(function (c) { return o[c] === undefined ? '' : o[c]; }); },
    publicRow: function (o) { var c = {}; COLS.forEach(function (k) { if (k !== 'metaJson' && k !== 'fileId') c[k] = o[k]; }); return c; },

    filterRows: function (rows, f) {
      f = f || {};
      var q = String(f.q || '').toLowerCase();
      return rows.filter(function (r) {
        if (f.user && r.user !== f.user) return false;
        if (f.dir && r.dir !== f.dir) return false;
        if (q && (String(r.building) + ' ' + String(r.lift) + ' ' + String(r.user)).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
    },

    /* ---- request handler. req = {action, token, ...}. S = platform adapter (see backend/gas.js and backend.js) ---- */
    handle: function (req, S) {
      try {
        if (!req || typeof req.action !== 'string') return fail('BAD', 'Missing action');
        var act = req.action, now = S.now();
        if (act === 'ping') return { ok: true, version: L.VERSION };

        if (act === 'login') {
          var uname = L.cleanUser(req.user), fl = S.getFails(uname) || { n: 0, until: 0 };
          if (fl.until > now) return fail('LOCKED', 'Too many failed attempts. Try again in ' + Math.ceil((fl.until - now) / 60000) + ' min.');
          var u = S.users().filter(function (x) { return x.username === uname; })[0];
          var ok = !!u && sameText(L.hashPassword(String(req.pass || ''), u.salt, S.digestHex), u.hash);
          if (!ok) {
            fl.n = (fl.n || 0) + 1; if (fl.n >= MAX_FAILS) { fl.until = now + LOCK_MS; fl.n = 0; }
            S.setFails(uname, fl);
            return fail('LOGIN', 'Wrong ID or password.');
          }
          S.setFails(uname, { n: 0, until: 0 });
          // status is revealed only after a correct password
          if (u.status === 'pending') return fail('PENDING', 'Your access request is waiting for the administrator\'s approval.');
          if (u.status === 'rejected') return fail('REJECTED', 'Your access request was not approved. Please contact the administrator.');
          if (u.status !== 'active') return fail('DISABLED', 'This account is disabled. Please contact the administrator.');
          var exp = now + TOKEN_DAYS * 86400000;
          return { ok: true, token: L.makeToken(u.username, u.role, exp, S.sign), user: u.username, name: u.name, role: u.role, exp: exp };
        }

        if (act === 'requestAccess') {
          var rid = L.cleanUser(req.username), rname = str(req.name, 60).trim(), rsec = str(req.section, 60).trim(), rmail = str(req.email, 120).trim();
          if (rname.length < 2) return fail('BAD', 'Please enter your full name.');
          if (rid.length < 3) return fail('BAD', 'ID must be 3 to 32 letters, digits, . _ -');
          if (!rsec) return fail('BAD', 'Please enter your section.');
          if (!L.validEmail(rmail)) return fail('BAD', 'Please enter a valid email address.');
          if (!L.validPassword(req.password)) return fail('BAD', 'Password must be 6 to 64 characters.');
          return S.lock(function () {
            var all = S.users(), ex = all.filter(function (x) { return x.username === rid; })[0];
            if (ex && ex.status !== 'rejected') return fail('BAD', ex.status === 'pending' ? 'A request with this ID is already waiting for approval.' : 'This ID already has an account. Sign in instead.');
            if (all.filter(function (x) { return x.status === 'pending'; }).length >= MAX_PENDING) return fail('BUSY', 'Too many requests are waiting. Please try later.');
            var salt = S.uuid();
            var nu = { username: rid, name: rname, section: rsec, email: rmail, role: 'user', status: 'pending', salt: salt, hash: L.hashPassword(req.password, salt, S.digestHex), created: now, decidedBy: '', decidedAt: '' };
            S.putUser(nu);
            try { S.notify('request', L.publicUser(nu)); } catch (e) { /* the request is saved even if the email fails */ }
            return { ok: true, username: rid, message: 'Request sent. You can sign in after the administrator approves it.' };
          });
        }

        // ---- everything below needs a valid token AND a still-active user ----
        var tk = L.parseToken(req.token, S.sign, now);
        if (!tk) return fail('AUTH', 'Please sign in again.');
        var me = S.users().filter(function (x) { return x.username === tk.user; })[0];
        if (!me || me.status !== 'active') return fail('AUTH', 'This account is not active any more. Please sign in again.');
        var role = me.role, isAdmin = role === 'admin';     // role comes from the store, never from the token
        function needAdmin() { return isAdmin ? null : fail('FORBIDDEN', 'Admin only.'); }

        if (act === 'me') {
          var o = { ok: true, user: me.username, name: me.name, role: role };
          if (isAdmin) o.pending = S.users().filter(function (x) { return x.status === 'pending'; }).length;
          return o;
        }

        if (act === 'upload') {
          var rec = req.record, why = L.validateUpload(rec);
          if (why) return fail('BAD', why);
          return S.lock(function () {
            var rows = S.rows(), dup = rows.filter(function (r) { return r.clientId === rec.clientId && r.user === me.username; })[0];
            if (dup) return { ok: true, id: dup.id, duplicate: true };
            var id = S.uuid(), m = rec.meta, s = rec.summary;
            var fileId = S.writeFile(id, JSON.stringify({ raw: L.packRaw(rec.raw) }));
            S.addRow({ id: id, clientId: rec.clientId, uploadedAt: now, user: me.username, date: str(m.date, 20), building: str(m.building, 80), lift: str(m.lift, 80),
              from: str(m.from, 10), to: str(m.to, 10), dir: s.dir === 'up' ? 'up' : 'down', height: isNum(s.height) ? r4(s.height) : '', vPeak: isNum(s.vPeak) ? r4(s.vPeak) : '', v95: isNum(s.v95) ? r4(s.v95) : '',
              aMax: isNum(s.aMax) ? r4(s.aMax) : '', dMax: isNum(s.dMax) ? r4(s.dMax) : '', jMax: isNum(s.jMax) ? r4(s.jMax) : '', a95z: isNum(s.a95z) ? r4(s.a95z) : '',
              allOk: s.allOk ? 'yes' : 'no', demo: m.demo ? 'yes' : 'no', fileId: fileId, metaJson: JSON.stringify(m) });
            return { ok: true, id: id };
          });
        }

        if (act === 'list') {
          var f = req.filter || {};
          var all = S.rows().filter(function (r) { return isAdmin || r.user === me.username; });
          var vis = L.filterRows(all, isAdmin ? f : { q: f.q, dir: f.dir });
          vis.sort(function (a, b) { return b.uploadedAt - a.uploadedAt; });
          var users = isAdmin ? S.users().map(function (x) { return x.username; }) : [me.username];
          return { ok: true, total: vis.length, rows: vis.slice(0, 500).map(L.publicRow), users: users };
        }

        if (act === 'get') {
          var row = S.rows().filter(function (r) { return r.id === req.id; })[0];
          if (!row || (!isAdmin && row.user !== me.username)) return fail('NOTFOUND', 'Record not found.');
          var file = JSON.parse(S.readFile(row.fileId));
          return { ok: true, id: row.id, owner: row.user, uploadedAt: row.uploadedAt, meta: JSON.parse(row.metaJson || '{}'), raw: file.raw };
        }

        if (act === 'remove') {
          var d = needAdmin(); if (d) return d;
          return S.lock(function () { var fid = S.delRow(req.id); if (fid === null) return fail('NOTFOUND', 'Record not found.'); S.trashFile(fid); return { ok: true }; });
        }

        if (act === 'changePassword') {
          if (!L.validPassword(req.newPass)) return fail('BAD', 'New password must be 6 to 64 characters.');
          if (!sameText(L.hashPassword(String(req.oldPass || ''), me.salt, S.digestHex), me.hash)) return fail('LOGIN', 'Current password is wrong.');
          return S.lock(function () { var salt = S.uuid(); me.salt = salt; me.hash = L.hashPassword(req.newPass, salt, S.digestHex); S.putUser(me); return { ok: true }; });
        }

        if (act === 'users') {
          var d1 = needAdmin(); if (d1) return d1;
          var us = S.users();
          return { ok: true, users: us.map(L.publicUser), pending: us.filter(function (x) { return x.status === 'pending'; }).length };
        }
        if (act === 'addUser') {
          var d2 = needAdmin(); if (d2) return d2;
          var nid = L.cleanUser(req.username);
          if (nid.length < 3) return fail('BAD', 'ID must be 3 to 32 letters, digits, . _ -');
          if (!L.validPassword(req.password)) return fail('BAD', 'Password must be 6 to 64 characters.');
          if (req.role !== 'admin' && req.role !== 'user') return fail('BAD', 'Role must be user or admin.');
          if (req.email && !L.validEmail(String(req.email))) return fail('BAD', 'Email address is not valid.');
          return S.lock(function () {
            if (S.users().some(function (x) { return x.username === nid; })) return fail('BAD', 'This ID already exists.');
            var salt = S.uuid();
            S.putUser({ username: nid, name: str(req.name, 60) || nid, section: str(req.section, 60), email: str(req.email, 120), role: req.role, status: 'active', salt: salt, hash: L.hashPassword(req.password, salt, S.digestHex), created: now, decidedBy: me.username, decidedAt: now });
            return { ok: true, username: nid };
          });
        }
        if (act === 'approve' || act === 'reject' || act === 'setPassword' || act === 'setActive') {
          var d3 = needAdmin(); if (d3) return d3;
          var tn = L.cleanUser(req.username);
          return S.lock(function () {
            var t = S.users().filter(function (x) { return x.username === tn; })[0], note = null;
            if (!t) return fail('NOTFOUND', 'User not found.');
            if (act === 'approve' || act === 'reject') {
              if (t.status !== 'pending') return fail('BAD', 'This request was already handled.');
              if (act === 'approve') { t.status = 'active'; t.role = req.role === 'admin' ? 'admin' : 'user'; note = 'approved'; }
              else { t.status = 'rejected'; note = 'rejected'; }
              t.decidedBy = me.username; t.decidedAt = now;
            } else if (act === 'setPassword') {
              if (!L.validPassword(req.password)) return fail('BAD', 'Password must be 6 to 64 characters.');
              t.salt = S.uuid(); t.hash = L.hashPassword(req.password, t.salt, S.digestHex);
            } else {
              if (t.username === me.username && !req.active) return fail('BAD', 'You cannot disable your own account.');
              if (t.status === 'pending' || t.status === 'rejected') return fail('BAD', 'Use Approve or Reject for a request.');
              t.status = req.active ? 'active' : 'disabled';
            }
            S.putUser(t);
            if (note) { try { S.notify(note, L.publicUser(t)); } catch (e) { /* email is best-effort */ } }
            return { ok: true };
          });
        }
        return fail('BAD', 'Unknown action');
      } catch (e) { return fail('SERVER', 'Server error: ' + (e && e.message || e)); }
    }
  };

  root.CloudLogic = L;
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
})(typeof self !== 'undefined' ? self : this);

/* ===== Google Apps Script adapter (platform part) — storage only; all rules are in CloudLogic above ===== */

// STEP 1: change these three lines, run setup() ONCE, then delete the password from this file.
var ADMIN_USER = 'admin';
var ADMIN_PASS = 'CHANGE-ME-123';
var ADMIN_NAME = 'Administrator';
// Where "new access request" emails go. Empty = the Google account that owns this script. Several: 'a@x.com,b@y.com'
var NOTIFY_EMAIL = '';
// Optional: link to the web app (GitHub Pages / Netlify) put into the emails.
var APP_LINK = '';

var FOLDER_NAME = 'LiftRideTest-Data';
var SHEET_USERS = 'Users';
var SHEET_RECORDS = 'Records';

function props_() { return PropertiesService.getScriptProperties(); }
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name, headers) {
  var sh = ss_().getSheetByName(name);
  if (!sh) { sh = ss_().insertSheet(name); }
  if (sh.getLastRow() === 0) { sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}

// Run this once from the editor (Run button). It creates the sheets, the Drive folder, the signing secret and the first admin.
function setup() {
  var p = props_();
  if (!p.getProperty('SECRET')) p.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  if (!p.getProperty('FOLDER_ID')) {
    var folder = DriveApp.createFolder(FOLDER_NAME);
    p.setProperty('FOLDER_ID', folder.getId());
  }
  var us = sheet_(SHEET_USERS, CloudLogic.USER_COLS);
  sheet_(SHEET_RECORDS, CloudLogic.COLS);
  if (us.getLastRow() < 2) {
    if (!CloudLogic.validPassword(ADMIN_PASS) || ADMIN_PASS === 'CHANGE-ME-123') throw new Error('Edit ADMIN_USER / ADMIN_PASS at the top of the file first (password 6+ characters, not the sample one).');
    var st = store_();
    var salt = Utilities.getUuid();
    st.putUser({ username: CloudLogic.cleanUser(ADMIN_USER), name: ADMIN_NAME, section: 'Admin', email: adminEmail_(), role: 'admin', status: 'active', salt: salt, hash: CloudLogic.hashPassword(ADMIN_PASS, salt, st.digestHex), created: Date.now(), decidedBy: 'setup', decidedAt: Date.now() });
  }
  // one test email proves that Gmail sending is authorised
  MailApp.sendEmail(adminEmail_(), 'Lift Ride Test: backend ready', 'Setup finished. Access requests will be emailed to this address.' + (APP_LINK ? '\nApp: ' + APP_LINK : ''));
  Logger.log('Setup done. Data folder id: ' + p.getProperty('FOLDER_ID') + '. Now: Deploy > New deployment > Web app.');
}

function adminEmail_() { return NOTIFY_EMAIL || Session.getEffectiveUser().getEmail(); }

function mail_(kind, u) {
  var link = APP_LINK ? '\n\nApp: ' + APP_LINK : '';
  if (kind === 'request') {
    MailApp.sendEmail(adminEmail_(), 'Lift Ride Test: access request from ' + u.name + ' (' + u.username + ')',
      'A new user asked for access.\n\nName: ' + u.name + '\nID: ' + u.username + '\nSection: ' + u.section + '\nEmail: ' + u.email + '\nTime: ' + new Date(u.created) +
      '\n\nOpen Lift Ride Test > Admin > Access requests to approve or reject.' + link);
  } else if (kind === 'approved' && u.email) {
    MailApp.sendEmail(u.email, 'Lift Ride Test: your access is approved',
      'Hello ' + u.name + ',\n\nYour access to Lift Ride Test is approved. Sign in with your ID "' + u.username + '" and your password.' + link);
  } else if (kind === 'rejected' && u.email) {
    MailApp.sendEmail(u.email, 'Lift Ride Test: access request not approved',
      'Hello ' + u.name + ',\n\nYour access request for ID "' + u.username + '" was not approved. Please contact the administrator.');
  }
}

function hex_(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) { var b = bytes[i]; if (b < 0) b += 256; s += (b < 16 ? '0' : '') + b.toString(16); }
  return s;
}

function store_() {
  var cache = CacheService.getScriptCache();
  var secret = props_().getProperty('SECRET');
  return {
    now: function () { return Date.now(); },
    uuid: function () { return Utilities.getUuid(); },
    digestHex: function (s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); },
    sign: function (s) { return hex_(Utilities.computeHmacSha256Signature(s, secret)); },
    lock: function (fn) {
      var lk = LockService.getScriptLock(); lk.waitLock(20000);
      try { return fn(); } finally { lk.releaseLock(); }
    },
    getFails: function (u) { var v = cache.get('fail_' + u); return v ? JSON.parse(v) : null; },
    setFails: function (u, o) { cache.put('fail_' + u, JSON.stringify(o), 900); },

    notify: function (kind, u) { mail_(kind, u); },
    users: function () {
      var C = CloudLogic.USER_COLS, sh = sheet_(SHEET_USERS, C), n = sh.getLastRow();
      if (n < 2) return [];
      return sh.getRange(2, 1, n - 1, C.length).getValues().map(function (r) {
        var o = {}; for (var i = 0; i < C.length; i++) o[C[i]] = r[i];
        ['username', 'name', 'section', 'email', 'role', 'status', 'salt', 'hash', 'decidedBy'].forEach(function (k) { o[k] = String(o[k] === undefined ? '' : o[k]); });
        o.created = Number(o.created) || 0; o.decidedAt = Number(o.decidedAt) || 0;
        return o;
      });
    },
    putUser: function (u) {
      var C = CloudLogic.USER_COLS, sh = sheet_(SHEET_USERS, C), n = sh.getLastRow();
      var row = C.map(function (k) { return u[k] === undefined ? '' : u[k]; });
      if (n >= 2) {
        var names = sh.getRange(2, 1, n - 1, 1).getValues();
        for (var i = 0; i < names.length; i++) if (String(names[i][0]) === u.username) { sh.getRange(i + 2, 1, 1, row.length).setValues([row]); return; }
      }
      sh.appendRow(row);
    },
    rows: function () {
      var sh = sheet_(SHEET_RECORDS, CloudLogic.COLS), n = sh.getLastRow();
      if (n < 2) return [];
      return sh.getRange(2, 1, n - 1, CloudLogic.COLS.length).getValues().map(function (r) {
        var o = CloudLogic.rowToObj(r); o.uploadedAt = Number(o.uploadedAt) || 0; o.id = String(o.id); o.clientId = String(o.clientId); o.user = String(o.user);
        o.date = String(o.date); o.from = String(o.from); o.to = String(o.to); o.building = String(o.building); o.lift = String(o.lift); return o;
      });
    },
    addRow: function (o) { sheet_(SHEET_RECORDS, CloudLogic.COLS).appendRow(CloudLogic.objToRow(o)); },
    delRow: function (id) {
      var sh = sheet_(SHEET_RECORDS, CloudLogic.COLS), n = sh.getLastRow();
      if (n < 2) return null;
      var vals = sh.getRange(2, 1, n - 1, CloudLogic.COLS.length).getValues(), fc = CloudLogic.COLS.indexOf('fileId');
      for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === id) { var f = String(vals[i][fc]); sh.deleteRow(i + 2); return f; }
      return null;
    },
    writeFile: function (id, text) {
      var blob = Utilities.gzip(Utilities.newBlob(text, 'application/json', id + '.json'));
      blob.setName(id + '.json.gz');
      return DriveApp.getFolderById(props_().getProperty('FOLDER_ID')).createFile(blob).getId();
    },
    readFile: function (fileId) { return Utilities.ungzip(DriveApp.getFileById(fileId).getBlob()).getDataAsString(); },
    trashFile: function (fileId) { try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* already gone */ } }
  };
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet() { return json_({ ok: true, app: 'Lift Ride Test backend', version: CloudLogic.VERSION }); }

function doPost(e) {
  var out;
  try {
    if (!props_().getProperty('SECRET')) { out = { ok: false, code: 'SETUP', error: 'Backend not set up: run setup() once in the Apps Script editor.' }; }
    else { out = CloudLogic.handle(JSON.parse(e.postData.contents), store_()); }
  } catch (err) { out = { ok: false, code: 'SERVER', error: 'Server error: ' + (err && err.message || err) }; }
  return json_(out);
}
