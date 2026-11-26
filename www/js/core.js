/*
 * core.js — Lift Ride Test v2: signal processing (same code in browser and Node)
 * Design & Developed by Md. Saiful Islam
 *
 * Method follows ISO 18738:2003 (Lifts - Measurement of lift ride quality):
 *   5.1   boundaries 0-3 (B1/B2 = 500 mm after start / before stop, from integrated height)
 *   5.2   acceleration/deceleration: 10 Hz 2-pole Butterworth low-pass of the unweighted z signal,
 *         max and A95 (5 %..95 % of max velocity)
 *   5.3   jerk: slope of a 0.5 s running least-squares line of the 10 Hz signal, max
 *   5.4   vibration: ISO 2631/8041 whole-body weighted x,y,z signals, peak-to-peak by the
 *         zero-crossing method (Annex A), max and A95; z split into constant and non-constant
 *         acceleration regions (Annex B)
 *   5.5   velocity: integration of the 10 Hz signal, max and V95
 * Sound level (5.6) is NOT measured. Phone MEMS sensors are not calibrated instruments.
 *
 * Accelerometer-only operation is first-class: the standard itself obtains speed and height by
 * integrating the vertical acceleration (rest-to-rest, zero-velocity corrected). A barometer is
 * optional and only improves height when present.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LiftCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var G0 = 9.80665;
  var SQ2 = Math.SQRT2;
  var MG = 1000 / G0; // m/s2 -> milli-g

  /* ---------------- defaults ---------------- */
  // ISO 18738 does not define acceptable values ("does not specify acceptable or unacceptable ride quality").
  // These are editable reference values for quick screening only.
  var DEFAULT_LIMITS = {
    accel: 1.0,    // m/s2  max acceleration
    decel: 1.0,    // m/s2  max deceleration
    jerk: 1.5,     // m/s3  max jerk
    a95v: 20,      // mg    A95 vertical peak-to-peak (constant-acceleration region)
    a95h: 15,      // mg    A95 horizontal peak-to-peak
    comfort: 0.315 // m/s2  ISO 2631-1 weighted rms: "not uncomfortable" boundary
  };
  var DEFAULTS = {
    fs: 0,            // 0 = automatic (50 / 100 / 200 Hz)
    calibStart: 0.5,  // s  skip (touch of the Start button)
    calibSec: 3.0,    // s  still window used for gravity / axes / noise floor
    tapTrim: 0.5,     // s  ignored at the end of the recording (touch of the Stop button)
    lpDyn: 10,        // Hz acceleration / jerk low-pass (ISO 18738 Table 1: 10 Hz, 2-pole Butterworth)
    vibLo: 0.5,       // Hz broadband (unweighted) band for spectrum / diagnostics
    vibHi: 80,        // Hz (limited to fs/2.5)
    bndDist: 0.5,     // m  boundary 1 / 2 distance (ISO 18738 5.1)
    tau: 2.0,         // s  barometer fusion time constant
    useBaro: true,
    knownHeight: null,
    ratedSpeed: null,
    rollerDiaMm: null,  // diagnostics (EVA-style): roller guide diameter
    sheaveDiaMm: null,  // diagnostics: traction sheave diameter
    limits: DEFAULT_LIMITS
  };

  /* ---------------- helpers ---------------- */
  function mean(a, i0, i1) {
    i0 = i0 || 0; i1 = (i1 === undefined) ? a.length : i1;
    var s = 0; for (var i = i0; i < i1; i++) s += a[i];
    return i1 > i0 ? s / (i1 - i0) : 0;
  }
  function std(a, i0, i1) {
    var m = mean(a, i0, i1), s = 0; i0 = i0 || 0; i1 = (i1 === undefined) ? a.length : i1;
    for (var i = i0; i < i1; i++) s += (a[i] - m) * (a[i] - m);
    return i1 > i0 ? Math.sqrt(s / (i1 - i0)) : 0;
  }
  function percentile(arr, p) {
    if (!arr.length) return 0;
    var s = Array.prototype.slice.call(arr).sort(function (x, y) { return x - y; });
    var k = (s.length - 1) * p / 100, f = Math.floor(k), c = Math.min(f + 1, s.length - 1);
    return s[f] + (s[c] - s[f]) * (k - f);
  }
  function medianRate(t) {
    var d = [];
    for (var i = 1; i < t.length; i++) { var x = t[i] - t[i - 1]; if (x > 0) d.push(x); }
    if (!d.length) return 0;
    d.sort(function (a, b) { return a - b; });
    return 1 / d[Math.floor(d.length / 2)];
  }
  function maxAbs(a, i0, i1) { var m = 0; for (var i = i0; i < i1; i++) { var v = Math.abs(a[i]); if (v > m) m = v; } return m; }
  function round(x, d) { var k = Math.pow(10, d); return Math.round(x * k) / k; }

  /* ---------------- resample (linear) ---------------- */
  function resample(t, y, t0, fs, n) {
    var out = new Float64Array(n), j = 0, m = t.length;
    for (var i = 0; i < n; i++) {
      var tt = t0 + i / fs;
      while (j < m - 2 && t[j + 1] < tt) j++;
      var ta = t[j], tb = t[j + 1], f = tb > ta ? (tt - ta) / (tb - ta) : 0;
      if (f < 0) f = 0; if (f > 1) f = 1;
      out[i] = y[j] + (y[j + 1] - y[j]) * f;
    }
    return out;
  }

  /* ---------------- Butterworth (biquad cascade) + filtfilt ---------------- */
  function biquad(type, fc, fs, Q) {
    var w0 = 2 * Math.PI * fc / fs, cw = Math.cos(w0), sw = Math.sin(w0), al = sw / (2 * Q);
    var b0, b1, b2;
    if (type === 'low') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
    else { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
    var a0 = 1 + al;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: -2 * cw / a0, a2: (1 - al) / a0 };
  }
  function butter(type, order, fc, fs) {
    var secs = [];
    if (fc >= fs / 2) fc = fs / 2 * 0.98;
    for (var k = 1; k <= order / 2; k++) {
      var Q = 1 / (2 * Math.cos((2 * k - 1) * Math.PI / (2 * order)));
      secs.push(biquad(type, fc, fs, Q));
    }
    return secs;
  }
  function runSections(secs, x) {
    var y = Float64Array.from(x);
    for (var s = 0; s < secs.length; s++) {
      var c = secs[s], z1 = 0, z2 = 0;
      for (var i = 0; i < y.length; i++) {
        var xi = y[i], yo = c.b0 * xi + z1;
        z1 = c.b1 * xi - c.a1 * yo + z2;
        z2 = c.b2 * xi - c.a2 * yo;
        y[i] = yo;
      }
    }
    return y;
  }
  function filtfilt(secs, x) {
    var n = x.length, pad = Math.min(n - 1, 400), i;
    var ext = new Float64Array(n + 2 * pad);
    for (i = 0; i < pad; i++) { ext[pad - 1 - i] = 2 * x[0] - x[i + 1]; ext[pad + n + i] = 2 * x[n - 1] - x[n - 2 - i]; }
    ext.set(x, pad);
    var y = runSections(secs, ext); y.reverse();
    y = runSections(secs, y); y.reverse();
    return y.slice(pad, pad + n);
  }
  function lowpass(x, fc, fs, order) { return filtfilt(butter('low', order || 4, fc, fs), x); }
  function bandpass(x, lo, hi, fs) {
    return filtfilt(butter('high', 2, lo, fs), filtfilt(butter('low', 4, hi, fs), x));
  }
  function cumtrapz(x, dt, i0, i1) {
    var y = new Float64Array(x.length);
    for (var i = i0 + 1; i <= i1; i++) y[i] = y[i - 1] + 0.5 * (x[i] + x[i - 1]) * dt;
    for (i = i1 + 1; i < x.length; i++) y[i] = y[i1];
    return y;
  }

  /* ---------------- FFT and spectra ---------------- */
  function fft(re, im) {
    var n = re.length, i, j, bit, t;
    for (i = 1, j = 0; i < n; i++) {
      bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (j = 0; j < h; j++) {
          var ur = re[i + j], ui = im[i + j];
          var xr = re[i + j + h], xi = im[i + j + h];
          var vr = xr * cr - xi * ci, vi = xr * ci + xi * cr;
          re[i + j] = ur + vr; im[i + j] = ui + vi;
          re[i + j + h] = ur - vr; im[i + j + h] = ui - vi;
          var ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }
  function ifft(re, im) {
    var n = re.length, i;
    for (i = 0; i < n; i++) im[i] = -im[i];
    fft(re, im);
    for (i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n; }
  }
  function nextPow2(n) { var N = 1; while (N < n) N <<= 1; return N; }
  // one-sided mean-square spectrum: sum(ms) = mean-square of the signal (Parseval)
  function msSpectrum(x, fs, hann) {
    var n = x.length, N = nextPow2(n);
    var re = new Float64Array(N), im = new Float64Array(N), i;
    var w2 = 0;
    for (i = 0; i < n; i++) {
      var w = hann ? 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / n) : 1;
      re[i] = x[i] * w; w2 += w * w;
    }
    var corr = hann ? n / w2 : 1;
    fft(re, im);
    var K = N / 2 + 1, ms = new Float64Array(K), f = new Float64Array(K);
    for (i = 0; i < K; i++) {
      var p = (re[i] * re[i] + im[i] * im[i]) / (N * n) * corr;
      ms[i] = (i === 0 || i === N / 2) ? p : 2 * p;
      f[i] = i * fs / N;
    }
    return { f: f, ms: ms };
  }
  // narrow-band single-sided amplitude spectrum (peak amplitude of sinusoids), Hann window, zero-padded x2
  function ampSpectrum(x, fs) {
    var n = x.length, N = nextPow2(n) * 2, i, m = mean(x);
    var re = new Float64Array(N), im = new Float64Array(N), ws = 0;
    for (i = 0; i < n; i++) { var w = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / n); re[i] = (x[i] - m) * w; ws += w; }
    fft(re, im);
    var K = N / 2 + 1, a = new Float64Array(K), f = new Float64Array(K);
    for (i = 0; i < K; i++) { a[i] = 2 * Math.sqrt(re[i] * re[i] + im[i] * im[i]) / ws; f[i] = i * fs / N; }
    return { f: f, a: a };
  }
  function topPeaks(sp, fmin, fmax, count) {
    var pk = [], i;
    for (i = 1; i < sp.f.length - 1; i++) {
      if (sp.f[i] < fmin || sp.f[i] > fmax) continue;
      if (sp.a[i] > sp.a[i - 1] && sp.a[i] >= sp.a[i + 1]) pk.push({ f: sp.f[i], a: sp.a[i] });
    }
    pk.sort(function (x, y) { return y.a - x.a; });
    var out = [];
    for (i = 0; i < pk.length && out.length < count; i++) {
      var close = out.some(function (o) { return Math.abs(o.f - pk[i].f) < 0.6; });
      if (!close) out.push(pk[i]);
    }
    return out;
  }

  /* ---------------- generic frequency-domain filter (zero or linear phase handled by H) ---------------- */
  function freqFilter(x, fs, Hfn) {
    var n = x.length, pad = Math.min(n - 1, Math.round(5 * fs)), i;
    var m = mean(x), L = n + 2 * pad, N = nextPow2(L);
    var re = new Float64Array(N), im = new Float64Array(N);
    for (i = 0; i < pad; i++) { re[pad - 1 - i] = 2 * (x[0] - m) - (x[i + 1] - m); re[pad + n + i] = 2 * (x[n - 1] - m) - (x[n - 2 - i] - m); }
    for (i = 0; i < n; i++) re[pad + i] = x[i] - m;
    fft(re, im);
    var half = N / 2;
    for (var k = 0; k <= half; k++) {
      var H = Hfn(k * fs / N), a = re[k], b = im[k];
      re[k] = a * H[0] - b * H[1]; im[k] = a * H[1] + b * H[0];
      if (k > 0 && k < half) {
        var k2 = N - k, c = re[k2], d = im[k2];
        re[k2] = c * H[0] + d * H[1]; im[k2] = d * H[0] - c * H[1]; // conj(H)
      }
    }
    ifft(re, im);
    var h0 = Hfn(0)[0], out = new Float64Array(n);
    for (i = 0; i < n; i++) out[i] = re[pad + i] + m * h0;
    return out;
  }
  // ISO 18738 Table 1: 2-pole Butterworth low-pass. Magnitude exactly as the standard filter, applied zero-phase
  // (no time shift, so peaks stay aligned with the other signals).
  function isoLowpass(x, fc, fs, order) {
    order = order || 2;
    return freqFilter(x, fs, function (f) { return [1 / Math.sqrt(1 + Math.pow(f / fc, 2 * order)), 0]; });
  }

  /* ---------------- ISO 2631-1 / ISO 8041 whole-body weighting (Wk: z, Wd: x,y) ---------------- */
  var W_PARAMS = {
    Wk: { f1: 0.4, f2: 100, f3: 12.5, f4: 12.5, q4: 0.63, f5: 2.37, q5: 0.91, f6: 3.35, q6: 0.91, k: 1 },
    Wd: { f1: 0.4, f2: 100, f3: 2.0, f4: 2.0, q4: 0.63, f5: 0, q5: 1, f6: 0, q6: 1, k: 1 }
  };
  function cmul(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
  function cdiv(a, b) { var d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; }
  function weightH(name, f) {
    var p = W_PARAMS[name], T = 2 * Math.PI, w = T * f;
    if (w === 0) return [0, 0];
    var w1 = T * p.f1, w2 = T * p.f2, w3 = T * p.f3, w4 = T * p.f4;
    var Hh = cdiv([-w * w, 0], [w1 * w1 - w * w, SQ2 * w1 * w]);
    var Hl = cdiv([w2 * w2, 0], [w2 * w2 - w * w, SQ2 * w2 * w]);
    var Ht = cdiv([1, w / w3], [1 - w * w / (w4 * w4), w / (p.q4 * w4)]);
    var H = cmul(cmul(Hh, Hl), Ht);
    if (p.f5 > 0) {
      var w5 = T * p.f5, w6 = T * p.f6;
      H = cmul(H, cdiv([w5 * w5 - w * w, w5 * w / p.q5], [w6 * w6 - w * w, w6 * w / p.q6]));
    }
    return [p.k * H[0], p.k * H[1]];
  }
  function weightMag(name, f) { var H = weightH(name, f); return Math.sqrt(H[0] * H[0] + H[1] * H[1]); }
  // time-domain weighted signal (ISO 18738 4.3)
  function weightSignal(x, fs, name) { return freqFilter(x, fs, function (f) { return weightH(name, f); }); }
  function weightedRms(x, fs, name) {
    var sp = msSpectrum(x, fs, false), s = 0;
    for (var i = 1; i < sp.f.length; i++) { var wm = weightMag(name, sp.f[i]); s += sp.ms[i] * wm * wm; }
    return Math.sqrt(s);
  }
  // ISO 2631-1 Annex C - perceived comfort (weighted rms, m/s2). This is a supplement, not part of ISO 18738.
  var COMFORT = [
    { max: 0.315, text: 'Not uncomfortable', level: 0 },
    { max: 0.63, text: 'A little uncomfortable', level: 1 },
    { max: 1.0, text: 'Fairly uncomfortable', level: 2 },
    { max: 1.6, text: 'Uncomfortable', level: 3 },
    { max: 2.5, text: 'Very uncomfortable', level: 4 },
    { max: Infinity, text: 'Extremely uncomfortable', level: 5 }
  ];
  function comfortOf(aw) {
    for (var i = 0; i < COMFORT.length; i++) if (aw < COMFORT[i].max) return COMFORT[i];
    return COMFORT[COMFORT.length - 1];
  }
  function thirdOctave(sp, fmax) {
    var out = { fc: [], rms: [] };
    for (var n = -3; n <= 20; n++) {
      var fc = Math.pow(10, n / 10);
      if (fc > fmax) break;
      var lo = fc * Math.pow(10, -0.05), hi = fc * Math.pow(10, 0.05), s = 0;
      for (var i = 0; i < sp.f.length; i++) if (sp.f[i] >= lo && sp.f[i] < hi) s += sp.ms[i];
      out.fc.push(fc); out.rms.push(Math.sqrt(s));
    }
    return out;
  }
  function isoCurve(fcList, name, awLimit) {
    return fcList.map(function (f) { var w = weightMag(name, f); return w > 1e-6 ? awLimit / w : null; });
  }

  /* ---------------- ISO 18738 building blocks ---------------- */
  // slope of the mid-point of a running least-squares line (window in seconds)
  function lsqSlope(y, winSec, fs) {
    var n = y.length, N = Math.max(3, Math.round(winSec * fs)); if (N % 2 === 0) N++;
    var half = (N - 1) / 2, out = new Float64Array(n), i, k;
    for (i = 0; i < n; i++) {
      var hh = Math.min(half, i, n - 1 - i);
      if (hh < 1) { out[i] = 0; continue; }
      var num = 0, den = 0;
      for (k = -hh; k <= hh; k++) { num += k * y[i + k]; den += k * k; }
      out[i] = num / den * fs;
    }
    return out;
  }
  // Annex A: peak-to-peak levels between zero crossings 1-3, 2-4, 3-5 ...
  function ppLevels(sig, i0, i1) {
    var zc = [], k, out = { p: [], s: [], e: [], pk: [] };
    i0 = Math.max(0, i0); i1 = Math.min(sig.length - 1, i1);
    for (k = i0; k < i1; k++) { var a = sig[k], b = sig[k + 1]; if ((a < 0 && b >= 0) || (a > 0 && b <= 0)) zc.push(k); }
    for (var j = 0; j + 2 < zc.length; j++) {
      var s = zc[j] + 1, e = zc[j + 2], mx = -Infinity, mn = Infinity, am = 0, ia = s;
      for (k = s; k <= e; k++) { var v = sig[k]; if (v > mx) mx = v; if (v < mn) mn = v; if (Math.abs(v) > am) { am = Math.abs(v); ia = k; } }
      out.p.push(Math.max(0, mx) + Math.abs(Math.min(0, mn))); out.s.push(s); out.e.push(e); out.pk.push(ia);
    }
    return out;
  }
  function ppSummary(lv, pred) {
    var vals = [], idx = [], i;
    for (i = 0; i < lv.p.length; i++) if (!pred || pred(lv.s[i], lv.e[i], lv.pk[i])) { vals.push(lv.p[i]); idx.push(i); }
    if (!vals.length) return { n: 0, max: 0, a95: 0, idx: idx };
    return { n: vals.length, max: Math.max.apply(null, vals) * MG, a95: percentile(vals, 95) * MG, idx: idx };
  }
  function zeroPeak(sig, mask, i0, i1) {
    var m = 0; for (var i = i0; i <= i1; i++) if ((!mask || mask[i]) && Math.abs(sig[i]) > m) m = Math.abs(sig[i]);
    return m * MG;
  }
  function prefix(mask) { var p = new Int32Array(mask.length + 1); for (var i = 0; i < mask.length; i++) p[i + 1] = p[i] + (mask[i] ? 1 : 0); return p; }

  /* ---------------- main analysis ---------------- */
  function analyze(raw, userOpts) {
    var o = Object.assign({}, DEFAULTS, userOpts || {});
    o.limits = Object.assign({}, DEFAULT_LIMITS, (userOpts && userOpts.limits) || {});
    var warnings = [], i;
    var n0 = raw.t.length;
    if (n0 < 300) throw new Error('Recording is too short. Record at least 15 seconds including the ride.');
    var rate = medianRate(raw.t);
    var fs = o.fs || (rate >= 180 ? 200 : rate >= 90 ? 100 : 50);
    if (rate < 45) warnings.push('Sensor rate is low (' + rate.toFixed(0) + ' Hz); jerk and vibration will be less accurate.');
    var t0 = raw.t[0], Tfull = raw.t[n0 - 1] - t0;
    var T = Tfull > 20 ? Tfull - o.tapTrim : Tfull; // ignore the touch of the Stop button
    var n = Math.floor(T * fs) + 1, dt = 1 / fs;

    var ax = resample(raw.t, raw.ax, t0, fs, n), ay = resample(raw.t, raw.ay, t0, fs, n), az = resample(raw.t, raw.az, t0, fs, n);

    /* --- calibration: gravity vector and axes (ISO 18738 3.6: z vertical; x,y horizontal) --- */
    var c0 = Math.floor(o.calibStart * fs), c1 = Math.min(Math.floor(o.calibSec * fs), Math.floor(n / 3));
    if (c1 - c0 < fs) throw new Error('At least 2 seconds of still data are needed at the start for calibration.');
    var gx = mean(ax, c0, c1), gy = mean(ay, c0, c1), gz = mean(az, c0, c1);
    var gm = Math.sqrt(gx * gx + gy * gy + gz * gz);
    if (gm < 8.5 || gm > 11) warnings.push('Gravity reading is unusual (' + gm.toFixed(2) + ' m/s2). Check the sensor or phone.');
    var ux = gx / gm, uy = gy / gm, uz = gz / gm;
    var d = ux;
    var e1x = 1 - d * ux, e1y = -d * uy, e1z = -d * uz;
    var e1n = Math.sqrt(e1x * e1x + e1y * e1y + e1z * e1z);
    if (e1n < 0.2) { e1x = -uy * ux; e1y = 1 - uy * uy; e1z = -uy * uz; e1n = Math.sqrt(e1x * e1x + e1y * e1y + e1z * e1z); }
    e1x /= e1n; e1y /= e1n; e1z /= e1n;
    var e2x = uy * e1z - uz * e1y, e2y = uz * e1x - ux * e1z, e2z = ux * e1y - uy * e1x;
    var av = new Float64Array(n), h1 = new Float64Array(n), h2 = new Float64Array(n);
    for (i = 0; i < n; i++) {
      av[i] = ax[i] * ux + ay[i] * uy + az[i] * uz - gm;
      h1[i] = ax[i] * e1x + ay[i] * e1y + az[i] * e1z;
      h2[i] = ax[i] * e2x + ay[i] * e2y + az[i] * e2z;
    }
    var m1 = mean(h1, c0, c1), m2 = mean(h2, c0, c1);
    for (i = 0; i < n; i++) { h1[i] -= m1; h2[i] -= m2; }
    // v2.1.1: the first calibStart seconds hold the touch of the Start button (and, on some phones, a few
    // warm-up samples). They are never evaluated, but the zero-phase filters would smear a jolt there into
    // the still window and the vibration plots. Hold them at the still-window level instead.
    var avRef = mean(av, c0, c1);
    for (i = 0; i < c0; i++) { av[i] = avRef; h1[i] = 0; h2[i] = 0; }
    var calibStd = std(av, c0, c1);
    var magStd = Math.sqrt(Math.pow(std(ax, c0, c1), 2) + Math.pow(std(ay, c0, c1), 2) + Math.pow(std(az, c0, c1), 2));
    if (magStd > 0.10) warnings.push('The phone was not still during the first 3 seconds (movement ' + magStd.toFixed(2) + ' m/s2). Accuracy may be reduced.');

    /* --- motion detection --- */
    var lp2 = lowpass(av, 2, fs, 2);
    var thr = Math.max(0.05, 5 * std(lp2, c0, c1));
    var minRun = Math.floor(0.2 * fs), first = -1, last = -1, run = 0;
    for (i = c1; i < n; i++) {
      if (Math.abs(lp2[i]) > thr) { run++; if (run >= minRun && first < 0) first = i - run + 1; } else run = 0;
    }
    run = 0;
    for (i = n - 1; i >= c1; i--) {
      if (Math.abs(lp2[i]) > thr) { run++; if (run >= minRun && last < 0) last = i + run - 1; } else run = 0;
    }
    if (first < 0 || last < 0 || last - first < fs) throw new Error('No lift motion was detected. Place the phone flat on the car floor and try again.');
    var s = Math.max(c1, first - Math.floor(1.0 * fs)), e = Math.min(n - 1, last + Math.floor(1.0 * fs));
    if (n - 1 - last < Math.floor(0.7 * fs)) warnings.push('Not enough still time after the lift stopped (wait at least 2 seconds). Speed and height may be inaccurate.');
    var endStill = std(lp2, Math.min(n - 2, last + Math.floor(0.5 * fs)), n);
    if (n - 1 - last >= Math.floor(0.7 * fs) && endStill > 0.08) warnings.push('The lift or phone had not fully stopped at the end; speed/height correction is less accurate.');

    /* --- ISO 18738 5.2: 10 Hz 2-pole low-pass of the unweighted z signal --- */
    var lpHz = Math.max(1, o.lpDyn);
    var z10 = isoLowpass(av, Math.min(lpHz, fs / 2.2), fs, 2);

    /* --- bias (rest-to-rest) and accelerometer-only speed / height (ISO 18738 5.5.1: integration) --- */
    var bias = mean(z10, s, e + 1);
    var ac = new Float64Array(n);
    for (i = s; i <= e; i++) ac[i] = z10[i] - bias;
    var tMotion = (e - s) / fs;
    // drift indicator: velocity error that would remain if only the still-calibration offset were removed
    var vDrift = Math.abs(bias) * tMotion;
    var vA = cumtrapz(ac, dt, s, e);
    var vEnd = vA[e];
    for (i = s; i <= e; i++) vA[i] -= vEnd * (i - s) / (e - s);
    for (i = e + 1; i < n; i++) vA[i] = 0;
    var hA = cumtrapz(vA, dt, s, e);
    var dhAccel = hA[e] - hA[s];
    var hUncertAccel = 0.5 * vDrift * tMotion * 0.5; // indicative: half of the drift-ramp area
    if (vDrift > 0.15) warnings.push('Large sensor offset drift during the ride (about ' + vDrift.toFixed(2) + ' m/s). Height from the accelerometer alone may be off by ~' + hUncertAccel.toFixed(1) + ' m; enter the known travel height to correct it.');

    /* --- optional barometer fusion --- */
    var hb = null, dhBaro = null, baroNoise = null;
    var v = vA, h = hA, method = 'accel';
    if (o.useBaro && raw.p && raw.pt && raw.p.length > 60) {
      var pr = resample(raw.pt, raw.p, t0, fs, n);
      var pref = mean(pr, c0, c1), prl = lowpass(pr, 0.8, fs, 2);
      hb = new Float64Array(n);
      for (i = 0; i < n; i++) hb[i] = 44330 * (1 - Math.pow(prl[i] / pref, 0.1903));
      var hbRef = mean(hb, c0, c1); for (i = 0; i < n; i++) hb[i] -= hbRef;
      baroNoise = std(hb, c0, c1);
      if (baroNoise > 0.5) warnings.push('Barometer noise is high (+/-' + baroNoise.toFixed(2) + ' m); its weight in the fusion was reduced.');
      var tau = baroNoise > 0.5 ? o.tau * 2.5 : o.tau;
      var k1 = 2 / tau, k2 = 1 / (tau * tau);
      var hf = new Float64Array(n), vf = new Float64Array(n), hh = 0, vv = 0;
      for (i = s; i <= e; i++) {
        var err = hb[i] - hh;
        vv += (ac[i] + k2 * err) * dt;
        hh += (vv + k1 * err) * dt;
        hf[i] = hh; vf[i] = vv;
      }
      for (i = e + 1; i < n; i++) { hf[i] = hf[e]; vf[i] = 0; }
      var hs0 = mean(hb, s, s + fs), he0 = mean(hb, Math.max(s, e - fs), e + 1);
      dhBaro = he0 - hs0;
      h = hf; v = vf; method = 'fusion';
      if (Math.abs(dhBaro - dhAccel) > Math.max(0.6, 0.06 * Math.abs(dhAccel)))
        warnings.push('Barometer and accelerometer heights disagree (diff ' + (dhBaro - dhAccel).toFixed(2) + ' m). Cabin pressure can change in a closed car.');
    }

    /* --- scale to a known height --- */
    var dh = h[e] - h[s], scale = 1;
    if (o.knownHeight && Math.abs(dh) > 0.5) {
      scale = o.knownHeight / Math.abs(dh);
      if (Math.abs(scale - 1) > 0.25) warnings.push('Entered height differs from the measured height by ' + Math.round(Math.abs(scale - 1) * 100) + '%. Check the phone placement and data.');
      var hn = new Float64Array(n), vn = new Float64Array(n);
      for (i = 0; i < n; i++) { hn[i] = h[i] * scale; vn[i] = v[i] * scale; }
      h = hn; v = vn; dh = h[e] - h[s];
    }
    var dir = dh >= 0 ? 1 : -1;

    /* --- acceleration, deceleration, jerk (5.2, 5.3) --- */
    var afl = new Float64Array(n);
    for (i = s; i <= e; i++) afl[i] = dir * ac[i];
    var jerk = lsqSlope(afl, 0.5, fs);
    for (i = 0; i < s; i++) jerk[i] = 0; for (i = e + 1; i < n; i++) jerk[i] = 0;
    var aMax = 0, dMax = 0;
    for (i = s; i <= e; i++) { if (afl[i] > aMax) aMax = afl[i]; if (-afl[i] > dMax) dMax = -afl[i]; }
    var jAbs = []; for (i = s; i <= e; i++) jAbs.push(Math.abs(jerk[i]));
    var jMax = maxAbs(jerk, s, e + 1), jP95 = percentile(jAbs, 95);

    /* --- speed landmarks --- */
    var vd = new Float64Array(n); for (i = 0; i < n; i++) vd[i] = dir * v[i];
    var vpk = 0; for (i = s; i <= e; i++) if (vd[i] > vpk) vpk = vd[i];
    var tv0 = s, tv1 = e;
    for (i = s; i <= e; i++) if (Math.abs(vd[i]) > 0.02 * vpk) { tv0 = i; break; }
    for (i = e; i >= s; i--) if (Math.abs(vd[i]) > 0.02 * vpk) { tv1 = i; break; }
    var mid = Math.floor((tv0 + tv1) / 2);
    var i5 = -1, i95 = -1, d95 = -1, d5 = -1;
    for (i = tv0; i <= mid; i++) { if (i5 < 0 && vd[i] >= 0.05 * vpk) i5 = i; if (vd[i] >= 0.95 * vpk) { i95 = i; break; } }
    for (i = tv1; i >= mid; i--) { if (d5 < 0 && vd[i] >= 0.05 * vpk) d5 = i; if (vd[i] >= 0.95 * vpk) { d95 = i; break; } }
    var aA95 = 0, dA95 = 0;
    if (i5 >= 0 && i95 > i5) { var aa = []; for (i = i5; i <= i95; i++) aa.push(afl[i]); aA95 = percentile(aa, 95); }
    if (d95 >= 0 && d5 > d95) { var dd = []; for (i = d95; i <= d5; i++) dd.push(-afl[i]); dA95 = percentile(dd, 95); }
    // V95 (5.5.3): from (95 % of vmax during acceleration + 1 s) to (95 % of vmax during deceleration - 1 s)
    var v95 = vpk, v95ok = false;
    if (i95 >= 0 && d95 >= 0) {
      var va = i95 + Math.floor(fs), vb = d95 - Math.floor(fs);
      if (vb > va) { var vv95 = []; for (i = va; i <= vb; i++) vv95.push(Math.abs(vd[i])); v95 = percentile(vv95, 95); v95ok = true; }
    }
    if (!v95ok) warnings.push('The ride is too short to compute V95 (needs >2 s at full speed); the peak speed is shown instead.');

    /* --- boundaries 0-3 (5.1) --- */
    var bnd = o.bndDist, b0 = c1, b3 = n - 1, b1 = tv0, b2 = tv1, bFallback = false;
    var hp = new Float64Array(n); for (i = 0; i < n; i++) hp[i] = dir * (h[i] - h[tv0]);
    var hTot = hp[tv1];
    if (hTot > 2.2 * bnd) {
      for (i = tv0; i <= tv1; i++) if (hp[i] >= bnd) { b1 = i; break; }
      for (i = tv1; i >= tv0; i--) if (hTot - hp[i] >= bnd) { b2 = i; break; }
    } else { bFallback = true; warnings.push('Travel is shorter than ' + (2.2 * bnd).toFixed(1) + ' m, so boundaries 1 and 2 were set at the start and stop of motion.'); }

    /* --- weighted vibration signals and peak-to-peak levels (5.4, Annex A) --- */
    var wz = weightSignal(av, fs, 'Wk'), wx = weightSignal(h1, fs, 'Wd'), wy = weightSignal(h2, fs, 'Wd');
    // Annex B: constant / non-constant acceleration regions
    var zSlow = isoLowpass(z10, 1.0, fs, 2);
    var slope1 = lsqSlope(zSlow, 1.0, fs);
    var nonc = new Uint8Array(n), cons = new Uint8Array(n), half5 = Math.floor(0.5 * fs);
    for (i = b0; i <= b3; i++) {
      if (Math.abs(slope1[i]) > 0.3) { var a1 = Math.max(b0, i - half5), a2 = Math.min(b3, i + half5); for (var q = a1; q <= a2; q++) nonc[q] = 1; }
    }
    for (i = b1; i <= b2; i++) cons[i] = nonc[i] ? 0 : 1;
    var pc = prefix(cons);
    var lvZ = ppLevels(wz, b0, b3), lvX = ppLevels(wx, b1, b2), lvY = ppLevels(wy, b1, b2);
    var inCons = function (s0, e0) { return pc[e0 + 1] - pc[s0] === e0 - s0 + 1; };
    var zC = ppSummary(lvZ, inCons);
    var zN = ppSummary(lvZ, function (s0, e0, pk) { return nonc[pk] === 1; });
    if (zC.n < 2) {
      warnings.push('No clear constant-acceleration section was found (short ride?). Vertical vibration was evaluated over boundaries 1-2.');
      zC = ppSummary(lvZ, function (s0, e0) { return s0 >= b1 && e0 <= b2; });
    }
    var xS = ppSummary(lvX, null), yS = ppSummary(lvY, null);
    var zpZ = zeroPeak(wz, cons, b1, b2), zpX = zeroPeak(wx, null, b1, b2), zpY = zeroPeak(wy, null, b1, b2);
    var zpZN = zeroPeak(wz, nonc, b0, b3);

    /* --- sensor noise floor: same estimator on the still calibration window --- */
    var nfLv = function (sig) { var lv = ppLevels(sig, c0, c1); return lv.p.length ? percentile(lv.p, 95) * MG : 0; };
    var nfZ = nfLv(wz), nfH = Math.max(nfLv(wx), nfLv(wy));
    if (zC.a95 < 2 * nfZ) warnings.push('Vertical vibration is close to the phone sensor noise (~' + nfZ.toFixed(0) + ' mg). Treat this value as an indication only.');

    /* --- broadband (unweighted) vibration, for diagnostics and spectra --- */
    var vibHi = Math.min(o.vibHi, fs / 2.5);
    var vz = bandpass(av, o.vibLo, vibHi, fs), vx = bandpass(h1, o.vibLo, vibHi, fs), vy = bandpass(h2, o.vibLo, vibHi, fs);
    var bbLv = function (sig, region) { var lv = ppLevels(sig, b1, b2); return ppSummary(lv, region === 'cons' ? inCons : null); };
    var bb = { z: bbLv(vz, 'cons'), x: bbLv(vx), y: bbLv(vy) };

    /* --- spectrum region: longest steady-speed section --- */
    var cAcc = Math.max(0.05, 0.08 * Math.max(aMax, dMax));
    var cs0 = -1, cs1 = -1, bestLen = 0, curS = -1;
    for (i = s; i <= e + 1; i++) {
      var ok = i <= e && Math.abs(vd[i]) >= 0.9 * vpk && Math.abs(afl[i]) < cAcc;
      if (ok && curS < 0) curS = i;
      if (!ok && curS >= 0) { if (i - curS > bestLen) { bestLen = i - curS; cs0 = curS; cs1 = i - 1; } curS = -1; }
    }
    var constFound = bestLen >= Math.floor(1.0 * fs) && vpk > 0.3;
    if (constFound) { var mg = Math.floor(0.25 * fs); if (cs1 - cs0 > 4 * mg) { cs0 += mg; cs1 -= mg; } }
    if (!constFound) { cs0 = tv0; cs1 = tv1; warnings.push('No steady-speed section was found (short distance?). Spectra use the whole ride.'); }

    /* --- ISO 2631-1 weighted rms (supplement) and 1/3-octave spectrum --- */
    var segZ = av.slice(s, e + 1), segX = h1.slice(s, e + 1), segY = h2.slice(s, e + 1);
    var awZ = weightedRms(segZ, fs, 'Wk'), awX = weightedRms(segX, fs, 'Wd'), awY = weightedRms(segY, fs, 'Wd');
    var awMax = Math.max(awZ, awX, awY), comfort = comfortOf(awMax);
    var spZ = msSpectrum(vz.slice(cs0, cs1 + 1), fs, true), spX = msSpectrum(vx.slice(cs0, cs1 + 1), fs, true), spY = msSpectrum(vy.slice(cs0, cs1 + 1), fs, true);
    var bz = thirdOctave(spZ, vibHi), bx = thirdOctave(spX, vibHi), by = thirdOctave(spY, vibHi);
    var spectrum = {
      fc: bz.fc, z: Array.from(bz.rms), x: Array.from(bx.rms), y: Array.from(by.rms),
      isoZ1: isoCurve(bz.fc, 'Wk', o.limits.comfort), isoZ2: isoCurve(bz.fc, 'Wk', o.limits.comfort * 2),
      isoH1: isoCurve(bz.fc, 'Wd', o.limits.comfort), isoH2: isoCurve(bz.fc, 'Wd', o.limits.comfort * 2),
      nb: null, peaks: { z: [], x: [], y: [] }
    };
    // narrow-band amplitude spectrum (EVA-style FFT) over the steady-speed section
    var diag = { vSteady: 0, rollerHz: null, sheaveHz: null, matches: [] };
    if (cs1 - cs0 > 3 * fs) {
      var aZ = ampSpectrum(vz.slice(cs0, cs1 + 1), fs), aX = ampSpectrum(vx.slice(cs0, cs1 + 1), fs), aY = ampSpectrum(vy.slice(cs0, cs1 + 1), fs);
      var fmaxP = vibHi, nbF = [], nbZ = [], nbX = [], nbY = [], step = Math.max(1, Math.floor(aZ.f.length / 700));
      for (i = 0; i < aZ.f.length && aZ.f[i] <= fmaxP; i += step) {
        var mz = 0, mx2 = 0, my2 = 0;
        for (var u = i; u < Math.min(i + step, aZ.f.length); u++) { mz = Math.max(mz, aZ.a[u]); mx2 = Math.max(mx2, aX.a[u]); my2 = Math.max(my2, aY.a[u]); }
        nbF.push(aZ.f[i]); nbZ.push(mz * MG); nbX.push(mx2 * MG); nbY.push(my2 * MG);
      }
      spectrum.nb = { f: nbF, z: nbZ, x: nbX, y: nbY };
      var tp = function (sp) { return topPeaks(sp, 1.0, fmaxP, 3).map(function (p) { return { f: p.f, mg: p.a * MG }; }); };
      spectrum.peaks = { z: tp(aZ), x: tp(aX), y: tp(aY) };
      // roller guide / sheave rotation frequency: f = v / (pi * D)
      var vs = 0, cnt = 0; for (i = cs0; i <= cs1; i++) { vs += Math.abs(vd[i]); cnt++; }
      diag.vSteady = cnt ? vs / cnt : vpk;
      if (o.rollerDiaMm > 0) diag.rollerHz = diag.vSteady / (Math.PI * o.rollerDiaMm / 1000);
      if (o.sheaveDiaMm > 0) diag.sheaveHz = diag.vSteady / (Math.PI * o.sheaveDiaMm / 1000);
      [['Roller guide', diag.rollerHz], ['Traction sheave', diag.sheaveHz]].forEach(function (c) {
        if (!c[1]) return;
        [1, 2].forEach(function (mult) {
          var f0 = c[1] * mult, near = null;
          ['z', 'x', 'y'].forEach(function (ax2) {
            spectrum.peaks[ax2].forEach(function (p) { if (Math.abs(p.f - f0) <= Math.max(0.4, 0.06 * f0) && (!near || p.mg > near.mg)) near = { f: p.f, mg: p.mg, axis: ax2.toUpperCase() }; });
          });
          if (near) diag.matches.push({ part: c[0], harmonic: mult, f: f0, peak: near });
        });
      });
    }

    /* --- bumps: largest weighted vertical peak-to-peak events between boundaries 1-2, with position --- */
    var ev = [];
    for (i = 0; i < lvZ.p.length; i++) if (lvZ.s[i] >= b1 && lvZ.e[i] <= b2 && cons[lvZ.pk[i]]) ev.push({ t: lvZ.pk[i] / fs, pos: hp[lvZ.pk[i]], mg: lvZ.p[i] * MG });
    ev.sort(function (a, b) { return b.mg - a.mg; });
    var bumps = [];
    for (i = 0; i < ev.length && bumps.length < 5; i++) { if (!bumps.some(function (x) { return Math.abs(x.t - ev[i].t) < 0.5; })) bumps.push(ev[i]); }

    /* --- result --- */
    var res = {
      version: 2, standard: 'ISO 18738:2003',
      fs: fs, rawRate: rate, duration: T, n: n, method: method, hasBaro: !!hb,
      idx: { s: s, e: e, c0: c0, c1: c1, cs0: cs0, cs1: cs1, b0: b0, b1: b1, b2: b2, b3: b3 },
      t: Float64Array.from({ length: n }, function (_, k) { return k / fs; }),
      series: {
        av: Float64Array.from(av, function (x, k) { return (k >= s && k <= e) ? x - bias : 0; }),
        afl: afl, jerk: jerk, v: v, h: h, hb: hb, hAccel: hA, h1: h1, h2: h2,
        vz: vz, vx: vx, vy: vy, wz: wz, wx: wx, wy: wy, nonc: nonc, cons: cons
      },
      m: {
        height: Math.abs(dh), direction: dir > 0 ? 'up' : 'down',
        vPeak: vpk, v95: v95, v95ok: v95ok, rideTime: (tv1 - tv0) / fs,
        aMax: aMax, dMax: dMax, aA95: aA95, dA95: dA95, jMax: jMax, jP95: jP95,
        // ISO 18738 6.5 b) ride quality results (mg = milli-g, peak-to-peak)
        x: { max: xS.max, a95: xS.a95, zp: zpX }, y: { max: yS.max, a95: yS.a95, zp: zpY },
        zC: { max: zC.max, a95: zC.a95, zp: zpZ, n: zC.n }, zN: { max: zN.max, a95: zN.a95, zp: zpZN, n: zN.n },
        a95z: zC.a95, a95x: xS.a95, a95y: yS.a95, maxppZ: zC.max, maxppX: xS.max, maxppY: yS.max, maxppZN: zN.max,
        bb: { z: { max: bb.z.max, a95: bb.z.a95 }, x: { max: bb.x.max, a95: bb.x.a95 }, y: { max: bb.y.max, a95: bb.y.a95 } },
        noiseFloorZ: nfZ, noiseFloorH: nfH,
        awZ: awZ, awX: awX, awY: awY, awMax: awMax, comfort: comfort.text, comfortLevel: comfort.level,
        constStart: cs0 / fs, constEnd: cs1 / fs, constFound: constFound,
        tB0: b0 / fs, tB1: b1 / fs, tB2: b2 / fs, tB3: b3 / fs, boundaryFallback: bFallback,
        scale: scale, bias: bias, gravity: gm, vDrift: vDrift, hUncertAccel: hUncertAccel,
        dhAccel: Math.abs(dhAccel), dhBaro: dhBaro === null ? null : Math.abs(dhBaro), baroNoise: baroNoise,
        calibNoise: calibStd, vibHi: vibHi, lpHz: lpHz
      },
      bumps: bumps,
      diag: diag,
      spectrum: spectrum,
      warnings: warnings,
      opts: { lpDyn: lpHz, vibLo: o.vibLo, tau: o.tau, knownHeight: o.knownHeight, ratedSpeed: o.ratedSpeed, rollerDiaMm: o.rollerDiaMm, sheaveDiaMm: o.sheaveDiaMm }
    };
    res.verdicts = evaluate(res.m, o.limits, o.ratedSpeed);
    return res;
  }

  /* ---------------- comparison with editable reference limits ---------------- */
  function evaluate(m, L, rated) {
    var list = [
      { key: 'accel', label: 'Max acceleration', value: m.aMax, limit: L.accel, unit: 'm/s²', dp: 2 },
      { key: 'decel', label: 'Max deceleration', value: m.dMax, limit: L.decel, unit: 'm/s²', dp: 2 },
      { key: 'jerk', label: 'Max jerk', value: m.jMax, limit: L.jerk, unit: 'm/s³', dp: 1 },
      { key: 'a95z', label: 'A95 vertical vibration, constant-accel. region (p-p)', value: m.a95z, limit: L.a95v, unit: 'mg', dp: 1 },
      { key: 'a95x', label: 'A95 horizontal X (p-p)', value: m.a95x, limit: L.a95h, unit: 'mg', dp: 1 },
      { key: 'a95y', label: 'A95 horizontal Y (p-p)', value: m.a95y, limit: L.a95h, unit: 'mg', dp: 1 },
      { key: 'aw', label: 'ISO 2631-1 weighted rms (worst axis)', value: m.awMax, limit: L.comfort, unit: 'm/s²', dp: 3 }
    ];
    list.forEach(function (it) { it.ok = it.value <= it.limit; });
    if (rated) list.push({ key: 'rated', label: 'Peak speed vs rated ' + rated + ' m/s', value: m.vPeak, limit: rated, unit: 'm/s', dp: 2, ok: Math.abs(m.vPeak - rated) <= 0.05 * rated, band: true });
    return list;
  }

  /* ---------------- CSV ---------------- */
  function toCSV(res, meta) {
    var lines = [], m = res.m;
    meta = meta || {};
    var q = function (s) { return String(s === undefined || s === null ? '' : s).replace(/[,\n\r]+/g, ' '); };
    lines.push('# Lift Ride Test v2 - ' + res.standard + ' method - Design & Developed by Md. Saiful Islam');
    lines.push('# building,' + q(meta.building) + ',lift,' + q(meta.lift) + ',from,' + q(meta.from) + ',to,' + q(meta.to) + ',date,' + q(meta.date) + ',method,' + res.method + ',fs_Hz,' + res.fs);
    lines.push('# height_m,' + m.height.toFixed(2) + ',vmax_mps,' + m.vPeak.toFixed(3) + ',V95_mps,' + m.v95.toFixed(3) + ',amax,' + m.aMax.toFixed(3) + ',A95acc,' + m.aA95.toFixed(3) + ',dmax,' + m.dMax.toFixed(3) + ',A95dec,' + m.dA95.toFixed(3) + ',jerk_max,' + m.jMax.toFixed(3));
    lines.push('# mg p-p: X max,' + m.x.max.toFixed(1) + ',X A95,' + m.x.a95.toFixed(1) + ',Y max,' + m.y.max.toFixed(1) + ',Y A95,' + m.y.a95.toFixed(1) + ',Z const max,' + m.zC.max.toFixed(1) + ',Z const A95,' + m.zC.a95.toFixed(1) + ',Z nonconst max,' + m.zN.max.toFixed(1));
    lines.push('t_s,a_vertical_mps2,a_10Hz_mps2,jerk_mps3,speed_mps,height_m,baro_height_m,horiz_x_mps2,horiz_y_mps2,w_z_mps2,w_x_mps2,w_y_mps2,region(1=const,2=nonconst)');
    var S = res.series;
    for (var i = 0; i < res.n; i++) {
      lines.push([res.t[i].toFixed(3), S.av[i].toFixed(4), S.afl[i].toFixed(4), S.jerk[i].toFixed(4), S.v[i].toFixed(4), S.h[i].toFixed(3), S.hb ? S.hb[i].toFixed(3) : '',
        S.h1[i].toFixed(4), S.h2[i].toFixed(4), S.wz[i].toFixed(5), S.wx[i].toFixed(5), S.wy[i].toFixed(5), S.cons[i] ? 1 : (S.nonc[i] ? 2 : 0)].join(','));
    }
    return lines.join('\n');
  }

  /* ---------------- sensor self-check (ISO 18738 4.6.3: 0 Hz accuracy check, noise, resolution) ---------------- */
  function staticCheck(raw) {
    var n = raw.t.length;
    if (n < 200) throw new Error('Sensor check needs at least 5 seconds of data.');
    var rate = medianRate(raw.t), i;
    var dts = []; for (i = 1; i < n; i++) dts.push(raw.t[i] - raw.t[i - 1]);
    var md = percentile(dts, 50), jit = std(dts) / md * 100;
    var skip = Math.floor(0.5 * rate), i1 = n;
    var gx = mean(raw.ax, skip, i1), gy = mean(raw.ay, skip, i1), gz = mean(raw.az, skip, i1);
    var gm = Math.sqrt(gx * gx + gy * gy + gz * gz);
    var sd = [std(raw.ax, skip, i1), std(raw.ay, skip, i1), std(raw.az, skip, i1)];
    var steps = [];
    [raw.ax, raw.ay, raw.az].forEach(function (a) {
      var u = Array.from(new Set(Array.prototype.slice.call(a, skip, Math.min(n, skip + 4000)))).sort(function (p, q) { return p - q; });
      for (var k = 1; k < u.length; k++) { var df = u[k] - u[k - 1]; if (df > 1e-9) steps.push(df); }
    });
    var step = steps.length ? percentile(steps, 10) : 0;
    // weighted vibration noise floor with the same estimator used in the analysis
    var fs = rate >= 180 ? 200 : rate >= 90 ? 100 : 50, N = Math.floor((raw.t[n - 1] - raw.t[0]) * fs) + 1, t0 = raw.t[0];
    var az = resample(raw.t, raw.az, t0, fs, N), azm = mean(az), azz = new Float64Array(N);
    for (i = 0; i < N; i++) azz[i] = az[i] - azm;
    var wz = weightSignal(azz, fs, 'Wk'), lv = ppLevels(wz, Math.floor(0.5 * fs), N - 1);
    var nfZ = lv.p.length ? percentile(lv.p, 95) * MG : 0;
    var errPct = (gm - G0) / G0 * 100;
    var checks = [
      { key: 'rate', label: 'Sampling rate', value: rate.toFixed(0) + ' Hz', ok: rate >= 95, note: rate >= 180 ? 'good for 0-80 Hz' : rate >= 95 ? 'usable up to ~40 Hz' : 'too low for ride-quality vibration' },
      { key: 'grav', label: 'Gravity (0 Hz accuracy)', value: gm.toFixed(3) + ' m/s² (' + (errPct >= 0 ? '+' : '') + errPct.toFixed(2) + ' %)', ok: Math.abs(errPct) <= 1.5, note: 'reference 9.807 m/s²; offset error is removed in each measurement' },
      { key: 'res', label: 'Resolution step', value: step > 1e-4 ? (step * 1000).toFixed(1) + ' mm/s²' : 'continuous (no visible steps)', ok: !step || step <= 0.01, note: 'ISO 18738 Table 1: 0.005-0.01 m/s²' },
      { key: 'noise', label: 'Noise rms (x / y / z)', value: sd.map(function (s) { return (s * 1000).toFixed(0); }).join(' / ') + ' mm/s²', ok: Math.max.apply(null, sd) <= 0.03, note: 'lower is better' },
      { key: 'nf', label: 'Vibration noise floor (weighted p-p A95)', value: nfZ.toFixed(1) + ' mg', ok: nfZ <= 8, note: 'vibration below about 2x this value is unreliable' }
    ];
    return { rate: rate, jitterPct: jit, gravity: gm, gravityErrPct: errPct, noiseRms: sd, step: step, nfZ: nfZ, checks: checks, ok: checks.every(function (c) { return c.ok; }), duration: raw.t[n - 1] - raw.t[0] };
  }

  /* ---------------- simulated data for demo and tests ---------------- */
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function simulateStill(sec, p) {
    p = Object.assign({ rate: 100, seed: 5, noise: 0.02, bias: [0.05, -0.04, 0.08], tilt: [3, 2] }, p || {});
    var rnd = mulberry32(p.seed), gauss = function () { return Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd()); };
    var raw = { t: [], ax: [], ay: [], az: [], pt: [], p: [] }, th = p.tilt[0] * Math.PI / 180, ph = p.tilt[1] * Math.PI / 180;
    for (var tt = 0; tt <= sec; tt += 1 / p.rate) {
      var x1 = Math.sin(th) * G0, y1 = 0, z1 = Math.cos(th) * G0;
      raw.t.push(tt + (rnd() - 0.5) * 0.002);
      raw.ax.push(x1 + p.bias[0] + gauss() * p.noise); raw.ay.push(Math.cos(ph) * y1 - Math.sin(ph) * z1 + p.bias[1] + gauss() * p.noise); raw.az.push(Math.sin(ph) * y1 + Math.cos(ph) * z1 + p.bias[2] + gauss() * p.noise);
    }
    return raw;
  }
  function simulateRun(p) {
    p = Object.assign({ height: 36, vmax: 2.5, amax: 1.0, jmax: 1.2, rate: 100, baroRate: 25, still0: 4.0, still1: 3.0, up: true, seed: 7, baro: true,
      vibZ: [[8, 0.035], [17, 0.025]], vibH: [[1.6, 0.04], [5.5, 0.03]], noise: 0.02, bias: [0.05, -0.04, 0.08], tilt: [4, 3], baroSigma: 0.02,
      door: false, bump: null }, p || {});
    var rnd = mulberry32(p.seed), gauss = function () { return Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd()); };
    var tj = p.amax / p.jmax, tc = Math.max(0, p.vmax / p.amax - tj);
    var Tacc = 2 * tj + tc, dAcc = p.vmax * Tacc / 2, tcr = (p.height - 2 * dAcc) / p.vmax;
    if (tcr < 0) throw new Error('simulateRun: height too small');
    var T = 2 * Tacc + tcr, dtI = 0.001, N = Math.floor(T / dtI) + 1;
    var a = new Float64Array(N), vel = new Float64Array(N), pos = new Float64Array(N);
    function jerkAt(t) {
      if (t < tj) return p.jmax; if (t < tj + tc) return 0; if (t < Tacc) return -p.jmax;
      if (t < Tacc + tcr) return 0; var u = t - Tacc - tcr;
      if (u < tj) return -p.jmax; if (u < tj + tc) return 0; if (u < Tacc) return p.jmax; return 0;
    }
    var aa = 0, vv = 0, pp = 0;
    for (var i = 0; i < N; i++) { var t = i * dtI; aa += jerkAt(t) * dtI; vv += aa * dtI; pp += vv * dtI; a[i] = aa; vel[i] = vv; pos[i] = pp; }
    var sgn = p.up ? 1 : -1, total = p.still0 + T + p.still1;
    var raw = { t: [], ax: [], ay: [], az: [], pt: [], p: [], truth: { height: pp * sgn, vmax: p.vmax, amax: p.amax, jmax: p.jmax, T: T, still0: p.still0, Tacc: Tacc, tcr: tcr } };
    var th = p.tilt[0] * Math.PI / 180, ph = p.tilt[1] * Math.PI / 180;
    var cth = Math.cos(th), sth = Math.sin(th), cph = Math.cos(ph), sph = Math.sin(ph);
    var dt = 1 / p.rate;
    function at(arr, t) { var k = t - p.still0; if (k < 0) return arr[0]; return arr[Math.min(N - 1, Math.floor(k / dtI))]; }
    for (var tt = 0; tt <= total; tt += dt) {
      var ts = tt + (rnd() - 0.5) * 0.002, mot = (tt >= p.still0 && tt <= p.still0 + T) ? 1 : 0;
      var az0 = (mot ? at(a, tt) * sgn : 0), vib = 0, hx = 0, hy = 0, k;
      for (k = 0; k < p.vibZ.length; k++) vib += mot * p.vibZ[k][1] * Math.sin(2 * Math.PI * p.vibZ[k][0] * tt + k);
      for (k = 0; k < p.vibH.length; k++) { hx += mot * p.vibH[k][1] * Math.sin(2 * Math.PI * p.vibH[k][0] * tt + 1 + k); hy += mot * p.vibH[k][1] * 0.8 * Math.sin(2 * Math.PI * p.vibH[k][0] * tt + 2 + k); }
      // door-close burst just before the car moves (belongs to boundary 0 region, not to constant speed)
      if (p.door && tt > p.still0 - 0.7 && tt < p.still0 - 0.2) vib += 0.08 * Math.sin(2 * Math.PI * 12 * tt) * Math.sin(Math.PI * (tt - (p.still0 - 0.7)) / 0.5);
      // a single rail-joint bump at the given time into the constant-speed part
      if (p.bump && tt > p.still0 + p.bump.t && tt < p.still0 + p.bump.t + 0.12) vib += p.bump.amp * Math.sin(2 * Math.PI * 9 * (tt - p.still0 - p.bump.t)) * Math.sin(Math.PI * (tt - p.still0 - p.bump.t) / 0.12);
      var wx = hx, wy = hy, wz = G0 + az0 + vib;
      var x1 = cth * wx + sth * wz, y1 = wy, z1 = -sth * wx + cth * wz;
      var dx = x1, dy = cph * y1 - sph * z1, dz = sph * y1 + cph * z1;
      raw.t.push(ts); raw.ax.push(dx + p.bias[0] + gauss() * p.noise); raw.ay.push(dy + p.bias[1] + gauss() * p.noise); raw.az.push(dz + p.bias[2] + gauss() * p.noise);
    }
    if (p.baro) {
      var db = 1 / p.baroRate;
      for (var tb = 0; tb <= total; tb += db) {
        var hh = at(pos, tb) * sgn;
        raw.pt.push(tb); raw.p.push(1008 * Math.pow(1 - hh / 44330, 5.255) + gauss() * p.baroSigma);
      }
    }
    return raw;
  }

  return {
    G0: G0, MG: MG, DEFAULTS: DEFAULTS, DEFAULT_LIMITS: DEFAULT_LIMITS, COMFORT: COMFORT, W_PARAMS: W_PARAMS,
    analyze: analyze, evaluate: evaluate, toCSV: toCSV, staticCheck: staticCheck, simulateRun: simulateRun, simulateStill: simulateStill,
    weightMag: weightMag, weightedRms: weightedRms, weightSignal: weightSignal, comfortOf: comfortOf, round: round,
    util: { mean: mean, std: std, percentile: percentile, butter: butter, filtfilt: filtfilt, lowpass: lowpass, bandpass: bandpass, isoLowpass: isoLowpass,
      msSpectrum: msSpectrum, ampSpectrum: ampSpectrum, thirdOctave: thirdOctave, resample: resample, medianRate: medianRate, lsqSlope: lsqSlope, ppLevels: ppLevels, freqFilter: freqFilter }
  };
});
