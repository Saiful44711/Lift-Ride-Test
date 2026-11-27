/* report.js — chart configs (screen + PDF) and the A4 report laid out after ISO 18738 clause 6.5
 * Design & Developed by Md. Saiful Islam */
(function (root) {
  'use strict';
  var G0 = 9.80665, MG = 1000 / G0;

  function scaleArr(a, k) { var o = new Float64Array(a.length); for (var i = 0; i < a.length; i++) o[i] = a[i] * k; return o; }
  function scaleList(a, k) { return a.map(function (v) { return v === null ? null : v * k; }); }

  var T = {
    time: 'Time (s)', speed: 'Speed (m/s)', height: 'Travelled height (m)', accel: 'Acceleration along travel, 10 Hz filtered (m/s²)', jerk: 'Jerk (m/s³)',
    vibz: 'Vertical Z, ISO-weighted (mg)', vibx: 'Horizontal X front-back, ISO-weighted (mg)', viby: 'Horizontal Y side-side, ISO-weighted (mg)',
    rawz: 'Vertical Z, unfiltered (mg)', rawx: 'Horizontal X front-back, unfiltered (mg)', rawy: 'Horizontal Y side-side, unfiltered (mg)',
    sound: 'Sound level LAF (dB(A))',
    fftz: 'Vertical FFT amplitude, steady speed (mg)', ffth: 'Horizontal FFT amplitude, steady speed (mg)', fftx: 'Frequency (Hz)', ffty: 'Amplitude (mg, peak)',
    specz: 'Vertical 1/3-octave spectrum vs ISO 2631-1 (Wk) curves', spech: 'Horizontal 1/3-octave spectrum vs ISO 2631-1 (Wd) curves',
    freq: '1/3-octave centre frequency (Hz)', ylev: 'Band rms (mg)',
    used: 'Used', baro: 'Barometer', meas: 'Measured', iso1: 'ISO curve ', limitUp: 'Accel limit', limitDn: 'Decel limit', jl: 'Jerk limit ±',
    x: 'X (front-back)', y: 'Y (side-side)', z: 'Vertical', b1: 'B1', b2: 'B2'
  };
  function f1(v) { return (v === null || v === undefined || !isFinite(v)) ? '–' : v.toFixed(1); }

  // opt: {mode: 'iso'|'raw', lift: lift data, limits: true/false}
  // returns [{id, title, group: 'time'|'freq', cfg}]
  function chartConfigs(res, L, opt) {
    opt = opt || {}; L = Object.assign({}, root.LiftCore ? root.LiftCore.DEFAULT_LIMITS : {}, L || {});
    var S = res.series, m = res.m, id = res.idx, dir = m.direction === 'up' ? 1 : -1, raw = opt.mode === 'raw', showL = opt.limits !== false;
    var tt = res.t, list = [], i;
    var tRange = { xmin: 0, xmax: tt[tt.length - 1] };
    var s0 = S.h[id.s];
    var v = scaleArr(S.v, dir), h = new Float64Array(S.h.length);
    for (i = 0; i < h.length; i++) h[i] = (S.h[i] - s0) * dir;
    var marks = [{ x: m.tB1, label: T.b1 }, { x: m.tB2, label: T.b2 }];
    if (m.constFound) { marks.push({ x: m.constStart, label: '', color: '#8a96a3' }); marks.push({ x: m.constEnd, label: '', color: '#8a96a3' }); }
    function T0(o) { return Object.assign({ xlabel: T.time, vlines: marks }, tRange, o); }
    var sl = [];
    if (showL && res.opts.ratedSpeed) { var r0 = res.opts.ratedSpeed; sl = [{ y: r0 * L.speedHi / 100, label: L.speedHi + ' % of rated' }, { y: r0 * L.speedLo / 100, label: L.speedLo + ' % of rated' }]; }
    list.push({ id: 'speed', group: 'time', title: T.speed, cfg: T0({ title: T.speed, stats: 'Max ' + m.vPeak.toFixed(2) + ' · V95 ' + m.v95.toFixed(2) + ' m/s', series: [{ x: tt, y: v, label: T.used }], hlines: sl }) });
    var hs = [{ x: tt, y: h, label: T.used }];
    if (S.hb) hs.push({ x: tt, y: scaleArr(S.hb, dir), label: T.baro, dash: true, width: 1.2 });
    list.push({ id: 'height', group: 'time', title: T.height, cfg: T0({ title: T.height, stats: 'Travel ' + m.height.toFixed(2) + ' m', series: hs }) });
    if (res.sound) {
      var so = res.sound, hiS = m.vPeak > 2.5 ? L.soundHi : L.sound;
      list.push({ id: 'sound', group: 'time', title: T.sound, cfg: T0({ title: T.sound + (so.demo ? ' · DEMO' : so.calibrated ? '' : ' · uncalibrated'),
        stats: 'Run max ' + f1(so.run.max) + ' · Run LAeq ' + f1(so.run.leq) + ' · Record max ' + f1(so.full && so.full.max) + ' dB(A)',
        series: [{ x: so.t, y: so.l, label: 'LAF' }], hlines: showL ? [{ y: hiS, label: 'Limit ' + hiS + ' dB(A)' }] : [] }) });
    }
    var axes = [['z', raw ? S.av : S.wz, raw ? T.rawz : T.vibz, raw ? m.raw.z : { max: m.zC.max, a95: m.zC.a95, zp: m.zC.zp }, L.maxv],
      ['x', raw ? S.h1 : S.wx, raw ? T.rawx : T.vibx, raw ? m.raw.x : m.x, L.maxh],
      ['y', raw ? S.h2 : S.wy, raw ? T.rawy : T.viby, raw ? m.raw.y : m.y, L.maxh]];
    // v2.2.1: unfiltered = the raw signal (as PMT EVA shows first); ISO filter = weighted, with the limit lines,
    // the jerk zone drawn in its own colour and + / o markers on the max peak-to-peak (PMT style).
    function segPts(sig, seg, shape, color) {
      if (!seg) return [];
      var kmx = seg.s, kmn = seg.s; for (var q = seg.s; q <= seg.e; q++) { if (sig[q] > sig[kmx]) kmx = q; if (sig[q] < sig[kmn]) kmn = q; }
      return [{ x: tt[kmx], y: sig[kmx] * MG, shape: shape, color: color }, { x: tt[kmn], y: sig[kmn] * MG, shape: shape, color: color }];
    }
    var mk = m.mk || {}, JZ = '#0c8599';
    axes.forEach(function (a, k) {
      var iso = !raw, hl = (showL && iso) ? [{ y: a[4] / 2, label: '±' + (a[4] / 2) + ' mg (max p-p ' + a[4] + ')' }, { y: -a[4] / 2 }] : [];
      var lab = a[0] === 'z' ? T.z : a[0] === 'x' ? T.x : T.y, series, pts = [], st;
      if (iso && a[0] === 'z' && S.nonc) {
        var yc = new Float64Array(tt.length), yj = new Float64Array(tt.length);
        for (var q = 0; q < tt.length; q++) { var val = a[1][q] * MG, jz = S.nonc[q] === 1; yc[q] = jz ? NaN : val; yj[q] = jz ? val : NaN; }
        // join the two colours without a gap
        for (q = 1; q < tt.length; q++) { var j0 = S.nonc[q - 1] === 1, j1 = S.nonc[q] === 1; if (j0 && !j1) yj[q] = yc[q]; if (!j0 && j1) yc[q] = yj[q]; }
        series = [{ x: tt, y: yc, label: T.z, pi: 3 }, { x: tt, y: yj, label: 'Jerk zone', color: JZ }];
        pts = segPts(a[1], mk.zC, 'plus').concat(segPts(a[1], mk.zN, 'circle', JZ));
        st = 'Max Pk/Pk ' + f1(m.zC.max) + ' · A95 ' + f1(m.zC.a95) + ' · 0-Pk ' + f1(m.zpZall !== undefined ? m.zpZall : m.zC.zp) + ' mg · Jerk zone Max Pk/Pk ' + f1(m.zN.max);
      } else {
        series = [{ x: tt, y: scaleArr(a[1], MG), label: lab, pi: [3, 0, 1][k] }];
        if (iso) pts = segPts(a[1], mk[a[0]], 'plus');
        st = 'Max Pk/Pk ' + f1(a[3].max) + ' · A95 ' + f1(a[3].a95) + ' · 0-Pk ' + f1(a[3].zp) + ' mg';
      }
      list.push({ id: 'vib' + a[0], group: 'time', title: a[2], cfg: T0({ title: a[2], symmetricY: true, stats: st, series: series, hlines: hl, points: pts }) });
    });
    list.push({ id: 'accel', group: 'time', title: T.accel, cfg: T0({ title: T.accel, symmetricY: true, stats: 'Max acc ' + m.aMax.toFixed(3) + ' · Max dec ' + m.dMax.toFixed(3) + ' m/s²',
      series: [{ x: tt, y: S.afl, label: T.accel }], hlines: showL ? [{ y: L.accel, label: T.limitUp + ' ' + L.accel }, { y: -L.decel, label: T.limitDn + ' ' + L.decel }] : [] }) });
    list.push({ id: 'jerk', group: 'time', title: T.jerk, cfg: T0({ title: T.jerk, symmetricY: true, stats: 'Max ' + m.jMax.toFixed(2) + ' m/s³',
      series: [{ x: tt, y: S.jerk, label: T.jerk }], hlines: showL ? [{ y: L.jerk, label: T.jl + L.jerk }, { y: -L.jerk }] : [] }) });
    var sp = res.spectrum;
    if (sp.nb) {
      var SHORT = { sheave: 'Sheave', motor: 'Motor', drive: 'Elec.', ripple: 'Ripple', roller: 'Roller', bracket: 'Bracket', joint: 'Joint' };
      var fv = [], cols = { sheave: '#7048e8', motor: '#ad1457', drive: '#ad1457', ripple: '#ad1457', roller: '#d9480f', bracket: '#2b8a3e', joint: '#2b8a3e' };
      var cands = (root.LiftSource && opt.lift) ? root.LiftSource.candidates(res.diag.vSteady || m.vPeak, root.LiftSource.liftData(opt.lift)) : [];
      cands.filter(function (c) { return c.f >= 0.5 && c.f <= m.vibHi && c.group !== 'joint'; }).forEach(function (c) { fv.push({ x: c.f, label: SHORT[c.group] + (c.harmonic > 1 ? '×' + c.harmonic : '') + ' ' + c.f.toFixed(1), color: cols[c.group] }); });
      if (!cands.length) {
        if (res.diag.rollerHz) fv.push({ x: res.diag.rollerHz, label: 'Roller ' + res.diag.rollerHz.toFixed(1) + ' Hz', color: '#d9480f' });
        if (res.diag.sheaveHz) fv.push({ x: res.diag.sheaveHz, label: 'Sheave ' + res.diag.sheaveHz.toFixed(1) + ' Hz', color: '#7048e8' });
      }
      var fr = { xmin: 0, xmax: m.vibHi };
      list.push({ id: 'fftz', group: 'freq', title: T.fftz, cfg: Object.assign({ title: T.fftz, xlabel: T.fftx, ylabel: T.ffty, series: [{ x: sp.nb.f, y: sp.nb.z, label: T.z }], vlines: fv, ymin: 0 }, fr) });
      list.push({ id: 'ffth', group: 'freq', title: T.ffth, cfg: Object.assign({ title: T.ffth, xlabel: T.fftx, ylabel: T.ffty, series: [{ x: sp.nb.f, y: sp.nb.x, label: T.x }, { x: sp.nb.f, y: sp.nb.y, label: T.y, color: '#7048e8' }], vlines: fv, ymin: 0 }, fr) });
    }
    var fc = sp.fc;
    var isoL = (L.comfort).toFixed(3), isoL2 = (L.comfort * 2).toFixed(3);
    list.push({ id: 'specz', group: 'oct', title: T.specz, cfg: { title: T.specz, xlabel: T.freq, ylabel: T.ylev, xlog: true, ylog: true, xmin: 0.5,
      series: [{ x: fc, y: scaleList(sp.z, MG), label: T.meas, marker: true, width: 2 },
        { x: fc, y: scaleList(sp.isoZ1, MG), label: T.iso1 + isoL + ' m/s²', dash: true, color: '#2b8a3e' },
        { x: fc, y: scaleList(sp.isoZ2, MG), label: T.iso1 + isoL2 + ' m/s²', dash: true, color: '#d9480f' }] } });
    list.push({ id: 'spech', group: 'oct', title: T.spech, cfg: { title: T.spech, xlabel: T.freq, ylabel: T.ylev, xlog: true, ylog: true, xmin: 0.5,
      series: [{ x: fc, y: scaleList(sp.x, MG), label: T.x, marker: true, width: 2 }, { x: fc, y: scaleList(sp.y, MG), label: T.y, marker: true, width: 2, color: '#7048e8' },
        { x: fc, y: scaleList(sp.isoH1, MG), label: T.iso1 + isoL, dash: true, color: '#2b8a3e' },
        { x: fc, y: scaleList(sp.isoH2, MG), label: T.iso1 + isoL2, dash: true, color: '#d9480f' }] } });
    return list;
  }

  /* ---------------- A4 report ---------------- */
  var PW = 1240, PH = 1754, MARGIN = 70, CW = PW - 2 * MARGIN;
  function mkPage() { var c = document.createElement('canvas'); c.width = PW; c.height = PH; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, PW, PH); return { c: c, x: x }; }
  function font(sz, bold) { return (bold ? 'bold ' : '') + sz + 'px system-ui, "Segoe UI", Roboto, Arial, sans-serif'; }
  function txt(x, s, px, py, o) { o = o || {}; x.font = font(o.size || 24, o.bold); x.fillStyle = o.color || '#14202b'; x.textAlign = o.align || 'left'; x.textBaseline = 'alphabetic'; x.fillText(s, px, py); }
  function footer(p, n, total) {
    p.x.fillStyle = '#d5dde6'; p.x.fillRect(MARGIN, PH - 90, CW, 2);
    txt(p.x, 'Design & Developed by Md. Saiful Islam', MARGIN, PH - 50, { size: 22, color: '#55677a' });
    txt(p.x, 'Page ' + n + ' / ' + total, PW - MARGIN, PH - 50, { size: 22, color: '#55677a', align: 'right' });
  }
  function chartInto(p, item, y, h) {
    var tmp = document.createElement('canvas');
    var cfg = Object.assign({}, item.cfg, { width: CW, height: h, dpr: 1, font: 19, colors: root.Charts.LIGHT });
    root.Charts.draw(tmp, cfg);
    p.x.drawImage(tmp, MARGIN, y);
    return y + h + 14;
  }
  function wrap(x, text, px, py, maxW, lh, o) {
    x.font = font((o && o.size) || 22, false);
    var words = String(text).split(' '), line = '';
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (x.measureText(test).width > maxW && line) { txt(x, line, px, py, o); py += lh; line = w; } else line = test;
    });
    if (line) { txt(x, line, px, py, o); py += lh; }
    return py;
  }
  function fit(x, s, maxW, size, bold) { x.font = font(size, bold); s = String(s); if (x.measureText(s).width <= maxW) return s; while (s.length > 1 && x.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; }
  function heading(x, s, y) { txt(x, s, MARGIN, y, { size: 28, bold: true, color: '#0b3d6e' }); return y + 14; }
  // generic table: cols = [{w, align}], rows = [[...]], rowH
  function drawTable(x, y, head, cols, rows, o) {
    o = o || {}; var rh = o.rowH || 42, size = o.size || 21, i, px;
    x.fillStyle = '#0b3d6e'; x.fillRect(MARGIN, y, CW, rh + 2);
    px = MARGIN; head.forEach(function (h, k) { txt(x, h, cols[k].align === 'right' ? px + cols[k].w - 12 : px + 12, y + rh - 11, { size: size, bold: true, color: '#fff', align: cols[k].align === 'right' ? 'right' : 'left' }); px += cols[k].w; });
    y += rh + 2;
    rows.forEach(function (r, i2) {
      if (i2 % 2) { x.fillStyle = '#f5f8fb'; x.fillRect(MARGIN, y, CW, rh); }
      px = MARGIN;
      r.forEach(function (c, k) {
        var st = (typeof c === 'object' && c) ? c : { t: c };
        txt(x, String(st.t), cols[k].align === 'right' ? px + cols[k].w - 12 : px + 12, y + rh - 12, { size: size, bold: st.bold || (k > 0 && cols[k].align === 'right' && !o.plain), color: st.color, align: cols[k].align === 'right' ? 'right' : 'left' });
        px += cols[k].w;
      });
      y += rh;
    });
    x.fillStyle = '#d5dde6'; x.fillRect(MARGIN, y, CW, 2);
    return y + 24;
  }
  function yn(b) { return b ? 'Yes' : 'Not confirmed'; }
  var EN_LABELS = { accel: 'Max acceleration (m/s²)', decel: 'Max deceleration (m/s²)', jerk: 'Max jerk (m/s³)', a95z: 'A95 vertical vibration, constant region (mg p-p)',
    a95x: 'A95 horizontal X (mg p-p)', a95y: 'A95 horizontal Y (mg p-p)', aw: 'ISO 2631-1 weighted rms, worst axis (m/s²)', rated: 'Peak speed vs rated (m/s)',
    maxz: 'Max vertical vibration ISO (mg p-p)', maxx: 'Max horizontal X ISO (mg p-p)', maxy: 'Max horizontal Y ISO (mg p-p)', sound: 'Max sound level, run (dB(A))' };
  function fx(v, d) { return (v === null || v === undefined || !isFinite(v)) ? '-' : v.toFixed(d); }
  function limTxt(v) { return v.band ? v.lo + '-' + v.hi + ' % of ' + v.limit : String(v.limit); }
  function pctTxt(v) { return v.db ? (v.margin >= 0 ? '+' : '') + v.margin.toFixed(1) + ' dB' : v.pct === null ? '-' : v.pct.toFixed(1) + ' %'; }

  // extra: {limitSet: 'reference'|'manual', lift, source (LiftSource.analyzeRun result)}
  function render(res, meta, L, cov, extra) {
    meta = meta || {}; cov = cov || { up: 0, down: 0 }; extra = extra || {};
    var m = res.m, pages = [], p, x, y, dp = m.noiseFloorZ >= 3 ? 0 : 1;
    var charts = chartConfigs(res, L, { lift: extra.lift }), byId = {}; charts.forEach(function (c) { byId[c.id] = c; });
    var ascii = function (s) { return String(s || '').replace(/[^\x20-\x7E→]/g, '').trim(); };
    var so = res.sound, setName = extra.limitSet === 'manual' ? 'Manual limits (set by the user)' : 'Reference limits (default)';

    /* ---- page 1: general information, measurements ---- */
    p = mkPage(); x = p.x;
    x.fillStyle = '#0b3d6e'; x.fillRect(0, 0, PW, 160);
    txt(x, 'Lift Ride Quality Report', MARGIN, 80, { size: 54, bold: true, color: '#fff' });
    txt(x, 'Lift Ride Test · method of ISO 18738 · vibration, performance, sound', MARGIN, 122, { size: 23, color: '#cfe0f3' });
    y = 210;
    if (meta.demo) { x.fillStyle = '#fff3dc'; x.fillRect(MARGIN, y - 34, CW, 46); txt(x, 'DEMO — simulated data, not a real measurement', MARGIN + 14, y - 3, { size: 24, bold: true, color: '#a65f00' }); y += 44; }
    y = heading(x, 'General information', y + 6) + 24;
    var info = [
      ['Date and time', meta.date || '-', 'Direction of travel', (m.direction === 'up' ? 'UP' : 'DOWN') + (meta.floors ? '  (' + ascii(meta.floors) + ')' : '')],
      ['Building', ascii(meta.building) || '-', 'Lift ID', ascii(meta.lift) || '-'],
      ['Measured by', ascii(meta.operator) || '-', 'Organisation', ascii(meta.org) || '-'],
      ['Instrument', ascii(meta.instr) || '-', 'Last sensor check', ascii(meta.lastCheck) || '-'],
      ['Persons in car', String(meta.persons === undefined ? '-' : meta.persons), 'Car fan / AC off', yn(meta.fan)],
      ['Method', res.method === 'fusion' ? 'Baro + accelerometer' : 'Accelerometer only', 'Sampling', res.fs + ' Hz'],
      ['Notes', ascii(meta.note) || '-', 'Runs for this lift', 'UP ' + cov.up + ' / DOWN ' + cov.down]
    ];
    info.forEach(function (r, i) {
      if (i % 2 === 0) { x.fillStyle = '#f5f8fb'; x.fillRect(MARGIN, y - 28, CW, 40); }
      txt(x, r[0], MARGIN + 8, y, { size: 20, color: '#55677a' }); txt(x, fit(x, r[1], 330, 21, true), MARGIN + 215, y, { size: 21, bold: true });
      txt(x, r[2], MARGIN + 570, y, { size: 20, color: '#55677a' }); txt(x, fit(x, r[3], 300, 21, true), MARGIN + 800, y, { size: 21, bold: true });
      y += 40;
    });
    y += 26;
    var c4 = [{ w: 380 }, { w: 180, align: 'right' }, { w: 180, align: 'right' }, { w: 180, align: 'right' }, { w: 180, align: 'right' }];
    if (so) {
      y = heading(x, 'Sound level dB(A)' + (so.demo ? ' — DEMO' : so.calibrated ? '' : ' — uncalibrated, indicative'), y) + 14;
      y = drawTable(x, y, ['', 'Full run', 'Pre-run', 'Post-run', 'Full record'], c4, [
        ['Max (LAF, 125 ms)', fx(so.run && so.run.max, 1), fx(so.pre && so.pre.max, 1), fx(so.post && so.post.max, 1), fx(so.full && so.full.max, 1)],
        ['LAeq', fx(so.run && so.run.leq, 1), fx(so.pre && so.pre.leq, 1), fx(so.post && so.post.leq, 1), fx(so.full && so.full.leq, 1)]
      ], { rowH: 38, size: 20 });
    }
    var c3 = [{ w: 470 }, { w: 210, align: 'right' }, { w: 210, align: 'right' }, { w: 210, align: 'right' }];
    y += 22;
    y = heading(x, 'Raw data, unfiltered (mg) — between boundaries 1 and 2', y) + 14;
    y = drawTable(x, y, ['', 'X', 'Y', 'Z'], c3, [
      ['Max Pk to Pk', fx(m.raw.x.max, dp), fx(m.raw.y.max, dp), fx(m.raw.z.max, dp)],
      ['A95', fx(m.raw.x.a95, dp), fx(m.raw.y.a95, dp), fx(m.raw.z.a95, dp)],
      ['Max 0 to Pk', fx(m.raw.x.zp, dp), fx(m.raw.y.zp, dp), fx(m.raw.z.zp, dp)]
    ], { rowH: 38, size: 20 });
    y += 22;
    y = heading(x, 'ISO-weighted vibration (mg) — ISO 18738 regions', y) + 14;
    y = drawTable(x, y, ['', 'X (B1-B2)', 'Y (B1-B2)', 'Z (const. acc.)'], c3, [
      ['Max Pk to Pk', fx(m.x.max, dp), fx(m.y.max, dp), fx(m.zC.max, dp)],
      ['A95', fx(m.x.a95, dp), fx(m.y.a95, dp), fx(m.zC.a95, dp)],
      ['Max 0 to Pk', fx(m.x.zp, dp), fx(m.y.zp, dp), fx(m.zC.zp, dp)]
    ], { rowH: 38, size: 20 });
    y += 22;
    y = heading(x, 'Performance', y) + 14;
    y = drawTable(x, y, ['', 'Max', '95', 'Average'], c3, [
      ['Velocity (m/s)', m.vPeak.toFixed(2), m.v95.toFixed(2), '-'],
      ['Jerk (m/s³)', m.jMax.toFixed(2), m.jP95.toFixed(2), '-'],
      ['Acceleration (m/s²)', m.aMax.toFixed(3), m.aA95.toFixed(3), m.aAvg.toFixed(3)],
      ['Deceleration (m/s²)', m.dMax.toFixed(3), m.dA95.toFixed(3), m.dAvg.toFixed(3)],
      ['Distance travelled (m) / ride time (s)', m.height.toFixed(2), m.rideTime.toFixed(1) + ' s', '-']
    ], { rowH: 38, size: 20 });
    pages.push(p);

    /* ---- page 2: analysis against limits ---- */
    p = mkPage(); x = p.x; y = 70;
    y = heading(x, 'Analysis — ' + setName, y) + 14;
    y = drawTable(x, y, ['Parameter', 'Measured', 'Limit', '% Limit', 'Status'], [{ w: 450 }, { w: 160, align: 'right' }, { w: 190, align: 'right' }, { w: 150, align: 'right' }, { w: 150, align: 'right' }],
      res.verdicts.map(function (v) {
        return [fit(x, EN_LABELS[v.key] || v.label, 430, 20), v.value.toFixed(v.dp), limTxt(v), pctTxt(v), { t: v.ok ? 'PASS' : 'FAIL', color: v.ok ? '#17803f' : '#c4302b', bold: true }];
      }), { rowH: 40, size: 20 });
    y = wrap(x, 'ISO 18738 defines the measuring method only, not acceptable values. ' + (extra.limitSet === 'manual' ? 'The limits above were entered by the user.' : 'Reference limits: speed 92-105 % of rated and acceleration 1.5 m/s² as in GB/T 10058; other values are common screening values. Confirm against the contract.'), MARGIN, y, CW, 27, { size: 19, color: '#55677a' });
    y += 10;
    if (res.warnings.length) {
      txt(x, 'Notes from the analysis', MARGIN, y, { size: 24, bold: true, color: '#a65f00' }); y += 32;
      res.warnings.slice(0, 5).forEach(function (w) { y = wrap(x, '• ' + w, MARGIN, y, CW, 27, { size: 20, color: '#a65f00' }); });
      y += 8;
    }
    if (extra.source) {
      y = heading(x, 'Vibration source analysis (probable causes, verify on site)', y + 10) + 18;
      extra.source.findings.slice(0, 6).forEach(function (f) {
        if (y > PH - 220) return;
        var col = f.level === 'high' ? '#c4302b' : f.level === 'medium' ? '#a65f00' : f.level === 'ok' ? '#17803f' : '#55677a';
        txt(x, '[' + f.level.toUpperCase() + '] ' + f.title, MARGIN, y, { size: 22, bold: true, color: col }); y += 30;
        f.evidence.slice(0, 2).forEach(function (e) { y = wrap(x, '– ' + e, MARGIN + 20, y, CW - 20, 26, { size: 19, color: '#33414f' }); });
        if (f.check.length) y = wrap(x, 'Check: ' + f.check.slice(0, 4).join('; ') + '.', MARGIN + 20, y, CW - 20, 26, { size: 19, color: '#0b3d6e' });
        y += 8;
      });
    }
    pages.push(p);

    /* ---- page 3: curves, PMT-style stack (sound, X, Y, Z, speed) ---- */
    p = mkPage(); y = 50;
    var stack = ['sound', 'vibx', 'viby', 'vibz', 'speed'].filter(function (k) { return byId[k]; }), hh = Math.floor((PH - 170) / stack.length) - 14;
    stack.forEach(function (k) { y = chartInto(p, byId[k], y, hh); });
    pages.push(p);

    /* ---- page 4: height, acceleration, jerk ---- */
    p = mkPage(); y = 60;
    y = chartInto(p, byId.height, y, 470); y = chartInto(p, byId.accel, y, 470); y = chartInto(p, byId.jerk, y, 470);
    pages.push(p);

    /* ---- page 5: spectra, events, method ---- */
    p = mkPage(); x = p.x; y = 60;
    if (byId.fftz) y = chartInto(p, byId.fftz, y, 330);
    if (byId.ffth) y = chartInto(p, byId.ffth, y, 330);
    y = chartInto(p, byId.specz, y, 360);
    var evs = extra.source ? extra.source.events.slice(0, 6) : [];
    if (evs.length) {
      y = heading(x, 'Largest vibration events and their position', y + 10) + 12;
      y = drawTable(x, y, ['Axis', 'Time (s)', 'Height* (m)', 'Speed (m/s)', 'p-p (mg)'], [{ w: 160 }, { w: 220, align: 'right' }, { w: 260, align: 'right' }, { w: 240, align: 'right' }, { w: 220, align: 'right' }],
        evs.map(function (e) { return [e.axis.toUpperCase(), e.t.toFixed(1), e.posAbs.toFixed(1), e.v.toFixed(2), e.mg.toFixed(dp)]; }), { rowH: 34, size: 19, plain: true });
      txt(x, '*Height above the lowest point of this run, from the integrated travel (about ±0.5 m).', MARGIN, y - 8, { size: 18, color: '#55677a' }); y += 22;
    }
    y += 6; txt(x, 'Method and limitations', MARGIN, y, { size: 26, bold: true, color: '#0b3d6e' }); y += 32;
    var notes = [
      'Axes: z = vertical (from gravity during the first still seconds), x and y = horizontal. Weighting ISO 2631-1 Wk (z) and Wd (x, y); peak-to-peak by the zero-crossing method (ISO 18738 Annex A). Unfiltered = gravity removed, no weighting.',
      'Acceleration and jerk: 10 Hz 2-pole low-pass, jerk from a 0.5 s running least-squares slope. Speed and height: ' + (res.method === 'fusion' ? 'barometer and accelerometer fusion' : 'integration of the vertical acceleration with zero-velocity correction') + (m.scale !== 1 ? ', scaled to the entered height' : '') + '.',
      'Sound: A-weighted 125 ms block levels from the device microphone' + (so ? (so.demo ? ' (DEMO data)' : so.calibrated ? ', calibrated with an offset of ' + so.offset.toFixed(1) + ' dB' : ', not calibrated') : ' (not recorded)') + '. A phone is not a class 1/2 sound level meter.',
      'A phone MEMS sensor is not a calibrated instrument. Noise floor: vertical ' + m.noiseFloorZ.toFixed(1) + ' mg, horizontal ' + m.noiseFloorH.toFixed(1) + ' mg. Use for screening, comparison and troubleshooting.'
    ];
    notes.forEach(function (n) { if (y < PH - 140) { y = wrap(x, '• ' + n, MARGIN, y, CW, 26, { size: 18, color: '#33414f' }); y += 4; } });
    pages.push(p);

    pages.forEach(function (pg, i) { footer(pg, i + 1, pages.length); });
    return pages.map(function (pg) { return pg.c; });
  }

  root.Report = { chartConfigs: chartConfigs, render: render, TXT: T };
})(typeof self !== 'undefined' ? self : this);
