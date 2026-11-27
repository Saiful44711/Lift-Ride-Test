/* e2e-v22.js — v2.2 features: interactive charts, limits (reference / manual), sound, source finder, compare, update bar, mic.
 * Run: python3 -m http.server 8123 --directory www &  then  NODE_PATH=/opt/npm-tools/node_modules node tests/e2e-v22.js
 * Design & Developed by Md. Saiful Islam */
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://127.0.0.1:8123/index.html';
const OUT = process.env.SHOTS || '/tmp/shots22'; fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const errors = [];
function check(name, ok, info) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + info : '')); if (!ok) fails++; }

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  async function newPage(vw, vh, scheme, q, setup) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, colorScheme: scheme, acceptDownloads: true, deviceScaleFactor: 2, permissions: ['microphone'] });
    await ctx.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.LRM_CONFIG={cloudUrl:"",updateRepo:"Saiful44711/Lift-Ride-Test"};' }));
    if (setup) await setup(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.goto(BASE + q); await page.waitForTimeout(400);
    return { ctx, page };
  }
  async function record(page, building) {
    await page.click('[data-tab=measure]');
    await page.fill('#fBuilding', building || 'Tower V'); await page.fill('#fLift', 'L-2'); await page.fill('#fRated', '2.5');
    await page.click('#btnStart');
    await page.waitForFunction(() => document.querySelector('#screen-results').classList.contains('active'), null, { timeout: 60000 });
    await page.waitForTimeout(500);
  }
  async function shotEl(page, sel, file) { const h = await page.locator(sel).first(); await h.scrollIntoViewIfNeeded(); await page.waitForTimeout(150); await h.screenshot({ path: OUT + '/' + file }); }

  /* ---------- mobile light: record, sound, limits, source, charts ---------- */
  let { ctx, page } = await newPage(390, 844, 'light', '?source=demo&demoSpeed=25&seed=14');
  await page.click('#liftData summary');
  await page.selectOption('#dRoping', '2'); await page.fill('#aSheave', '400'); await page.fill('#dPoles', '20'); await page.fill('#aRoller', '125'); await page.locator('#aRoller').blur();
  await shotEl(page, '#liftData', '01_liftdata_mobile.png');
  check('sound checkbox on by default', await page.locator('#fSound').isChecked());
  await record(page);
  const r = await page.evaluate(() => { const c = window.__LRM.current; return { snd: !!c.res.sound, run: c.res.sound && c.res.sound.run, v: c.res.verdicts.map(v => v.key), src: c.src && c.src.findings.map(f => f.title), lift: c.meta.liftData }; });
  check('DEMO sound analysed (run max / LAeq)', r.snd && r.run.max > 40 && r.run.leq > 40, JSON.stringify(r.run));
  check('sound card visible with 4 regions', await page.locator('#soundCard').isVisible() && (await page.locator('#soundTbl').innerText()).includes('Post-run'));
  check('verdicts include max p-p, sound and speed band', ['maxz', 'maxx', 'maxy', 'sound', 'rated'].every(k => r.v.includes(k)), r.v.join(','));
  check('% Limit column', (await page.locator('#verdictTbl').innerText()).includes('% Limit'));
  check('reference limits chip', (await page.locator('#limChip').innerText()).includes('Reference'));
  check('lift data stored with the record', r.lift && r.lift.sheaveMm === '400' && r.lift.roping === '2');
  check('source finder has findings', r.src && r.src.length >= 1, (r.src || []).join(' | '));
  check('rail joints found in DEMO (joints every 5 m)', (r.src || []).some(t => /Rail joints/.test(t)));
  check('raw (unfiltered) table', (await page.locator('#rawTbl tr').count()) === 4);
  await shotEl(page, '#srcCard', '02_source_mobile_light.png');
  await shotEl(page, '#soundCard', '03_sound_mobile_light.png');

  // charts
  const ids = await page.evaluate(() => Array.from(document.querySelectorAll('#charts .chart-card')).map(c => c.dataset.chart));
  check('charts: sound, X, Y, Z, speed, accel, jerk, FFT, octave', ['sound', 'vibx', 'viby', 'vibz', 'speed', 'accel', 'jerk', 'fftz', 'specz'].every(i => ids.includes(i)), ids.join(','));
  const vibz = page.locator('[data-chart=vibz] canvas');
  await vibz.scrollIntoViewIfNeeded();
  const bb = await vibz.boundingBox();
  await page.mouse.click(bb.x + bb.width * 0.55, bb.y + bb.height * 0.55); await page.waitForTimeout(200);
  const ro = await page.locator('[data-chart=vibz] .readout').innerText();
  check('click shows time, value, position, speed, phase', /t = .* s/.test(ro) && /position .* m from the bottom/.test(ro) && /speed .* m\/s/.test(ro) && /(steady speed|acceleration|deceleration|still)/.test(ro), ro);
  const ro2 = await page.locator('[data-chart=speed] .readout').innerText();
  check('cursor is shared by all time charts', ro2.startsWith(ro.split(' · ')[0]), ro2.slice(0, 40));
  await shotEl(page, '[data-chart=vibz]', '04_chart_cursor_mobile.png');
  // zoom buttons
  await page.click('[data-chart=vibz] button[title="Zoom in"]'); await page.waitForTimeout(150);
  let st = await page.evaluate(() => window.__LRM.chartState.view.time);
  check('zoom in button narrows the time window', st && st.xmax - st.xmin < 15, JSON.stringify(st));
  await page.click('[data-chart=vibz] button[title="Move right"]'); await page.waitForTimeout(100);
  const st2 = await page.evaluate(() => window.__LRM.chartState.view.time);
  check('move right shifts the window', st2.xmin > st.xmin, st2.xmin.toFixed(2) + ' > ' + st.xmin.toFixed(2));
  await page.click('[data-chart=vibz] button[title="Reset zoom"]'); await page.waitForTimeout(100);
  check('reset zoom', !(await page.evaluate(() => window.__LRM.chartState.view.time)));
  // manual Y scale
  await page.click('[data-chart=vibx] .cbtn-y'); await page.uncheck('[data-chart=vibx] .chart-scale input[type=checkbox]');
  await page.fill('[data-chart=vibx] .chart-scale input[placeholder=min]', '-50'); await page.fill('[data-chart=vibx] .chart-scale input[placeholder=max]', '50');
  await page.click('[data-chart=vibx] .chart-scale button'); await page.waitForTimeout(150);
  const lay = await page.evaluate(() => { const cv = document.querySelector('[data-chart=vibx] canvas'); return { a: cv.__lay.ymin, b: cv.__lay.ymax }; });
  check('manual Y scale (-50..50 mg)', lay.a === -50 && lay.b === 50, JSON.stringify(lay));
  // limit lines
  const hl = await page.evaluate(() => { const r = window.__LRM.current.res; return Report.chartConfigs(r, LiftCore.DEFAULT_LIMITS, {}).filter(c => c.id === 'vibz')[0].cfg.hlines.map(h => h.y); });
  check('vibration chart has ±(max p-p / 2) limit lines', hl.includes(15) && hl.includes(-15), hl.join(','));
  // v2.2.1: charts open unfiltered; the ISO filter button switches to ISO-weighted and back
  const lbl = () => page.evaluate(() => document.querySelector('[data-chart=vibz] canvas').getAttribute('aria-label'));
  check('charts open unfiltered (PMT style)', /unfiltered/.test(await lbl()) && (await page.textContent('#cmIso')) === 'Apply ISO filter' && await page.isHidden('#cLimitsWrap'));
  await page.click('#cmIso'); await page.waitForTimeout(200);
  check('ISO filter button switches to ISO-weighted with limit-line option', /ISO-weighted/.test(await lbl()) && (await page.getAttribute('#cmIso', 'aria-pressed')) === 'true' && await page.isVisible('#cLimitsWrap'));
  const iz = await page.evaluate(() => { const c = Report.chartConfigs(window.__LRM.current.res, LiftCore.DEFAULT_LIMITS, {}).filter(c => c.id === 'vibz')[0].cfg; return { n: c.series.length, jz: c.series[1] && c.series[1].label, pts: (c.points || []).map(p => p.shape), st: c.stats }; });
  check('ISO Z chart: jerk zone series, + and o markers, Jerk Zone Max in title', iz.n === 2 && iz.jz === 'Jerk zone' && iz.pts.includes('plus') && iz.pts.includes('circle') && /Jerk zone Max Pk\/Pk/.test(iz.st), JSON.stringify(iz));
  await shotEl(page, '[data-chart=vibz]', '04b_iso_jerkzone_mobile.png');
  await page.click('#cmIso'); await page.waitForTimeout(150);
  check('ISO filter button again = unfiltered', /unfiltered/.test(await lbl()));
  await page.click('#cmIso'); await page.click('#clStack'); await page.waitForTimeout(200);
  const first = await page.evaluate(() => document.querySelector('#charts .chart-card').dataset.chart);
  check('stacked layout starts with sound (PMT order)', first === 'sound' && await page.evaluate(() => document.querySelector('#charts').classList.contains('stacked')), first);
  await page.click('#clGrid');

  // manual limits
  await page.click('[data-tab=more]'); await page.click('#lsMan'); await page.fill('#lMaxv', '5'); await page.locator('#lMaxv').blur(); await page.waitForTimeout(300);
  await shotEl(page, '#limitsCard', '05_limits_manual_mobile.png');
  await page.click('[data-tab=results]'); await page.waitForTimeout(200);
  const vz = await page.evaluate(() => window.__LRM.current.res.verdicts.filter(v => v.key === 'maxz')[0]);
  check('manual limit 5 mg fails the vertical max p-p', vz.limit === 5 && !vz.ok, vz.value.toFixed(1) + ' mg');
  check('chip says Manual limits', (await page.locator('#limChip').innerText()).includes('Manual'));
  await page.click('[data-tab=more]'); await page.click('#lsRef'); await page.waitForTimeout(200);
  check('reference inputs are read-only', await page.locator('#lMaxv').isDisabled() && (await page.locator('#lMaxv').inputValue()) === '30');

  // microphone (fake device) + calibration
  await page.fill('#sMeter', '60'); await page.click('#btnCal');
  await page.waitForFunction(() => /Calibrated|error|No /.test(document.querySelector('#calMsg').textContent), null, { timeout: 15000 });
  const cal = await page.locator('#calMsg').innerText();
  check('microphone calibration sets an offset', /Calibrated: offset/.test(cal) && (await page.locator('#calChip').innerText()) === 'Calibrated', cal);
  await shotEl(page, '#soundSetCard', '06_sound_settings_mobile.png');

  // PDF
  const pages = await page.evaluate(() => { const c = window.__LRM.current; return Report.render(c.res, c.meta, LiftCore.DEFAULT_LIMITS, { up: 1, down: 0 }, { limitSet: 'reference', lift: c.meta.liftData, source: c.src }).map(cv => cv.toDataURL('image/png')); });
  pages.forEach((d, i) => fs.writeFileSync(OUT + `/pdf_page${i + 1}.png`, Buffer.from(d.split(',')[1], 'base64')));
  check('PDF: 5 pages (measurements, analysis, curves, performance, spectra)', pages.length === 5, String(pages.length));
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), (async () => { await page.click('[data-tab=results]'); await page.click('#btnPdf'); })()]);
  check('PDF download works', (await dl.path()) && fs.statSync(await dl.path()).size > 60000);

  // second run and compare
  await page.goto(BASE + '?source=demo&demoSpeed=25&seed=15'); await page.waitForTimeout(400);
  await record(page);
  const dirs = await page.evaluate(() => window.__LRM.current.res.m.direction);
  await page.click('[data-tab=history]'); await page.waitForTimeout(300);
  const cbs = page.locator('.cmp-cb'); check('history has compare check boxes', (await cbs.count()) >= 2, String(await cbs.count()));
  await cbs.nth(0).check(); await cbs.nth(1).check();
  check('compare button enabled', !(await page.locator('#btnCompare').isDisabled()));
  await page.click('#btnCompare'); await page.waitForFunction(() => window.__LRM.compare, null, { timeout: 15000 }); await page.waitForTimeout(300);
  const C = await page.evaluate(() => { const c = window.__LRM.compare; return { runs: c.runs.length, rec: c.recurring.length, f: c.findings.map(f => f.title), w: c.warnings }; });
  check('compare: 2 runs, recurring heights found (joints every 5 m)', C.runs === 2 && C.rec >= 1, JSON.stringify(C).slice(0, 300) + ' dir2=' + dirs);
  await shotEl(page, '#cmpCard', '07_compare_mobile.png');
  await ctx.close();

  /* ---------- desktop light + dark: charts, box zoom, ctrl wheel ---------- */
  for (const scheme of ['light', 'dark']) {
    ({ ctx, page } = await newPage(1366, 900, scheme, '?source=demo&demoSpeed=25&seed=20'));
    await record(page, 'Desk Tower');
    const cv = page.locator('[data-chart=vibz] canvas'); await cv.scrollIntoViewIfNeeded();
    const b = await cv.boundingBox();
    await page.mouse.move(b.x + b.width * 0.35, b.y + b.height * 0.5); await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(200);
    const v = await page.evaluate(() => window.__LRM.chartState.view.time);
    check(scheme + ': drag selects a box zoom on all time charts', v && v.xmax - v.xmin < 8, JSON.stringify(v));
    await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5); await page.keyboard.down('Control'); await page.mouse.wheel(0, 300); await page.keyboard.up('Control'); await page.waitForTimeout(200);
    const v2 = await page.evaluate(() => window.__LRM.chartState.view.time);
    check(scheme + ': Ctrl + wheel zooms out', v2 && (v2.xmax - v2.xmin) > (v.xmax - v.xmin), JSON.stringify(v2));
    await page.mouse.click(b.x + b.width * 0.45, b.y + b.height * 0.45); await page.waitForTimeout(150);
    await page.evaluate(() => document.querySelector('#chartTools').scrollIntoView());
    await page.waitForTimeout(200);
    await page.screenshot({ path: OUT + `/10_charts_desktop_${scheme}.png` });
    await page.evaluate(() => document.querySelector('[data-chart=fftz]').scrollIntoView());
    await page.waitForTimeout(150);
    await page.screenshot({ path: OUT + `/11_fft_desktop_${scheme}.png` });
    await page.evaluate(() => document.querySelector('#srcCard').scrollIntoView());
    await page.screenshot({ path: OUT + `/12_source_desktop_${scheme}.png` });
    await ctx.close();
  }
  /* ---------- mobile dark charts ---------- */
  ({ ctx, page } = await newPage(390, 844, 'dark', '?source=demo&demoSpeed=25&seed=14'));
  await record(page);
  await page.evaluate(() => document.querySelector('#chartTools').scrollIntoView()); await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/13_charts_mobile_dark.png' });
  // pinch zoom on touch (two pointers)
  await ctx.close();

  /* ---------- update bar (PC web app) and phone update check ---------- */
  const upd = async (c) => {
    await c.route('**/build-info.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.LRM_BUILD={version:"2.2.0",build:40,sha:"aaa111",kind:"web"};' }));
    await c.route('**/version.json*', r => r.fulfill({ contentType: 'application/json', body: '{"version":"2.2.1","build":41,"sha":"bbb222"}' }));
    await c.route('https://api.github.com/**', r => r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ tag_name: 'v2.2.1-b41', name: 'v2.2.1 (build 41)', assets: [{ name: 'LiftRideTest.apk', browser_download_url: 'https://github.com/Saiful44711/Lift-Ride-Test/releases/download/v2.2.1-b41/LiftRideTest.apk' }] }) }));
  };
  ({ ctx, page } = await newPage(1280, 800, 'light', '?source=demo', upd));
  await page.waitForFunction(() => !document.querySelector('#updBar').hidden, null, { timeout: 8000 }).catch(() => { });
  check('PC: "update available" bar appears', await page.locator('#updBar').isVisible(), await page.locator('#updText').innerText());
  await page.screenshot({ path: OUT + '/14_update_bar_desktop.png' });
  await page.click('#updLater'); check('Later hides the bar', !(await page.locator('#updBar').isVisible()));
  const apk = await page.evaluate(() => { window.Capacitor = { isNativePlatform: () => true }; return Updater.check(); });
  check('phone: release with a newer build and an APK is found', apk.available && /\.apk$/.test(apk.url) && apk.build === 41, JSON.stringify(apk).slice(0, 160));
  await page.evaluate(() => { delete window.Capacitor; });
  await page.click('[data-tab=more]'); await page.click('#btnUpdCheck'); await page.waitForTimeout(500);
  check('manual "Check for updates"', /Update available/.test(await page.locator('#updMsg').innerText()), await page.locator('#updMsg').innerText());
  await ctx.close();
  // same build -> no bar
  ({ ctx, page } = await newPage(1280, 800, 'light', '?source=demo', async (c) => {
    await c.route('**/build-info.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.LRM_BUILD={version:"2.2.1",build:41,sha:"bbb222",kind:"web"};' }));
    await c.route('**/version.json*', r => r.fulfill({ contentType: 'application/json', body: '{"version":"2.2.1","build":41,"sha":"bbb222"}' }));
  }));
  await page.waitForTimeout(3800);
  check('PC: no bar when already up to date', !(await page.locator('#updBar').isVisible()));
  await ctx.close();

  await browser.close();
  console.log(errors.length ? 'console/page errors:\n' + errors.join('\n') : 'console/page errors: none');
  check('no JS errors', errors.length === 0);
  console.log(fails ? fails + ' FAILED' : 'All v2.2 e2e tests passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
