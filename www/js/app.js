/* app.js — Lift Ride Test: main controller
 * Design & Developed by Md. Saiful Islam */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var Core = window.LiftCore;
  var APP_VERSION = '2.1.1';
  var params = new URLSearchParams(location.search);

  /* ---------------- settings ---------------- */
  var S = {
    theme: 'system', source: 'auto', demoSpeed: 1, lpDyn: 10, tau: 2, useBaro: true,
    rollerDia: '', sheaveDia: '', operator: '', org: '', instr: '', lastCheck: null,
    limits: Object.assign({}, Core.DEFAULT_LIMITS),
    form: { building: '', lift: '', from: '', to: '', height: '', rated: '', note: '', persons: '1', fan: false, chime: false, placed: false }
  };
  (function load() {
    var saved = Store.loadSettings();
    if (saved) {
      Object.keys(saved).forEach(function (k) { if (k === 'limits' || k === 'form') Object.assign(S[k], saved[k]); else S[k] = saved[k]; });
    }
    if (!(S.lpDyn >= 1)) S.lpDyn = 10;
    if (params.get('source')) S.source = params.get('source');
    if (params.get('demoSpeed')) S.demoSpeed = Number(params.get('demoSpeed')) || 1;
    if (params.get('theme')) S.theme = params.get('theme');
  })();
  function save() { Store.saveSettings(S); }

  /* ---------------- helpers ---------------- */
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(d) { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function safeName(s) { return String(s || 'lift').replace(/[^A-Za-z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '') || 'lift'; }
  function numOrNull(v) { var n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; }
  // ISO 18738 6.5: do not quote more digits than the uncertainty justifies -> fewer decimals on a noisy phone
  function mgDp(res) { return res && res.m.noiseFloorZ >= 3 ? 0 : 1; }
  function td(text, cls) { return el('td', cls || '', text); }

  /* ---------------- theme and tabs ---------------- */
  function applyTheme() {
    var r = document.documentElement;
    if (S.theme === 'light' || S.theme === 'dark') r.setAttribute('data-theme', S.theme); else r.removeAttribute('data-theme');
    $('sTheme').value = S.theme;
    setTimeout(drawAllCharts, 30);
  }
  $('themeBtn').addEventListener('click', function () {
    S.theme = S.theme === 'system' ? 'light' : S.theme === 'light' ? 'dark' : 'system'; save(); applyTheme();
  });
  if (window.matchMedia) { try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { setTimeout(drawAllCharts, 30); }); } catch (e) { /* ignore */ } }

  var activeTab = 'measure';
  function showTab(name) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('active', s.id === 'screen-' + name); });
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); b.setAttribute('aria-selected', b.dataset.tab === name); });
    $('main').scrollTop = 0;
    if (name === 'results') drawAllCharts();
    if (name === 'history') renderHistory();
    if (name === 'admin') { refreshAdmin(); refreshUsers(); }
    activeTab = name;
    if (name === 'measure') drawLive();
  }
  document.querySelectorAll('.tabs button').forEach(function (b) { b.addEventListener('click', function () { showTab(b.dataset.tab); }); });

  /* ---------------- sensor status ---------------- */
  var sensorInfo = null;
  function chip(text, cls) { return el('span', 'chip' + (cls ? ' ' + cls : ''), text); }
  function refreshSensors() {
    return Sensors.detect(S.source).then(function (info) {
      sensorInfo = info;
      var box = $('sensorChips'); box.textContent = '';
      var mode = info.mode === 'native' ? 'Native sensors' : info.mode === 'web' ? 'Browser sensors' : 'DEMO';
      $('modeChip').textContent = mode; $('modeChip').className = 'chip ' + (info.mode === 'demo' ? 'warn' : 'ok');
      box.appendChild(chip((info.accel ? '✓ ' : '✗ ') + 'Accelerometer', info.accel ? 'ok' : 'bad'));
      box.appendChild(chip((info.baro ? '✓ ' : '– ') + 'Barometer ' + (info.baro ? '' : '(not needed)'), info.baro ? 'ok' : ''));
      var note = '';
      if (info.error) note = info.error;
      else if (info.mode === 'demo') note = 'DEMO mode: the app shows fictional lift data. This is not a real measurement.' + (info.fallback ? ' (No sensor was found on this device.)' : '');
      else if (info.mode === 'web') note = 'Browser sensors run at about 60 Hz and have no barometer. Use the APK for best results.';
      else if (!info.baro) note = 'This phone has no barometer. That is fine: speed and height are calculated from the accelerometer as ISO 18738 describes. Entering the known travel height improves accuracy.';
      else note = 'Barometer found: height will use pressure and acceleration together (fusion).';
      $('sensorNote').textContent = note;
      $('lvBaroBox').hidden = !info.baro;
      return info;
    });
  }

  /* ---------------- recording ---------------- */
  var rec = null, uiTimer = null, current = null, checking = false;
  var CAL_END = 3.2;

  var FORM_TEXT = { fBuilding: 'building', fLift: 'lift', fFrom: 'from', fTo: 'to', fHeight: 'height', fRated: 'rated', fNote: 'note', fPersons: 'persons' };
  var FORM_CHECK = { fFan: 'fan', fChime: 'chime', fPlaced: 'placed' };
  function readForm() {
    Object.keys(FORM_TEXT).forEach(function (id) { S.form[FORM_TEXT[id]] = $(id).value.trim(); });
    Object.keys(FORM_CHECK).forEach(function (id) { S.form[FORM_CHECK[id]] = $(id).checked; });
  }
  function fillForm() {
    Object.keys(FORM_TEXT).forEach(function (id) { $(id).value = S.form[FORM_TEXT[id]]; });
    Object.keys(FORM_CHECK).forEach(function (id) { $(id).checked = !!S.form[FORM_CHECK[id]]; });
  }
  Object.keys(FORM_TEXT).concat(Object.keys(FORM_CHECK)).forEach(function (id) { $(id).addEventListener('change', function () { readForm(); save(); }); });

  function setRecUI(state, msg) {
    var chipEl = $('recState');
    var map = { idle: ['Ready', ''], calib: ['Calibrating — stay still', 'warn'], run: ['Recording — run the lift', 'ok'], busy: ['Analysing…', 'warn'] };
    chipEl.textContent = map[state][0]; chipEl.className = 'chip ' + map[state][1];
    $('btnStart').disabled = state !== 'idle' || checking; $('btnStop').disabled = state === 'idle' || state === 'busy';
    $('calibBar').hidden = state !== 'calib';
    if (msg !== undefined) $('recMsg').textContent = msg;
  }

  function beep() {
    try { if (navigator.vibrate) navigator.vibrate(200); } catch (e) { /* ignore */ }
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      var c = new AC(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(c.destination); o.start();
      setTimeout(function () { o.stop(); c.close(); }, 180);
    } catch (e) { /* ignore */ }
  }

  function startRec() {
    if (rec || checking) return;
    readForm(); save();
    if (!sensorInfo || !sensorInfo.accel) { setRecUI('idle', sensorInfo && sensorInfo.error ? sensorInfo.error : 'No accelerometer found.'); return; }
    rec = { buf: { t: [], ax: [], ay: [], az: [], pt: [], p: [] }, calibDone: false, u: null, gm: 0, pref: null, avs: 0, hs: 0, ps: null, hb: 0,
      liveT: [], liveA: [], lastT: 0, prevAvs: 0, prevT: 0, jv: 0, cnt: 0, lastRate: 0, rateAt: performance.now(), ctrl: null, info: sensorInfo, stopping: false };
    setRecUI('calib', 'Keep the phone still… (about 3 seconds)');
    ['lvA', 'lvJ', 'lvH', 'lvT', 'lvR'].forEach(function (i) { $(i).textContent = '0'; }); $('lvB').textContent = '–';
    var seed = params.get('seed') ? Number(params.get('seed')) : undefined;
    Sensors.start(sensorInfo, { speed: S.demoSpeed, seed: seed }, onBatch, function () { stopRec(true); }).then(function (c) {
      if (rec) rec.ctrl = c; else c.stop();
    }).catch(function (err) {
      rec = null; clearInterval(uiTimer); setRecUI('idle', 'Could not start the sensor: ' + (err && err.message || err));
    });
    clearInterval(uiTimer); uiTimer = setInterval(uiTick, 100);
  }

  function onBatch(b) {
    var r = rec; if (!r || r.stopping) return;
    var B = r.buf, k;
    for (k = 0; k < b.t.length; k++) { B.t.push(b.t[k]); B.ax.push(b.ax[k]); B.ay.push(b.ay[k]); B.az.push(b.az[k]); }
    for (k = 0; k < b.pt.length; k++) { B.pt.push(b.pt[k]); B.p.push(b.p[k]); }
    r.cnt += b.t.length;
    if (!r.calibDone && B.t.length && B.t[B.t.length - 1] >= CAL_END) {
      var sx = 0, sy = 0, sz = 0, n = 0, i;
      for (i = 0; i < B.t.length; i++) if (B.t[i] >= 0.5 && B.t[i] <= 3.0) { sx += B.ax[i]; sy += B.ay[i]; sz += B.az[i]; n++; }
      if (n > 20) {
        sx /= n; sy /= n; sz /= n; r.gm = Math.sqrt(sx * sx + sy * sy + sz * sz); r.u = [sx / r.gm, sy / r.gm, sz / r.gm];
        var ps = 0, pn = 0; for (i = 0; i < B.pt.length; i++) if (B.pt[i] >= 0.5 && B.pt[i] <= 3.0) { ps += B.p[i]; pn++; }
        r.pref = pn ? ps / pn : null; r.calibDone = true;
        setRecUI('run', 'Calibration done. Run the lift now. After the doors open and the car is still, wait 1 second and tap “Stop”.'); beep();
        r.liveFrom = B.t.length;
      }
    }
    if (r.calibDone) {
      var from = r.liveFrom || 0;
      for (k = from; k < B.t.length; k++) {
        var x = B.ax[k], y = B.ay[k], z = B.az[k], d = x * r.u[0] + y * r.u[1] + z * r.u[2], av = d - r.gm;
        var hm = Math.sqrt(Math.max(0, x * x + y * y + z * z - d * d));
        r.avs += 0.15 * (av - r.avs); r.hs += 0.15 * (hm - r.hs);
        r.liveT.push(B.t[k]); r.liveA.push(r.avs); r.lastT = B.t[k];
      }
      r.liveFrom = B.t.length;
      if (r.pref) for (k = 0; k < b.p.length; k++) { r.ps = r.ps === null ? b.p[k] : r.ps + 0.2 * (b.p[k] - r.ps); r.hb = 44330 * (1 - Math.pow(r.ps / r.pref, 0.1903)); }
    }
  }

  function uiTick() {
    var r = rec; if (!r) return;
    var B = r.buf, t = B.t.length ? B.t[B.t.length - 1] : 0;
    $('lvT').textContent = t.toFixed(1);
    if (!r.calibDone) $('calibBar').firstElementChild.style.width = Math.min(100, t / CAL_END * 100) + '%';
    var now = performance.now();
    if (now - r.rateAt >= 1000) { r.lastRate = r.cnt * 1000 / (now - r.rateAt); if (rec.info.mode === 'demo') r.lastRate /= (S.demoSpeed || 1); r.cnt = 0; r.rateAt = now; $('lvR').textContent = Math.round(r.lastRate); }
    if (r.calibDone) {
      $('lvA').textContent = r.avs.toFixed(2); $('lvH').textContent = r.hs.toFixed(2);
      var dt = r.lastT - r.prevT;
      if (dt > 0.05) { var jj = (r.avs - r.prevAvs) / dt; r.jv += 0.4 * (jj - r.jv); r.prevAvs = r.avs; r.prevT = r.lastT; }
      $('lvJ').textContent = r.jv.toFixed(2);
      if (r.pref) $('lvB').textContent = r.hb.toFixed(1);
    }
    drawLive();
  }

  function drawLive() {
    var cv = $('liveChart'); if (!cv || !cv.clientWidth) return;
    var t = [], a = [];
    if (rec && rec.liveT.length) {
      var last = rec.liveT[rec.liveT.length - 1], i0 = 0; while (i0 < rec.liveT.length && rec.liveT[i0] < last - 10) i0++;
      if (i0 > 2000) { rec.liveT = rec.liveT.slice(i0); rec.liveA = rec.liveA.slice(i0); i0 = 0; }
      t = rec.liveT.slice(i0); a = rec.liveA.slice(i0);
    }
    Charts.draw(cv, { title: 'Vertical acceleration — last 10 s (m/s²)', series: [{ x: t, y: a }], symmetricY: true, ymin: -1.5, ymax: 1.5,
      xmin: t.length ? Math.max(0, t[t.length - 1] - 10) : 0, xmax: t.length ? Math.max(10, t[t.length - 1]) : 10, legendRow: false, font: 11 });
  }

  function stopRec(auto) {
    var r = rec; if (!r || r.stopping) return;
    r.stopping = true; clearInterval(uiTimer); setRecUI('busy', 'Analysing…');
    Promise.resolve(r.ctrl ? r.ctrl.stop() : null).then(function () {
      var raw = r.buf, meta = buildMeta(r.info);
      rec = null;
      var res;
      try { res = Core.analyze(raw, analysisOpts(meta)); }
      catch (e) { setRecUI('idle', '⚠ ' + e.message); drawLive(); return; }
      var summary = summarize(res);
      return Store.add(meta, raw, summary).then(function (id) {
        current = { id: id, meta: meta, raw: raw, res: res };
        setRecUI('idle', auto ? 'DEMO recording finished; analysis done.' : 'Analysis done.');
        renderResults(); showTab('results');
      });
    }).catch(function (e) { rec = null; setRecUI('idle', 'Error: ' + (e && e.message || e)); });
  }

  function buildMeta(info) {
    var demo = info.mode === 'demo', F = S.form;
    var from = F.from, to = F.to;
    return { building: F.building || (demo ? 'DEMO building' : ''), lift: F.lift || (demo ? 'DEMO lift' : 'Lift'), from: from, to: to,
      floors: [from, to].filter(Boolean).join(' → '), note: (demo ? 'DEMO (fictional data) ' : '') + F.note,
      date: fmtDate(Date.now()), knownHeight: numOrNull(F.height), rated: numOrNull(F.rated), source: info.mode, demo: demo, baroAvailable: !!info.baro,
      persons: F.persons, fan: !!F.fan, chime: !!F.chime, placed: !!F.placed,
      operator: S.operator, org: S.org, instr: S.instr || info.accelName || (demo ? 'DEMO (simulated sensor)' : 'Phone accelerometer'),
      lastCheck: S.lastCheck ? S.lastCheck.date + (S.lastCheck.ok ? ' (passed)' : ' (warnings)') : 'not done' };
  }
  function analysisOpts(meta) {
    return { lpDyn: S.lpDyn, tau: S.tau, useBaro: S.useBaro, limits: S.limits, knownHeight: meta.knownHeight, ratedSpeed: meta.rated,
      rollerDiaMm: numOrNull(S.rollerDia), sheaveDiaMm: numOrNull(S.sheaveDia) };
  }
  function summarize(res) {
    var m = res.m;
    return { height: m.height, vPeak: m.vPeak, v95: m.v95, aMax: m.aMax, dMax: m.dMax, jMax: m.jMax, a95z: m.a95z, dir: m.direction, method: res.method,
      allOk: res.verdicts.every(function (v) { return v.ok; }) };
  }
  $('btnStart').addEventListener('click', startRec);
  $('btnStop').addEventListener('click', function () { stopRec(false); });

  /* ---------------- results ---------------- */
  var chartCanvases = [];
  function kpi(label, value, unit, sub) {
    var d = el('div', 'kpi'); d.appendChild(el('span', 'k', label));
    var b = el('b', '', value); d.appendChild(b); if (unit) d.appendChild(el('small', '', unit));
    if (sub) d.appendChild(el('span', 's', sub)); return d;
  }
  function table(id, head, rows) {
    var tb = $(id); tb.textContent = '';
    var hr = el('tr'); head.forEach(function (h, i) { var th = el('th', '', h); if (i) th.style.textAlign = 'right'; hr.appendChild(th); }); tb.appendChild(hr);
    rows.forEach(function (r) { var tr = el('tr'); r.forEach(function (c, i) { tr.appendChild(td(c, i ? 'num' : '')); }); tb.appendChild(tr); });
  }
  function renderResults() {
    if (!current) { $('resEmpty').hidden = false; $('resBody').hidden = true; return; }
    var res = current.res, m = res.m, meta = current.meta, dp = mgDp(res);
    $('resEmpty').hidden = true; $('resBody').hidden = false; updateSendBtn();
    $('resTitle').textContent = ([meta.building, meta.lift].filter(Boolean).join(' · ') || 'Result') + (current.owner ? ' · by ' + current.owner : '');
    var chipM = $('resMethod'); chipM.textContent = (res.method === 'fusion' ? 'Barometer + accelerometer' : 'Accelerometer only') + (meta.demo ? ' · DEMO' : '');
    chipM.className = 'chip ' + (meta.demo ? 'warn' : 'ok');
    $('resMeta').textContent = [meta.date, meta.floors, m.direction === 'up' ? '↑ UP' : '↓ DOWN', res.fs + ' Hz analysis', meta.note].filter(Boolean).join(' · ');
    var w = $('resWarn'); w.textContent = '';
    res.warnings.forEach(function (t) { w.appendChild(el('div', 'alert', '⚠ ' + t)); });
    var k = $('kpis'); k.textContent = '';
    k.appendChild(kpi('Max speed', m.vPeak.toFixed(2), 'm/s', 'V95 ' + m.v95.toFixed(2) + (meta.rated ? ' · rated ' + meta.rated : '')));
    k.appendChild(kpi('Travel height', m.height.toFixed(2), 'm', m.dhBaro !== null ? 'baro ' + m.dhBaro.toFixed(2) + ' · accel ' + m.dhAccel.toFixed(2) : (m.scale !== 1 ? 'scaled ×' + m.scale.toFixed(3) : 'accelerometer only, ±' + Math.max(0.1, m.hUncertAccel).toFixed(1) + ' m est.')));
    k.appendChild(kpi('Ride time', m.rideTime.toFixed(1), 's', ''));
    k.appendChild(kpi('Max acceleration', m.aMax.toFixed(2), 'm/s²', 'A95 ' + m.aA95.toFixed(2)));
    k.appendChild(kpi('Max deceleration', m.dMax.toFixed(2), 'm/s²', 'A95 ' + m.dA95.toFixed(2)));
    k.appendChild(kpi('Max jerk', m.jMax.toFixed(1), 'm/s³', ''));
    k.appendChild(kpi('A95 vertical', m.zC.a95.toFixed(dp), 'mg p-p', 'noise floor ~' + m.noiseFloorZ.toFixed(1)));
    k.appendChild(kpi('A95 horizontal X / Y', m.x.a95.toFixed(dp) + ' / ' + m.y.a95.toFixed(dp), 'mg p-p', 'noise floor ~' + m.noiseFloorH.toFixed(1)));
    // ISO 18738 6.5 b)
    table('isoTbl', ['Axis / region', 'Max p-p', 'A95 p-p', '0-pk'], [
      ['X (front-back), B1–B2', m.x.max.toFixed(dp), m.x.a95.toFixed(dp), m.x.zp.toFixed(dp)],
      ['Y (side-side), B1–B2', m.y.max.toFixed(dp), m.y.a95.toFixed(dp), m.y.zp.toFixed(dp)],
      ['Z vertical, constant-accel. region', m.zC.max.toFixed(dp), m.zC.a95.toFixed(dp), m.zC.zp.toFixed(dp)],
      ['Z vertical, non-constant region', m.zN.max.toFixed(dp), '–', m.zN.zp.toFixed(dp)]
    ]);
    // ISO 18738 6.5 c)
    table('perfTbl', ['Quantity', 'Maximum', 'A95 / V95'], [
      ['Speed (m/s)', m.vPeak.toFixed(2), m.v95.toFixed(2) + (m.v95ok ? '' : ' *')],
      ['Acceleration (m/s²)', m.aMax.toFixed(2), m.aA95.toFixed(2)],
      ['Deceleration (m/s²)', m.dMax.toFixed(2), m.dA95.toFixed(2)],
      ['Jerk (m/s³)', m.jMax.toFixed(1), '–'],
      ['Travel height (m)', m.height.toFixed(2), '–'],
      ['Ride time (s)', m.rideTime.toFixed(1), '–']
    ]);
    renderVerdicts(res);
    renderDiag(res);
    $('rHeight').value = meta.knownHeight || '';
    var host = $('charts'); host.textContent = ''; chartCanvases = [];
    Report.chartConfigs(res, S.limits).forEach(function (item) {
      var card = el('div', 'card'); var cv = el('canvas', 'chart'); cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', item.title);
      card.appendChild(cv); host.appendChild(card); chartCanvases.push({ cv: cv, cfg: item.cfg });
    });
    drawAllCharts();
    if (current.owner) $('runsBox').hidden = true; else renderCoverage(meta);
  }
  function renderVerdicts(res) {
    var tb = $('verdictTbl'); tb.textContent = '';
    var head = el('tr'); ['Parameter', 'Measured', 'Limit', 'Status'].forEach(function (h) { head.appendChild(el('th', '', h)); }); tb.appendChild(head);
    res.verdicts.forEach(function (v) {
      var tr = el('tr'); tr.appendChild(el('td', '', v.label));
      tr.appendChild(el('td', 'num', v.value.toFixed(v.dp) + ' ' + v.unit));
      tr.appendChild(el('td', 'num', (v.band ? '±5% ' : '≤ ') + v.limit + ' ' + v.unit));
      var c = el('td'); c.appendChild(chip(v.ok ? '✓ Within limit' : '✗ Exceeds', v.ok ? 'ok' : 'bad')); tr.appendChild(c); tb.appendChild(tr);
    });
  }
  function renderDiag(res) {
    var box = $('diagBox'); box.textContent = '';
    var P = res.spectrum.peaks, d = res.diag;
    function peaks(arr) { return arr.length ? arr.map(function (p) { return p.f.toFixed(1) + ' Hz (' + p.mg.toFixed(1) + ' mg)'; }).join(', ') : 'none'; }
    if (res.spectrum.nb) {
      box.appendChild(el('p', '', 'Strongest vertical vibration lines at steady speed: ' + peaks(P.z) + '.'));
      box.appendChild(el('p', '', 'Horizontal X: ' + peaks(P.x) + '. Y: ' + peaks(P.y) + '.'));
    } else box.appendChild(el('p', 'muted', 'The steady-speed section was too short for an FFT spectrum.'));
    if (d.rollerHz) box.appendChild(el('p', '', 'Roller guide rotation ≈ ' + d.rollerHz.toFixed(2) + ' Hz at ' + d.vSteady.toFixed(2) + ' m/s.'));
    if (d.sheaveHz) box.appendChild(el('p', '', 'Traction sheave rotation ≈ ' + d.sheaveHz.toFixed(2) + ' Hz.'));
    d.matches.forEach(function (mt) { box.appendChild(el('p', '', 'Possible match: ' + mt.part + (mt.harmonic > 1 ? ' ×' + mt.harmonic : '') + ' (' + mt.f.toFixed(1) + ' Hz) ↔ ' + mt.peak.axis + ' peak at ' + mt.peak.f.toFixed(1) + ' Hz, ' + mt.peak.mg.toFixed(1) + ' mg. Check the part.')); });
    if ((d.rollerHz || d.sheaveHz) && !d.matches.length) box.appendChild(el('p', 'muted', 'No strong spectrum line near the entered rotation frequencies.'));
    var rows = res.bumps.map(function (b, i) { return [String(i + 1), b.t.toFixed(1) + ' s', b.pos.toFixed(1) + ' m', b.mg.toFixed(mgDp(res))]; });
    table('bumpTbl', ['Largest vibration events', 'Time', 'Position*', 'p-p (mg)'], rows);
    $('bumpTbl').parentNode.hidden = !rows.length;
    if (rows.length) box.appendChild(el('p', 'muted small', '*Position = distance from the start floor along the travel, from the integrated height. Use it to find rail joints or guide problems; accuracy is about ±0.5 m.'));
  }
  function drawAllCharts() {
    chartCanvases.forEach(function (c) { if (c.cv.clientWidth) Charts.draw(c.cv, Object.assign({ font: 12 }, c.cfg)); });
    drawLive();
  }
  window.addEventListener('resize', function () { clearTimeout(window.__rz); window.__rz = setTimeout(drawAllCharts, 120); });

  // ISO 18738 6.4: at least one UP and one DOWN run
  function coverageCount(items, meta) {
    var key = function (x) { return (x.building || '').toLowerCase() + '|' + (x.lift || '').toLowerCase() + '|' + (x.demo ? 'd' : 'r'); };
    var k = key(meta), up = 0, down = 0;
    items.forEach(function (it) { if (key(it.meta) === k && it.summary) { if (it.summary.dir === 'up') up++; else down++; } });
    return { up: up, down: down };
  }
  function renderCoverage(meta) {
    var box = $('runsBox');
    Store.list().then(function (items) {
      var c = coverageCount(items, meta), ok = c.up > 0 && c.down > 0;
      box.hidden = false; box.className = 'alert ' + (ok ? 'info' : '');
      box.textContent = 'Saved runs for this lift: UP ' + c.up + ', DOWN ' + c.down + (ok ? ' — ISO 18738 6.4 satisfied (at least one UP and one DOWN).' : ' — ISO 18738 6.4 asks for at least one UP and one DOWN run.');
    }).catch(function () { box.hidden = true; });
  }

  function reanalyze(persist) {
    if (!current) return;
    try {
      current.res = Core.analyze(current.raw, analysisOpts(current.meta));
      renderResults();
      if (persist && current.id !== undefined) Store.updateMeta(current.id, current.meta, summarize(current.res));
    } catch (e) { $('exportMsg').textContent = '⚠ ' + e.message; }
  }
  $('btnRecalc').addEventListener('click', function () { if (!current) return; current.meta.knownHeight = numOrNull($('rHeight').value); reanalyze(true); });

  /* ---------------- save / share files ---------------- */
  function bytesToB64(u8) { var s = '', CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
  function saveFile(name, mime, data) {
    var bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    if (Sensors.isNative()) {
      var FS = Sensors.plugin('Filesystem'), SH = Sensors.plugin('Share');
      if (!FS || !SH) return Promise.reject(new Error('Filesystem/Share plugin not found'));
      return FS.writeFile({ path: name, data: bytesToB64(bytes), directory: 'CACHE', recursive: true })
        .then(function () { return FS.getUri({ path: name, directory: 'CACHE' }); })
        .then(function (u) { return SH.share({ title: name, url: u.uri, dialogTitle: 'Save / share' }); })
        .then(function () { return 'Share sheet opened: ' + name; });
    }
    var blob = new Blob([bytes], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return Promise.resolve('Download started: ' + name);
  }
  function baseName() { var m = current.meta; return 'LiftRide_' + safeName(m.lift) + '_' + m.date.replace(/[: ]/g, '').replace('-', '').replace('-', '').slice(0, 13); }
  $('btnCsv').addEventListener('click', function () {
    if (!current) return;
    $('exportMsg').textContent = 'Preparing CSV…';
    saveFile(baseName() + '.csv', 'text/csv', '﻿' + Core.toCSV(current.res, current.meta)).then(function (m) { $('exportMsg').textContent = m; }).catch(function (e) { $('exportMsg').textContent = '⚠ ' + e.message; });
  });
  $('btnPdf').addEventListener('click', function () {
    if (!current) return;
    $('exportMsg').textContent = 'Preparing PDF…';
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
      if (current.owner) return Backend.list({ q: current.meta.building || '' }).then(function (o) { return o.rows.map(function (r) { return { meta: { building: r.building, lift: r.lift, demo: r.demo === 'yes' }, summary: { dir: r.dir } }; }); });
      return Store.list();
    }).then(function (items) {
      var pages = Report.render(current.res, current.meta, S.limits, coverageCount(items, current.meta));
      var bytes = PDFLib.fromCanvases(pages, { title: 'Lift Ride Quality Report ' + current.meta.lift });
      return saveFile(baseName() + '.pdf', 'application/pdf', bytes);
    }).then(function (m) { $('exportMsg').textContent = m; }).catch(function (e) { $('exportMsg').textContent = '⚠ ' + (e && e.message || e); });
  });

  /* ---------------- history ---------------- */
  var clearArmed = false;
  function renderHistory() {
    updateSyncLine();
    Store.list().then(function (items) {
      var ul = $('histList'); ul.textContent = ''; $('histEmpty').hidden = items.length > 0;
      items.forEach(function (it) {
        var li = el('li'), info = el('div', 'info'), s = it.summary || {};
        var title = el('b', '', [it.meta.building, it.meta.lift || 'Lift'].filter(Boolean).join(' · ') + ' — ' + it.meta.date); info.appendChild(title);
        info.appendChild(el('span', 'muted small', (s.dir === 'up' ? '↑ ' : '↓ ') + 'H ' + (s.height || 0).toFixed(1) + ' m · v ' + (s.vPeak || 0).toFixed(2) + ' m/s · a ' + (s.aMax || 0).toFixed(2) + ' · jerk ' + (s.jMax || 0).toFixed(1) + (it.meta.demo ? ' · DEMO' : '')));
        info.addEventListener('click', function () { openRecord(it.id); });
        var st = chip(s.allOk ? '✓' : '✗', s.allOk ? 'ok' : 'bad'); st.title = s.allOk ? 'All within limits' : 'Some limits exceeded';
        var del = el('button', 'btn small-btn danger-o', 'Delete'); del.setAttribute('aria-label', 'Delete record');
        del.addEventListener('click', function () { Store.remove(it.id).then(renderHistory); });
        li.appendChild(info); li.appendChild(st);
        var sc = syncChip(it); if (sc) li.appendChild(sc);
        li.appendChild(del); ul.appendChild(li);
      });
    });
  }
  function openRecord(id) {
    Store.get(id).then(function (r) {
      if (!r) return;
      current = { id: r.id, meta: r.meta, raw: r.raw, res: null };
      try { current.res = Core.analyze(r.raw, analysisOpts(r.meta)); } catch (e) { $('exportMsg').textContent = '⚠ ' + e.message; return; }
      renderResults(); showTab('results');
    });
  }
  $('btnClearAll').addEventListener('click', function () {
    var b = $('btnClearAll');
    if (!clearArmed) { clearArmed = true; b.textContent = 'Sure? Tap again'; setTimeout(function () { clearArmed = false; b.textContent = 'Delete all'; }, 3000); return; }
    clearArmed = false; b.textContent = 'Delete all'; Store.clear().then(renderHistory);
  });

  /* ---------------- settings form ---------------- */
  var limitMap = { lAccel: 'accel', lDecel: 'decel', lJerk: 'jerk', lA95v: 'a95v', lA95h: 'a95h', lComfort: 'comfort' };
  function fillSettings() {
    $('sTheme').value = S.theme; $('sSource').value = S.source; $('sDemoSpeed').value = String(S.demoSpeed);
    Object.keys(limitMap).forEach(function (id) { $(id).value = S.limits[limitMap[id]]; });
    $('aLp').value = S.lpDyn; $('aTau').value = S.tau; $('aBaro').checked = !!S.useBaro; $('aRoller').value = S.rollerDia; $('aSheave').value = S.sheaveDia;
    $('sOperator').value = S.operator; $('sOrg').value = S.org; $('sInstr').value = S.instr;
    renderCheck(S.lastCheck);
  }
  $('sTheme').addEventListener('change', function () { S.theme = this.value; save(); applyTheme(); });
  $('sSource').addEventListener('change', function () { S.source = this.value; save(); refreshSensors(); });
  $('sDemoSpeed').addEventListener('change', function () { S.demoSpeed = Number(this.value) || 1; save(); });
  Object.keys(limitMap).forEach(function (id) {
    $(id).addEventListener('change', function () {
      var v = parseFloat(this.value); if (!isFinite(v) || v <= 0) { this.value = S.limits[limitMap[id]]; return; }
      S.limits[limitMap[id]] = v; save(); reanalyze(false);
    });
  });
  $('btnLimitsReset').addEventListener('click', function () { S.limits = Object.assign({}, Core.DEFAULT_LIMITS); save(); fillSettings(); reanalyze(false); });
  $('aLp').addEventListener('change', function () { var v = parseFloat(this.value); if (!(v >= 1 && v <= 20)) { this.value = S.lpDyn; return; } S.lpDyn = v; save(); reanalyze(false); });
  $('aTau').addEventListener('change', function () { var v = parseFloat(this.value); if (!(v >= 0.5 && v <= 10)) { this.value = S.tau; return; } S.tau = v; save(); reanalyze(false); });
  $('aBaro').addEventListener('change', function () { S.useBaro = this.checked; save(); reanalyze(false); });
  $('aRoller').addEventListener('change', function () { S.rollerDia = this.value; save(); reanalyze(false); });
  $('aSheave').addEventListener('change', function () { S.sheaveDia = this.value; save(); reanalyze(false); });
  [['sOperator', 'operator'], ['sOrg', 'org'], ['sInstr', 'instr']].forEach(function (p) { $(p[0]).addEventListener('change', function () { S[p[1]] = this.value.trim(); save(); }); });

  /* ---------------- sensor check (ISO 18738 4.6.3 style) ---------------- */
  function renderCheck(c) {
    var tb = $('checkTbl'); tb.textContent = '';
    var st = $('checkState');
    if (!c) { st.hidden = true; return; }
    st.hidden = false; st.textContent = (c.ok ? '✓ Passed' : '⚠ Warnings') + ' · ' + c.date; st.className = 'chip ' + (c.ok ? 'ok' : 'warn');
    var hr = el('tr'); ['Check', 'Result', 'Note'].forEach(function (h) { hr.appendChild(el('th', '', h)); }); tb.appendChild(hr);
    c.checks.forEach(function (k) { var tr = el('tr'); tr.appendChild(td(k.label)); var cell = el('td'); cell.appendChild(chip((k.ok ? '✓ ' : '⚠ ') + k.value, k.ok ? 'ok' : 'warn')); tr.appendChild(cell); tr.appendChild(td(k.note, 'muted')); tb.appendChild(tr); });
  }
  $('btnCheck').addEventListener('click', function () {
    if (rec || checking) return;
    if (!sensorInfo || !sensorInfo.accel) { $('checkMsg').textContent = sensorInfo && sensorInfo.error ? sensorInfo.error : 'No accelerometer found.'; return; }
    checking = true; $('btnCheck').disabled = true; $('btnStart').disabled = true;
    $('checkMsg').textContent = 'Keep the phone flat and still for 10 seconds…';
    var buf = { t: [], ax: [], ay: [], az: [], pt: [], p: [] }, ctrl = null, finished = false, tick = null, wd = null, t0 = Date.now();
    var demo = sensorInfo.mode === 'demo', wait = 10.4 * 1000 / (demo ? (S.demoSpeed || 1) : 1);
    function done() { checking = false; $('btnCheck').disabled = false; setRecUI('idle'); }
    // Live progress: shows whether samples are really arriving from the sensor.
    tick = setInterval(function () {
      if (finished) return;
      var sec = Math.min(10, Math.round((Date.now() - t0) / 1000));
      $('checkMsg').textContent = (Sensors.fallback ? '(' + Sensors.fallback + ') ' : '') + 'Keep the phone flat and still… ' + sec + ' / 10 s · ' + buf.t.length + ' samples' + (buf.t.length === 0 && sec >= 3 ? ' (no data yet)' : '');
    }, 500);
    function finish() {
      if (finished) return; finished = true;
      clearInterval(tick); clearTimeout(wd);
      // stop() must never block the result: give it at most 2 s
      var stopP = Promise.race([Promise.resolve(ctrl ? ctrl.stop() : null).catch(function () { }), new Promise(function (r) { setTimeout(r, 2000); })]);
      stopP.then(function () {
        try {
          if (!ctrl) throw new Error('The sensor did not start (stage: ' + (Sensors.stage || '?') + ').');
          if (buf.t.length < 50) throw new Error('Only ' + buf.t.length + ' samples arrived in 10 s. Close other sensor apps, turn off battery saver, then try again.');
          var r = Core.staticCheck(buf);
          S.lastCheck = { date: fmtDate(Date.now()), ok: r.ok, checks: r.checks, nfZ: r.nfZ, rate: r.rate }; save();
          renderCheck(S.lastCheck);
          $('checkMsg').textContent = r.ok ? 'Sensor check passed.' : 'Sensor check finished with warnings. See the table.';
        } catch (e) { $('checkMsg').textContent = '⚠ ' + e.message; }
      }).then(done, done);
    }
    // Watchdog: runs from the click, independent of whether the plugin ever answers start().
    wd = setTimeout(finish, wait + 2500);
    Sensors.start(sensorInfo, { speed: S.demoSpeed, still: 10, seed: 5 }, function (b) {
      if (finished) return;
      for (var k = 0; k < b.t.length; k++) { buf.t.push(b.t[k]); buf.ax.push(b.ax[k]); buf.ay.push(b.ay[k]); buf.az.push(b.az[k]); }
    }, finish).then(function (c) {
      ctrl = c;
      if (finished) { try { c.stop(); } catch (e) { /* ignore */ } return; }
      clearTimeout(wd); setTimeout(finish, Math.max(0, wait + 800 - (Date.now() - t0)));
    }).catch(function (e) {
      if (finished) return; finished = true; clearInterval(tick); clearTimeout(wd);
      $('checkMsg').textContent = 'Could not start the sensor: ' + (e && e.message || e); done();
    });
  });

  /* ---------------- cloud: sign-in, sync outbox, admin ---------------- */
  var syncing = false, DEVICE = (function () {
    try { var d = localStorage.getItem('liftmeter.device'); if (!d) { d = 'd' + Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6); localStorage.setItem('liftmeter.device', d); } return d; }
    catch (e) { return 'dev' + Math.random().toString(36).slice(2, 10); }
  })();
  function clientIdOf(it) { return DEVICE + '-' + it.created; }
  function sendable(it) { return Backend.configured() && !!it.meta && !it.meta.imported && !(it.meta.demo && !Backend.isDemo()); }   // fictional sensor data is never sent to a real cloud
  function syncChip(it) {   // returns a chip or a Send button for a history row
    if (!sendable(it) || !Backend.signedIn()) return null;
    var c = it.cloud || {}, k;
    if (c.state === 'done') { k = chip('☁ Sent', 'ok'); k.title = 'Sent to the administrator'; k.classList.add('sync'); return k; }
    if (c.state === 'pending') { k = chip('☁ Queued', 'warn'); k.title = 'Will be sent when the internet is available' + (c.msg ? ' (' + c.msg + ')' : ''); k.classList.add('sync'); return k; }
    var b = el('button', 'btn small-btn sync-btn', c.state === 'error' ? 'Retry send' : 'Send');
    if (c.state === 'error') b.title = 'Not accepted by the server: ' + (c.msg || '');
    b.addEventListener('click', function () { b.disabled = true; sendRecord(it.id).then(function (m) { $('impMsg').textContent = m; renderHistory(); }); });
    return b;
  }
  function sendRecord(id) {
    return Store.setCloud(id, { state: 'pending', queuedAt: Date.now() }).then(function () { return syncFlush(); }).then(function (r) {
      return Store.get(id).then(function (x) {
        var c = (x && x.cloud) || {};
        if (c.state === 'done') return 'Sent to the administrator ✓';
        if (c.state === 'error') return '⚠ Not accepted: ' + (c.msg || r.msg);
        return 'No connection now — queued. It will be sent automatically when the internet is back.' + (c.msg ? ' (' + c.msg + ')' : '');
      });
    });
  }
  function updateSyncLine() {
    var ln = $('syncLine');
    if (!Backend.configured()) { ln.hidden = true; return; }
    ln.hidden = false;
    if (!Backend.signedIn()) { ln.textContent = 'Cloud: signed out.'; return; }
    Store.list().then(function (items) {
      var q = items.filter(function (it) { return sendable(it) && it.cloud && it.cloud.state === 'pending'; }).length;
      ln.textContent = 'Records stay on this phone. Tap Send to send one to the administrator.' + (q ? ' ' + q + ' queued, waiting for internet.' : '');
    });
  }
  function syncFlush(manual) {
    if (syncing || !Backend.signedIn()) return Promise.resolve({ sent: 0, left: 0 });
    syncing = true; var sent = 0, msg = '';
    return Store.list().then(function (items) {
      var todo = items.filter(function (it) { return sendable(it) && it.cloud && it.cloud.state === 'pending'; }).reverse();   // only records the user chose to send
      var stop = false, chain = Promise.resolve();
      todo.forEach(function (it) {
        chain = chain.then(function () {
          if (stop) return;
          return Store.get(it.id).then(function (r) {
            if (!r) return;
            return Backend.upload({ clientId: clientIdOf(it), meta: r.meta, summary: it.summary || {}, raw: r.raw }).then(function (o) { sent++; return Store.setCloud(it.id, { state: 'done', cid: o.id, at: Date.now() }); })
              .catch(function (e) {
                msg = e.message;
                if (e.code === 'NET' || e.code === 'URL' || e.code === 'AUTH' || e.code === 'SETUP' || e.code === 'SERVER') { stop = true; return Store.setCloud(it.id, { state: 'pending', msg: e.message }); }
                return Store.setCloud(it.id, { state: 'error', msg: e.message });
              });
          });
        });
      });
      return chain;
    }).catch(function (e) { msg = e && e.message || String(e); }).then(function () {
      syncing = false; updateSyncLine(); if (activeTab === 'history') renderHistory();
      return Store.list().then(function (items) { return { sent: sent, msg: msg, left: items.filter(function (it) { return sendable(it) && it.cloud && it.cloud.state === 'pending'; }).length }; });
    });
  }
  window.addEventListener('online', function () { syncFlush(); });
  setInterval(function () { syncFlush(); }, 60000);

  function cloudUI() {
    var cfgd = Backend.configured(), signed = Backend.signedIn();
    var c = $('cloudChip');
    if (!cfgd) { c.textContent = 'Not connected'; c.className = 'chip'; }
    else if (signed) { c.textContent = '✓ ' + (Backend.name() || Backend.user()) + ' · ' + Backend.role() + (Backend.isDemo() ? ' · DEMO' : ''); c.className = 'chip ok'; }
    else { c.textContent = 'Signed out'; c.className = 'chip warn'; }
    $('cUrl').value = Backend.url(); $('cUrl').disabled = Backend.urlLocked(); $('cSave').hidden = Backend.urlLocked();
    $('cSync').disabled = !signed; $('cLogout').disabled = !signed;
    $('cPwBox').hidden = !signed; $('cDemoBox').hidden = !Backend.isDemo();
    $('tabAdmin').hidden = !Backend.isAdmin();
    if (Backend.isAdmin()) pollRequests(); else $('adBadge').hidden = true;
    updateSendBtn();
    if (activeTab === 'admin' && !Backend.isAdmin()) showTab('measure');
    var need = cfgd && !signed;
    $('loginOv').hidden = !need;
    $('lgOffline').hidden = !need || Backend.urlLocked();
    updateSyncLine();
  }
  window.addEventListener('lrm-auth', function () { cloudUI(); });
  $('cSave').addEventListener('click', function () {
    var u = $('cUrl').value.trim();
    if (u && !Backend.validUrl(u)) { $('cMsg').textContent = '⚠ The URL must look like https://script.google.com/macros/s/…/exec (or type demo).'; return; }
    Backend.setUrl(u); cloudUI(); $('cMsg').textContent = u ? 'Saved. Please sign in.' : 'Cloud disconnected. Records stay on this phone.';
  });
  $('cLogout').addEventListener('click', function () { Backend.logout(); cloudUI(); $('cMsg').textContent = 'Signed out.'; });
  $('cSync').addEventListener('click', function () {
    $('cMsg').textContent = 'Sending…';
    syncFlush().then(function (r) { $('cMsg').textContent = r.left ? '⚠ ' + r.left + ' record(s) still queued' + (r.msg ? ': ' + r.msg : '') : (r.sent ? r.sent + ' record(s) sent ✓' : 'Nothing is queued. Use Send on a record to send it.'); });
  });
  $('cPw').addEventListener('click', function () {
    $('cPwMsg').textContent = '…';
    Backend.changePassword($('cOld').value, $('cNew').value).then(function () { $('cPwMsg').textContent = 'Password changed ✓'; $('cOld').value = ''; $('cNew').value = ''; })
      .catch(function (e) { $('cPwMsg').textContent = '⚠ ' + e.message; });
  });
  $('cDemoReset').addEventListener('click', function () { Backend.resetDemo(); Backend.logout(); cloudUI(); $('cMsg').textContent = 'Demo data cleared.'; });
  $('lgOffline').addEventListener('click', function () { Backend.setUrl(''); cloudUI(); });
  function loginView(req) { $('loginForm').hidden = req; $('reqForm').hidden = !req; $('lgMsg').hidden = true; $('rqMsg').hidden = true; }
  $('toReq').addEventListener('click', function () { loginView(true); $('rqName').focus(); });
  $('toLogin').addEventListener('click', function () { loginView(false); });
  $('reqForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var m = $('rqMsg'); m.hidden = true; m.className = 'alert';
    if ($('rqPass').value !== $('rqPass2').value) { m.textContent = '⚠ The two passwords are different.'; m.hidden = false; return; }
    $('rqGo').disabled = true;
    Backend.requestAccess({ name: $('rqName').value.trim(), username: $('rqId').value.trim(), section: $('rqSection').value.trim(), email: $('rqEmail').value.trim(), password: $('rqPass').value }).then(function (o) {
      loginView(false); $('lgUser').value = o.username; $('rqPass').value = ''; $('rqPass2').value = '';
      var lm = $('lgMsg'); lm.className = 'alert info'; lm.textContent = '✓ ' + o.message; lm.hidden = false;
    }).catch(function (e) { m.textContent = '⚠ ' + e.message; m.hidden = false; }).then(function () { $('rqGo').disabled = false; });
  });
  $('loginForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var m = $('lgMsg'); m.hidden = true; m.className = 'alert'; $('lgGo').disabled = true;
    Backend.login($('lgUser').value.trim(), $('lgPass').value).then(function () {
      $('lgPass').value = ''; cloudUI(); syncFlush(); if (Backend.isAdmin()) { showTab('admin'); }
    }).catch(function (e) { m.textContent = '⚠ ' + e.message; m.hidden = false; }).then(function () { $('lgGo').disabled = false; });
  });

  /* ---- admin: all records + users ---- */
  var adRows = [], adArmed = null;
  function adErr(e) { $('adMsg').textContent = '⚠ ' + (e && e.message || e); }
  function refreshAdmin() {
    if (!Backend.isAdmin()) return Promise.resolve();
    $('adMsg').textContent = 'Loading…';
    return Backend.list({ q: $('adQ').value.trim(), user: $('adUser').value, dir: $('adDir').value }).then(function (o) {
      adRows = o.rows;
      var sel = $('adUser'), cur = sel.value, have = Array.prototype.map.call(sel.options, function (x) { return x.value; }).slice(1).join(',');
      if (have !== o.users.join(',')) { sel.textContent = ''; var all = el('option', '', 'All users'); all.value = ''; sel.appendChild(all); o.users.forEach(function (u) { var op = el('option', '', u); op.value = u; sel.appendChild(op); }); sel.value = cur; }
      renderAdminTable(o.total);
    }).catch(adErr);
  }
  function renderAdminTable(total) {
    var tb = $('adTbl'); tb.textContent = '';
    var hr = el('tr'); ['', 'Date', 'User', 'Building', 'Lift', 'Dir', 'H (m)', 'v (m/s)', 'a (m/s²)', 'Jerk', 'A95 z (mg)', 'Limits'].forEach(function (h, i) { var th = el('th', i >= 6 && i <= 10 ? 'num' : '', h); hr.appendChild(th); }); tb.appendChild(hr);
    adRows.forEach(function (r) {
      var tr = el('tr'), ac = el('td', 'row-actions'); tr.appendChild(ac); tr.appendChild(td(r.date)); tr.appendChild(td(r.user)); tr.appendChild(td(r.building)); tr.appendChild(td(r.lift)); tr.appendChild(td(r.dir === 'up' ? '↑ UP' : '↓ DOWN'));
      [r.height, r.vPeak, r.aMax, r.jMax].forEach(function (v, i) { tr.appendChild(td(v === '' ? '–' : Number(v).toFixed(i === 0 ? 1 : 2), 'num')); });
      tr.appendChild(td(r.a95z === '' ? '–' : Number(r.a95z).toFixed(1), 'num'));
      var okc = el('td'); okc.appendChild(chip(r.allOk === 'yes' ? '✓' : '✗', r.allOk === 'yes' ? 'ok' : 'bad')); if (r.demo === 'yes') okc.appendChild(chip('DEMO', 'warn')); tr.appendChild(okc);
      var open = el('button', 'btn small-btn primary', 'Open'), del = el('button', 'btn small-btn danger-o', 'Delete');
      open.addEventListener('click', function () { openCloud(r); });
      del.addEventListener('click', function () {
        if (adArmed !== r.id) { adArmed = r.id; del.textContent = 'Sure?'; setTimeout(function () { if (adArmed === r.id) { adArmed = null; del.textContent = 'Delete'; } }, 3000); return; }
        adArmed = null; Backend.remove(r.id).then(refreshAdmin).catch(adErr);
      });
      ac.appendChild(open); ac.appendChild(del); tb.appendChild(tr);
    });
    $('adMsg').textContent = total + ' record(s)' + (total > adRows.length ? ' — showing the newest ' + adRows.length : '') + '.';
  }
  function openCloud(r) {
    $('adMsg').textContent = 'Downloading…';
    Backend.get(r.id).then(function (o) {
      var raw = { t: Float64Array.from(o.raw.t), ax: Float32Array.from(o.raw.ax), ay: Float32Array.from(o.raw.ay), az: Float32Array.from(o.raw.az), pt: Float64Array.from(o.raw.pt || []), p: Float64Array.from(o.raw.p || []) };
      current = { id: undefined, cloudId: o.id, owner: o.owner, meta: o.meta, raw: raw, res: null };
      current.res = Core.analyze(raw, analysisOpts(o.meta));
      $('adMsg').textContent = ''; renderResults(); showTab('results');
    }).catch(adErr);
  }
  ['adQ', 'adUser', 'adDir'].forEach(function (id) { $(id).addEventListener('change', refreshAdmin); });
  $('adQ').addEventListener('search', refreshAdmin);
  $('adRefresh').addEventListener('click', function () { refreshAdmin(); refreshUsers(); });
  $('adCsv').addEventListener('click', function () {
    if (!adRows.length) { $('adMsg').textContent = 'Nothing to export.'; return; }
    var cols = ['date', 'user', 'building', 'lift', 'from', 'to', 'dir', 'height', 'vPeak', 'v95', 'aMax', 'dMax', 'jMax', 'a95z', 'allOk', 'demo', 'uploadedAt'];
    var q = function (v) { v = String(v === undefined ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var lines = [cols.join(',')].concat(adRows.map(function (r) { return cols.map(function (c) { return q(c === 'uploadedAt' ? new Date(r[c]).toISOString() : r[c]); }).join(','); }));
    saveFile('LiftRide_team_summary.csv', 'text/csv', '﻿' + lines.join('\r\n')).then(function (m) { $('adMsg').textContent = m; }).catch(adErr);
  });
  var lastPending = -1, pollTimer = null;
  function setBadge(n) {
    var b = $('adBadge'); b.hidden = !n; b.textContent = n ? String(n) : '';
    $('rqCount').textContent = String(n); $('rqCount').className = 'chip' + (n ? ' warn' : '');
    if (lastPending >= 0 && n > lastPending && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification('Lift Ride Test', { body: (n - lastPending) + ' new access request(s) waiting for approval', icon: 'icons/icon-192.png' }); } catch (e) { /* ignore */ }
    }
    lastPending = n;
  }
  function pollRequests() {
    if (!Backend.isAdmin()) return;
    Backend.me().then(function (o) { setBadge(o.pending || 0); if (activeTab === 'admin' && o.pending !== Number($('rqCount').dataset.shown || -1)) refreshUsers(); }).catch(function () { /* offline */ });
    if (!pollTimer) pollTimer = setInterval(function () { if (Backend.isAdmin()) pollRequests(); }, 120000);
  }
  $('rqAlerts').addEventListener('click', function () {
    if (typeof Notification === 'undefined') { $('rqAdMsg').textContent = 'This browser has no desktop notifications. You still get emails.'; return; }
    Notification.requestPermission().then(function (p) { $('rqAdMsg').textContent = p === 'granted' ? 'Desktop alerts on (while the app is open).' : 'Desktop alerts were not allowed. You still get emails.'; });
  });
  function refreshUsers() {
    if (!Backend.isAdmin()) return;
    Backend.users().then(function (o) {
      setBadge(o.pending || 0); $('rqCount').dataset.shown = String(o.pending || 0);
      // requests
      var rq = o.users.filter(function (u) { return u.status === 'pending'; }), rt = $('rqList'); rt.textContent = '';
      $('rqEmpty').hidden = rq.length > 0;
      rq.forEach(function (u) {
        var box = el('div', 'rq-item'), info = el('div', 'rq-info');
        info.appendChild(el('b', '', u.name + ' (' + u.username + ')'));
        info.appendChild(el('span', 'small', 'Section: ' + u.section + ' · ' + u.email));
        info.appendChild(el('span', 'muted small', 'Requested ' + fmtDate(u.created)));
        var ac = el('div', 'row-actions'), ap = el('button', 'btn small-btn primary', 'Approve'), rj = el('button', 'btn small-btn danger-o', 'Reject');
        ap.addEventListener('click', function () { ap.disabled = rj.disabled = true; Backend.approve(u.username).then(function () { $('rqAdMsg').textContent = u.name + ' approved ✓ (an email was sent to ' + u.email + ')'; refreshUsers(); refreshAdmin(); }).catch(function (e) { $('rqAdMsg').textContent = '⚠ ' + e.message; ap.disabled = rj.disabled = false; }); });
        rj.addEventListener('click', function () { ap.disabled = rj.disabled = true; Backend.reject(u.username).then(function () { $('rqAdMsg').textContent = u.name + ' rejected.'; refreshUsers(); }).catch(function (e) { $('rqAdMsg').textContent = '⚠ ' + e.message; ap.disabled = rj.disabled = false; }); });
        ac.appendChild(ap); ac.appendChild(rj); box.appendChild(info); box.appendChild(ac); rt.appendChild(box);
      });
      // users
      var tb = $('usTbl'); tb.textContent = '';
      var hr = el('tr'); ['ID', 'Name', 'Section', 'Email', 'Role', 'Status', ''].forEach(function (x) { hr.appendChild(el('th', '', x)); }); tb.appendChild(hr);
      o.users.filter(function (u) { return u.status !== 'pending'; }).forEach(function (u) {
        var tr = el('tr'); tr.appendChild(td(u.username)); tr.appendChild(td(u.name)); tr.appendChild(td(u.section)); tr.appendChild(td(u.email)); tr.appendChild(td(u.role));
        var sc = el('td'), map = { active: ['Active', 'ok'], disabled: ['Disabled', 'bad'], rejected: ['Rejected', 'bad'] }, st = map[u.status] || [u.status, ''];
        sc.appendChild(chip(st[0], st[1])); tr.appendChild(sc);
        var ac = el('td', 'row-actions');
        if (u.status === 'active' || u.status === 'disabled') {
          var pw = el('button', 'btn small-btn', 'Reset password'), tg = el('button', 'btn small-btn ' + (u.status === 'active' ? 'danger-o' : ''), u.status === 'active' ? 'Disable' : 'Enable');
          pw.addEventListener('click', function () {
            var np = window.prompt('New password for ' + u.username + ' (6+ characters):');
            if (np === null) return;
            Backend.setPassword(u.username, np).then(function () { $('usMsg').textContent = 'Password reset for ' + u.username + ' ✓'; }).catch(function (e) { $('usMsg').textContent = '⚠ ' + e.message; });
          });
          tg.addEventListener('click', function () { Backend.setActive(u.username, u.status !== 'active').then(refreshUsers).catch(function (e) { $('usMsg').textContent = '⚠ ' + e.message; }); });
          ac.appendChild(pw); ac.appendChild(tg);
        }
        tr.appendChild(ac); tb.appendChild(tr);
      });
    }).catch(function (e) { $('usMsg').textContent = '⚠ ' + e.message; });
  }
  $('usAdd').addEventListener('click', function () {
    Backend.addUser({ username: $('usUser').value, name: $('usName').value.trim(), section: $('usSection').value.trim(), email: $('usEmail').value.trim(), role: $('usRole').value, password: $('usPass').value }).then(function (o) {
      $('usMsg').textContent = 'User ' + o.username + ' added ✓ — give them the ID and password.'; ['usUser', 'usName', 'usPass', 'usSection', 'usEmail'].forEach(function (i) { $(i).value = ''; }); refreshUsers(); refreshAdmin();
    }).catch(function (e) { $('usMsg').textContent = '⚠ ' + e.message; });
  });


  /* ---- send from Results, reading file export / import ---- */
  function updateSendBtn() {
    var b = $('btnSend');
    if (!current || current.id === undefined || !Backend.signedIn() || !sendable({ meta: current.meta })) { b.hidden = true; return; }
    b.hidden = false;
    Store.get(current.id).then(function (x) {
      var c = (x && x.cloud) || {};
      b.disabled = c.state === 'done' || c.state === 'pending';
      b.textContent = c.state === 'done' ? '☁ Sent' : c.state === 'pending' ? '☁ Queued' : 'Send to admin';
    });
  }
  $('btnSend').addEventListener('click', function () {
    if (!current || current.id === undefined) return;
    $('btnSend').disabled = true; $('exportMsg').textContent = 'Sending…';
    sendRecord(current.id).then(function (m) { $('exportMsg').textContent = m; updateSendBtn(); });
  });
  $('btnRaw').addEventListener('click', function () {
    if (!current) return;
    var r = current.raw, pk = CloudLogic.packRaw({ t: r.t, ax: r.ax, ay: r.ay, az: r.az, pt: r.pt || [], p: r.p || [] });
    var doc = { format: 'lift-ride-meter-reading', version: APP_VERSION, exported: new Date().toISOString(), meta: current.meta, raw: pk };
    saveFile(baseName() + '.lrm.json', 'application/json', JSON.stringify(doc)).then(function (m) { $('exportMsg').textContent = m; }).catch(function (e) { $('exportMsg').textContent = '⚠ ' + e.message; });
  });
  $('btnImport').addEventListener('click', function () { $('fileImport').value = ''; $('fileImport').click(); });
  $('fileImport').addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    if (f.size > 20 * 1024 * 1024) { $('impMsg').textContent = '⚠ File is too large.'; return; }
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(rd.result);
        if (!d || d.format !== 'lift-ride-meter-reading' || !d.raw || !d.meta) throw new Error('This is not a Lift Ride Test reading file.');
        var why = CloudLogic.validateUpload({ clientId: 'import-file', meta: d.meta, summary: {}, raw: d.raw });
        if (why) throw new Error(why);
        var raw = { t: Float64Array.from(d.raw.t), ax: Float32Array.from(d.raw.ax), ay: Float32Array.from(d.raw.ay), az: Float32Array.from(d.raw.az), pt: Float64Array.from(d.raw.pt || []), p: Float64Array.from(d.raw.p || []) };
        var meta = Object.assign({}, d.meta, { imported: f.name });
        var res = Core.analyze(raw, analysisOpts(meta));
        Store.add(meta, raw, summarize(res)).then(function (id) {
          return Store.setCloud(id, { state: 'imported' }).then(function () {
            current = { id: id, meta: meta, raw: raw, res: res };
            $('impMsg').textContent = 'Imported ' + f.name + ' ✓'; renderResults(); showTab('results');
          });
        });
      } catch (e) { $('impMsg').textContent = '⚠ ' + e.message; }
    };
    rd.onerror = function () { $('impMsg').textContent = '⚠ Could not read the file.'; };
    rd.readAsText(f);
  });

  /* ---------------- start-up ---------------- */
  $('ver').textContent = 'v' + APP_VERSION;
  fillForm(); fillSettings(); applyTheme(); setRecUI('idle', ''); cloudUI(); syncFlush();
  refreshSensors().then(function () { setTimeout(drawLive, 50); });
  window.__LRM = { get current() { return current; }, S: S, showTab: showTab, refreshSensors: refreshSensors, syncFlush: syncFlush, cloudUI: cloudUI };
})();
