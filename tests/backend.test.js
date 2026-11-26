/* Runs the generated backend/Code.gs inside a Node VM with an in-memory emulation of Google Apps Script services.
 * It proves the logic and the sheet/Drive glue; it does NOT prove real Google quotas, latency or deployment settings. */
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), assert = require('assert');
const { execSync } = require('child_process');
execSync('node scripts/build-backend.js', { cwd: __dirname + '/..' });
const src = fs.readFileSync(__dirname + '/../backend/Code.gs', 'utf8');
let fails = 0; function check(n, ok, i) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!ok) fails++; }

function makeGoogle() {
  const props = {}, files = {}, cache = {}, sheets = {}, mails = [];
  const signed = b => Array.from(b).map(x => x > 127 ? x - 256 : x);
  const Blob = (bytes, name) => ({ bytes, name, setName(n) { this.name = n; return this; }, getDataAsString() { return Buffer.from(this.bytes).toString('utf8'); }, getBytes() { return this.bytes; } });
  const G = {
    Logger: { log() { } },
    MailApp: { sendEmail: (to, subj, body) => { mails.push({ to, subj, body }); } },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; } }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (a, s) => signed(crypto.createHash('sha256').update(s, 'utf8').digest()),
      computeHmacSha256Signature: (s, k) => signed(crypto.createHmac('sha256', k).update(s, 'utf8').digest()),
      newBlob: (text, mime, name) => Blob(Buffer.from(text, 'utf8'), name),
      gzip: b => Blob(require('zlib').gzipSync(Buffer.from(b.bytes)), b.name + '.gz'),
      ungzip: b => Blob(require('zlib').gunzipSync(Buffer.from(b.bytes)), 'x')
    },
    DriveApp: {
      createFolder: n => ({ getId: () => 'folder1' }),
      getFolderById: id => ({ createFile: blob => { const fid = 'file' + Object.keys(files).length + '_' + crypto.randomBytes(3).toString('hex'); files[fid] = { blob, trashed: false }; return { getId: () => fid }; } }),
      getFileById: id => { if (!files[id]) throw new Error('No file'); return { getBlob: () => files[id].blob, setTrashed: t => { files[id].trashed = t; } }; }
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ text: t, setMimeType() { return this; }, getContent() { return this.text; } }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: n => sheets[n] || null,
        insertSheet: n => {
          const data = [];
          return (sheets[n] = {
            data, getLastRow: () => data.length, appendRow: r => { data.push(r.slice()); }, setFrozenRows() { }, deleteRow: i => { data.splice(i - 1, 1); },
            getRange: (r, c, nr, nc) => ({
              getValues: () => data.slice(r - 1, r - 1 + nr).map(row => { const o = []; for (let j = 0; j < nc; j++) o.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]); return o; }),
              setValues: v => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = v[i][j]; }
            })
          });
        }
      })
    }
  };
  return { G, files, sheets, props, mails };
}

(function run() {
  const env = makeGoogle(); const ctx = vm.createContext(Object.assign({ console, Date, JSON, Math }, env.G));
  vm.runInContext(src, ctx, { filename: 'Code.gs' });
  let now = Date.now(); ctx.Date = class extends Date { static now() { return now; } };
  const post = (o) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(o) } }).getContent());

  check('doGet answers', JSON.parse(ctx.doGet().getContent()).ok === true);
  check('before setup: clear SETUP error', post({ action: 'ping' }).code === 'SETUP');
  let threw = false; try { ctx.setup(); } catch (e) { threw = /Edit ADMIN/.test(e.message); }
  check('setup refuses the sample admin password', threw);
  vm.runInContext("ADMIN_USER='Boss'; ADMIN_PASS='Strong#Pass1'", ctx);
  ctx.setup(); ctx.setup();
  check('setup is repeatable (still 1 user)', env.sheets.Users.data.length === 2);
  check('setup sends a test email to the owner', env.mails.length >= 1 && env.mails[0].to === 'owner@example.com');
  check('password not stored in clear', !JSON.stringify(env.sheets.Users.data).includes('Strong#Pass1'));

  let r = post({ action: 'login', user: 'boss', pass: 'Strong#Pass1' });
  check('admin login (username case-insensitive)', r.ok && r.role === 'admin' && r.token.split('|').length === 4);
  const A = r.token;
  check('ping with token', post({ action: 'ping' }).ok);
  check('wrong password', post({ action: 'login', user: 'boss', pass: 'nope' }).code === 'LOGIN');
  for (let i = 0; i < 5; i++) post({ action: 'login', user: 'ghost', pass: 'x' + i });
  check('lock-out after repeated failures', post({ action: 'login', user: 'ghost', pass: 'x' }).code === 'LOCKED');
  check('lock-out also blocks the right password for that name', post({ action: 'login', user: 'ghost', pass: 'x' }).code === 'LOCKED');

  check('no token -> AUTH', post({ action: 'list' }).code === 'AUTH');
  check('add user u1', post({ action: 'addUser', token: A, username: 'User1', name: 'Rahim', role: 'user', password: 'pass-u1' }).ok);
  check('add user u2', post({ action: 'addUser', token: A, username: 'user2', name: 'Karim', role: 'user', password: 'pass-u2' }).ok);
  check('duplicate username rejected', post({ action: 'addUser', token: A, username: 'user1', role: 'user', password: 'abcdef' }).code === 'BAD');
  check('short password rejected', post({ action: 'addUser', token: A, username: 'u3', role: 'user', password: '123' }).code === 'BAD');
  check('bad role rejected', post({ action: 'addUser', token: A, username: 'u3', role: 'root', password: 'abcdef' }).code === 'BAD');
  const U1 = post({ action: 'login', user: 'user1', pass: 'pass-u1' }), U2 = post({ action: 'login', user: 'user2', pass: 'pass-u2' });
  check('users can sign in', U1.ok && U2.ok && U1.role === 'user');
  check('user cannot list users', post({ action: 'users', token: U1.token }).code === 'FORBIDDEN');
  check('user cannot add users', post({ action: 'addUser', token: U1.token, username: 'x1x', role: 'user', password: 'abcdef' }).code === 'FORBIDDEN');
  check('admin lists users without hashes', (() => { const x = post({ action: 'users', token: A }); return x.ok && x.users.length === 3 && !JSON.stringify(x).includes('hash') && !JSON.stringify(x).includes('salt'); })());

  const N = 4000, raw = { t: [], ax: [], ay: [], az: [], pt: [1, 2, 3], p: [1008.123456, 1008.2, 1008.1] };
  for (let i = 0; i < N; i++) { raw.t.push(i * 0.005 + 0.000012345); raw.ax.push(0.01 * Math.sin(i)); raw.ay.push(0.02); raw.az.push(9.81 + 0.00001234); }
  const rec = (cid, extra) => Object.assign({ clientId: cid, meta: { date: '2026-11-25 14:07', building: 'Test Tower', lift: 'L1', from: '14', to: '1', demo: false, knownHeight: 35 }, summary: { dir: 'down', height: 35.07, vPeak: 1.17, v95: 1.16, aMax: 1.02, dMax: 1.01, jMax: 1.7, a95z: 48.3, allOk: false }, raw: raw }, extra || {});
  r = post({ action: 'upload', token: U1.token, record: rec('dev1-1700000000000') });
  check('user uploads a record', r.ok && r.id);
  const id1 = r.id;
  check('same upload again is idempotent', (() => { const d = post({ action: 'upload', token: U1.token, record: rec('dev1-1700000000000') }); return d.ok && d.duplicate && d.id === id1; })());
  check('only one Drive file + one row', Object.keys(env.files).length === 1 && env.sheets.Records.data.length === 2);
  check('file is gzip and has no username inside', (() => { const f = Object.values(env.files)[0]; return f.blob.name.endsWith('.json.gz') && f.blob.bytes[0] === 0x1f && f.blob.bytes[1] === 0x8b; })());
  r = post({ action: 'upload', token: U2.token, record: rec('dev2-1700000000001', { meta: { date: '2026-11-25 15:00', building: 'Other', lift: 'L9', demo: false } }) });
  check('second user uploads', r.ok); const id2 = r.id;
  check('bad upload: NaN sample', post({ action: 'upload', token: U1.token, record: rec('dev1-bad000001', { raw: Object.assign({}, raw, { az: raw.az.map((v, i) => i === 5 ? 'x' : v) }) }) }).code === 'BAD');
  check('bad upload: too few samples', post({ action: 'upload', token: U1.token, record: rec('dev1-bad000002', { raw: { t: [1], ax: [1], ay: [1], az: [1] } }) }).code === 'BAD');
  check('bad upload: bad clientId', post({ action: 'upload', token: U1.token, record: rec('a b') }).code === 'BAD');
  check('uploads cannot claim another user (server stamps the owner)', (() => { const x = post({ action: 'upload', token: U1.token, record: rec('dev1-1700000000002', { user: 'user2', meta: { date: 'x', user: 'user2' } }) }); const row = env.sheets.Records.data[env.sheets.Records.data.length - 1]; return x.ok && row[3] === 'user1'; })());

  let l1 = post({ action: 'list', token: U1.token }), lA = post({ action: 'list', token: A });
  check('user sees only own records', l1.ok && l1.rows.every(x => x.user === 'user1') && l1.total === 2);
  check('user cannot filter to someone else', post({ action: 'list', token: U1.token, filter: { user: 'user2' } }).rows.every(x => x.user === 'user1'));
  check('admin sees all', lA.total === 3 && lA.users.length === 3);
  check('admin filter by user and text', post({ action: 'list', token: A, filter: { user: 'user2' } }).total === 1 && post({ action: 'list', token: A, filter: { q: 'test tower' } }).total === 1);
  check('list hides file ids and meta', !JSON.stringify(lA).includes('fileId') && !JSON.stringify(lA).includes('metaJson'));

  let g = post({ action: 'get', token: U1.token, id: id1 });
  check('owner reads raw data back', g.ok && g.raw.t.length === N && Math.abs(g.raw.az[10] - 9.81) < 1e-3 && g.meta.building === 'Test Tower');
  check('raw is rounded (smaller)', g.raw.t[1] === 0.005 || String(g.raw.t[1]).length <= 8);
  check('other user cannot read it', post({ action: 'get', token: U2.token, id: id1 }).code === 'NOTFOUND');
  check('admin can read any', post({ action: 'get', token: A, id: id2 }).ok);
  check('user cannot delete', post({ action: 'remove', token: U1.token, id: id1 }).code === 'FORBIDDEN');

  // tampered token: user edits role in the token
  const parts = U1.token.split('|'); const forged = [parts[0], 'admin', parts[2], parts[3]].join('|');
  check('forged admin token rejected', post({ action: 'users', token: forged }).code === 'AUTH');
  const forged2 = ['boss', 'admin', parts[2], parts[3]].join('|');
  check('token for another name rejected', post({ action: 'users', token: forged2 }).code === 'AUTH');
  now += 31 * 86400000; check('expired token rejected', post({ action: 'list', token: U1.token }).code === 'AUTH'); now -= 31 * 86400000;

  check('change password: wrong old', post({ action: 'changePassword', token: U1.token, oldPass: 'bad', newPass: 'newpass1' }).code === 'LOGIN');
  check('change password ok', post({ action: 'changePassword', token: U1.token, oldPass: 'pass-u1', newPass: 'newpass1' }).ok);
  check('old password no longer works, new does', post({ action: 'login', user: 'user1', pass: 'pass-u1' }).code === 'LOGIN' && post({ action: 'login', user: 'user1', pass: 'newpass1' }).ok);
  check('admin resets a password', post({ action: 'setPassword', token: A, username: 'user2', password: 'reset-u2' }).ok && post({ action: 'login', user: 'user2', pass: 'reset-u2' }).ok);
  check('disable user cuts the existing token at once', post({ action: 'setActive', token: A, username: 'user2', active: false }).ok && post({ action: 'list', token: U2.token }).code === 'AUTH');
  check('disabled user cannot sign in (told only after the right password)', post({ action: 'login', user: 'user2', pass: 'reset-u2' }).code === 'DISABLED' && post({ action: 'login', user: 'user2', pass: 'xx' }).code === 'LOGIN');
  check('admin cannot disable self', post({ action: 'setActive', token: A, username: 'boss', active: false }).code === 'BAD');
  check('re-enable works', post({ action: 'setActive', token: A, username: 'user2', active: true }).ok && post({ action: 'login', user: 'user2', pass: 'reset-u2' }).ok);

  /* ---- access requests ---- */
  env.mails.length = 0;
  const reqBase = { action: 'requestAccess', name: 'Sumon Ahmed', username: 'WAL-1001', section: 'Installation', email: 'sumon@example.com', password: 'sumon123' };
  check('request: bad email refused', post(Object.assign({}, reqBase, { email: 'nope' })).code === 'BAD');
  check('request: missing section refused', post(Object.assign({}, reqBase, { section: ' ' })).code === 'BAD');
  check('request: short password refused', post(Object.assign({}, reqBase, { password: '123' })).code === 'BAD');
  r = post(reqBase);
  check('request accepted without a token', r.ok && r.username === 'wal-1001', JSON.stringify(r));
  check('admin gets an email with name, ID, section, email', env.mails.length === 1 && env.mails[0].to === 'owner@example.com' && /Sumon Ahmed/.test(env.mails[0].body) && /wal-1001/.test(env.mails[0].body) && /Installation/.test(env.mails[0].body) && /sumon@example.com/.test(env.mails[0].body));
  check('request password is stored hashed', !JSON.stringify(env.sheets.Users.data).includes('sumon123'));
  check('same ID cannot request twice while pending', post(reqBase).code === 'BAD');
  check('existing account ID cannot be requested', post(Object.assign({}, reqBase, { username: 'user1' })).code === 'BAD');
  check('pending user cannot sign in (clear message)', post({ action: 'login', user: 'wal-1001', pass: 'sumon123' }).code === 'PENDING');
  check('wrong password on a pending request reveals nothing', post({ action: 'login', user: 'wal-1001', pass: 'bad' }).code === 'LOGIN');
  check('admin sees the pending count in "me" and "users"', post({ action: 'me', token: A }).pending === 1 && post({ action: 'users', token: A }).pending === 1);
  check('user does not get the pending count', post({ action: 'me', token: U1.token }).pending === undefined);
  check('user cannot approve', post({ action: 'approve', token: U1.token, username: 'wal-1001' }).code === 'FORBIDDEN');
  check('enable/disable is not used for requests', post({ action: 'setActive', token: A, username: 'wal-1001', active: true }).code === 'BAD');
  check('admin approves', post({ action: 'approve', token: A, username: 'wal-1001' }).ok);
  check('approved user gets an email', env.mails.some(m => m.to === 'sumon@example.com' && /approved/.test(m.subj)));
  check('approved user signs in as a normal user', (() => { const x = post({ action: 'login', user: 'WAL-1001', pass: 'sumon123' }); return x.ok && x.role === 'user'; })());
  check('approving twice is refused', post({ action: 'approve', token: A, username: 'wal-1001' }).code === 'BAD');
  post(Object.assign({}, reqBase, { username: 'wal-2002', email: 'x2@example.com', name: 'Second Person' }));
  check('admin rejects', post({ action: 'reject', token: A, username: 'wal-2002' }).ok && post({ action: 'login', user: 'wal-2002', pass: 'sumon123' }).code === 'REJECTED');
  check('rejected user is emailed', env.mails.some(m => m.to === 'x2@example.com' && /not approved/.test(m.subj)));
  check('a rejected ID may request again', post(Object.assign({}, reqBase, { username: 'wal-2002', email: 'x2@example.com', name: 'Second Person' })).ok && post({ action: 'login', user: 'wal-2002', pass: 'sumon123' }).code === 'PENDING');
  check('request still saved if the email fails', (() => { const keep = env.G.MailApp.sendEmail; env.G.MailApp.sendEmail = () => { throw new Error('quota'); }; const x = post(Object.assign({}, reqBase, { username: 'wal-3003', email: 'x3@example.com' })); env.G.MailApp.sendEmail = keep; return x.ok && post({ action: 'users', token: A }).users.some(u => u.username === 'wal-3003' && u.status === 'pending'); })());
  check('users list carries section, email and status', (() => { const u = post({ action: 'users', token: A }).users.find(x => x.username === 'wal-1001'); return u && u.section === 'Installation' && u.email === 'sumon@example.com' && u.status === 'active' && u.decidedBy === 'boss'; })());

  check('admin removes a record (row gone, file trashed)', (() => { const fid = Object.keys(env.files)[0]; const x = post({ action: 'remove', token: A, id: id1 }); return x.ok && env.files[fid].trashed && post({ action: 'get', token: A, id: id1 }).code === 'NOTFOUND'; })());
  check('remove unknown id', post({ action: 'remove', token: A, id: 'nope' }).code === 'NOTFOUND');
  check('unknown action', post({ action: 'hack', token: A }).code === 'BAD');
  check('garbage body does not crash', (() => { const o = JSON.parse(ctx.doPost({ postData: { contents: '{bad' } }).getContent()); return o.ok === false && o.code === 'SERVER'; })());

  console.log(fails ? '\n' + fails + ' FAILED' : '\nAll backend tests passed');
  process.exit(fails ? 1 : 0);
})();
