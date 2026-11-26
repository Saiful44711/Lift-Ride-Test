/* store.js — record storage (IndexedDB; memory fallback) and settings (localStorage)
 * Design & Developed by Md. Saiful Islam */
(function (root) {
  'use strict';
  var DB = 'liftmeter', ST = 'runs', db = null, mem = [], memId = 1, useMem = false, opening = null;

  function open() {
    if (opening) return opening;
    opening = new Promise(function (res) {
      try {
        var rq = indexedDB.open(DB, 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore(ST, { keyPath: 'id', autoIncrement: true }); };
        rq.onsuccess = function () { db = rq.result; res(true); };
        rq.onerror = function () { useMem = true; res(false); };
        rq.onblocked = function () { useMem = true; res(false); };
      } catch (e) { useMem = true; res(false); }
    });
    return opening;
  }
  function req(mode, fn) {
    return open().then(function () {
      if (useMem) return null;
      return new Promise(function (res, rej) {
        var t = db.transaction(ST, mode), st = t.objectStore(ST), r = fn(st);
        t.oncomplete = function () { res(r && r.result !== undefined ? r.result : null); };
        t.onerror = t.onabort = function () { rej(t.error); };
      });
    });
  }
  function pack(raw) {
    return { t: Float64Array.from(raw.t), ax: Float32Array.from(raw.ax), ay: Float32Array.from(raw.ay), az: Float32Array.from(raw.az),
      pt: Float64Array.from(raw.pt || []), p: Float64Array.from(raw.p || []) };
  }
  function unpack(r) { return { t: r.t, ax: r.ax, ay: r.ay, az: r.az, pt: r.pt, p: r.p }; }

  var Store = {
    add: function (meta, raw, summary) {
      var rec = { created: Date.now(), meta: meta, summary: summary, raw: pack(raw) };
      return open().then(function () {
        if (useMem) { rec.id = memId++; mem.push(rec); return rec.id; }
        return req('readwrite', function (st) { return st.add(rec); });
      });
    },
    list: function () {
      return open().then(function () {
        if (useMem) return mem.slice().reverse().map(function (r) { return { id: r.id, created: r.created, meta: r.meta, summary: r.summary, cloud: r.cloud }; });
        return req('readonly', function (st) { return st.getAll(); }).then(function (all) {
          return (all || []).reverse().map(function (r) { return { id: r.id, created: r.created, meta: r.meta, summary: r.summary, cloud: r.cloud }; });
        });
      });
    },
    get: function (id) {
      return open().then(function () {
        if (useMem) { var r = mem.filter(function (x) { return x.id === id; })[0]; return r ? { id: r.id, created: r.created, cloud: r.cloud, meta: r.meta, raw: unpack(r.raw) } : null; }
        return req('readonly', function (st) { return st.get(id); }).then(function (r) { return r ? { id: r.id, created: r.created, cloud: r.cloud, meta: r.meta, raw: unpack(r.raw) } : null; });
      });
    },
    updateMeta: function (id, meta, summary) {
      return open().then(function () {
        if (useMem) { mem.forEach(function (r) { if (r.id === id) { r.meta = meta; r.summary = summary; } }); return; }
        return new Promise(function (res, rej) {
          var t = db.transaction(ST, 'readwrite'), st = t.objectStore(ST), g = st.get(id);
          g.onsuccess = function () { var r = g.result; if (r) { r.meta = meta; r.summary = summary; st.put(r); } };
          t.oncomplete = function () { res(); }; t.onerror = function () { rej(t.error); };
        });
      });
    },
    // cloud sync state per record: {state:'pending'|'done'|'error', cid, at, msg}
    setCloud: function (id, cloud) {
      return open().then(function () {
        if (useMem) { mem.forEach(function (r) { if (r.id === id) r.cloud = cloud; }); return; }
        return new Promise(function (res, rej) {
          var t = db.transaction(ST, 'readwrite'), st = t.objectStore(ST), g = st.get(id);
          g.onsuccess = function () { var r = g.result; if (r) { r.cloud = cloud; st.put(r); } };
          t.oncomplete = function () { res(); }; t.onerror = function () { rej(t.error); };
        });
      });
    },
    remove: function (id) { return open().then(function () { if (useMem) { mem = mem.filter(function (r) { return r.id !== id; }); return; } return req('readwrite', function (st) { return st.delete(id); }); }); },
    clear: function () { return open().then(function () { if (useMem) { mem = []; return; } return req('readwrite', function (st) { return st.clear(); }); }); },

    loadSettings: function () { try { return JSON.parse(localStorage.getItem('liftmeter.settings') || 'null'); } catch (e) { return null; } },
    saveSettings: function (s) { try { localStorage.setItem('liftmeter.settings', JSON.stringify(s)); } catch (e) { /* ignore */ } }
  };
  root.Store = Store;
})(typeof self !== 'undefined' ? self : this);
