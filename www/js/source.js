/*
 * source.js — Lift Ride Test v2.2: vibration source finder (same code in browser and Node)
 * Design & Developed by Md. Saiful Islam
 *
 * Gives PROBABLE causes with the evidence behind them, never a final diagnosis:
 *   - which axis, which phase (acceleration / steady speed / deceleration)
 *   - single events with their position in the shaft
 *   - vibration that repeats with position (rail joints, brackets)
 *   - spectrum peaks matched to rotating parts (sheave, motor, roller guides) from the lift data
 *   - several runs: events at the same height (up and down), peaks that follow the speed
 * Phone sensors see about 0.5-80 Hz; higher-frequency sources (bearings, inverter carrier) are not visible.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.LiftSource = factory(root.LiftCore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';
  var MG = Core.MG, U = Core.util;
  var AX = ['z', 'x', 'y'], AXN = { z: 'vertical (Z)', x: 'horizontal X (front-back)', y: 'horizontal Y (side-side)' };

  function num(v) { var n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; }
  function liftData(d) {
    d = d || {};
    return { roping: num(d.roping) || 1, sheaveMm: num(d.sheaveMm), gear: num(d.gear) || 1, poles: num(d.poles), rollerMm: num(d.rollerMm),
      railLen: num(d.railLen) || 5, bracketM: num(d.bracketM), minR: num(d.minR) };
  }
  function sigOf(res, ax) { return res.series['w' + ax]; }
  function median(a) { return a.length ? U.percentile(a.slice(), 50) : 0; }

  /* rms of the ISO-weighted signal per phase (mg) */
  function phaseRms(res) {
    var ph = res.series.phase, out = {};
    AX.forEach(function (ax) {
      var w = sigOf(res, ax), acc = [0, 0, 0, 0], cnt = [0, 0, 0, 0];
      for (var i = res.idx.b1; i <= res.idx.b2; i++) { var p = ph[i]; acc[p] += w[i] * w[i]; cnt[p]++; }
      out[ax] = { acc: cnt[1] ? Math.sqrt(acc[1] / cnt[1]) * MG : 0, steady: cnt[2] ? Math.sqrt(acc[2] / cnt[2]) * MG : 0, dec: cnt[3] ? Math.sqrt(acc[3] / cnt[3]) * MG : 0 };
    });
    return out;
  }

  /* largest peak-to-peak events per axis, with position, speed and an estimate of their frequency */
  function findEvents(res, limits, relOnly) {
    var fs = res.fs, S = res.series, ev = [];
    AX.forEach(function (ax) {
      // Z: constant-acceleration region only (jerk transitions are not vibration); X, Y: boundaries 1-2
      var lv = U.ppLevels(sigOf(res, ax), res.idx.b1, res.idx.b2), cons = res.series.cons;
      if (!lv.p.length) return;
      var med = median(lv.p) * MG, lim = ax === 'z' ? limits.maxv : limits.maxh;
      var thr = relOnly ? 2.0 * med : Math.max(2.2 * med, 0.5 * lim);
      var cand = [];
      for (var i = 0; i < lv.p.length; i++) {
        var mg = lv.p[i] * MG; if (mg < thr) continue;
        var k = lv.pk[i];
        if (ax === 'z' && !(cons[lv.s[i]] && cons[lv.e[i]])) continue;
        cand.push({ axis: ax, t: k / fs, mg: mg, ratio: med > 0 ? mg / med : 0, pos: S.pos[k], posAbs: S.posAbs[k], v: Math.abs(S.vd[k]), phase: Core.PHASES[S.phase[k]], f: fs / Math.max(2, lv.e[i] - lv.s[i] + 1), overLimit: mg > lim });
      }
      cand.sort(function (a, b) { return b.mg - a.mg; });
      var kept = [];
      cand.forEach(function (c) { if (kept.length < (relOnly ? 12 : 8) && !kept.some(function (x) { return Math.abs(x.t - c.t) < 0.4; })) kept.push(c); });
      ev = ev.concat(kept);
    });
    ev.sort(function (a, b) { return b.mg - a.mg; });
    return ev.slice(0, relOnly ? 30 : 14);
  }

  /* vibration envelope against position (steady-speed part) and its autocorrelation: repeating shaft features */
  function periodicity(res, D) {
    // whole travel B1-B2, not only the steady part: while the speed changes, a beat between two frequencies smears
    // out over position, but a shaft item stays at the same place.
    var S = res.series, i0 = res.idx.b1, i1 = res.idx.b2, best = null;
    if (i1 - i0 < 3 * res.fs) return null;
    var span = Math.abs(S.pos[i1] - S.pos[i0]), dx = 0.05, G = Math.floor(span / dx) + 1;
    if (span < 2.2 * Math.min(D.railLen, D.bracketM || 99)) return null;
    var p0 = Math.min(S.pos[i0], S.pos[i1]), half = Math.max(1, Math.floor(0.05 * res.fs));
    // only spacings that a shaft item can have (rail length, bracket spacing). Any other repeat can also be a beat
    // between two vibration frequencies at constant speed, so it is not reported as a shaft item.
    var targets = [{ kind: 'rail', d: D.railLen }]; if (D.bracketM) targets.push({ kind: 'bracket', d: D.bracketM });
    AX.forEach(function (ax) {
      var w = S['v' + ax], env = new Float64Array(G), i, k;
      for (i = i0; i <= i1; i++) {
        var m = 0; for (k = Math.max(i0, i - half); k <= Math.min(i1, i + half); k++) if (Math.abs(w[k]) > m) m = Math.abs(w[k]);
        var g = Math.min(G - 1, Math.max(0, Math.floor((S.pos[i] - p0) / dx)));
        if (m > env[g]) env[g] = m;
      }
      var mu = U.mean(env), vr = 0; for (i = 0; i < G; i++) { env[i] -= mu; vr += env[i] * env[i]; }
      if (vr <= 0) return;
      function r(L) { var s = 0; for (var q = 0; q + L < G; q++) s += env[q] * env[q + L]; return s / vr * G / (G - L); }
      targets.forEach(function (tg) {
        var a = Math.floor(0.92 * tg.d / dx), b = Math.ceil(1.08 * tg.d / dx), bl = null, br = -1;
        for (var L = a; L <= b && L < G / 2; L++) { var v = r(L); if (v > br) { br = v; bl = L; } }
        if (bl === null) return;
        var off = r(Math.round(bl * 0.5)); // half-way lag must be clearly lower (a real repeat, not a smooth trend)
        if (br > (D.minR || 0.55) && br - off > 0.3 && (!best || br > best.r)) best = { axis: ax, period: bl * dx, r: br, kind: tg.kind, off: off };
      });
    });
    return best;
  }

  /* hot spots: heights where the vibration envelope is clearly above the run's typical level (for comparing runs) */
  function hotSpots(res) {
    var S = res.series, dx = 0.1, H = res.m.travel, G = Math.floor(H / dx) + 1, out = [];
    if (H < 2) return out;
    AX.forEach(function (ax) {
      var w = S['v' + ax], env = new Float64Array(G), has = new Uint8Array(G), i; // unweighted 0.5-80 Hz: impacts show better
      var vmin = 0.4 * res.m.vPeak; // shaft items show at any reasonable speed; skip the slow ends of the run
      for (i = res.idx.b1; i <= res.idx.b2; i++) {
        if (Math.abs(S.vd[i]) < vmin) continue;
        var g = Math.min(G - 1, Math.max(0, Math.round(S.posAbs[i] / dx))), a = Math.abs(w[i]);
        if (a > env[g]) env[g] = a; has[g] = 1;
      }
      var sm = new Float64Array(G), vals = [];
      for (i = 0; i < G; i++) { if (!has[i]) continue; var m = 0; for (var k = Math.max(0, i - 2); k <= Math.min(G - 1, i + 2); k++) if (has[k] && env[k] > m) m = env[k]; sm[i] = m; vals.push(m); }
      if (vals.length < 20) return;
      var med = median(vals);
      if (!(med > 0)) return;
      var cand = [];
      for (i = 1; i < G - 1; i++) if (has[i] && sm[i] >= sm[i - 1] && sm[i] >= sm[i + 1] && sm[i] > 1.45 * med) cand.push({ g: i, r: sm[i] / med, a: sm[i] });
      cand.sort(function (a, b) { return b.r - a.r; });
      var kept = [];
      cand.forEach(function (c) { if (kept.length < 12 && !kept.some(function (q) { return Math.abs(q.g - c.g) * dx < 1.0; })) kept.push(c); });
      kept.forEach(function (c) { out.push({ axis: ax, posAbs: c.g * dx, mg: 2 * c.a * MG, ratio: c.r }); });
    });
    return out;
  }

  function candidates(v, D) {
    var c = [];
    function add(part, f, group) { if (f && isFinite(f) && f > 0.3) for (var h = 1; h <= 3; h++) c.push({ part: part, harmonic: h, f: f * h, group: group }); }
    if (D.sheaveMm) {
      var fsh = v * D.roping / (Math.PI * D.sheaveMm / 1000);
      add('Traction sheave rotation', fsh, 'sheave');
      if (D.gear > 1.01) add('Motor shaft (geared machine)', fsh * D.gear, 'motor');
      if (D.poles) {
        var fe = fsh * D.gear * D.poles / 2;
        c.push({ part: 'Motor electrical frequency', harmonic: 1, f: fe, group: 'drive' });
        c.push({ part: 'Motor torque ripple (6×)', harmonic: 1, f: 6 * fe, group: 'ripple' });
      }
    }
    if (D.rollerMm) add('Roller guide rotation', v / (Math.PI * D.rollerMm / 1000), 'roller');
    if (D.bracketM && v / D.bracketM > 0.3) c.push({ part: 'Rail bracket passing', harmonic: 1, f: v / D.bracketM, group: 'bracket' });
    // rail joints (about v / rail length, usually < 1 Hz) are found from the position pattern, not from the spectrum
    return c;
  }

  function matchPeaks(res, cands) {
    var out = [], v = res.diag.vSteady || res.m.vPeak;
    AX.forEach(function (ax) {
      (res.spectrum.peaks[ax] || []).forEach(function (p) {
        var mt = cands.filter(function (c) { return Math.abs(c.f - p.f) <= Math.max(0.15, 0.05 * c.f); });
        out.push({ axis: ax, f: p.f, mg: p.mg, dEqMm: v > 0 ? v / (Math.PI * p.f) * 1000 : null, matches: mt });
      });
    });
    out.sort(function (a, b) { return b.mg - a.mg; });
    return out;
  }

  function lvl(x) { return x >= 3 ? 'high' : x >= 2 ? 'medium' : 'low'; }

  /* ---------------- one run ---------------- */
  function analyzeRun(res, lift, limits) {
    var L = Object.assign({}, Core.DEFAULT_LIMITS, limits || {}), D = liftData(lift), m = res.m;
    var v = res.diag.vSteady || m.vPeak;
    var pr = phaseRms(res), events = findEvents(res, L), per = periodicity(res, D), cands = candidates(v, D), peaks = matchPeaks(res, cands);
    var F = [], notes = [];
    var ratioZ = m.a95z / L.a95v, ratioH = Math.max(m.a95x, m.a95y) / L.a95h, maxRatio = Math.max(ratioZ, ratioH, m.maxppZ / L.maxv, Math.max(m.maxppX, m.maxppY) / L.maxh);
    var strongAxis = ['z', 'x', 'y'].reduce(function (b, ax) { var r = ax === 'z' ? m.a95z / L.a95v : m['a95' + ax] / L.a95h; return r > b.r ? { ax: ax, r: r } : b; }, { ax: 'z', r: -1 });

    // 1) repeating with position
    if (per) {
      var mR = per.kind === 'rail', mB = per.kind === 'bracket';
      var score = per.r > 0.65 ? 3 : 2;
      F.push({ key: 'periodic', title: mR ? 'Rail joints (vibration repeats every rail length)' : mB ? 'Rail brackets (vibration repeats every bracket spacing)' : 'A shaft feature that repeats every ' + per.period.toFixed(1) + ' m', level: lvl(score),
        evidence: ['The ' + AXN[per.axis] + ' vibration envelope repeats every ' + per.period.toFixed(2) + ' m of travel (correlation ' + per.r.toFixed(2) + ').', 'Confirm with a run at another speed (e.g. inspection): rail joints keep the same spacing in metres.',
          mR ? 'This matches the rail length you entered (' + D.railLen + ' m).' : mB ? 'This matches the bracket spacing you entered (' + D.bracketM + ' m).' : 'It does not match the rail length (' + D.railLen + ' m)' + (D.bracketM ? ' or bracket spacing (' + D.bracketM + ' m)' : '') + '.'],
        check: mR ? ['Steps and gaps at the rail joints (straight edge / feeler gauge)', 'Fish-plate bolts and joint filing', 'Rail alignment and distance between guides (DBG) near the joints'] :
          mB ? ['Bracket fixings and clip bolts', 'Rail straightness between brackets'] : ['Walk the shaft at the listed positions', 'Compare with the rail length and the bracket spacing'] });
    }
    // 2) spectrum peaks matched to parts
    var seen = {};
    peaks.forEach(function (p) {
      p.matches.forEach(function (c) {
        if (seen[c.group]) return;
        var big = p.mg > 0.25 * (p.axis === 'z' ? L.a95v : L.a95h);
        seen[c.group] = true;
        var chk = {
          sheave: ['Rope tension equal (within about ±5 %)', 'Sheave groove wear and equal rope seating', 'Sheave run-out / eccentricity'],
          motor: ['Gearbox and motor coupling', 'Motor shaft bearings', 'Gear mesh (backlash, oil)'],
          drive: ['Speed-loop gains and encoder signal (drive parameters)', 'Motor phase currents balanced', 'Encoder mounting and cable screening'],
          ripple: ['Encoder offset / pole-position (auto-tune) of the PM motor', 'Current-loop gains', 'Motor phase currents balanced'],
          roller: ['Roller tyres: flat spots, wear, hardening', 'Roller bearings', 'Roller spring preload'],
          bracket: ['Bracket fixings'], joint: ['Rail joints']
        }[c.group] || [];
        F.push({ key: 'part-' + c.group, title: c.part + (c.harmonic > 1 ? ' (harmonic ×' + c.harmonic + ')' : ''), level: lvl((big ? 2.5 : 1.5) + (p.matches.length === 1 ? 0.5 : 0) - (c.harmonic > 1 ? 0.75 : 0)),
          evidence: [AXN[p.axis][0].toUpperCase() + AXN[p.axis].slice(1) + ' spectrum peak ' + p.f.toFixed(2) + ' Hz (' + p.mg.toFixed(1) + ' mg) at steady speed ' + v.toFixed(2) + ' m/s.',
            'Expected ' + c.part.toLowerCase() + ' frequency: ' + c.f.toFixed(2) + ' Hz from the lift data.'], check: chk });
      });
    });
    // 3) phase
    ['z', 'x', 'y'].forEach(function (ax) {
      var r = pr[ax], ad = Math.max(r.acc, r.dec);
      if (r.steady > 0 && ad > 1.6 * r.steady && ad > 1.5) {
        var which = r.acc >= r.dec ? 'acceleration' : 'deceleration';
        F.push({ key: 'phase-' + ax, title: ax === 'z' ? 'Drive / control during ' + which : 'Car sway during ' + which, level: lvl(1.5 + Math.min(1.5, ad / r.steady - 1.6)),
          evidence: [AXN[ax][0].toUpperCase() + AXN[ax].slice(1) + ' vibration is ' + (ad / r.steady).toFixed(1) + '× higher during ' + which + ' (' + ad.toFixed(1) + ' mg rms) than at steady speed (' + r.steady.toFixed(1) + ' mg rms).'],
          check: ax === 'z' ? ['Speed-loop gains (low / high speed) and the switch-over frequency', 'S-curve / jerk settings and start pre-torque (load compensation)', 'Brake opening / closing timing', 'Encoder and its mounting'] :
            ['Car balance (static) and guide clearances', 'Guide shoe / roller preload', 'Compensation and travelling cable hanging'] });
      }
    });
    // 4) dominant axis at steady speed (no part match)
    var st = { z: pr.z.steady, x: pr.x.steady, y: pr.y.steady }, hMax = Math.max(st.x, st.y);
    if (!Object.keys(seen).some(function (k) { return k !== 'joint'; }) && maxRatio > 0.5) {
      if (st.z > 1.3 * hMax) F.push({ key: 'axis-z', title: 'Vertical vibration at steady speed (suspension / ropes / sheave)', level: lvl(1 + Math.min(2, ratioZ * 2)),
        evidence: ['Vertical vibration (' + st.z.toFixed(1) + ' mg rms) is ' + (st.z / Math.max(0.01, hMax)).toFixed(1) + '× the horizontal at steady speed.', 'No spectrum peak matched a part from the lift data (enter the sheave / motor data to test).'],
        check: ['Rope tension equal', 'Sheave grooves', 'Car isolation pads / sling', 'Compensation chain or ropes', 'Machine base isolation'] });
      else if (hMax > 1.3 * st.z) F.push({ key: 'axis-h', title: 'Horizontal vibration at steady speed (guides / rails)', level: lvl(1 + Math.min(2, ratioH * 2)),
        evidence: ['Horizontal ' + (st.x >= st.y ? 'X' : 'Y') + ' vibration (' + hMax.toFixed(1) + ' mg rms) is ' + (hMax / Math.max(0.01, st.z)).toFixed(1) + '× the vertical at steady speed.'],
        check: ['Guide shoe liners / roller tyres', 'Rail alignment and lubrication', 'Car balance', 'Guide shoe / roller preload'] });
    }
    // 5) low-frequency vertical bounce
    peaks.filter(function (p) { return p.axis === 'z' && p.f >= 0.8 && p.f <= 4 && !p.matches.length; }).slice(0, 1).forEach(function (p) {
      F.push({ key: 'bounce', title: 'Car / rope bounce (low-frequency vertical resonance)', level: lvl(1.5 + (p.mg > 0.3 * L.a95v ? 1 : 0)),
        evidence: ['Vertical peak ' + p.f.toFixed(2) + ' Hz (' + p.mg.toFixed(1) + ' mg) is in the 1-4 Hz range typical of car-on-rope bounce.'],
        check: ['Rope tension and rope hitch springs', 'Car isolation rubbers', 'Drive speed-loop gains (low frequency oscillation)'] });
    });
    // 6) isolated events above the limit
    var big = events.filter(function (e) { return e.overLimit; });
    if (big.length && big.length <= 4 && !per) {
      F.push({ key: 'local', title: 'Local event(s) at a fixed point in the shaft', level: lvl(2 + (big.length === 1 ? 0.5 : 0)),
        evidence: big.map(function (e) { return AXN[e.axis] + ' ' + e.mg.toFixed(1) + ' mg at ' + e.posAbs.toFixed(1) + ' m above the lowest point of this run (' + e.phase + ', ' + e.v.toFixed(2) + ' m/s).'; }),
        check: ['Rail joint or bracket at that height', 'Landing door sill / apron clearance', 'Anything touching the car (cables, debris)', 'Repeat the run in the other direction: the same height means a shaft item'] });
    }
    // 7) counterweight passing (horizontal event near mid travel)
    var mid = m.travel / 2;
    var cw = events.filter(function (e) { return e.axis !== 'z' && Math.abs(e.posAbs - mid) < Math.max(1.0, 0.08 * m.travel) && e.mg > 0.4 * L.maxh; });
    if (cw.length) F.push({ key: 'cwt', title: 'Counterweight passing (if this run covers the whole shaft)', level: 'low',
      evidence: ['Horizontal event of ' + cw[0].mg.toFixed(1) + ' mg near the middle of the travel (' + cw[0].posAbs.toFixed(1) + ' of ' + m.travel.toFixed(1) + ' m).'],
      check: ['Car to counterweight clearance', 'Counterweight guide shoes', 'Air pressure in a narrow shaft'] });
    // unmatched strong peaks: equivalent rolling diameter
    peaks.filter(function (p) { return !p.matches.length && p.f > 4 && p.mg > 0.2 * (p.axis === 'z' ? L.a95v : L.a95h); }).slice(0, 2).forEach(function (p) {
      notes.push(AXN[p.axis][0].toUpperCase() + AXN[p.axis].slice(1) + ' peak ' + p.f.toFixed(1) + ' Hz: a part rolling at car speed would have a diameter of about ' + Math.round(p.dEqMm) + ' mm' +
        (D.roping === 2 ? ' (about ' + Math.round(2 * p.dEqMm) + ' mm if it turns with the ropes)' : '') + '. If nothing has that size, a fixed-frequency source (structure resonance, fan, drive) is more likely.');
    });
    if (!F.length) {
      if (maxRatio < 0.5) F.push({ key: 'ok', title: 'No significant vibration source', level: 'ok', evidence: ['All vibration values are below half of the limits.'], check: [] });
      else F.push({ key: 'unknown', title: 'No clear pattern in this run', level: 'low', evidence: ['Vibration is present but does not repeat with position or match a part.'],
        check: ['Enter the lift data (sheave, roping, motor poles, roller size)', 'Record runs up and down, and at a different speed, then use Compare'] });
    }
    var order = { high: 0, medium: 1, low: 2, ok: 3 };
    F.sort(function (a, b) { return order[a.level] - order[b.level]; });
    if (!D.sheaveMm && !D.rollerMm) notes.push('Enter the lift data (roping, sheave diameter, gear ratio, motor poles, roller diameter) to match spectrum peaks to parts.');
    notes.push('Phone sensors see about 0.5-80 Hz. Bearing noise and inverter carrier frequencies are outside this range.');
    return { v: v, lift: D, phaseRms: pr, strongAxis: strongAxis.ax, events: events, periodic: per, candidates: cands, peaks: peaks, findings: F, notes: notes };
  }

  /* ---------------- several runs of the same lift ---------------- */
  function compare(items, lift, limits) {
    var L = Object.assign({}, Core.DEFAULT_LIMITS, limits || {});
    var runs = items.map(function (it, k) {
      var a = analyzeRun(it.res, lift, L), m = it.res.m, evAll = hotSpots(it.res);
      return { k: k, label: (it.meta && it.meta.date || 'Run ' + (k + 1)) + ' ' + m.direction.toUpperCase(), dir: m.direction, v: a.v, height: m.travel,
        a95: { z: m.a95z, x: m.a95x, y: m.a95y }, events: evAll, peaks: a.peaks, analysis: a };
    });
    var F = [], warn = [];
    var hs = runs.map(function (r) { return r.height; }), hMin = Math.min.apply(null, hs), hMax = Math.max.apply(null, hs);
    if (hMax / Math.max(0.1, hMin) > 1.08) warn.push('The runs have different travel heights (' + hMin.toFixed(1) + '-' + hMax.toFixed(1) + ' m). Positions are compared from the lowest point of each run, so record runs between the same floors.');
    // recurring positions
    var all = [];
    runs.forEach(function (r) { r.events.forEach(function (e) { all.push({ run: r.k, dir: r.dir, posAbs: e.posAbs, axis: e.axis, mg: e.mg }); }); });
    all.sort(function (a, b) { return a.posAbs - b.posAbs; });
    var clusters = [];
    all.forEach(function (e) {
      var c = clusters.length ? clusters[clusters.length - 1] : null;
      if (c && e.posAbs - c.last <= 0.5) { c.items.push(e); c.last = e.posAbs; } else clusters.push({ items: [e], last: e.posAbs });
    });
    var recurring = clusters.map(function (c) {
      var rs = {}, dirs = {}, axes = {}, mx = 0, sp = 0;
      c.items.forEach(function (e) { rs[e.run] = 1; dirs[e.dir] = 1; axes[e.axis] = 1; mx = Math.max(mx, e.mg); sp += e.posAbs; });
      return { posAbs: sp / c.items.length, runs: Object.keys(rs).length, dirs: Object.keys(dirs), axes: Object.keys(axes), maxMg: mx };
    }).filter(function (c) { return c.runs >= 2; }).sort(function (a, b) { return b.runs - a.runs || b.maxMg - a.maxMg; });
    if (recurring.length) {
      var both = recurring.filter(function (c) { return c.dirs.length === 2; });
      F.push({ key: 'recurring', title: both.length ? 'Fixed points in the shaft (same height going up and down)' : 'Same height in several runs', level: both.length ? 'high' : 'medium',
        evidence: recurring.slice(0, 6).map(function (c) { return c.posAbs.toFixed(1) + ' m: ' + c.runs + ' of ' + runs.length + ' runs, ' + c.dirs.join(' + ') + ', axis ' + c.axes.join('/').toUpperCase() + ', up to ' + c.maxMg.toFixed(1) + ' mg'; }),
        check: ['Rail joints and brackets at those heights', 'Landing sills and door aprons at those heights', 'Shaft wall items close to the car or counterweight'] });
    }
    // speed scaling
    var scal = [];
    for (var i = 0; i < runs.length; i++) for (var j = i + 1; j < runs.length; j++) {
      var a = runs[i], b = runs[j], ratio = b.v / a.v;
      if (Math.abs(ratio - 1) < 0.15) continue;
      a.peaks.forEach(function (pa) {
        b.peaks.forEach(function (pb) {
          if (pa.axis !== pb.axis) return;
          var fr = pb.f / pa.f;
          if (Math.abs(fr - ratio) <= 0.08 * ratio) scal.push({ axis: pa.axis, f1: pa.f, f2: pb.f, v1: a.v, v2: b.v, kind: 'speed', dEqMm: a.v / (Math.PI * pa.f) * 1000 });
          else if (Math.abs(fr - 1) <= 0.05) scal.push({ axis: pa.axis, f1: pa.f, f2: pb.f, v1: a.v, v2: b.v, kind: 'fixed' });
        });
      });
    }
    var sp = scal.filter(function (s) { return s.kind === 'speed'; }), fx = scal.filter(function (s) { return s.kind === 'fixed'; });
    if (sp.length) F.push({ key: 'rotating', title: 'Rotating part (frequency follows the speed)', level: 'high',
      evidence: sp.slice(0, 3).map(function (s) { return AXN[s.axis] + ': ' + s.f1.toFixed(1) + ' Hz at ' + s.v1.toFixed(2) + ' m/s → ' + s.f2.toFixed(1) + ' Hz at ' + s.v2.toFixed(2) + ' m/s. Equivalent rolling diameter ≈ ' + Math.round(s.dEqMm) + ' mm'; }),
      check: ['Roller guides of about that diameter', 'Sheave / deflector sheave (rope speed = roping × car speed)', 'Motor and gearbox'] });
    if (fx.length) F.push({ key: 'fixedf', title: 'Fixed-frequency source (does not change with speed)', level: 'medium',
      evidence: fx.slice(0, 3).map(function (s) { return AXN[s.axis] + ': ' + s.f1.toFixed(1) + ' Hz at both ' + s.v1.toFixed(2) + ' and ' + s.v2.toFixed(2) + ' m/s'; }),
      check: ['Car frame / panel resonance', 'Machine base and its isolation', 'Fans or drive switching noise', 'Building structure'] });
    if (!sp.length && !fx.length && runs.length >= 2 && !runs.some(function (r, q) { return q && Math.abs(r.v / runs[0].v - 1) >= 0.15; }))
      warn.push('All runs have about the same speed. Record one run at a different speed (e.g. inspection speed) to separate rotating parts from fixed resonances.');
    // up vs down
    var dirAvg = { up: { z: [], x: [], y: [] }, down: { z: [], x: [], y: [] } };
    runs.forEach(function (r) { AX.forEach(function (ax) { dirAvg[r.dir][ax].push(r.a95[ax]); }); });
    if (dirAvg.up.z.length && dirAvg.down.z.length) {
      AX.forEach(function (ax) {
        var u = U.mean(dirAvg.up[ax]), d = U.mean(dirAvg.down[ax]), hi = Math.max(u, d), lo = Math.min(u, d);
        if (lo > 0 && hi / lo > 1.35 && hi > 0.4 * (ax === 'z' ? L.a95v : L.a95h)) F.push({ key: 'dir-' + ax, title: 'Direction-dependent ' + AXN[ax] + ' vibration', level: 'medium',
          evidence: ['A95 ' + AXN[ax] + ' is ' + hi.toFixed(1) + ' mg going ' + (u > d ? 'up' : 'down') + ' and ' + lo.toFixed(1) + ' mg going ' + (u > d ? 'down' : 'up') + '.'],
          check: ax === 'z' ? ['Car / counterweight balance and load', 'Drive tuning for motoring vs regenerating', 'Brake drag'] : ['Car balance (load position)', 'Guide preload on one side', 'Travelling cable / compensation hanging'] });
      });
    } else warn.push('Record at least one run in each direction (up and down) to tell shaft items from car items.');
    var order = { high: 0, medium: 1, low: 2, ok: 3 };
    F.sort(function (a, b) { return order[a.level] - order[b.level]; });
    return { runs: runs, recurring: recurring, scaling: scal, findings: F, warnings: warn };
  }

  return { analyzeRun: analyzeRun, compare: compare, liftData: liftData, candidates: candidates };
});
