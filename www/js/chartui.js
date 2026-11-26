/* chartui.js — v2.2 interactive charts: zoom (Ctrl+wheel, pinch, drag a box, + / − buttons), pan (Shift+wheel,
 * one-finger swipe, ← →), reset (double click / ⟲), shared cursor with read-out (time, values, position, speed, phase)
 * and manual Y scale. Time charts zoom and move together.
 * Design & Developed by Md. Saiful Islam */
(function (root) {
  'use strict';
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function unitOf(title) { var m = /\(([^()]*)\)\s*$/.exec(title || ''); return m ? m[1] : ''; }
  function fmt(v, d) { return (v === null || v === undefined || !isFinite(v)) ? '–' : v.toFixed(d); }

  function mount(host, items, ctx) {
    ctx = ctx || {};
    var res = ctx.res, st = ctx.state || {}, cards = [];
    st.view = st.view || {}; st.cursor = st.cursor || {}; st.yScale = st.yScale || {};
    var full = {};
    host.textContent = '';
    items.forEach(function (it) {
      var g = it.group || it.id;
      if (it.group !== 'oct' && !full[g]) full[g] = { xmin: it.cfg.xmin !== undefined ? it.cfg.xmin : 0, xmax: it.cfg.xmax };
      var card = el('div', 'card chart-card'); card.dataset.chart = it.id;
      var bar = el('div', 'chart-bar');
      var zoomable = it.group !== 'oct';
      function btn(txt, title, fn) { var b = el('button', 'cbtn', txt); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', fn); bar.appendChild(b); return b; }
      if (zoomable) {
        btn('＋', 'Zoom in', function () { zoomBy(it, 0.5); });
        btn('－', 'Zoom out', function () { zoomBy(it, 2); });
        btn('←', 'Move left', function () { panBy(it, -0.25); });
        btn('→', 'Move right', function () { panBy(it, 0.25); });
        btn('⟲', 'Reset zoom', function () { delete st.view[g]; redrawGroup(g); });
      }
      var sb = btn('Y', 'Y scale (auto / manual)', function () { sc.hidden = !sc.hidden; });
      sb.classList.add('cbtn-y');
      var sc = el('div', 'chart-scale'); sc.hidden = true;
      var auto = el('label', 'chk'); var ac = el('input'); ac.type = 'checkbox'; ac.checked = !st.yScale[it.id]; auto.appendChild(ac); auto.appendChild(document.createTextNode(' Auto'));
      var lo = el('input'); lo.type = 'number'; lo.step = 'any'; lo.placeholder = 'min'; lo.setAttribute('aria-label', 'Y minimum');
      var hi = el('input'); hi.type = 'number'; hi.step = 'any'; hi.placeholder = 'max'; hi.setAttribute('aria-label', 'Y maximum');
      if (st.yScale[it.id]) { lo.value = st.yScale[it.id].min; hi.value = st.yScale[it.id].max; }
      var ap = el('button', 'cbtn', 'Apply'); ap.type = 'button';
      ap.addEventListener('click', function () {
        var a = parseFloat(lo.value), b = parseFloat(hi.value);
        if (ac.checked || !(b > a)) { delete st.yScale[it.id]; ac.checked = true; } else st.yScale[it.id] = { min: a, max: b };
        draw(card.__c);
      });
      ac.addEventListener('change', function () { if (ac.checked) { delete st.yScale[it.id]; draw(card.__c); } });
      [auto, lo, hi, ap].forEach(function (n) { sc.appendChild(n); });
      var wrap = el('div', 'chart-wrap'), cv = el('canvas', 'chart'); cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', it.title);
      var sel = el('div', 'chart-sel'); sel.hidden = true;
      wrap.appendChild(cv); wrap.appendChild(sel);
      var ro = el('div', 'readout small'); ro.textContent = zoomable ? 'Tap / click a point to read it. Drag across to zoom · Ctrl + wheel or pinch to zoom · double-click to reset.' : 'Tap / click a point to read it.';
      card.appendChild(bar); card.appendChild(sc); card.appendChild(wrap); card.appendChild(ro); host.appendChild(card);
      var c = { it: it, g: g, cv: cv, ro: ro, sel: sel, card: card, zoomable: zoomable };
      card.__c = c; cards.push(c);
      bind(c);
    });

    function viewOf(g) { return st.view[g] || null; }
    function draw(c) {
      if (!c.cv.clientWidth) return;
      var cfg = Object.assign({ font: root.innerWidth < 520 ? 11 : 12 }, c.it.cfg, { view: viewOf(c.g), cursor: st.cursor[c.g] !== undefined ? { x: st.cursor[c.g] } : null, yScale: st.yScale[c.it.id] || null });
      Charts.draw(c.cv, cfg);
    }
    function redrawGroup(g) { cards.forEach(function (c) { if (c.g === g) { draw(c); if (st.cursor[g] !== undefined) readout(c, st.cursor[g]); } }); }
    function redraw() { cards.forEach(function (c) { draw(c); if (st.cursor[c.g] !== undefined) readout(c, st.cursor[c.g]); }); }
    function cur(it) { var g = it.group || it.id; return st.view[g] || full[g]; }
    function setView(it, a, b) {
      var g = it.group || it.id, F = full[g]; if (!F) return;
      var span = F.xmax - F.xmin, minSpan = Math.max(span / 400, g === 'time' ? 0.2 : 0.2);
      if (b - a < minSpan) { var mid = (a + b) / 2; a = mid - minSpan / 2; b = mid + minSpan / 2; }
      if (b - a >= span) { delete st.view[g]; redrawGroup(g); return; }
      if (a < F.xmin) { b += F.xmin - a; a = F.xmin; } if (b > F.xmax) { a -= b - F.xmax; b = F.xmax; }
      st.view[g] = { xmin: a, xmax: b }; redrawGroup(g);
    }
    function zoomBy(it, k, center) { var v = cur(it); if (!v) return; var c0 = center !== undefined ? center : (v.xmin + v.xmax) / 2; setView(it, c0 - (c0 - v.xmin) * k, c0 + (v.xmax - c0) * k); }
    function panBy(it, frac) { var v = cur(it); if (!v) return; var d = (v.xmax - v.xmin) * frac; setView(it, v.xmin + d, v.xmax + d); }

    function readout(c, x) {
      var it = c.it, cfg = it.cfg, parts = [], u = unitOf(it.title), lay = c.cv.__lay;
      if (it.group === 'time') parts.push('t = ' + fmt(x, 2) + ' s');
      else parts.push('f = ' + fmt(x, 2) + ' Hz');
      cfg.series.forEach(function (se) {
        if (!se.x.length) return;
        var k = Charts.nearest(se.x, x), y = se.y[k];
        if (y === null || !isFinite(y)) return;
        parts.push((se.label ? se.label + ': ' : '') + fmt(y, Math.abs(y) >= 100 ? 0 : Math.abs(y) >= 10 ? 1 : 2) + (u ? ' ' + u : ''));
      });
      if (it.group === 'time' && res) {
        var i = Math.max(0, Math.min(res.n - 1, Math.round(x * res.fs))), S = res.series;
        parts.push('position ' + fmt(S.posAbs[i], 2) + ' m from the bottom (' + fmt(S.pos[i], 2) + ' m travelled)');
        parts.push('speed ' + fmt(Math.abs(S.vd[i]), 2) + ' m/s · ' + LiftCore.PHASES[S.phase[i]]);
      } else if (it.group === 'freq' && res) {
        var v = res.diag.vSteady || res.m.vPeak;
        if (x > 0.3) parts.push('a part rolling at car speed with this frequency ≈ ' + Math.round(v / (Math.PI * x) * 1000) + ' mm diameter');
      }
      c.ro.textContent = parts.join(' · ');
      void lay;
    }
    function setCursor(c, x) { st.cursor[c.g] = x; cards.forEach(function (o) { if (o.g === c.g) { draw(o); readout(o, x); } }); }

    function bind(c) {
      var cv = c.cv, pts = {}, start = null, pinch = null, moved = false;
      function local(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
      function xAt(px) { return cv.__lay ? cv.__lay.xAt(px) : 0; }
      function inPlot(p) { var L = cv.__lay; return L && p.x >= L.L && p.x <= L.L + L.pw && p.y >= L.T - 4 && p.y <= L.T + L.ph + 4; }
      cv.addEventListener('pointerdown', function (e) {
        var p = local(e); pts[e.pointerId] = p;
        var ids = Object.keys(pts);
        if (ids.length === 2 && c.zoomable) {
          var a = pts[ids[0]], b = pts[ids[1]];
          pinch = { d: Math.abs(a.x - b.x) || 1, view: Object.assign({}, cur(c.it)), cx: xAt((a.x + b.x) / 2) }; start = null; c.sel.hidden = true; return;
        }
        start = { p: p, view: Object.assign({}, cur(c.it) || {}), touch: e.pointerType === 'touch', t: Date.now() }; moved = false;
        try { cv.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      });
      cv.addEventListener('pointermove', function (e) {
        if (!pts[e.pointerId]) return;
        var p = local(e); pts[e.pointerId] = p;
        var ids = Object.keys(pts);
        if (pinch && ids.length === 2) {
          var a = pts[ids[0]], b = pts[ids[1]], k = pinch.d / Math.max(1, Math.abs(a.x - b.x)), v = pinch.view;
          setView(c.it, pinch.cx - (pinch.cx - v.xmin) * k, pinch.cx + (v.xmax - pinch.cx) * k); e.preventDefault(); return;
        }
        if (!start) return;
        var dx = p.x - start.p.x, dy = p.y - start.p.y;
        if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) moved = true;
        if (!moved || !c.zoomable) return;
        if (start.touch) { // one finger: pan
          var L = cv.__lay, sp = start.view.xmax - start.view.xmin, d = -dx / L.pw * sp;
          if (st.view[c.g]) setView(c.it, start.view.xmin + d, start.view.xmax + d);
        } else { // mouse: box zoom selection
          var a0 = Math.max(cv.__lay.L, Math.min(start.p.x, p.x)), a1 = Math.min(cv.__lay.L + cv.__lay.pw, Math.max(start.p.x, p.x));
          c.sel.hidden = false; c.sel.style.left = a0 + 'px'; c.sel.style.width = Math.max(1, a1 - a0) + 'px';
          c.sel.style.top = cv.__lay.T + 'px'; c.sel.style.height = cv.__lay.ph + 'px';
        }
      });
      function end(e) {
        var p = pts[e.pointerId]; delete pts[e.pointerId];
        if (pinch) { if (Object.keys(pts).length < 2) pinch = null; return; }
        if (!start || !p) { start = null; return; }
        if (moved && !start.touch && c.zoomable) {
          var a = xAt(Math.min(start.p.x, p.x)), b = xAt(Math.max(start.p.x, p.x));
          c.sel.hidden = true; if (b > a) setView(c.it, a, b);
        } else if (!moved && inPlot(p)) setCursor(c, xAt(p.x));
        start = null; moved = false;
      }
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', function (e) { delete pts[e.pointerId]; pinch = null; start = null; c.sel.hidden = true; });
      cv.addEventListener('wheel', function (e) {
        if (!c.zoomable || !(e.ctrlKey || e.metaKey || e.shiftKey)) return;
        e.preventDefault();
        if (e.shiftKey && !e.ctrlKey) { panBy(c.it, (e.deltaY || e.deltaX) > 0 ? 0.15 : -0.15); return; }
        zoomBy(c.it, e.deltaY > 0 ? 1.4 : 1 / 1.4, xAt(local(e).x));
      }, { passive: false });
      cv.addEventListener('dblclick', function () { if (c.zoomable) { delete st.view[c.g]; redrawGroup(c.g); } });
    }

    return { redraw: redraw, state: st, cards: cards, setView: function (g, a, b) { var c = cards.filter(function (x) { return x.g === g; })[0]; if (c) setView(c.it, a, b); },
      setCursor: function (g, x) { var c = cards.filter(function (q) { return q.g === g; })[0]; if (c) setCursor(c, x); },
      reset: function () { st.view = {}; st.cursor = {}; redraw(); } };
  }
  root.ChartUI = { mount: mount };
})(typeof self !== 'undefined' ? self : this);
