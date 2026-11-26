/* Cloud / admin / PWA browser tests (Playwright).
 * Run: python3 -m http.server 8123 --directory www &  then  NODE_PATH=/opt/npm-tools/node_modules node tests/e2e-cloud.js
 * Part A uses the built-in demo server. Parts B/C use the REAL fetch code path against a mocked Apps Script URL
 * (a Node server running the same CloudLogic) — this does not prove the real Google deployment. */
const { chromium } = require('playwright');
const fs = require('fs'), crypto = require('crypto');
const CL = require('../www/js/cloudlogic.js');
const OUT = process.env.SHOTS || '/tmp/shots'; fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://127.0.0.1:8123/index.html';
const URL_OK = 'https://script.google.com/macros/s/TESTDEPLOY123/exec';
let fails = 0; function check(n, ok, i) { console.log((ok ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!ok) fails++; }

function memStore() {
  const db = { users: [], rows: [], files: {} }, fl = {};
  const S = { notify: () => {}, now: () => Date.now(), uuid: () => crypto.randomUUID(), digestHex: s => crypto.createHash('sha256').update(s).digest('hex'), sign: s => crypto.createHmac('sha256', 'k').update(s).digest('hex'),
    lock: f => f(), getFails: u => fl[u] || null, setFails: (u, o) => { fl[u] = o; }, users: () => db.users.map(x => ({ ...x })),
    putUser: u => { const i = db.users.findIndex(x => x.username === u.username); if (i < 0) db.users.push({ ...u }); else db.users[i] = { ...u }; },
    rows: () => db.rows.map(x => ({ ...x })), addRow: o => { db.rows.push(o); }, delRow: id => { const i = db.rows.findIndex(r => r.id === id); if (i < 0) return null; const f = db.rows[i].fileId; db.rows.splice(i, 1); return f; },
    writeFile: (id, t) => { db.files[id] = t; return id; }, readFile: f => db.files[f], trashFile: f => { delete db.files[f]; } };
  const mk = (u, n, r, p) => { const salt = 's-' + u; db.users.push({ username: u, name: n, section: 'Test', email: u + '@example.com', role: r, status: 'active', salt, hash: CL.hashPassword(p, salt, S.digestHex), created: Date.now() }); };
  mk('tester', 'Field Tester', 'user', 'secret1'); mk('boss', 'The Boss', 'admin', 'Admin#123');
  return { S, db };
}

(async () => {
  const browser = await chromium.launch(); const errors = [];
  async function newPage(vw, vh, scheme, q, setup) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, colorScheme: scheme, acceptDownloads: true, deviceScaleFactor: 2 });
    await ctx.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.LRM_CONFIG={cloudUrl:""};' }));
    if (setup) await setup(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.goto(BASE + (q || '?source=demo&demoSpeed=25&seed=14')); await page.waitForTimeout(300);
    return { ctx, page };
  }
  const runDemo = async (page) => { await page.click('[data-tab=measure]'); await page.click('#btnStart'); await page.waitForFunction(() => document.querySelector('#screen-results').classList.contains('active'), null, { timeout: 40000 }); await page.waitForTimeout(400); };
  const tab = async (page, t) => { await page.click(`[data-tab=${t}]`); await page.waitForTimeout(250); };

  /* ===== A. demo server: sign-in, manual send, access request + approval, admin ===== */
  let { ctx, page } = await newPage(390, 844, 'dark');
  check('no cloud configured: login overlay hidden, admin tab hidden', await page.locator('#loginOv').isHidden() && await page.locator('#tabAdmin').isHidden());
  await tab(page, 'more'); await page.fill('#cUrl', 'https://example.com/x'); await page.click('#cSave');
  check('invalid URL is refused with a clear message', /must look like/.test(await page.locator('#cMsg').innerText()));
  await page.fill('#cUrl', 'demo'); await page.click('#cSave'); await page.waitForTimeout(300);
  check('after saving a URL the sign-in page blocks the app', await page.locator('#loginOv').isVisible());
  await page.screenshot({ path: OUT + '/20_login_dark_mobile.png' });
  await page.fill('#lgUser', 'demo'); await page.fill('#lgPass', 'wrong'); await page.click('#lgGo'); await page.waitForTimeout(400);
  check('wrong password shows an error', /Wrong ID or password/.test(await page.locator('#lgMsg').innerText()));

  // request access
  await page.click('#toReq'); await page.waitForTimeout(200);
  await page.fill('#rqName', 'Sumon Ahmed'); await page.fill('#rqId', 'WAL-1001'); await page.fill('#rqSection', 'Installation'); await page.fill('#rqEmail', 'sumon@example.com');
  await page.fill('#rqPass', 'sumon123'); await page.fill('#rqPass2', 'sumon124'); await page.click('#rqGo'); await page.waitForTimeout(300);
  check('request form: mismatching passwords refused', /different/.test(await page.locator('#rqMsg').innerText()));
  await page.fill('#rqEmail', 'not-an-email'); await page.fill('#rqPass2', 'sumon123');
  await page.evaluate(() => document.getElementById('rqEmail').setAttribute('type', 'text'));   // bypass the browser check to test the server rule
  await page.click('#rqGo'); await page.waitForTimeout(300);
  check('request form: server refuses a bad email', /valid email/.test(await page.locator('#rqMsg').innerText()), await page.locator('#rqMsg').innerText());
  await page.fill('#rqEmail', 'sumon@example.com'); await page.screenshot({ path: OUT + '/28_request_access_dark_mobile.png' });
  await page.click('#rqGo'); await page.waitForTimeout(400);
  check('request sent: back on sign-in with the ID filled in', await page.locator('#loginForm').isVisible() && (await page.inputValue('#lgUser')) === 'wal-1001' && /Request sent/.test(await page.locator('#lgMsg').innerText()));
  await page.fill('#lgPass', 'sumon123'); await page.click('#lgGo'); await page.waitForTimeout(400);
  check('cannot sign in before approval', /waiting for the administrator/.test(await page.locator('#lgMsg').innerText()) && await page.locator('#loginOv').isVisible());

  await page.fill('#lgUser', 'demo'); await page.fill('#lgPass', 'demo123'); await page.click('#lgGo'); await page.waitForTimeout(500);
  check('user signs in', await page.locator('#loginOv').isHidden() && /Demo User/.test(await page.locator('#cloudChip').innerText()), await page.locator('#cloudChip').innerText());
  check('user does not see the Admin tab', await page.locator('#tabAdmin').isHidden());
  await runDemo(page);
  check('nothing is sent automatically after a recording', (await page.evaluate(() => JSON.parse(localStorage.getItem('liftmeter.demo.cloud')).rows.length)) === 3);
  check('Results has "Send to admin" and "Reading file"', await page.locator('#btnSend').isVisible() && await page.locator('#btnRaw').isVisible());
  await tab(page, 'history');
  check('history row offers a Send button', await page.locator('#histList .sync-btn').count() === 1);
  check('history line explains records stay on the phone', /stay on this phone/.test(await page.locator('#syncLine').innerText()));
  await page.click('#histList .sync-btn'); await page.waitForTimeout(900);
  check('tap Send: record sent (☁ Sent)', (await page.locator('#histList .sync').first().innerText()).includes('Sent') && (await page.evaluate(() => JSON.parse(localStorage.getItem('liftmeter.demo.cloud')).rows.length)) === 4);
  await page.screenshot({ path: OUT + '/21_history_sent_mobile_dark.png' });
  await page.locator('#histList .info').first().click(); await page.waitForTimeout(500);
  check('Results shows the record as sent', /Sent/.test(await page.locator('#btnSend').innerText()) && await page.locator('#btnSend').isDisabled());
  const [dlr] = await Promise.all([page.waitForEvent('download'), page.click('#btnRaw')]);
  const rawPath = OUT + '/reading_test.lrm.json'; fs.copyFileSync(await dlr.path(), rawPath);
  const rj = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  check('reading file exported (raw samples + details)', rj.format === 'lift-ride-meter-reading' && rj.raw.t.length > 1000 && rj.meta.building !== undefined);
  await tab(page, 'more'); await page.screenshot({ path: OUT + '/22_more_cloud_mobile_dark.png' });
  await page.click('#cPwBox summary'); await page.fill('#cOld', 'zzzzzz'); await page.fill('#cNew', 'newpass9'); await page.click('#cPw'); await page.waitForTimeout(300);
  check('change password: wrong current password is refused', /Current password is wrong/.test(await page.locator('#cPwMsg').innerText()));
  await page.fill('#cOld', 'demo123'); await page.click('#cPw'); await page.waitForTimeout(300);
  check('change password works', /changed/.test(await page.locator('#cPwMsg').innerText()));
  await page.click('#cLogout'); await page.waitForTimeout(300);
  check('sign out brings the sign-in page back', await page.locator('#loginOv').isVisible());

  // admin
  await page.fill('#lgUser', 'admin'); await page.fill('#lgPass', 'admin123'); await page.click('#lgGo'); await page.waitForTimeout(700);
  check('admin signs in, lands on Admin, sees a request badge', await page.locator('#screen-admin').isVisible() && (await page.locator('#adBadge').innerText()) === '1');
  await page.waitForFunction(() => document.querySelectorAll('#rqList .rq-item').length >= 1, null, { timeout: 8000 });
  check('request shows name, ID, section, email', /Sumon Ahmed/.test(await page.locator('#rqList').innerText()) && /wal-1001/.test(await page.locator('#rqList').innerText()) && /Installation/.test(await page.locator('#rqList').innerText()) && /sumon@example.com/.test(await page.locator('#rqList').innerText()));
  check('demo server recorded an admin notification', (await page.evaluate(() => JSON.parse(localStorage.getItem('liftmeter.demo.cloud')).notes.filter(n => n.kind === 'request').length)) === 1);
  await page.screenshot({ path: OUT + '/29_admin_requests_dark_mobile.png' });
  await page.locator('#rqList .rq-item', { hasText: 'wal-1001' }).locator('text=Approve').click(); await page.waitForTimeout(600);
  check('approve: request gone, badge cleared, user listed as Active', await page.locator('#rqEmpty').isVisible() && await page.locator('#adBadge').isHidden() && /Active/.test(await page.locator('#usTbl tr', { hasText: 'wal-1001' }).innerText()));
  await page.waitForFunction(() => document.querySelectorAll('#adTbl tr').length >= 5, null, { timeout: 15000 });
  const nRows = await page.locator('#adTbl tr').count() - 1;
  check('admin sees every user\'s sent records (3 seeded + 1 sent)', nRows === 4, 'rows=' + nRows);
  await page.selectOption('#adUser', 'rahim'); await page.waitForTimeout(500);
  check('filter by user', await page.locator('#adTbl tr').count() === 2);
  await page.selectOption('#adUser', ''); await page.fill('#adQ', 'plaza'); await page.dispatchEvent('#adQ', 'change'); await page.waitForTimeout(500);
  check('text filter', await page.locator('#adTbl tr').count() === 2);
  await page.fill('#adQ', ''); await page.dispatchEvent('#adQ', 'change'); await page.waitForTimeout(400);
  const [dl0] = await Promise.all([page.waitForEvent('download'), page.click('#adCsv')]);
  const csv = fs.readFileSync(await dl0.path(), 'utf8');
  check('summary CSV downloads with a header and rows', /date,user,building,lift/.test(csv) && csv.split(/\r?\n/).length >= 5);
  await page.setViewportSize({ width: 1280, height: 1300 }); await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/23_admin_dark_desktop.png' });
  await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(300); await page.screenshot({ path: OUT + '/24_admin_light_desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300); await page.screenshot({ path: OUT + '/25_admin_light_mobile.png' });
  await page.locator('#adTbl tr', { hasText: 'rahim' }).first().locator('text=Open').click();
  await page.waitForFunction(() => document.querySelector('#screen-results').classList.contains('active'), null, { timeout: 20000 }); await page.waitForTimeout(500);
  check('cloud record opens in Results with full analysis', /by rahim/.test(await page.locator('#resTitle').innerText()) && await page.locator('#charts canvas').count() >= 8, await page.locator('#resTitle').innerText());
  check('no Send button / runs note for a cloud record', await page.locator('#btnSend').isHidden() && await page.locator('#runsBox').isHidden());
  const [dl1] = await Promise.all([page.waitForEvent('download'), page.click('#btnPdf')]);
  const pdf = fs.readFileSync(await dl1.path()); check('PDF export works for a cloud record', pdf.slice(0, 5).toString() === '%PDF-' && pdf.length > 50000, pdf.length + ' bytes');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#btnCsv')]); check('CSV export works for a cloud record', fs.statSync(await dl2.path()).size > 10000);
  await page.screenshot({ path: OUT + '/26_cloud_record_results_mobile.png' });
  await tab(page, 'admin');
  await page.fill('#usName', 'New Person'); await page.fill('#usUser', 'Newbie'); await page.fill('#usPass', 'abc'); await page.click('#usAdd'); await page.waitForTimeout(400);
  check('adding a user with a short password is refused', /6 to 64/.test(await page.locator('#usMsg').innerText()));
  await page.fill('#usPass', 'abcdef'); await page.fill('#usSection', 'QC'); await page.click('#usAdd'); await page.waitForTimeout(500);
  check('admin adds a user directly (ID lower-cased)', (await page.locator('#usTbl').innerText()).includes('newbie'));
  await page.locator('#usTbl tr', { hasText: 'newbie' }).locator('text=Disable').click(); await page.waitForTimeout(500);
  check('user can be disabled', (await page.locator('#usTbl tr', { hasText: 'newbie' }).innerText()).includes('Disabled'));
  await page.locator('#usTbl tr', { hasText: 'Demo Admin' }).locator('text=Disable').click(); await page.waitForTimeout(400);
  check('admin cannot disable own account', /cannot disable your own/.test(await page.locator('#usMsg').innerText()), await page.locator('#usMsg').innerText());
  const before = await page.locator('#adTbl tr').count();
  const delBtn = page.locator('#adTbl tr', { hasText: 'rahim' }).first().locator('button.danger-o'); await delBtn.click(); await delBtn.click(); await page.waitForTimeout(700);
  check('admin deletes a record (two taps)', await page.locator('#adTbl tr').count() === before - 1);
  await page.click('[data-tab=more]'); await page.click('#cLogout'); await page.waitForTimeout(300);
  await page.fill('#lgUser', 'wal-1001'); await page.fill('#lgPass', 'sumon123'); await page.click('#lgGo'); await page.waitForTimeout(500);
  check('approved user can now sign in', await page.locator('#loginOv').isHidden() && /Sumon Ahmed/.test(await page.locator('#cloudChip').innerText()));
  await ctx.close();

  /* ===== A2. PC: import a reading file (no cloud needed) ===== */
  ({ ctx, page } = await newPage(1280, 900, 'light', '?source=demo'));
  await tab(page, 'history');
  await page.setInputFiles('#fileImport', rawPath); await page.waitForTimeout(1500);
  check('reading file imported and analysed on the PC', await page.locator('#screen-results').isVisible() && await page.locator('#charts canvas').count() >= 8);
  await tab(page, 'history');
  check('imported record listed, no Send button for it', await page.locator('#histList li').count() === 1 && await page.locator('#histList .sync-btn').count() === 0);
  fs.writeFileSync(OUT + '/bad.json', '{"hello":1}');
  await page.setInputFiles('#fileImport', OUT + '/bad.json'); await page.waitForTimeout(400);
  check('a wrong file is refused with a message', /not a Lift Ride Test reading/.test(await page.locator('#impMsg').innerText()));
  await ctx.close();

  /* ===== B. real fetch path against a mocked Apps Script ===== */
  const { S, db } = memStore(); const net = { down: false, html: false };
  const mock = async (c) => {
    await c.route(URL_OK, async route => {
      if (net.down) return route.abort('failed');
      if (net.html) return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Sign in to Google</html>' });
      const out = CL.handle(JSON.parse(route.request().postData()), S);
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
    });
  };
  ({ ctx, page } = await newPage(390, 844, 'light', '?source=demo&demoSpeed=25&seed=14', mock));
  await tab(page, 'more'); await page.fill('#cUrl', URL_OK); await page.click('#cSave'); await page.waitForTimeout(300);
  await page.fill('#lgUser', 'Tester'); await page.fill('#lgPass', 'secret1'); await page.click('#lgGo'); await page.waitForTimeout(700);
  check('sign-in through real fetch (text/plain POST, JSON reply)', /Field Tester/.test(await page.locator('#cloudChip').innerText()), await page.locator('#cloudChip').innerText());
  await runDemo(page); await tab(page, 'history'); await page.waitForTimeout(500);
  check('fictional (DEMO sensor) records cannot be sent to a real cloud', db.rows.length === 0 && await page.locator('#histList .sync-btn').count() === 0);
  await page.evaluate(async () => { const l = await Store.list(); for (const it of l) await Store.updateMeta(it.id, Object.assign({}, it.meta, { demo: false, building: 'Real Tower', lift: 'Lift A' }), it.summary); });
  await tab(page, 'more'); await tab(page, 'history');
  net.down = true; await page.click('#histList .sync-btn'); await page.waitForTimeout(900);
  check('offline Send: record queued with a clear message', /queued/.test(await page.locator('#impMsg').innerText()) && db.rows.length === 0 && (await page.locator('#histList .sync').first().innerText()).includes('Queued'), await page.locator('#impMsg').innerText());
  net.down = false; await tab(page, 'more'); await page.click('#cSync'); await page.waitForTimeout(1500);
  check('back online: queued record sent, owner stamped by the server', db.rows.length === 1 && db.rows[0].user === 'tester' && /sent/.test(await page.locator('#cMsg').innerText()), await page.locator('#cMsg').innerText());
  await page.click('#cSync'); await page.waitForTimeout(600);
  check('nothing queued after sending', db.rows.length === 1 && /Nothing is queued/.test(await page.locator('#cMsg').innerText()));
  await page.evaluate(async () => { const l = await Store.list(); for (const it of l) await Store.setCloud(it.id, { state: 'pending' }); });
  await page.click('#cSync'); await page.waitForTimeout(1200);
  check('a retry after a lost reply is idempotent (server de-duplicates)', db.rows.length === 1);
  await page.evaluate(async () => { const l = await Store.list(); for (const it of l) await Store.setCloud(it.id, { state: 'pending' }); });
  net.html = true; await page.click('#cSync'); await page.waitForTimeout(900);
  check('wrong deployment access shows a helpful message', /did not return data/.test(await page.locator('#cMsg').innerText()), await page.locator('#cMsg').innerText());
  net.html = false;
  S.putUser(Object.assign(S.users().find(u => u.username === 'tester'), { status: 'disabled' }));
  await page.click('#cSync'); await page.waitForTimeout(900);
  check('disabled account: app returns to the sign-in page', await page.locator('#loginOv').isVisible());
  S.putUser(Object.assign(S.users().find(u => u.username === 'tester'), { status: 'active' }));
  await ctx.close();

  /* ===== C. URL fixed in config.js by the administrator ===== */
  const lockCfg = async (c) => { await mock(c); await c.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.LRM_CONFIG={cloudUrl:"' + URL_OK + '"};' })); };
  ({ ctx, page } = await newPage(1280, 900, 'light', '?source=demo&demoSpeed=25&seed=14', lockCfg));
  check('config.js URL: sign-in is required from the first screen', await page.locator('#loginOv').isVisible());
  check('config.js URL: no "use without cloud" escape', await page.locator('#lgOffline').isHidden());
  await page.fill('#lgUser', 'boss'); await page.fill('#lgPass', 'Admin#123'); await page.click('#lgGo'); await page.waitForTimeout(800);
  await tab(page, 'more'); check('URL field is locked', await page.locator('#cUrl').isDisabled() && await page.locator('#cSave').isHidden());
  await tab(page, 'admin'); await page.waitForTimeout(900);
  check('admin sees the field tester\'s record through the real fetch path', (await page.locator('#adTbl').innerText()).includes('Real Tower') && (await page.locator('#adTbl').innerText()).includes('tester'));
  await page.screenshot({ path: OUT + '/27_admin_real_desktop_light.png' });
  await page.locator('#adTbl tr', { hasText: 'Real Tower' }).locator('text=Open').click(); await page.waitForTimeout(1500);
  check('record downloaded and analysed', /by tester/.test(await page.locator('#resTitle').innerText()));
  await ctx.close();

  /* ===== D. installable web app (PWA) ===== */
  ({ ctx, page } = await newPage(1280, 800, 'light', '?source=demo'));
  const pw = await page.evaluate(async () => {
    const m = await (await fetch('manifest.webmanifest')).json();
    const icons = await Promise.all(m.icons.map(i => fetch(i.src).then(r => r.ok)));
    let reg = null; try { reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 6000))]); } catch (e) { /* none */ }
    return { name: m.name, display: m.display, icons, sw: !!reg, scope: reg && reg.scope };
  });
  check('manifest valid, 3 icons reachable, standalone', pw.name === 'Lift Ride Test' && pw.display === 'standalone' && pw.icons.length === 3 && pw.icons.every(Boolean), JSON.stringify(pw));
  check('service worker active', pw.sw, pw.scope);
  await page.reload(); await page.waitForTimeout(600);
  check('app still loads after the service worker takes over', await page.locator('#btnStart').isVisible());
  await ctx.close();

  console.log('\nconsole/page errors:', errors.length ? '\n' + errors.join('\n') : 'none');
  check('no JS errors', errors.length === 0);
  await browser.close();
  console.log(fails ? `\n${fails} failed` : '\nAll cloud e2e tests passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
