// electron-builder afterPack hook: ad-hoc sign the app bundle.
//
// With no signature at all, quarantined downloads on Apple Silicon hit a
// dead-end "LibbyBar is damaged" dialog. Ad-hoc signing (identity "-") gives
// Gatekeeper a valid signature, downgrading that to the overridable
// "unverified developer" flow (System Settings -> Privacy & Security ->
// Open Anyway). Real Developer ID + notarization would remove the dialog
// entirely, but needs a paid Apple Developer account.
//
// Plain .js: electron-builder require()s this file directly.

const { execFileSync } = require('node:child_process');
const path = require('node:path');

module.exports = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  console.log(`  • ad-hoc signing ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });
};
