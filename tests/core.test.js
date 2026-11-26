/* Run with Node: node tests/core.test.js  — checks the ISO 18738 method blocks and end-to-end accuracy on simulated lifts */
const C = require('../www/js/core.js');
const U = C.util;
let fails = 0;
function check(name, ok, info) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!ok) fails++; }
const dB = x => 20 * Math.log10(x);
const sine = (f, A, fs, sec, ph = 0) => Float64Array.from({ length: Math.floor(fs * sec) }, (_, i) => A * Math.sin(2 * Math.PI * f * i / fs + ph));

/* 1) ISO 2631-1 weighting magnitudes vs published 1/3-octave values (dB) */
const ref = { Wk: { 1: -6.33, 2: -5.49, 4: -0.29, 8: 0.31, 16: -2.28 }, Wd: { 1: 0.10, 2: -1.01, 4: -5.82, 8: -11.93, 16: -18.03 } };
for (const name of ['Wk', 'Wd']) for (const f of [1, 2, 4, 8, 16]) {
  const fc = Math.pow(10, Math.round(Math.log10(f) * 10) / 10);
  const got = dB(C.weightMag(name, fc)), want = ref[name][f];
  check(`${name}(${f} Hz) ~ ${want} dB`, Math.abs(got - want) < 0.35, `got ${got.toFixed(2)} dB`);
}

/* 2) Time-domain weighting gives the same gain as the magnitude formula */
{
  const fs = 200, x = sine(8, 0.1, fs, 30), y = C.weightSignal(x, fs, 'Wk');
  let mx = 0; for (let i
= 3000; i < 5000; i++) mx = Math.max(mx, Math.abs(y[i]));
  const want = 0.1 * C.weightMag('Wk', 8);
  check('weightSignal Wk at 8 Hz: amplitude = 0.1 x |Wk(8)|', Math.abs(mx - want) / want < 0.03, `${mx.toFixed(4)} vs ${want.toFixed(4)}`);
  const x2 = sine(1, 0.1, fs, 30), y2 = C.weightSignal(x2, fs, 'Wd');
  let m2 = 0; for (let i = 3000; i < 5000; i++) m2 = Math.max(m2, Math.abs(y2[i]));
  const want2 = 0.1 * C.weightMag('Wd', 1);
  check('weightSignal Wd at 1 Hz', Math.abs(m2 - want2) / want2 < 0.04, `${m2.toFixed(4)} vs ${want2.toFixed(4)}`);
}

/* 3) ISO 18738 Table 1 low-pass: 2-pole Butterworth, -3 dB at 10 Hz */
{
  const fs = 200;
  const amp = (f) => { const y = U.isoLowpass(sine(f, 1, fs, 30), 10, fs, 2); let m = 0; for (let i = 3000; i < 5000; i++) m = Math.max(m, Math.abs(y[i])); return m; };
  check('10 Hz low-pass: gain at 10 Hz = 0.707', Math.abs(amp(10) - Math.SQRT1_2) < 0.01, amp(10).toFixed(3));
  check('10 Hz low-pass: gain at 2 Hz ~ 1', Math.abs(amp(2) - 1) < 0.01, amp(2).toFixed(3));
  check('10 Hz low-pass: gain at 40 Hz ~ 1/17 (12 dB/oct)', Math.abs(amp(40) - 1 / Math.sqrt(1 + Math.pow(4, 4))) < 0.01, amp(40).toFixed(4));
}

/* 4) Annex A peak-to-peak: a sine of amplitude A gives p-p = 2A */
{
  const fs = 200, x = sine(5, 0.05, fs, 10, 0.3), lv = U.ppLevels(x, 0, x.length - 1);
  const mx = Math.max(...lv.p), mn = Math.min(...lv.p);
  check('Annex A: sine A=0.05 -> p-p = 0.10', Math.abs(mx - 0.1) < 0.002 && Math.abs(mn - 0.1) < 0.004, `max ${mx.toFixed(4)} min ${mn.toFixed(4)}`);
}

/* 5) Running least-squares slope: a ramp of 2 m/s3 gives 2 */
{
  const fs = 100, y = Float64Array.from({ length: 1000 }, (_, i) => 2 * i / fs), s = U.lsqSlope(y, 0.5, fs);
  check('LSQ slope of ramp 2 m/s3', Math.abs(s[500] - 2) < 1e-6, s[500].toFixed(4));
}

/* 6) Simulated lifts: ISO 18738 quantities vs the known truth */
function run(label, simOpts, anOpts, tol) {
  const raw = C.simulateRun(simOpts), r = C.analyze(raw, anOpts || {}), tr = raw.truth, m = r.m;
  console.log(`  [${label}] method=${r.method} H=${m.height.toFixed(2)}(${Math.abs(tr.height).toFixed(2)}) vmax=${m.vPeak.toFixed(2)} V95=${m.v95.toFixed(2)} a=${m.aMax.toFixed(2)} A95a=${m.aA95.toFixed(2)} d=${m.dMax.toFixed(2)} A95d=${m.dA95.toFixed(2)} jerk=${m.jMax.toFixed(2)} | zC max/A95=${m.zC.max.toFixed(1)}/${m.zC.a95.toFixed(1)} zN max=${m.zN.max.toFixed(1)} x ${m.x.max.toFixed(1)}/${m.x.a95.toFixed(1)} y ${m.y.max.toFixed(1)}/${m.y.a95.toFixed(1)} mg`);
  if (r.warnings.length) console.log('   warnings:', r.warnings.join(' | '));
  const eh = Math.abs(m.height - Math.abs(tr.height)), ev = Math.abs(m.vPeak - tr.vmax) / tr.vmax;
  check(`${label}: height error <= ${tol.h} m`, eh <= tol.h, `${eh.toFixed(2)} m`);
  check(`${label}: max speed error <= ${tol.v * 100}%`, ev <= tol.v, `${(ev * 100).toFixed(1)}%`);
  const ta = tol.a || 0.08;
  check(`${label}: max accel ~ ${tr.amax} (+-${ta * 100}%)`, Math.abs(m.aMax - tr.amax) / tr.amax < ta, m.aMax.toFixed(3));
  check(`${label}: max decel ~ ${tr.amax} (+-${ta * 100}%)`, Math.abs(m.dMax - tr.amax) / tr.amax < ta, m.dMax.toFixed(3));
  check(`${label}: max jerk ~ ${tr.jmax} (+-12%)`, Math.abs(m.jMax - tr.jmax) / tr.jmax < 0.12, m.jMax.toFixed(3));
  check(`${label}: V95 close to rated speed`, Math.abs(m.v95 - tr.vmax) / tr.vmax < 0.04, m.v95.toFixed(3));
  return { r, raw };
}
const base = run('baro+accel, up', { seed: 7 }, {}, { h: 0.35, v: 0.04 });
run('accel-only, up', { seed: 8, baro: false }, {}, { h: 0.8, v: 0.05 });
run('baro+accel, down', { seed: 9, up: false }, {}, { h: 0.35, v: 0.04 });
run('100 Hz, high noise', { seed: 10, noise: 0.05, rate: 100 }, {}, { h: 0.6, v: 0.06, a: 0.12 }); // 10 Hz band keeps sensor noise (as the standard prescribes)
run('200 Hz', { seed: 11, rate: 200 }, {}, { h: 0.35, v: 0.04 });
run('known height scales', { seed: 12, baro: false }, { knownHeight: 36 }, { h: 0.05, v: 0.06 });

/* 7) Accelerometer-only statistics over many random runs (no barometer) */
{
  const errs = [], verrs = [];
  for (let sd = 20; sd < 32; sd++) {
    const raw = C.simulateRun({ seed: sd, baro: false, height: 20 + (sd % 5) * 8, vmax: 1.6 + (sd % 4) * 0.6, noise: 0.015 + (sd % 3) * 0.01, up: sd % 2 === 0 });
    const r = C.analyze(raw, {});
    errs.push(Math.abs(r.m.height - Math.abs(raw.truth.height))); verrs.push(Math.abs(r.m.vPeak - raw.truth.vmax) / raw.truth.vmax);
  }
  const mx = Math.max(...errs), mv = Math.max(...verrs);
  check('accelerometer-only, 12 random lifts: height error <= 0.6 m', mx <= 0.6, `worst ${mx.toFixed(2)} m, mean ${(errs.reduce((a, b) => a + b) / errs.length).toFixed(2)} m`);
  check('accelerometer-only, 12 random lifts: speed error <= 5%', mv <= 0.05, `worst ${(mv * 100).toFixed(1)}%`);
}

/* 8) Boundaries 1/2 are 500 mm from the start/stop of motion; regions follow Annex B */
{
  const raw = C.simulateRun({ seed: 7, baro: false, door: true }), r = C.analyze(raw, {}), m = r.m, S = r.series, fs = r.fs;
  const hAt = (t) => Math.abs(S.h[Math.round(t * fs)] - S.h[r.idx.s]);
  const dB1 = hAt(m.tB1) - 0, dB2 = Math.abs(m.height) - hAt(m.tB2);
  check('boundary 1 is ~0.5 m after the start of motion', Math.abs(dB1 - 0.5) < 0.1, dB1.toFixed(2) + ' m');
  check('boundary 2 is ~0.5 m before the stop', Math.abs(dB2 - 0.5) < 0.1, dB2.toFixed(2) + ' m');
  let nonInSteady = 0, steady = 0;
  for (let i = Math.round((raw.truth.still0 + raw.truth.Tacc + 1.5) * fs); i < Math.round((raw.truth.still0 + raw.truth.Tacc + raw.truth.tcr - 1.5) * fs); i++) { steady++; if (S.nonc[i]) nonInSteady++; }
  check('Annex B: steady-speed middle is entirely constant-acceleration region', nonInSteady === 0, `${nonInSteady}/${steady} samples flagged`);
  let acc = 0; const iA = Math.round((raw.truth.still0 + 0.5) * fs), iB = Math.round((raw.truth.still0 + 2.5) * fs);
  for (let i = iA; i < iB; i++) if (S.nonc[i]) acc++;
  check('Annex B: acceleration ramp is non-constant region', acc > 0.8 * (iB - iA), `${acc}/${iB - iA}`);
  check('door-close burst is not counted in the constant region', m.zC.max < 20, `zC max ${m.zC.max.toFixed(1)} mg vs zN max ${m.zN.max.toFixed(1)} mg`);
}

/* 9) Vibration levels (weighted, peak-to-peak) and a single bump with its position */
{
  const quiet = C.analyze(C.simulateRun({ seed: 5, noise: 0.003 }), {});
  check('A95 vertical (quiet): 9-16 mg', quiet.m.zC.a95 > 9 && quiet.m.zC.a95 < 16, quiet.m.zC.a95.toFixed(1) + ' (noise floor ' + quiet.m.noiseFloorZ.toFixed(1) + ')');
  const noisy = C.analyze(C.simulateRun({ seed: 7, noise: 0.05 }), {});
  check('noise floor tracks sensor noise', noisy.m.noiseFloorZ > 2 * quiet.m.noiseFloorZ, `${noisy.m.noiseFloorZ.toFixed(1)} vs ${quiet.m.noiseFloorZ.toFixed(1)}`);
  const raw = C.simulateRun({ seed: 6, noise: 0.004, baro: false, bump: { t: 8.0, amp: 0.2 } }), r = C.analyze(raw, {});
  const b = r.bumps[0], tTrue = raw.truth.still0 + 8.06;
  check('bump detected as the largest event', b && b.mg > 25, b ? b.mg.toFixed(1) + ' mg' : 'none');
  check('bump time within 0.2 s', b && Math.abs(b.t - tTrue) < 0.2, b ? `${b.t.toFixed(2)} s vs ${tTrue.toFixed(2)} s` : '');
  check('bump position in hoistway is plausible (inside the ride)', b && b.pos > 2 && b.pos < Math.abs(r.m.height) - 2, b ? b.pos.toFixed(1) + ' m' : '');
  const pk = r.spectrum.peaks.z[0];
  check('FFT peak list has the 9 Hz bump or the 8 Hz line', pk && (Math.abs(pk.f - 8) < 0.5 || Math.abs(pk.f - 9) < 0.7), pk ? pk.f.toFixed(2) + ' Hz' : 'none');
}

/* 10) Roller-guide diagnostics: f = v / (pi D) */
{
  const raw = C.simulateRun({ seed: 3, noise: 0.004, baro: false, vibZ: [[5.2, 0.06]], vmax: 2.5 });
  const r = C.analyze(raw, { rollerDiaMm: 152.4 });
  const want = 2.5 / (Math.PI * 0.1524);
  check('roller guide frequency from speed and diameter', r.diag.rollerHz && Math.abs(r.diag.rollerHz - want) < 0.25, (r.diag.rollerHz || 0).toFixed(2) + ' vs ' + want.toFixed(2));
  check('spectrum peak matched to roller guide frequency', r.diag.matches.some(x => x.part === 'Roller guide'), JSON.stringify(r.diag.matches.map(x => x.part + ' ' + x.peak.f.toFixed(1))));
}

/* 11) Warnings and errors */
{
  const shaky = C.simulateRun({ seed: 3, baro: true });
  for (let i = 0; i < 300; i++) shaky.ax[i] += 1.5 * Math.sin(i / 3);
  check('movement at the start gives a warning', C.analyze(shaky, {}).warnings.some(w => w.includes('not still')));
  const idle = C.simulateRun({ seed: 4, vmax: 2.5, height: 36 });
  for (let i = 0; i < idle.t.length; i++) { idle.az[i] = 9.80665 + 0.01 * Math.sin(i); idle.ax[i] = 0; idle.ay[i] = 0; }
  let threw = false; try { C.analyze(idle, {}); } catch (e) { threw = /No lift motion/.test(e.message); }
  check('no lift motion gives a clear error', threw);
  const tiny = C.simulateRun({ seed: 2, vmax: 1.0, height: 3, amax: 0.8, jmax: 1.0 });
  const rt = C.analyze(tiny, {});
  check('very short ride still analyses (boundary fallback warning)', rt.warnings.some(w => /shorter|too short|steady|constant/i.test(w)), rt.warnings.length + ' warnings');
}

/* 12) Sensor self-check and CSV */
{
  const st = C.staticCheck(C.simulateStill(10, { rate: 200, noise: 0.01 }));
  check('sensor check: gravity within 1.5% and noise floor reported', Math.abs(st.gravityErrPct) < 1.5 && st.nfZ > 0, `g ${st.gravity.toFixed(3)} nf ${st.nfZ.toFixed(1)} mg`);
  check('sensor check: bad (noisy) sensor is flagged', !C.staticCheck(C.simulateStill(10, { rate: 100, noise: 0.08 })).ok);
  const csv = C.toCSV(base.r, { lift: 'Test', date: '2026-11-24', building: 'B1', from: 'G', to: '12' });
  check('CSV header and rows', csv.split('\n').length > base.r.n && csv.includes('t_s,a_vertical') && csv.includes('ISO 18738:2003'));
}

/* 13) v2.1.1: a jolt or warm-up samples before calibStart must not leak into the still window / plots */
{
  const mk = () => C.simulateRun({ seed: 3, rate: 200, height: 38, vmax: 1.07, amax: 0.55, jmax: 0.5, still0: 35 });
  const clean = C.analyze(mk(), {});
  const zeros = mk(), jolt = mk();
  for (let i = 0; i < zeros.t.length; i++) {
    const t = zeros.t[i] - zeros.t[0];
    if (t < 0.1) { zeros.ax[i] = 0; zeros.ay[i] = 0; zeros.az[i] = 0; }
    if (t < 0.4) { jolt.az[i] += 2.5; jolt.ax[i] += 0.6; }
  }
  const maxAbs = a => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0) * 1000 / 9.80665;
  for (const [name, raw] of [['zero warm-up samples', zeros], ['jolt at Start', jolt]]) {
    const r = C.analyze(raw, {});
    check('start ' + name + ': noise floor unchanged', Math.abs(r.m.noiseFloorZ - clean.m.noiseFloorZ) < 0.2, r.m.noiseFloorZ.toFixed(2) + ' vs ' + clean.m.noiseFloorZ.toFixed(2));
    check('start ' + name + ': no false noise warning', !r.warnings.some(w => /sensor noise/.test(w)));
    check('start ' + name + ': vibration plot has no start spike', maxAbs(r.series.wz) < 2 * maxAbs(clean.series.wz) && maxAbs(r.series.wx) < 2 * maxAbs(clean.series.wx), maxAbs(r.series.wz).toFixed(0) + ' mg');
  }
}

console.log(fails ? `\n${fails} test(s) FAILED` : '\nAll tests passed');
process.exit(fails ? 1 : 0);
