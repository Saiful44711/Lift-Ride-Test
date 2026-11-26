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
    cfg.series.forEach(function (se) {
      for (k = 0; k < se.x.length; k++) {
        var xv = se.x[k], yv = se.y[k];
        if (yv === null || yv === undefined || !isFinite(yv) || !isFinite(xv) || (cfg.ylog && yv <= 0)) continue;
        if (xv < xmin) xmin = xv; if (xv > xmax) xmax = xv; if (yv < ymin) ymin = yv; if (yv > ymax) ymax = yv;
      }
    });
    (cfg.hlines || []).forEach(function (h) { if (cfg.ylog && h.y <= 0) return; if (h.y < ymin) ymin = h.y; if (h.y > ymax) ymax = h.y; });
    if (!isFinite(xmin)) { xmin = 0; xmax = 1; ymin = 0; ymax = 1; }
    if (cfg.xmin !== undefined) xmin = cfg.xmin; if (cfg.xmax !== undefined) xmax = cfg.xmax;
    if (cfg.ymin !== undefined) ymin = cfg.ymin; if (cfg.ymax !== undefined) ymax = cfg.ymax;
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
    ctx.fillStyle = C.axis; ctx.textAlign = 'center';
    if (cfg.xlabel) ctx.fillText(cfg.xlabel, L + pw / 2, H - F * 0.9);
    if (cfg.ylabel) { ctx.save(); ctx.translate(F * 0.9, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(cfg.ylabel, 0, 0); ctx.restore(); }

    // lines clipped to the plot area
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
    (cfg.vlines || []).forEach(function (v) {
      var xx3 = fx(v.x); ctx.strokeStyle = v.color || C.axis; ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(xx3, T); ctx.lineTo(xx3, T + ph); ctx.stroke(); ctx.setLineDash([]);
      if (v.label) { ctx.fillStyle = v.color || C.axis; ctx.font = (F * 0.85) + 'px ' + fam; ctx.textAlign = 'left'; ctx.fillText(v.label, xx3 + 3, T + F * 1.0); }
    });
    (cfg.hlines || []).forEach(function (h) {
      if (cfg.ylog && h.y <= 0) return;
      ctx.strokeStyle = h.color || C.limit; ctx.lineWidth = 1.4; ctx.setLineDash(h.dash === false ? [] : [6, 4]);
      var y3 = fy(h.y); ctx.beginPath(); ctx.moveTo(L, y3); ctx.lineTo(L + pw, y3); ctx.stroke(); ctx.setLineDash([]);
    });
    cfg.series.forEach(function (se, si) {
      var col = se.color || C.palette[si % C.palette.length];
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = se.width || 1.6; ctx.lineJoin = 'round';
      ctx.setLineDash(se.dash ? [6, 4] : []);
      var n = se.x.length, step = Math.max(1, Math.floor(n / (pw * 1.5))), started = false;
      ctx.beginPath();
      for (k = 0; k < n; k += step) {
        var yv3 = se.y[k];
        if (yv3 === null || yv3 === undefined || !isFinite(yv3) || (cfg.ylog && yv3 <= 0) || (cfg.xlog && se.x[k] < xmin * 0.999)) { started = false; continue; }
        if (step > 1) { // keep block min/max so peaks are not lost
          var mn = yv3, mx = yv3, xk = se.x[k];
          for (var q = k; q < Math.min(n, k + step); q++) { if (se.y[q] < mn) mn = se.y[q]; if (se.y[q] > mx) mx = se.y[q]; }
          var px = fx(xk);
          if (!started) { ctx.moveTo(px, fy(mn)); started = true; } else ctx.lineTo(px, fy(mn));
          ctx.lineTo(px, fy(mx));
        } else {
          var px2 = fx(se.x[k]), py2 = fy(yv3);
          if (!started) { ctx.moveTo(px2, py2); started = true; } else ctx.lineTo(px2, py2);
        }
      }
      ctx.stroke(); ctx.setLineDash([]);
      if (se.marker) {
        for (k = 0; k < n; k++) { var ym = se.y[k]; if (ym === null || !isFinite(ym) || (cfg.ylog && ym <= 0)) continue; ctx.beginPath(); ctx.arc(fx(se.x[k]), fy(ym), Math.max(2.5, F * 0.28), 0, 6.2832); ctx.fill(); }
      }
    });
    ctx.restore();

    // limit-line labels
    ctx.font = (F * 0.9) + 'px ' + fam; ctx.textAlign = 'right';
    (cfg.hlines || []).forEach(function (h) {
      if (!h.label) return; ctx.fillStyle = h.color || C.limit;
      ctx.fillText(h.label, L + pw - 4, Math.min(T + ph - F * 0.6, Math.max(T + F * 0.6, fy(h.y) - F * 0.7)));
    });
    ctx.font = F + 'px ' + fam;

    // legend
    ctx.textAlign = 'left';
    legend.forEach(function (it) {
      var col2 = it.se.color || C.palette[it.si % C.palette.length], lx = L + it.x, ly = T - F * 0.9 - (legRows - 1 - it.row) * F * 1.5;
      ctx.fillStyle = col2; ctx.fillRect(lx, ly - F * 0.35, F * 1.2, F * 0.7);
      ctx.fillStyle = C.fg; ctx.fillText(it.se.label, lx + F * 1.5, ly);
    });
  }

  root.Charts = { draw: draw, LIGHT: LIGHT, themeColors: themeColors };
})(typeof self !== 'undefined' ? self : this);
