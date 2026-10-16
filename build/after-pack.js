// electron-builder hook: runs after the app is packed, before it's signed and turned into an installer.
// Switches on the engine's cookie encryption (the same thing harden.js does for the source version),
// so saved logins in the installed app are encrypted.
const path = require('path');
const fs = require('fs');
const { harden } = require('../src/main/harden');

exports.default = async function afterPack(context) {
  const name = context.packager.appInfo.productFilename;
  const exe = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${name}.app`, 'Contents', 'MacOS', name)
    : path.join(context.appOutDir, `${name}.exe`);
  if (!fs.existsSync(exe)) throw new Error('after-pack: app not found at ' + exe);
  const res = harden(exe, { resign: false });      // electron-builder signs the app itself afterwards
  console.log(`  • saved-login encryption: ${res}  file=${path.basename(exe)}`);
  if (res !== 'on' && res !== 'turned-on') throw new Error('after-pack: could not switch on login encryption (' + res + ')');
};
