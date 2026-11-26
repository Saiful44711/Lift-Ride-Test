/* report.js — chart configs (screen + PDF) and the A4 report laid out after ISO 18738 clause 6.5
 * Design & Developed by Md. Saiful Islam */
(function (root) {
  'use strict';
  var G0 = 9.80665, MG = 1000 / G0;

  function scaleArr(a, k) { var o = new Float64Array(a.length); for (var i = 0; i < a.length; i++) o[i] = a[i] * k; return o; }
  function scaleList(a, k) { return a.map(function (v) { return v === null ? null : v * k; }); }

  var T = {
    time: 'Time (s)', speed: 'Speed (m/s)', height: 'Travelled height (m)', accel: 'Acceleration along travel, 10 Hz filtered (m/s²)', jerk: 'Jerk (m/s³)',
    vibz: 'Vertical vibration, ISO-weighted (mg)', vibh: 'Horizontal vibration, ISO-weighted (mg)',
    fftz: 'Vertical FFT amplitude, steady speed (mg)', ffth: 'Horizontal FFT amplitude, steady speed (mg)', fftx: 'Frequency (Hz)', ffty: 'Amplitude (mg, peak)',
    specz: 'Vertical 1/3-octave spectrum vs ISO 2631-1 (Wk) curves', spech: 'Horizontal 1/3-octave spectrum vs ISO 2631-1 (Wd) curves',
    freq: '1/3-octave centre frequency (Hz)', ylev: 'Band rms (mg)',
    used: 'Used', baro: 'Barometer', meas: 'Measured', iso1: 'ISO curve ', limitUp: 'Accel limit', limitDn: 'Decel limit', jl: 'Jerk limit',
    x: 'X (front-back)', y: 'Y (side-side)', z: 'Vertical', b1: 'B1', b2: 'B2'
  };

  // [{id,title,cfg}]
  function chartConfigs(res, L) {
    var S = res.series, m = res.m, id = res.idx, dir = m.direction === 'up' ? 1 : -1;
    var tt = res.t, list = [], i;
    var tRange = { xmin: 0, xmax: tt[tt.length - 1] };
    var s0 = S.h[id.s];
    var v = scaleArr(S.v, dir), h = new Float64Array(S.h.length);
    for (i = 0; i < h.length; i++) h[i] = (S.h[i] - s0) * dir;
    list.push({ id: 'speed', title: T.speed, cfg: Object.assign({ title: T.speed, xlabel: T.time, series: [{ x: tt, y: v, label: T.used }] }, tRange) });
    var hs = [{ x: tt, y: h, label: T.used }];
    if (S.hb) hs.push({ x: tt, y: scaleArr(S.hb, dir), label: T.baro, dash: true, width: 1.2 });
    list.push({ id: 'height', title: T.height, cfg: Object.assign({ title: T.height, xlabel: T.time, series: hs }, tRange) });
    list.push({ id: 'accel', title: T.accel, cfg: Object.assign({ title: T.accel, xlabel: T.time, symmetricY: true,
      series: [{ x: tt, y: S.afl, label: T.accel }],
      hlines: [{ y: L.accel, label: T.limitUp + ' ' + L.accel }, { y: -L.decel, label: T.limitDn + ' ' + L.decel }] }, tRange) });
    list.push({ id: 'jerk', title: T.jerk, cfg: Object.assign({ title: T.jerk, xlabel: T.time, symmetricY: true,
      series: [{ x: tt, y: S.jerk, label: T.jerk }],
      hlines: [{ y: L.jerk, label: T.jl + ' ' + L.jerk }, { y: -L.jerk, label: T.jl + ' ' + L.jerk }] }, tRange) });
    var vl = [{ x: m.tB1, label: T.b1 }, { x: m.tB2, label: T.b2 }];
    list.push({ id: 'vibz', title: T.vibz, cfg: Object.assign({ title: T.vibz, xlabel: T.time, symmetricY: true, series: [{ x: tt, y: scaleArr(S.wz, MG), label: T.z }], vlines: vl }, tRange) });
    list.push({ id: 'vibh', title: T.vibh, cfg: Object.assign({ title: T.vibh, xlabel: T.time, symmetricY: true,
      series: [{ x: tt, y: scaleArr(S.wx, MG), label: T.x }, { x: tt, y: scaleArr(S.wy, MG), label: T.y }], vlines: vl }, tRange) });
    var sp = res.spectrum;
    if (sp.nb) {
      var fv = [];
      if (res.diag.rollerHz) fv.push({ x: res.diag.rollerHz, label: 'Roller ' + res.diag.rollerHz.toFixed(1) + ' Hz', color: '#d9480f' });
      if (res.diag.sheaveHz) fv.push({ x: res.diag.sheaveHz, label: 'Sheave ' + res.diag.sheaveHz.toFixed(1) + ' Hz', color: '#7048e8' });
      var fr = { xmin: 0, xmax: m.vibHi };
      list.push({ id: 'fftz', title: T.fftz, cfg: Object.assign({ title: T.fftz, xlabel: T.fftx, ylabel: T.ffty, series: [{ x: sp.nb.f, y: sp.nb.z, label: T.z }], vlines: fv, ymin: 0 }, fr) });
      list.push({ id: 'ffth', title: T.ffth, cfg: Object.assign({ title: T.ffth, xlabel: T.fftx, ylabel: T.ffty, series: [{ x: sp.nb.f, y: sp.nb.x, label: T.x }, { x: sp.nb.f, y: sp.nb.y, label: T.y, color: '#7048e8' }], vlines: fv, ymin: 0 }, fr) });
    }
    var fc = sp.fc;
    var isoL = (L.comfort).toFixed(3), isoL2 = (L.comfort * 2).toFixed(3);
    list.push({ id: 'specz', title: T.specz, cfg: { title: T.specz, xlabel: T.freq, ylabel: T.ylev, xlog: true, ylog: true, xmin: 0.5,
      series: [{ x: fc, y: scaleList(sp.z, MG), label: T.meas, marker: true, width: 2 },
        { x: fc, y: scaleList(sp.isoZ1, MG), label: T.iso1 + isoL + ' m/s²', dash: true, color: '#2b8a3e' },
        { x: fc, y: scaleList(sp.isoZ2, MG), label: T.iso1 + isoL2 + ' m/s²', dash: true, color: '#d9480f' }] } });
    list.push({ id: 'spech', title: T.spech, cfg: { title: T.spech, xlabel: T.freq, ylabel: T.ylev, xlog: true, ylog: true, xmin: 0.5,
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
    a95x: 'A95 horizontal X (mg p-p)', a95y: 'A95 horizontal Y (mg p-p)', aw: 'ISO 2631-1 weighted rms, worst axis (m/s²)', rated: 'Peak speed vs rated (m/s)' };

  function render(res, meta, L, cov) {
    meta = meta || {}; cov = cov || { up: 0, down: 0 };
    var m = res.m, pages = [], p, x, y, dp = m.noiseFloorZ >= 3 ? 0 : 1;
    var charts = chartConfigs(res, L), byId = {}; charts.forEach(function (c) { byId[c.id] = c; });
    var ascii = function (s) { return String(s || '').replace(/[^\x20-\x7E→]/g, '').trim(); };

    /* ---- page 1: general information, results ---- */
    p = mkPage(); x = p.x;
    x.fillStyle = '#0b3d6e'; x.fillRect(0, 0, PW, 160);
    txt(x, 'Lift Ride Quality Report', MARGIN, 80, { size: 54, bold: true, color: '#fff' });
    txt(x, 'Smartphone measurement · method of ISO 18738:2003 · peak-to-peak vibration, performance parameters', MARGIN, 122, { size: 23, color: '#cfe0f3' });
    y = 210;
    if (meta.demo) { x.fillStyle = '#fff3dc'; x.fillRect(MARGIN, y - 34, CW, 46); txt(x, 'DEMO — simulated data, not a real measurement', MARGIN + 14, y - 3, { size: 24, bold: true, color: '#a65f00' }); y += 44; }
    y = heading(x, 'General information', y + 6) + 24;
    var info = [
      ['Date and time', meta.date || '-', 'Direction of travel', (m.direction === 'up' ? 'UP' : 'DOWN') + (meta.floors ? '  (' + ascii(meta.floors) + ')' : '')],
      ['Building', ascii(meta.building) || '-', 'Lift ID', ascii(meta.lift) || '-'],
      ['Measured by', ascii(meta.operator) || '-', 'Organisation', ascii(meta.org) || '-'],
      ['Instrument', ascii(meta.instr) || '-', 'Last sensor check', ascii(meta.lastCheck) || '-'],
      ['Persons in car', String(meta.persons === undefined ? '-' : meta.persons), 'Car fan / AC off', yn(meta.fan)],
      ['Alarms / chimes off', yn(meta.chime), 'Phone placement OK', yn(meta.placed)],
      ['Method', res.method === 'fusion' ? 'Baro + accelerometer' : 'Accelerometer only', 'Sampling', res.fs + ' Hz'],
      ['Notes', ascii(meta.note) || '-', 'Runs for this lift', 'UP ' + cov.up + ' / DOWN ' + cov.down]
    ];
    info.forEach(function (r, i) {
      if (i % 2 === 0) { x.fillStyle = '#f5f8fb'; x.fillRect(MARGIN, y - 28, CW, 40); }
      txt(x, r[0], MARGIN + 8, y, { size: 20, color: '#55677a' }); txt(x, fit(x, r[1], 330, 21, true), MARGIN + 215, y, { size: 21, bold: true });
      txt(x, r[2], MARGIN + 570, y, { size: 20, color: '#55677a' }); txt(x, fit(x, r[3], 300, 21, true), MARGIN + 800, y, { size: 21, bold: true });
      y += 40;
    });
    y += 34;
    y = heading(x, 'Ride quality results — weighted vibration, peak-to-peak (mg)', y) + 14;
    y = drawTable(x, y, ['Axis / region', 'Maximum p-p', 'A95 p-p', '0-peak'], [{ w: 520 }, { w: 200, align: 'right' }, { w: 200, align: 'right' }, { w: 180, align: 'right' }], [
      ['X, front-back (between boundaries 1 and 2)', m.x.max.toFixed(dp), m.x.a95.toFixed(dp), m.x.zp.toFixed(dp)],
      ['Y, side-to-side (between boundaries 1 and 2)', m.y.max.toFixed(dp), m.y.a95.toFixed(dp), m.y.zp.toFixed(dp)],
      ['Z vertical, constant-acceleration region', m.zC.max.toFixed(dp), m.zC.a95.toFixed(dp), m.zC.zp.toFixed(dp)],
      ['Z vertical, non-constant region', m.zN.max.toFixed(dp), '-', m.zN.zp.toFixed(dp)]
    ]);
    y += 10;
    y = heading(x, 'Performance characteristics (for reference)', y) + 14;
    y = drawTable(x, y, ['Quantity', 'Maximum', 'A95 / V95'], [{ w: 520 }, { w: 280, align: 'right' }, { w: 300, align: 'right' }], [
      ['Speed (m/s)', m.vPeak.toFixed(2), m.v95.toFixed(2)],
      ['Acceleration (m/s²)', m.aMax.toFixed(2), m.aA95.toFixed(2)],
      ['Deceleration (m/s²)', m.dMax.toFixed(2), m.dA95.toFixed(2)],
      ['Jerk (m/s³)', m.jMax.toFixed(1), '-'],
      ['Travel height (m) / ride time (s)', m.height.toFixed(2), m.rideTime.toFixed(1)]
    ]);
    var scoreNote = 'Sound level (LAeq, max dB(A)) was not measured. Boundary 1 / 2 = 500 mm after the start / before the stop. Values are rounded to the precision the phone sensor supports (noise floor ' + m.noiseFloorZ.toFixed(1) + ' mg vertical).';
    y = wrap(x, scoreNote, MARGIN, y, CW, 28, { size: 20, color: '#55677a' });
    pages.push(p);

    /* ---- page 2: limits, notes, speed/height ---- */
    p = mkPage(); x = p.x; y = 70;
    y = heading(x, 'Results against reference limits', y) + 14;
    y = drawTable(x, y, ['Parameter', 'Measured', 'Limit', 'Status'], [{ w: 520 }, { w: 190, align: 'right' }, { w: 190, align: 'right' }, { w: 200, align: 'right' }],
      res.verdicts.map(function (v) {
        return [EN_LABELS[v.key] || v.label, v.value.toFixed(v.dp), (v.band ? '±5% of ' : '<= ') + v.limit, { t: v.ok ? 'Within' : (v.band ? 'Outside' : 'Exceeds'), color: v.ok ? '#17803f' : '#c4302b', bold: true }];
      }), { rowH: 40, size: 20 });
    txt(x, 'ISO 18738 does not define acceptable values; limits are editable reference values.', MARGIN, y - 6, { size: 19, color: '#55677a' }); y += 26;
    if (res.warnings.length) {
      txt(x, 'Notes from the analysis', MARGIN, y, { size: 24, bold: true, color: '#a65f00' }); y += 32;
      res.warnings.slice(0, 5).forEach(function (w) { y = wrap(x, '• ' + w, MARGIN, y, CW, 27, { size: 20, color: '#a65f00' }); });
      y += 8;
    }
    y = chartInto(p, byId.speed, y, 330); y = chartInto(p, byId.height, y, 330); y = chartInto(p, byId.accel, y, 330);
    pages.push(p);

    /* ---- page 3: jerk and vibration ---- */
    p = mkPage(); y = 60;
    y = chartInto(p, byId.jerk, y, 360); y = chartInto(p, byId.vibz, y, 360); y = chartInto(p, byId.vibh, y, 360);
    if (byId.fftz) y = chartInto(p, byId.fftz, y, 360);
    pages.push(p);

    /* ---- page 4: spectra, bumps, method ---- */
    p = mkPage(); x = p.x; y = 60;
    if (byId.ffth) y = chartInto(p, byId.ffth, y, 340);
    y = chartInto(p, byId.specz, y, 380);
    if (res.bumps.length) {
      y = heading(x, 'Largest vertical vibration events (constant-acceleration region)', y + 14) + 12;
      y = drawTable(x, y, ['#', 'Time (s)', 'Position from start (m)', 'p-p (mg)'], [{ w: 120 }, { w: 280, align: 'right' }, { w: 400, align: 'right' }, { w: 300, align: 'right' }],
        res.bumps.slice(0, 4).map(function (b, i) { return [String(i + 1), b.t.toFixed(1), b.pos.toFixed(1), b.mg.toFixed(dp)]; }), { rowH: 36, size: 20, plain: true });
    }
    y += 8; txt(x, 'Method and limitations', MARGIN, y, { size: 26, bold: true, color: '#0b3d6e' }); y += 32;
    var notes = [
      'Axes: z = vertical (from gravity during the first still seconds), x and y = horizontal. Vibration is weighted with ISO 2631-1 Wk (z) and Wd (x, y) in the time domain; peak-to-peak levels use the zero-crossing method (ISO 18738 Annex A).',
      'Acceleration and jerk: 10 Hz 2-pole Butterworth magnitude (zero phase), jerk from a 0.5 s running least-squares slope. Constant / non-constant regions: Annex B (1 Hz filtered acceleration, slope 0.3 m/s3 over 1 s, +/-0.5 s).',
      'Speed and height: ' + (res.method === 'fusion' ? 'barometer and accelerometer fusion (tau ' + res.opts.tau + ' s)' : 'double integration of the bias-corrected vertical acceleration with zero-velocity end correction') + (m.scale !== 1 ? '; scaled to the entered height (factor ' + m.scale.toFixed(3) + ')' : '') + '.',
      'A phone MEMS sensor is not a calibrated instrument. Noise floor: vertical ' + m.noiseFloorZ.toFixed(1) + ' mg, horizontal ' + m.noiseFloorH.toFixed(1) + ' mg (weighted p-p, A95). Use for screening, comparison and troubleshooting, not as certified ride-quality evidence.'
    ];
    notes.forEach(function (n) { y = wrap(x, '• ' + n, MARGIN, y, CW, 27, { size: 19, color: '#33414f' }); y += 4; });
    pages.push(p);

    pages.forEach(function (pg, i) { footer(pg, i + 1, pages.length); });
    return pages.map(function (pg) { return pg.c; });
  }

  root.Report = { chartConfigs: chartConfigs, render: render, TXT: T };
})(typeof self !== 'undefined' ? self : this);
