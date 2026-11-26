/* ===== Google Apps Script adapter (platform part) — storage only; all rules are in CloudLogic above ===== */

// STEP 1: change these three lines, run setup() ONCE, then delete the password from this file.
var ADMIN_USER = 'admin';
var ADMIN_PASS = 'CHANGE-ME-123';
var ADMIN_NAME = 'Administrator';
// Where "new access request" emails go. Empty = the Google account that owns this script. Several: 'a@x.com,b@y.com'
var NOTIFY_EMAIL = '';
// Optional: link to the web app (GitHub Pages / Netlify) put into the emails.
var APP_LINK = '';

var FOLDER_NAME = 'LiftRideTest-Data';
var SHEET_USERS = 'Users';
var SHEET_RECORDS = 'Records';

function props_() { return PropertiesService.getScriptProperties(); }
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name, headers) {
  var sh = ss_().getSheetByName(name);
  if (!sh) { sh = ss_().insertSheet(name); }
  if (sh.getLastRow() === 0) { sh.appendRow(headers); sh.setFrozenRows(1); }
  return sh;
}

// Run this once from the editor (Run button). It creates the sheets, the Drive folder, the signing secret and the first admin.
function setup() {
  var p = props_();
  if (!p.getProperty('SECRET')) p.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  if (!p.getProperty('FOLDER_ID')) {
    var folder = DriveApp.createFolder(FOLDER_NAME);
    p.setProperty('FOLDER_ID', folder.getId());
  }
  var us = sheet_(SHEET_USERS, CloudLogic.USER_COLS);
  sheet_(SHEET_RECORDS, CloudLogic.COLS);
  if (us.getLastRow() < 2) {
    if (!CloudLogic.validPassword(ADMIN_PASS) || ADMIN_PASS === 'CHANGE-ME-123') throw new Error('Edit ADMIN_USER / ADMIN_PASS at the top of the file first (password 6+ characters, not the sample one).');
    var st = store_();
    var salt = Utilities.getUuid();
    st.putUser({ username: CloudLogic.cleanUser(ADMIN_USER), name: ADMIN_NAME, section: 'Admin', email: adminEmail_(), role: 'admin', status: 'active', salt: salt, hash: CloudLogic.hashPassword(ADMIN_PASS, salt, st.digestHex), created: Date.now(), decidedBy: 'setup', decidedAt: Date.now() });
  }
  // one test email proves that Gmail sending is authorised
  MailApp.sendEmail(adminEmail_(), 'Lift Ride Test: backend ready', 'Setup finished. Access requests will be emailed to this address.' + (APP_LINK ? '\nApp: ' + APP_LINK : ''));
  Logger.log('Setup done. Data folder id: ' + p.getProperty('FOLDER_ID') + '. Now: Deploy > New deployment > Web app.');
}

function adminEmail_() { return NOTIFY_EMAIL || Session.getEffectiveUser().getEmail(); }

function mail_(kind, u) {
  var link = APP_LINK ? '\n\nApp: ' + APP_LINK : '';
  if (kind === 'request') {
    MailApp.sendEmail(adminEmail_(), 'Lift Ride Test: access request from ' + u.name + ' (' + u.username + ')',
      'A new user asked for access.\n\nName: ' + u.name + '\nID: ' + u.username + '\nSection: ' + u.section + '\nEmail: ' + u.email + '\nTime: ' + new Date(u.created) +
      '\n\nOpen Lift Ride Test > Admin > Access requests to approve or reject.' + link);
  } else if (kind === 'approved' && u.email) {
    MailApp.sendEmail(u.email, 'Lift Ride Test: your access is approved',
      'Hello ' + u.name + ',\n\nYour access to Lift Ride Test is approved. Sign in with your ID "' + u.username + '" and your password.' + link);
  } else if (kind === 'rejected' && u.email) {
    MailApp.sendEmail(u.email, 'Lift Ride Test: access request not approved',
      'Hello ' + u.name + ',\n\nYour access request for ID "' + u.username + '" was not approved. Please contact the administrator.');
  }
}

function hex_(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) { var b = bytes[i]; if (b < 0) b += 256; s += (b < 16 ? '0' : '') + b.toString(16); }
  return s;
}

function store_() {
  var cache = CacheService.getScriptCache();
  var secret = props_().getProperty('SECRET');
  return {
    now: function () { return Date.now(); },
    uuid: function () { return Utilities.getUuid(); },
    digestHex: function (s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); },
    sign: function (s) { return hex_(Utilities.computeHmacSha256Signature(s, secret)); },
    lock: function (fn) {
      var lk = LockService.getScriptLock(); lk.waitLock(20000);
      try { return fn(); } finally { lk.releaseLock(); }
    },
    getFails: function (u) { var v = cache.get('fail_' + u); return v ? JSON.parse(v) : null; },
    setFails: function (u, o) { cache.put('fail_' + u, JSON.stringify(o), 900); },

    notify: function (kind, u) { mail_(kind, u); },
    users: function () {
      var C = CloudLogic.USER_COLS, sh = sheet_(SHEET_USERS, C), n = sh.getLastRow();
      if (n < 2) return [];
      return sh.getRange(2, 1, n - 1, C.length).getValues().map(function (r) {
        var o = {}; for (var i = 0; i < C.length; i++) o[C[i]] = r[i];
        ['username', 'name', 'section', 'email', 'role', 'status', 'salt', 'hash', 'decidedBy'].forEach(function (k) { o[k] = String(o[k] === undefined ? '' : o[k]); });
        o.created = Number(o.created) || 0; o.decidedAt = Number(o.decidedAt) || 0;
        return o;
      });
    },
    putUser: function (u) {
      var C = CloudLogic.USER_COLS, sh = sheet_(SHEET_USERS, C), n = sh.getLastRow();
      var row = C.map(function (k) { return u[k] === undefined ? '' : u[k]; });
      if (n >= 2) {
        var names = sh.getRange(2, 1, n - 1, 1).getValues();
        for (var i = 0; i < names.length; i++) if (String(names[i][0]) === u.username) { sh.getRange(i + 2, 1, 1, row.length).setValues([row]); return; }
      }
      sh.appendRow(row);
    },
    rows: function () {
      var sh = sheet_(SHEET_RECORDS, CloudLogic.COLS), n = sh.getLastRow();
      if (n < 2) return [];
      return sh.getRange(2, 1, n - 1, CloudLogic.COLS.length).getValues().map(function (r) {
        var o = CloudLogic.rowToObj(r); o.uploadedAt = Number(o.uploadedAt) || 0; o.id = String(o.id); o.clientId = String(o.clientId); o.user = String(o.user);
        o.date = String(o.date); o.from = String(o.from); o.to = String(o.to); o.building = String(o.building); o.lift = String(o.lift); return o;
      });
    },
    addRow: function (o) { sheet_(SHEET_RECORDS, CloudLogic.COLS).appendRow(CloudLogic.objToRow(o)); },
    delRow: function (id) {
      var sh = sheet_(SHEET_RECORDS, CloudLogic.COLS), n = sh.getLastRow();
      if (n < 2) return null;
      var vals = sh.getRange(2, 1, n - 1, CloudLogic.COLS.length).getValues(), fc = CloudLogic.COLS.indexOf('fileId');
      for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === id) { var f = String(vals[i][fc]); sh.deleteRow(i + 2); return f; }
      return null;
    },
    writeFile: function (id, text) {
      var blob = Utilities.gzip(Utilities.newBlob(text, 'application/json', id + '.json'));
      blob.setName(id + '.json.gz');
      return DriveApp.getFolderById(props_().getProperty('FOLDER_ID')).createFile(blob).getId();
    },
    readFile: function (fileId) { return Utilities.ungzip(DriveApp.getFileById(fileId).getBlob()).getDataAsString(); },
    trashFile: function (fileId) { try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* already gone */ } }
  };
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet() { return json_({ ok: true, app: 'Lift Ride Test backend', version: CloudLogic.VERSION }); }

function doPost(e) {
  var out;
  try {
    if (!props_().getProperty('SECRET')) { out = { ok: false, code: 'SETUP', error: 'Backend not set up: run setup() once in the Apps Script editor.' }; }
    else { out = CloudLogic.handle(JSON.parse(e.postData.contents), store_()); }
  } catch (err) { out = { ok: false, code: 'SERVER', error: 'Server error: ' + (err && err.message || err) }; }
  return json_(out);
}
