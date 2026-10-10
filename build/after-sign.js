// electron-builder hook: runs after the app is signed, before the Mac disk image is made.
// Mac only: re-signs the app with the project's own (free, self-signed) certificate, if the build has it.
//
// Why: macOS keeps the key that encrypts your saved logins in the Keychain, and only lets the app
// that saved it read it back. It recognises "the same app" by its signature. An ad-hoc signature
// (what you get without a certificate) is different for every build, so after each update macOS
// treats the app as a stranger and the saved logins can't be read. Signing every version with the
// same certificate keeps the signature's identity the same, so logins survive updates.
// The build workflow sets MAC_SIGN_IDENTITY / MAC_SIGN_KEYCHAIN when the MAC_CERT_P12 secret exists.
const path = require('path');
const { execFileSync } = require('child_process');

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const id = process.env.MAC_SIGN_IDENTITY;
  if (!id) { console.log('  • Mac signing certificate not set up: the app keeps its ad-hoc signature'); return; }
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const kc = process.env.MAC_SIGN_KEYCHAIN;
  execFileSync('codesign', ['--force', '--deep', '--timestamp=none', '--sign', id, ...(kc ? ['--keychain', kc] : []), app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  // The identity macOS will remember the app by. It must not change between versions.
  const out = execFileSync('codesign', ['-d', '-r-', app], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const req = (out.match(/designated => (.*)/) || [])[1] || out.trim();
  console.log(`  • signed with "${id}"`);
  console.log(`::notice title=Mac app identity::${req}`);
  if (!/certificate/.test(req)) throw new Error('after-sign: the app is not signed with the certificate: ' + req);
};
