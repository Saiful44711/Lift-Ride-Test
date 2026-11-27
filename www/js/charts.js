/* charts.js — own canvas chart (no external library)
 * Design & Developed by Md. Saiful Islam */
(function (root) {
  'use strict';

  var LIGHT = { bg: '#ffffff', fg: '#14202b', axis: '#55677a', grid: '#e4e9ef', palette: ['#0b63c4', '#d9480f', '#2b8a3e', '#7048e8'], limit: '#c4302b' };

  function themeColors() {
    var cs = getComputedStyle(document.documentElement);
    function g(n, d) { var v = cs.getPropertyValue(n).trim(); return v || d; }
    return { bg: g('--card', '#fff'), fg: g('--fg', '#14202b'), axis: g('--axis', '#55677a'), grid: g('--grid', '#e4e9ef'),
      palette: [g('--c1', '#0b63c4'), g('--c2', '#d9480f'), g('--c3', '#2b8a3e'), g('--c4', '#7048e8')], limit: g('--danger', '#c4302b') };
  }

  function niceStep(range, count) {
    var raw = range / Math.max(1, count), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    var n = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
    return n * p;
  }
  function fmt(v, step) {
    var dp = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
    return (Math.abs(v) < 1e-12 ? 0 : v).toFixed(dp);
  }

  /* cfg: {width,height,title,xlabel,ylabel,series:[{x,y,color,label,width,marker,dash}],hlines:[{y,label,color,dash}],
   *       vlines:[{x,label}], xlog, xmin,xmax,ymin,ymax, font, colors, symmetricY} */
  function draw(canvas, cfg) {
    var dpr = cfg.dpr || (root.devicePixelRatio || 1);
    var W = cfg.width || canvas.clientWidth || 600, H = cfg.height || canvas.clientHeight || 260;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    var ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var C = cfg.colors || themeColors(), F = cfg.font || 12;
    var fam = getComputedStyle(document.body).fontFamily || 'sans-serif';
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.font = F + 'px ' + fam; ctx.textBaseline = 'middle';

    var L = F * 4.6, R = F * 1.0, T = cfg.title ? F * 2.6 : F * 1.2, B = F * 3.2;
    // v2.2.1: stats wrap onto a second line on narrow charts
    var statLines = [];
    if (cfg.stats) {
      ctx.font = (F * 0.95) + 'px ' + fam;
      var parts = String(cfg.stats).split(' · '), line = '', maxS = W - L - R;
      parts.forEach(function (pt) { var t2 = line ? line + ' · ' + pt : pt; if (line && ctx.measureText(t2).width > maxS) { statLines.push(line); line = pt; } else line = t2; });
      if (line) statLines.push(line);
      ctx.font = F + 'px ' + fam;
      T += F * 1.3 * statLines.length;
    }
    // legend wraps onto several rows on narrow screens
    var legend = [], legRows = 0;
    if (cfg.legendRow !== false && cfg.series.length > 1) {
      var cx = 0, maxW = W - L - R;
      cfg.series.forEach(function (se, si) {
        if (!se.label) return;
        var w = F * 1.5 + ctx.measureText(se.label).width + F * 1.2;
        if (cx + w > maxW && cx > 0) { legRows++; cx = 0; }
        legend.push({ se: se, si: si, x: cx, row: legRows }); cx += w;
      });
      legRows++;
      T += F * 1.5 * legRows;
    }
    var pw = W - L - R, ph = H - T - B;

    // ranges
    var xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, i, s, k;
    var V = cfg.view || null; // {xmin, xmax} zoom window
    cfg.series.forEach(function (se) {
      for (k = 0; k < se.x.length; k++) {
        var xv = se.x[k], yv = se.y[k];
        if (V && (xv < V.xmin || xv > V.xmax)) { if (isFinite(xv)) { if (xv < xmin) xmin = xv; if (xv > xmax) xmax = xv; } continue; }
        if (yv === null || yv === undefined || !isFinite(yv) || !isFinite(xv) || (cfg.ylog && yv <= 0)) continue;
        if (xv < xmin) xmin = xv; if (xv > xmax) xmax = xv; if (yv < ymin) ymin = yv; if (yv > ymax) ymax = yv;
      }
    });
    (cfg.hlines || []).forEach(function (h) { if (cfg.ylog && h.y <= 0) return; if (h.y < ymin) ymin = h.y; if (h.y > ymax) ymax = h.y; });
    if (!isFinite(xmin)) { xmin = 0; xmax = 1; ymin = 0; ymax = 1; }
    if (cfg.xmin !== undefined) xmin = cfg.xmin; if (cfg.xmax !== undefined) xmax = cfg.xmax;
    if (V) { xmin = V.xmin; xmax = V.xmax; }
    if (cfg.ymin !== undefined) ymin = cfg.ymin; if (cfg.ymax !== undefined) ymax = cfg.ymax;
    if (cfg.yScale && isFinite(cfg.yScale.min) && isFinite(cfg.yScale.max) && cfg.yScale.max > cfg.yScale.min) { ymin = cfg.yScale.min; ymax = cfg.yScale.max; cfg = Object.assign({}, cfg, { ymin: ymin, ymax: ymax, symmetricY: false }); }
    if (cfg.symmetricY) { var m = Math.max(Math.abs(ymin), Math.abs(ymax)); ymin = -m; ymax = m; }
    if (cfg.ylog) { if (cfg.ymin === undefined) ymin = Math.max(1e-3, ymin) / 1.5; if (cfg.ymax === undefined) ymax = ymax * 1.5; if (ymax <= ymin) ymax = ymin * 10; }
    else {
      if (ymax - ymin < 1e-9) { ymax += 1; ymin -= 1; }
      if (cfg.ymin === undefined) ymin -= (ymax - ymin) * 0.06; if (cfg.ymax === undefined) ymax += (ymax - ymin) * 0.06;
    }
    if (cfg.xlog) { xmin = Math.max(xmin, 1e-3); }
    if (xmax - xmin < 1e-9) xmax = xmin + 1;

    function fx(v) { return cfg.xlog ? L + (Math.log10(v) - Math.log10(xmin)) / (Math.log10(xmax) - Math.log10(xmin)) * pw : L + (v - xmin) / (xmax - xmin) * pw; }
    function fy(v) { return cfg.ylog ? T + ph - (Math.log10(Math.max(v, 1e-9)) - Math.log10(ymin)) / (Math.log10(ymax) - Math.log10(ymin)) * ph : T + ph - (v - ymin) / (ymax - ymin) * ph; }

    // grid and axes
    ctx.lineWidth = 1; ctx.strokeStyle = C.grid; ctx.fillStyle = C.axis;
    ctx.textAlign = 'right';
    if (cfg.ylog) {
      for (var de = Math.floor(Math.log10(ymin)); de <= Math.ceil(Math.log10(ymax)); de++) {
        [1, 2, 5].forEach(function (mul) {
          var tv = mul * Math.pow(10, de);
          if (tv < ymin || tv > ymax) return;
          var yl = Math.round(fy(tv)) + 0.5;
          ctx.beginPath(); ctx.moveTo(L, yl); ctx.lineTo(L + pw, yl); ctx.stroke();
          ctx.fillText(String(tv), L - 6, yl);
        });
      }
    } else {
      var ystep = niceStep(ymax - ymin, Math.max(3, Math.floor(ph / (F * 3.2))));
      for (var yv2 = Math.ceil(ymin / ystep) * ystep; yv2 <= ymax + 1e-9; yv2 += ystep) {
        var yy = Math.round(fy(yv2)) + 0.5;
        ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(L + pw, yy); ctx.stroke();
        ctx.fillText(fmt(yv2, ystep), L - 6, yy);
      }
    }
    ctx.textAlign = 'center';
    if (cfg.xlog) {
      var ticks = [0.5, 1, 2, 5, 10, 20, 50, 100];
      ticks.forEach(function (tv) {
        if (tv < xmin * 0.999 || tv > xmax * 1.001) return;
        var xx = Math.round(fx(tv)) + 0.5;
        ctx.beginPath(); ctx.moveTo(xx, T); ctx.lineTo(xx, T + ph); ctx.stroke();
        ctx.fillText(String(tv), xx, T + ph + F * 1.2);
      });
    } else {
      var xstep = niceStep(xmax - xmin, Math.max(3, Math.floor(pw / (F * 6))));
      for (var xv2 = Math.ceil(xmin / xstep) * xstep; xv2 <= xmax + 1e-9; xv2 += xstep) {
        var xx2 = Math.round(fx(xv2)) + 0.5;
        ctx.beginPath(); ctx.moveTo(xx2, T); ctx.lineTo(xx2, T + ph); ctx.stroke();
        ctx.fillText(fmt(xv2, xstep), xx2, T + ph + F * 1.2);
      }
    }
    ctx.strokeStyle = C.axis; ctx.strokeRect(L + 0.5, T + 0.5, pw, ph);
    if (!cfg.ylog && ymin < 0 && ymax > 0) { ctx.strokeStyle = C.axis; ctx.globalAlpha = .5; var z = Math.round(fy(0)) + .5; ctx.beginPath(); ctx.moveTo(L, z); ctx.lineTo(L + pw, z); ctx.stroke(); ctx.globalAlpha = 1; }

    // title, axis labels
    ctx.fillStyle = C.fg; ctx.textAlign = 'left';
    if (cfg.title) { ctx.font = 'bold ' + (F * 1.1) + 'px ' + fam; ctx.fillText(cfg.title, L, F * 1.3); ctx.font = F + 'px ' + fam; }
    if (statLines.length) { ctx.fillStyle = C.axis; ctx.font = (F * 0.95) + 'px ' + fam; statLines.forEach(function (ln, k) { ctx.fillText(ln, L, F * (cfg.title ? 2.75 : 1.3) + k * F * 1.3); }); ctx.font = F + 'px ' + fam; }
    ctx.fillStyle = C.axis; ctx.textAlign = 'center';
    if (cfg.xlabel) ctx.fillText(cfg.xlabel, L + pw / 2, H - F * 0.9);
    if (cfg.ylabel) { ctx.save(); ctx.translate(F * 0.9, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(cfg.ylabel, 0, 0); ctx.restore(); }

    // lines clipped to the plot area
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
    (cfg.vlines || []).forEach(function (v) {
      var xx3 = fx(v.x); ctx.strokeStyle = v.color || C.axis; ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(xx3, T); ctx.lineTo(xx3, T + ph); ctx.stroke(); ctx.setLineDash([]);
    });
    (cfg.hlines || []).forEach(function (h) {
      if (cfg.ylog && h.y <= 0) return;
      ctx.strokeStyle = h.color || C.limit; ctx.lineWidth = 1.4; ctx.setLineDash(h.dash === false ? [] : [6, 4]);
      var y3 = fy(h.y); ctx.beginPath(); ctx.moveTo(L, y3); ctx.lineTo(L + pw, y3); ctx.stroke(); ctx.setLineDash([]);
    });
    cfg.series.forEach(function (se, si) {
      var col = se.color || C.palette[(se.pi !== undefined ? se.pi : si) % C.palette.length];
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = se.width || 1.6; ctx.lineJoin = 'round';
      ctx.setLineDash(se.dash ? [6, 4] : []);
      var n = se.x.length, k0 = 0, k1 = n;
      if (V && n > 2 && se.x[n - 1] > se.x[0]) { k0 = Math.max(0, lowerBound(se.x, xmin) - 1); k1 = Math.min(n, lowerBound(se.x, xmax) + 2); }
      var step = Math.max(1, Math.floor((k1 - k0) / (pw * 1.5))), started = false;
      ctx.beginPath();
      for (k = k0; k < k1; k += step) {
        var yv3 = se.y[k];
        if (yv3 === null || yv3 === undefined || !isFinite(yv3) || (cfg.ylog && yv3 <= 0) || (cfg.xlog && se.x[k] < xmin * 0.999)) { started = false; continue; }
        if (step > 1) { // keep block min/max so peaks are not lost
          var mn = yv3, mx = yv3, xk = se.x[k];
          for (var q = k; q < Math.min(k1, k + step); q++) { if (se.y[q] < mn) mn = se.y[q]; if (se.y[q] > mx) mx = se.y[q]; }
          var px = fx(xk);
          if (!started) { ctx.moveTo(px, fy(mn)); started = true; } else ctx.lineTo(px, fy(mn));
          ctx.lineTo(px, fy(mx));
        } else {
          var px2 = fx(se.x[k]), py2 = fy(yv3);
          if (!started) { ctx.moveTo(px2, py2); started = true; } else ctx.lineTo(px2, py2);
        }
      }
      if (se.line !== false) ctx.stroke(); ctx.setLineDash([]);
      if (se.marker) {
        for (k = k0; k < k1; k++) { var ym = se.y[k]; if (ym === null || !isFinite(ym) || (cfg.ylog && ym <= 0)) continue; ctx.beginPath(); ctx.arc(fx(se.x[k]), fy(ym), Math.max(2.5, F * 0.28), 0, 6.2832); ctx.fill(); }
      }
    });
    // v2.2.1 point markers (PMT style): '+' = max peak-to-peak, 'o' = jerk-zone max
    (cfg.points || []).forEach(function (pt) {
      if (!isFinite(pt.x) || !isFinite(pt.y) || pt.x < xmin || pt.x > xmax) return;
      var px = fx(pt.x), py = fy(Math.max(ymin, Math.min(ymax, pt.y))), r = Math.max(6, F * 0.6);
      ctx.strokeStyle = pt.color || C.fg; ctx.lineWidth = 1.6; ctx.setLineDash([]); ctx.beginPath();
      if (pt.shape === 'circle') ctx.arc(px, py, r, 0, 6.2832);
      else { ctx.moveTo(px - r, py); ctx.lineTo(px + r, py); ctx.moveTo(px, py - r); ctx.lineTo(px, py + r); }
      ctx.stroke();
    });
    ctx.restore();

    // limit-line labels (never on top of each other)
    ctx.font = (F * 0.9) + 'px ' + fam; ctx.textAlign = 'right';
    var usedY = [], boxes = [];
    (cfg.hlines || []).forEach(function (h) {
      if (!h.label || (cfg.ylog && h.y <= 0)) return; ctx.fillStyle = h.color || C.limit;
      var below = h.y < (ymin + ymax) / 2, yl = fy(h.y) + (below ? F * 0.8 : -F * 0.7);
      yl = Math.min(T + ph - F * 0.6, Math.max(T + F * 0.6, yl));
      if (usedY.some(function (u) { return Math.abs(u - yl) < F * 1.1; })) return;
      var tw = ctx.measureText(h.label).width;
      usedY.push(yl); ctx.fillStyle = C.bg; ctx.globalAlpha = 0.8; ctx.fillRect(L + pw - 6 - tw, yl - F * 0.55, tw + 4, F * 1.1); ctx.globalAlpha = 1;
      ctx.fillStyle = h.color || C.limit; ctx.fillText(h.label, L + pw - 4, yl); boxes.push({ x0: L + pw - 4 - tw, x1: L + pw - 4, y0: yl - F * 0.6, y1: yl + F * 0.6 });
    });
    // vertical-line labels: rows from the bottom of the plot, never on top of another label
    ctx.font = (F * 0.85) + 'px ' + fam; ctx.textAlign = 'left';
    (cfg.vlines || []).forEach(function (v) {
      if (!v.label || v.x < xmin || v.x > xmax) return;
      var xx = fx(v.x) + 3, tw2 = ctx.measureText(v.label).width;
      if (xx + tw2 > L + pw) xx = fx(v.x) - 3 - tw2;
      for (var row = 0; row < 4; row++) {
        var yc = T + ph - F * (0.75 + row * 1.05), bx = { x0: xx - 2, x1: xx + tw2 + 2, y0: yc - F * 0.5, y1: yc + F * 0.5 };
        if (boxes.some(function (o) { return bx.x0 < o.x1 && bx.x1 > o.x0 && bx.y0 < o.y1 && bx.y1 > o.y0; })) continue;
        boxes.push(bx); ctx.fillStyle = C.bg; ctx.globalAlpha = 0.75; ctx.fillRect(bx.x0, bx.y0, bx.x1 - bx.x0, bx.y1 - bx.y0); ctx.globalAlpha = 1;
        ctx.fillStyle = v.color || C.axis; ctx.fillText(v.label, xx, yc); break;
      }
    });
    ctx.font = F + 'px ' + fam;

    // cursor (shared read-out position)
    if (cfg.cursor && isFinite(cfg.cursor.x) && cfg.cursor.x >= xmin && cfg.cursor.x <= xmax) {
      var cx0 = fx(cfg.cursor.x);
      ctx.save(); ctx.strokeStyle = C.fg; ctx.globalAlpha = 0.75; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx0 + 0.5, T); ctx.lineTo(cx0 + 0.5, T + ph); ctx.stroke(); ctx.restore();
      cfg.series.forEach(function (se, si) {
        if (!se.x.length) return;
        var kk = nearest(se.x, cfg.cursor.x), yv4 = se.y[kk];
        if (yv4 === null || !isFinite(yv4) || yv4 < ymin || yv4 > ymax) return;
        ctx.fillStyle = se.color || C.palette[(se.pi !== undefined ? se.pi : si) % C.palette.length]; ctx.strokeStyle = C.bg; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(fx(se.x[kk]), fy(yv4), Math.max(3.5, F * 0.33), 0, 6.2832); ctx.fill(); ctx.stroke();
      });
    }

    // legend
    ctx.textAlign = 'left';
    legend.forEach(function (it) {
      var col2 = it.se.color || C.palette[(it.se.pi !== undefined ? it.se.pi : it.si) % C.palette.length], lx = L + it.x, ly = T - F * 0.9 - (legRows - 1 - it.row) * F * 1.5;
      ctx.fillStyle = col2; ctx.fillRect(lx, ly - F * 0.35, F * 1.2, F * 0.7);
      ctx.fillStyle = C.fg; ctx.fillText(it.se.label, lx + F * 1.5, ly);
    });
    var lay = { L: L, T: T, pw: pw, ph: ph, W: W, H: H, xmin: xmin, xmax: xmax, ymin: ymin, ymax: ymax, xlog: !!cfg.xlog, ylog: !!cfg.ylog,
      xAt: function (px) { var u = (px - L) / pw; return cfg.xlog ? Math.pow(10, Math.log10(xmin) + u * (Math.log10(xmax) - Math.log10(xmin))) : xmin + u * (xmax - xmin); },
      yAt: function (py) { var u = (T + ph - py) / ph; return cfg.ylog ? Math.pow(10, Math.log10(ymin) + u * (Math.log10(ymax) - Math.log10(ymin))) : ymin + u * (ymax - ymin); } };
    canvas.__lay = lay;
    return lay;
  }
  function lowerBound(a, v) { var lo = 0, hi = a.length; while (lo < hi) { var m = (lo + hi) >> 1; if (a[m] < v) lo = m + 1; else hi = m; } return lo; }
  function nearest(a, v) { var k = lowerBound(a, v); if (k <= 0) return 0; if (k >= a.length) return a.length - 1; return (v - a[k - 1] <= a[k] - v) ? k - 1 : k; }

  root.Charts = { draw: draw, LIGHT: LIGHT, themeColors: themeColors, nearest: nearest, lowerBound: lowerBound };
})(typeof self !== 'undefined' ? self : this);
