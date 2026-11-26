/* update.js — v2.2 "Update available" for the phone app (GitHub Releases) and the PC web app (version.json).
 * Design & Developed by Md. Saiful Islam */
(function (root) {
  'use strict';
  var B = root.LRM_BUILD || { version: '?', build: 0, sha: 'dev', kind: 'dev' };
  var C = root.LRM_CONFIG || {};
  function isNative() { var K = root.Capacitor; return !!(K && typeof K.isNativePlatform === 'function' && K.isNativePlatform()); }
  function kind() { return isNative() ? 'apk' : (B.kind === 'dev' ? 'dev' : 'web'); }
  function dismissed() { try { return localStorage.getItem('lrm-upd-later') || ''; } catch (e) { return ''; } }
  function setDismissed(v) { try { localStorage.setItem('lrm-upd-later', v); } catch (e) { /* ignore */ } }

  // -> Promise<{available, label, id, url?}>
  function check() {
    var k = kind();
    if (k === 'apk') {
      if (!C.updateRepo) return Promise.resolve({ available: false, reason: 'No update repository is set in config.js.' });
      return fetch('https://api.github.com/repos/' + C.updateRepo + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error(r.status === 404 ? 'No release published yet' : 'GitHub answered ' + r.status); return r.json(); })
        .then(function (j) {
          var m = /b(\d+)/.exec(j.tag_name || ''), build = m ? Number(m[1]) : 0;
          var a = (j.assets || []).filter(function (x) { return /\.apk$/i.test(x.name); })[0];
          if (!a) return { available: false, reason: 'The latest release has no APK yet (build still running?).' };
          return { available: build > (B.build || 0), id: j.tag_name, label: (j.name || j.tag_name), url: a.browser_download_url, build: build };
        });
    }
    if (k === 'web') {
      return fetch('version.json?ts=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('version.json ' + r.status); return r.json(); })
        .then(function (j) { return { available: !!j.sha && j.sha !== B.sha, id: j.sha, label: 'v' + j.version + (j.build ? ' (build ' + j.build + ')' : '') }; });
    }
    return Promise.resolve({ available: false, reason: 'Development copy: update checks are off.' });
  }
  function apply(info) {
    if (kind() === 'apk') { root.location.href = info.url; return Promise.resolve('download'); }
    var p = Promise.resolve();
    if (root.caches && caches.keys) p = caches.keys().then(function (ks) { return Promise.all(ks.map(function (x) { return caches.delete(x); })); }).catch(function () { });
    return p.then(function () {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) return navigator.serviceWorker.getRegistration().then(function (r) { if (r) return r.update().catch(function () { }); });
    }).then(function () { root.location.reload(); return 'reload'; });
  }
  var last = null;
  function show(info, $) {
    last = info;
    var bar = $('updBar'); if (!bar) return;
    $('updText').textContent = kind() === 'apk' ? 'New version ' + info.label + ' is available. Tap Update, then Install when Android asks.' : 'A new version ' + info.label + ' is available.';
    bar.hidden = false;
  }
  function auto($, force) {
    return check().then(function (info) {
      if (info.available && (force || dismissed() !== info.id)) show(info, $);
      return info;
    });
  }
  function init($) {
    if (!$('updBar')) return;
    $('updBtn').addEventListener('click', function () { if (last) { $('updText').textContent = kind() === 'apk' ? 'Downloading… open the downloaded file and tap Install.' : 'Updating…'; apply(last); } });
    $('updLater').addEventListener('click', function () { if (last) setDismissed(last.id); $('updBar').hidden = true; });
    $('btnUpdCheck') && $('btnUpdCheck').addEventListener('click', function () {
      $('updMsg').textContent = 'Checking…';
      auto($, true).then(function (i) { $('updMsg').textContent = i.available ? 'Update available: ' + i.label : (i.reason || 'You have the latest version.'); })
        .catch(function (e) { $('updMsg').textContent = 'Could not check: ' + (e && e.message || e); });
    });
    if (kind() === 'dev') return;
    setTimeout(function () { auto($).catch(function () { }); }, 3000);
    setInterval(function () { auto($).catch(function () { }); }, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') auto($).catch(function () { }); });
  }
  root.Updater = { init: init, check: check, apply: apply, kind: kind, build: B };
})(typeof self !== 'undefined' ? self : this);
