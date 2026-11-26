/* Builds backend/Code.gs = cloudlogic.js (shared rules) + backend/gas.js (Google adapter). Run: node scripts/build-backend.js */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const logic = fs.readFileSync(path.join(root, 'www/js/cloudlogic.js'), 'utf8');
const gas = fs.readFileSync(path.join(root, 'backend/gas.js'), 'utf8');
const head = '/* Lift Ride Test Cloud backend — Google Apps Script.  Design & Developed by Md. Saiful Islam\n * GENERATED FILE: do not edit the CloudLogic part here. Source: www/js/cloudlogic.js + backend/gas.js (node scripts/build-backend.js) */\n\n';
fs.writeFileSync(path.join(root, 'backend/Code.gs'), head + logic + '\n' + gas);
console.log('backend/Code.gs written');
