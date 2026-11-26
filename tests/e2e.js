/* Full-app browser test (Playwright).
 * Run: python3 -m http.server 8123 --directory www &  then  NODE_PATH=/opt/npm-tools/node_modules node tests/e2e.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.env.SHOTS || '/tmp/shots'; fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://127.0.0.1:8123/index.html';
let fails = 0;
function check(name, ok, info) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!ok) fails++; }

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function newPage(vw, vh, scheme, q) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, colorScheme: scheme, acceptDownloads: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(BASE + (q || '?source=demo&demoSpeed=25&seed=14'));
    await page.waitForTimeout(300);
    return { ctx, page };
  }

  /* ---- mobile, light ---- */
  let { ctx, page } = await newPage(390, 844, 'light', '?source=demo&demoSpeed=4&seed=14');
  await page.screenshot({ path: OUT + '/01_measure_light_mobile.png' });
  check('footer visible with the author name', await page.locator('.credit').isVisible() && (await page.locator('.credit').innerText()).includes('Md. Saiful Islam'));
  check('DEMO chip', (await page.locator('#modeChip').innerText()).includes('DEMO'));
  const bodyText = await page.evaluate(() => document.body.innerText);
  check('whole UI is English (no Bangla characters)', !/[ঀ-৿]/.test(bodyText) && !/[ঀ-৿]/.test(await page.evaluate(() => document.documentElement.innerHTML)));
  check('html lang is en', (await page.evaluate(() => document.documentElement.lang)) === 'en');

  await page.fill('#fBuilding', 'Test Tower'); await page.fill('#fLift', 'Test-Lift-01'); await page.fill('#fFrom', 'G'); await page.fill('#fTo', '12'); await page.fill('#fRated', '2.5');
  await page.click('#isoSetup summary'); await page.check('#fFan'); await page.check('#fChime'); await page.check('#fPlaced');
  await page.screenshot({ path: OUT + '/01b_measure_details_mobile.png' });
  await page.click('#btnStart');
  await page.waitForTimeout(250);
  check('calibration state', (await page.locator('#recState').innerText()).includes('Calibrating'));
  await page.screenshot({ path: OUT + '/02_calibration_mobile.png' });
  await page.waitForFunction(() => document.querySelector('#recState').textContent.includes('Recording'), null, { timeout: 15000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: OUT + '/03_recording_mobile.png' });
  const liveA = await page.locator('#lvA').innerText();
  check('live values update', liveA !== '0' && liveA !== '0.00', 'a=' + liveA);
  await page.waitForFunction(() => document.querySelector('#screen-results').classList.contains('active'), null, { timeout: 60000 });
  await page.waitForTimeout(600);
  const cur = await page.evaluate(() => { const c = window.__LRM.current; return { m: c.res.m, method: c.res.method, w: c.res.warnings, n: c.res.verdicts.length, meta: c.meta }; });
  console.log('   result:', JSON.stringify({ H: cur.m.height.toFixed(2), v: cur.m.vPeak.toFixed(2), v95: cur.m.v95.toFixed(2), a: cur.m.aMax.toFixed(2), j: cur.m.jMax.toFixed(2), zA95: cur.m.zC.a95.toFixed(1), method: cur.method, warn: cur.w }));
  check('demo has a barometer so fusion is used', cur.method === 'fusion');
  check('height is plausible (27-37 m)', cur.m.height > 27 && cur.m.height < 37, cur.m.height.toFixed(2));
  check('meta stored: building, floors, ISO conditions', cur.meta.building === 'Test Tower' && cur.meta.floors === 'G → 12' && cur.meta.fan && cur.meta.placed);
  check('10 charts rendered (incl. FFT)', (await page.locator('#charts canvas').count()) === 10, String(await page.locator('#charts canvas').count()));
  check('ISO ride-quality table has 4 rows', (await page.locator('#isoTbl tr').count()) === 5);
  check('performance table has V95 row', (await page.locator('#perfTbl').innerText()).includes('Speed') && (await page.locator('#perfTbl tr').count()) === 7);
  check('largest-bumps table present', (await page.locator('#bumpTbl tr').count()) >= 2);
  const cov = await page.locator('#runsBox').innerText();
  check('UP/DOWN coverage note (ISO 18738 6.4)', /UP \d, DOWN \d/.test(cov), cov);
  await page.setViewportSize({ width: 390, height: 5200 }); await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/04_results_light_mobile_full.png' });
  await page.setViewportSize({ width: 390, height: 844 });

  const nonBlank = await page.evaluate(() => Array.from(document.querySelectorAll('#charts canvas')).map(cv => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; const set = new Set(); for (let i = 0; i < d.length; i += 4 * 97) set.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return set.size;
  }));
  check('every chart has several colours (not blank)', nonBlank.every(n => n > 3), nonBlank.join(','));

  /* ---- PDF and CSV ---- */
  const [dlPdf] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#btnPdf')]);
  const pdfPath = OUT + '/report.pdf'; await dlPdf.saveAs(pdfPath);
  check('PDF download', fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 50000, dlPdf.suggestedFilename() + ' ' + fs.statSync(pdfPath).size + ' bytes');
  const pages = await page.evaluate(() => { const c = window.__LRM.current; return Report.render(c.res, c.meta, window.__LRM.S.limits, { up: 1, down: 0 }).map(cv => cv.toDataURL('image/png')); });
  pages.forEach((d, i) => fs.writeFileSync(OUT + `/pdf_page${i + 1}.png`, Buffer.from(d.split(',')[1], 'base64')));
  check('PDF has 4 A4 pages', pages.length === 4, String(pages.length));
  const [dlCsv] = await Promise.all([page.waitForEvent('download'), page.click('#btnCsv')]);
  const csvPath = OUT + '/data.csv'; await dlCsv.saveAs(csvPath);
  const csv = fs.readFileSync(csvPath, 'utf8');
  check('CSV data with weighted columns', csv.includes('t_s,a_vertical_mps2') && csv.includes('w_z_mps2') && csv.split('\n').length > 1500 && csv.includes('Test Tower'), csv.split('\n').length + ' lines');

  /* ---- recalculation with a known height ---- */
  await page.fill('#rHeight', '30'); await page.click('#btnRecalc'); await page.waitForTimeout(400);
  const h2 = await page.evaluate(() => window.__LRM.current.res.m.height);
  check('known height (30 m) is applied', Math.abs(h2 - 30) < 0.05, h2.toFixed(2));

  /* ---- limits change the verdict ---- */
  await page.click('[data-tab=more]'); await page.fill('#lJerk', '0.5'); await page.locator('#lJerk').blur(); await page.waitForTimeout(300);
  await page.click('[data-tab=results]'); await page.waitForTimeout(200);
  const bad = await page.locator('#verdictTbl .chip.bad').count();
  check('jerk limit 0.5 shows a failed row', bad >= 1, 'bad=' + bad);
  await page.click('[data-tab=more]'); await page.click('#btnLimitsReset');

  /* ---- roller guide diagnostics from settings ---- */
  await page.fill('#aRoller', '152'); await page.locator('#aRoller').blur(); await page.waitForTimeout(400);
  const diag = await page.evaluate(() => window.__LRM.current.res.diag);
  check('roller diameter gives a rotation frequency', diag.rollerHz > 3 && diag.rollerHz < 9, (diag.rollerHz || 0).toFixed(2) + ' Hz');
  await page.click('[data-tab=results]'); await page.waitForTimeout(200);
  check('diagnostics text shows the roller frequency', (await page.locator('#diagBox').innerText()).includes('Roller guide rotation'));

  /* ---- sensor check (More tab) ---- */
  await page.click('[data-tab=more]'); await page.fill('#sOperator', 'Md. Saiful Islam'); await page.fill('#sInstr', 'Test phone'); await page.locator('#sInstr').blur();
  await page.click('#btnCheck');
  await page.waitForFunction(() => !document.querySelector('#checkState').hidden, null, { timeout: 20000 });
  const chk = await page.locator('#checkTbl').innerText();
  check('sensor check table filled (5 checks)', (await page.locator('#checkTbl tr').count()) === 6 && chk.includes('Gravity'), chk.replace(/\s+/g, ' ').slice(0, 120));
  await page.setViewportSize({ width: 390, height: 3600 }); await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/06_more_light_mobile.png' });
  await page.setViewportSize({ width: 390, height: 844 });

  /* ---- history ---- */
  await page.click('[data-tab=history]'); await page.waitForTimeout(300);
  check('history has one record', (await page.locator('#histList li').count()) === 1);
  await page.screenshot({ path: OUT + '/05_history_mobile.png' });
  await page.click('#histList .info'); await page.waitForTimeout(500);
  check('opening a record shows Results', await page.locator('#screen-results.active').count() === 1);

  /* ---- dark theme switch ---- */
  await page.click('#themeBtn'); await page.click('#themeBtn');
  await page.waitForTimeout(200);
  check('manual dark theme', (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark');
  await page.click('[data-tab=measure]'); await page.screenshot({ path: OUT + '/07_measure_dark_mobile.png' });
  await page.click('[data-tab=results]'); await page.waitForTimeout(300);
  await page.setViewportSize({ width: 390, height: 5200 }); await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/08_results_dark_mobile_full.png' });
  await ctx.close();

  /* ---- error path: stop immediately ---- */
  ({ ctx, page } = await newPage(390, 844, 'light', '?source=demo&demoSpeed=1&seed=14'));
  await page.click('#btnStart'); await page.waitForTimeout(400); await page.click('#btnStop'); await page.waitForTimeout(600);
  const msg = await page.locator('#recMsg').innerText();
  check('clear error for a too-short recording', msg.includes('⚠') && /short/i.test(msg), msg);
  await ctx.close();

  /* ---- UP then DOWN coverage ---- */
  ({ ctx, page } = await newPage(390, 844, 'light', '?source=demo&demoSpeed=25&seed=14'));
  for (const sd of [14, 15]) {
    await page.goto(BASE + `?source=demo&demoSpeed=25&seed=${sd}`); await page.waitForTimeout(300);
    await page.click('#btnStart');
    await page.waitForFunction(() => document.querySelector('#screen-results').classList.contains('active'), null, { timeout: 40000 });
    await page.waitForTimeout(500);
  }
  const cov2 = await page.locator('#runsBox').innerText();
  check('after an UP and a DOWN run the coverage note is satisfied', /UP 1, DOWN 1/.test(cov2) && /satisfied/.test(cov2), cov2);
  await ctx.close();

  /* ---- desktop, light and dark ---- */
  for (const scheme of ['light', 'dark']) {
    ({ ctx, page } = await newPage(1280, 900, scheme, '?source=demo&demoSpeed=25&seed=20'));
    await page.click('#btnStart');
    await page.waitForFunction(() => document.querySelector('#screen-results').classList.contains('active'), null, { timeout: 40000 });
    await page.waitForTimeout(600);
    await page.setViewportSize({ width: 1280, height: 3200 }); await page.waitForTimeout(500);
    await page.screenshot({ path: OUT + `/09_results_${scheme}_desktop_full.png` });
    await page.click('[data-tab=measure]'); await page.setViewportSize({ width: 1280, height: 1300 }); await page.waitForTimeout(300);
    await page.screenshot({ path: OUT + `/10_measure_${scheme}_desktop.png` });
    await ctx.close();
  }

  /* ---- desktop browser without sensors falls back to DEMO ---- */
  ({ ctx, page } = await newPage(390, 844, 'light', '?source=auto'));
  await page.waitForTimeout(1600);
  const modeTxt = await page.locator('#modeChip').innerText();
  check('desktop browser without sensors detected as DEMO', modeTxt === 'DEMO', modeTxt);
  await ctx.close();

  console.log('\nconsole/page errors:', errors.length ? '\n' + errors.join('\n') : 'none');
  check('no JS errors', errors.length === 0);
  await browser.close();
  console.log(fails ? `\n${fails} failed` : '\nAll e2e tests passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
