/* sensors.js — sensor sources: native (Java plugin) / browser (DeviceMotion) / DEMO (fictional)
 * Batch format: {t:[s], ax, ay, az, pt:[s], p:[hPa]} — time in seconds from the start of the recording
 * Design & Developed by Md. Saiful Islam */
(function (root) {
  'use strict';

  function isNative() {
    var C = root.Capacitor;
    if (!C) return false;
    if (typeof C.isNativePlatform === 'function') return !!C.isNativePlatform();
    return typeof C.getPlatform === 'function' && C.getPlatform() !== 'web';
  }
  function plugin(name) {
    var C = root.Capacitor;
    if (!C) return null;
    if (C.Plugins && C.Plugins[name]) return C.Plugins[name];
    if (typeof C.registerPlugin === 'function') { try { return C.registerPlugin(name); } catch (e) { return null; } }
    return null;
  }

  var Sensors = {
    isNative: isNative, plugin: plugin,

    detect: function (pref) {
      if (pref === 'demo') return Promise.resolve({ mode: 'demo', accel: true, baro: true });
      if (isNative()) {
        var P = plugin('LiftSensor');
        if (!P) return Promise.resolve({ mode: 'native', accel: false, baro: false, error: 'LiftSensor plugin not found (APK not built correctly?)' });
        return P.getInfo().then(function (i) {
          return { mode: 'native', accel: !!i.accel, baro: !!i.baro, accelName: i.accelName, baroName: i.baroName, maxRate: i.accelMaxRate };
        }).catch(function (e) { return { mode: 'native', accel: false, baro: false, error: 'Could not read sensor info: ' + (e && e.message || e) }; });
      }
      if ('DeviceMotionEvent' in root) {
        // iOS needs a permission tap. Elsewhere, check that real data arrives within 1.2 s.
        if (typeof DeviceMotionEvent.requestPermission === 'function' && /iPad|iPhone|iPod/.test(navigator.userAgent || '')) return Promise.resolve({ mode: 'web', accel: true, baro: false });
        return new Promise(function (res) {
          var done = false, cnt = 0, mag = 0;
          function fin(ok) { if (done) return; done = true; root.removeEventListener('devicemotion', h); res(ok ? { mode: 'web', accel: true, baro: false } : { mode: 'demo', accel: true, baro: true, fallback: true }); }
          // A real phone delivers >=5 events with gravity (~9.8) per second; desktops give null/zero
          function h(e) {
            var a = e.accelerationIncludingGravity;
            if (a && a.x !== null && a.x !== undefined) { cnt++; mag = Math.max(mag, Math.abs(a.x) + Math.abs(a.y) + Math.abs(a.z)); }
            if (cnt >= 5 && mag > 5) fin(true);
          }
          root.addEventListener('devicemotion', h);
          setTimeout(function () { fin(false); }, 1200);
        });
      }
      return Promise.resolve({ mode: 'demo', accel: true, baro: true, fallback: true });
    },

    // onBatch(batch); onDone() only in DEMO (when the data ends). opts.still = N seconds of still data (sensor check)
    start: function (info, opts, onBatch, onDone) {
      if (info.mode === 'native') {
        Sensors.fallback = null;
        return startNative(onBatch).catch(function (err) {
          if (!('DeviceMotionEvent' in root)) throw err;
          Sensors.fallback = 'Native sensor plugin not responding (' + (err && err.message || err) + '). Using the WebView sensor (about 50-60 Hz) instead.';
          return startWeb(onBatch);
        });
      }
      if (info.mode === 'web') return startWeb(onBatch);
      return startDemo(opts || {}, onBatch, onDone);
    }
  };

  function withTimeout(p, ms, what) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error(what + ' did not answer within ' + (ms / 1000) + ' s')); }, ms);
      Promise.resolve(p).then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }

  // Native plugin. Registering the listener is NOT awaited (on some Capacitor builds that promise can stay pending);
  // start() is awaited with a time limit. If the plugin does not answer, fall back to the WebView DeviceMotion sensor.
  function startNative(onBatch) {
    var P = plugin('LiftSensor'), base = null, handle = null, removed = false;
    Sensors.stage = 'addListener';
    var lp = P.addListener('batch', function (d) {
      if (!d || !d.t || !d.t.length) return;
      if (base === null) base = d.t[0];
      var t = d.t.map(function (v) { return v - base; });
      var pt = (d.pt || []).map(function (v) { return v - base; });
      onBatch({ t: t, ax: d.ax, ay: d.ay, az: d.az, pt: pt, p: d.p || [] });
    });
    function drop() { removed = true; try { if (handle && handle.remove) handle.remove(); } catch (e) { /* ignore */ } }
    Promise.resolve(lp).then(function (h) { handle = h; if (removed) drop(); }, function () { });
    Sensors.stage = 'start';
    return withTimeout(P.start({ rate: 200 }), 4000, 'LiftSensor.start()').then(function () {
      Sensors.stage = 'running';
      return { mode: 'native', stop: function () { return withTimeout(P.stop(), 2000, 'LiftSensor.stop()').then(drop, drop); } };
    }, function (e) {
      drop(); try { P.stop(); } catch (x) { /* ignore */ }
      throw e;
    });
  }

  function startWeb(onBatch) {
    var buf = { t: [], ax: [], ay: [], az: [], pt: [], p: [] }, t0 = null, timer = null, wake = null;
    function handler(e) {
      var a = e.accelerationIncludingGravity; if (!a || a.x === null) return;
      var now = performance.now() / 1000; if (t0 === null) t0 = now;
      buf.t.push(now - t0); buf.ax.push(a.x); buf.ay.push(a.y); buf.az.push(a.z);
    }
    function flush() { if (buf.t.length) { onBatch(buf); buf = { t: [], ax: [], ay: [], az: [], pt: [], p: [] }; } }
    var ask = (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') ? DeviceMotionEvent.requestPermission() : Promise.resolve('granted');
    return ask.then(function (r) {
      if (r !== 'granted') throw new Error('Sensor permission was not granted');
      root.addEventListener('devicemotion', handler);
      timer = setInterval(flush, 100);
      try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () { }); } catch (e) { /* ignore */ }
      return { stop: function () { root.removeEventListener('devicemotion', handler); clearInterval(timer); flush(); try { if (wake) wake.release(); } catch (e) { /* ignore */ } return Promise.resolve(); } };
    });
  }

  function startDemo(opts, onBatch, onDone) {
    var seed = opts.seed || (Date.now() % 100000), up = (seed % 2) === 0;
    var raw = opts.still ? root.LiftCore.simulateStill(opts.still, { rate: 100, seed: seed }) : root.LiftCore.simulateRun({ seed: seed, rate: 100, up: up, height: 28 + (seed % 9), vmax: 2.0 + (seed % 3) * 0.5, jmax: 1.0 + (seed % 4) * 0.1, baro: true, sound: true, joints: { every: 5, amp: 0.22 } });
    var speed = opts.speed || 1, t0 = performance.now(), i = 0, j = 0, q = 0, timer, finished = false, snd = raw.snd || { t: [], l: [] };
    var tEnd = raw.t[raw.t.length - 1];
    raw.pt = raw.pt || []; raw.p = raw.p || [];
    function tick() {
      var simT = (performance.now() - t0) / 1000 * speed, b = { t: [], ax: [], ay: [], az: [], pt: [], p: [] };
      while (i < raw.t.length && raw.t[i] <= simT) { b.t.push(raw.t[i]); b.ax.push(raw.ax[i]); b.ay.push(raw.ay[i]); b.az.push(raw.az[i]); i++; }
      while (j < raw.pt.length && raw.pt[j] <= simT) { b.pt.push(raw.pt[j]); b.p.push(raw.p[j]); j++; }
      if (snd.t.length) { b.st = []; b.sl = []; b.sref = 'spl'; while (q < snd.t.length && snd.t[q] <= simT) { b.st.push(snd.t[q]); b.sl.push(snd.l[q]); q++; } }
      if (b.t.length) onBatch(b);
      if (!finished && simT > tEnd) { finished = true; clearInterval(timer); if (onDone) onDone(); }
    }
    timer = setInterval(tick, 50);
    return Promise.resolve({ stop: function () { clearInterval(timer); return Promise.resolve(); }, truth: raw.truth });
  }

  root.Sensors = Sensors;
})(typeof self !== 'undefined' ? self : this);
