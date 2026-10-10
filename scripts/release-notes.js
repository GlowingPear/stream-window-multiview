// Prints the release notes for one version, taken from CHANGELOG.md.
//   node scripts/release-notes.js 0.2.10   (or v0.2.10)
const fs = require('fs');
const path = require('path');

const want = String(process.argv[2] || '').replace(/^v/i, '').trim();
const text = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8').replace(/^﻿/, '').replace(/\r/g, '');
const lines = text.split('\n');
let start = -1;
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^##\s+v?([0-9][0-9.]*)/);
  if (m && m[1] === want) { start = i + 1; break; }
}
const body = [];
if (start >= 0) {
  for (let i = start; i < lines.length && !/^##\s/.test(lines[i]); i++) body.push(lines[i]);
}
const changes = body.join('\n').trim() || '- See CHANGELOG.md for details.';

process.stdout.write(`### What's new in ${want}
${changes}

### Download
- **Windows:** \`Stream-Multiview-Setup-${want}.exe\`
- **Mac:** \`Stream-Multiview-${want}-mac.dmg\`

Already have Stream Multiview? It updates itself, no download needed.

First time installing? Windows may say "Windows protected your PC": click **More info → Run anyway**. On a Mac, if it says the app can't be checked, open **System Settings → Privacy & Security** and click **Open Anyway**. This happens because the app isn't code-signed yet.

Full history: \`CHANGELOG.md\`
`);
