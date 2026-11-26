/* mic.js — v2.2 sound level from the phone / PC microphone (Web Audio)
 * A-weighted level of each 125 ms block (FAST), stored as uncalibrated dB re full scale ("dbfs");
 * the calibration offset is added in the analysis, so old records follow a new calibration.
 * Indicative only: phone microphones are not class 1/2 sound level meters.
 * Design & Developed by Md. Saiful Islam */
(function (root) {
  'use strict';
  function aWeightDb(f) {
    var f2 = f * f, n = 148693636 * f2 * f2, d = (f2 + 424.36) * Math.sqrt((f2 + 11599.29) * (f2 + 544496.41)) * (f2 + 148693636);
    return 20 * Math.log10(n / d) + 2.0;
  }
  var Mic = {
    supported: function () { return !!(root.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (root.AudioContext || root.webkitAudioContext)); },
    aWeightDb: aWeightDb,
    // onLevel({perf: ms, l: dB}) every 125 ms. Resolves to {stop()}.
    start: function (onLevel) {
      if (!Mic.supported()) return Promise.reject(new Error('This device / browser has no microphone access'));
      return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (stream) {
        var AC = root.AudioContext || root.webkitAudioContext, ctx = new AC(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
        an.fftSize = 4096; an.smoothingTimeConstant = 0; src.connect(an);
        var bins = an.frequencyBinCount, buf = new Float32Array(bins), wA = new Float32Array(bins), df = ctx.sampleRate / an.fftSize;
        for (var k = 0; k < bins; k++) { var f = k * df; wA[k] = (f < 20 || f > 16000) ? -200 : aWeightDb(f); }
        var timer = setInterval(function () {
          an.getFloatFrequencyData(buf);
          var p = 0; for (var q = 1; q < bins; q++) { var v = buf[q]; if (v > -200) p += Math.pow(10, (v + wA[q]) / 10); }
          if (p > 0) onLevel({ perf: performance.now(), l: 10 * Math.log10(p) });
        }, 125);
        if (ctx.resume) ctx.resume();
        return { sampleRate: ctx.sampleRate, stop: function () { clearInterval(timer); try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignore */ } try { ctx.close(); } catch (e2) { /* ignore */ } return Promise.resolve(); } };
      });
    },
    // average level over `sec` seconds (for calibration against a sound level meter)
    measure: function (sec) {
      var vals = [];
      return Mic.start(function (x) { vals.push(x.l); }).then(function (c) {
        return new Promise(function (res) { setTimeout(function () { c.stop(); res(vals.length ? 10 * Math.log10(vals.reduce(function (s, v) { return s + Math.pow(10, v / 10); }, 0) / vals.length) : null); }, sec * 1000); });
      });
    }
  };
  root.Mic = Mic;
})(typeof self !== 'undefined' ? self : this);
