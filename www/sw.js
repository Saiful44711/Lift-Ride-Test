/* sw.js — makes the web app installable on a PC and usable offline (app files only).
 * Network first, so an updated version always wins when online. Cloud calls (script.google.com) are never touched.
 * Design & Developed by Md. Saiful Islam */
var CACHE = 'lift-ride-test-v2.2.0';
var FILES = ['./', 'index.html', 'config.js', 'build-info.js', 'manifest.webmanifest', 'css/app.css', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/core.js', 'js/source.js', 'js/cloudlogic.js', 'js/backend.js', 'js/charts.js', 'js/chartui.js', 'js/mic.js', 'js/update.js', 'js/pdf.js', 'js/report.js', 'js/store.js', 'js/sensors.js', 'js/app.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // cloud + fonts: browser handles them
  if (/version\.json$/.test(url.pathname)) return;           // update check always asks the network
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () { return caches.match(req).then(function (m) { return m || caches.match('index.html'); }); }));
});
