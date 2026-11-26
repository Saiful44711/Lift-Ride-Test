/* pdf.js — tiny PDF writer: places canvas pages as JPEG images in an A4 PDF
 * (no font embedding needed)
 * Design & Developed by Md. Saiful Islam */
(function (root) {
  'use strict';

  function dataUrlToBytes(url) {
    var b64 = url.split(',')[1], bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function ascii(s) { var o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 255; return o; }

  // canvases: A4-ratio canvases
  function fromCanvases(canvases, meta) {
    var PW = 595.28, PH = 841.89, parts = [], offsets = [], len = 0;
    function push(u8) { parts.push(u8); len += u8.length; }
    function pushStr(s) { push(ascii(s)); }
    function obj(n, body) { offsets[n] = len; pushStr(n + ' 0 obj\n' + body + '\nendobj\n'); }

    pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    var nPages = canvases.length, kids = [], first = 3;
    for (var i = 0; i < nPages; i++) kids.push((first + i * 3) + ' 0 R');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + nPages + ' >>');
    var infoNum = first + nPages * 3;
    for (i = 0; i < nPages; i++) {
      var pg = first + i * 3, ct = pg + 1, im = pg + 2, cv = canvases[i];
      obj(pg, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R >>');
      var content = 'q ' + PW + ' 0 0 ' + PH + ' 0 0 cm /Im0 Do Q';
      obj(ct, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
      var jpg = dataUrlToBytes(cv.toDataURL('image/jpeg', 0.92));
      offsets[im] = len;
      pushStr(im + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + cv.width + ' /Height ' + cv.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n');
      push(jpg);
      pushStr('\nendstream\nendobj\n');
    }
    var title = String((meta && meta.title) || 'Lift Ride Report').replace(/[^\x20-\x7e]/g, '?').replace(/[()\\]/g, ' ');
    obj(infoNum, '<< /Title (' + title + ') /Author (Md. Saiful Islam) /Producer (Lift Ride Test) >>');
    var xref = len, total = infoNum + 1, x = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (i = 1; i < total; i++) x += ('0000000000' + offsets[i]).slice(-10) + ' 00000 n \n';
    pushStr(x + 'trailer\n<< /Size ' + total + ' /Root 1 0 R /Info ' + infoNum + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    var out = new Uint8Array(len), p = 0;
    parts.forEach(function (u) { out.set(u, p); p += u.length; });
    return out;
  }

  root.PDFLib = { fromCanvases: fromCanvases };
})(typeof self !== 'undefined' ? self : this);
