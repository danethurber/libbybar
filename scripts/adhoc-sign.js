// electron-builder afterPack hook: ad-hoc sign the app bundle.
//
// With no signature at all, quarantined downloads on Apple Silicon hit a
// dead-end "LibbyBar is damaged" dialog. Ad-hoc signing (identity "-") gives
// Gatekeeper a valid signature, downgrading that to the overridable
// "unverified developer" flow. Real Developer ID + notarization would remove
// the dialog entirely, but needs a paid Apple Developer account.
//
// Signs inside-out (nested frameworks/helpers before the outer app) rather
// than with the deprecated `codesign --deep`, then verifies the result so a
// bad signature fails the build instead of shipping.
//
// Plain .js: electron-builder require()s this file directly.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function sign(target) {
  execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', target], {
    stdio: 'inherit',
  });
}

module.exports = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const frameworksDir = path.join(appPath, 'Contents', 'Frameworks');

  console.log(`  • ad-hoc signing ${appPath}`);

  // Nested bundles first (deepest code sealed before its container).
  if (fs.existsSync(frameworksDir)) {
    for (const entry of fs.readdirSync(frameworksDir)) {
      if (entry.endsWith('.framework') || entry.endsWith('.app') || entry.endsWith('.dylib')) {
        sign(path.join(frameworksDir, entry));
      }
    }
  }
  // Then the outer app.
  sign(appPath);

  // Fail loudly if the bundle isn't actually valid + self-consistent.
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
};
