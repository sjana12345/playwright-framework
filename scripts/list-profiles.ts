import { inspectBrowserProfiles, isCdpPortAvailable } from '../utils/browser/profileManager';

try {
  (process as any).loadEnvFile?.();
} catch {}

async function main() {
  console.log('\n======================================================');
  console.log('       INSTALLED CORPORATE BROWSER PROFILES');
  console.log('======================================================\n');

  const cdpRunning = await isCdpPortAvailable(9222);
  console.log(`📡 Remote Debugging Port 9222 (CDP): ${cdpRunning ? '✅ ACTIVE (Ready to connect)' : '⚪ Inactive'}`);
  console.log('');

  for (const channel of ['chrome', 'msedge']) {
    const inspection = inspectBrowserProfiles(channel);
    const displayName = channel === 'chrome' ? 'Google Chrome' : 'Microsoft Edge';

    console.log(`--- [${displayName}] ---`);
    console.log(`Path: ${inspection.userDataDir}`);
    console.log(`Exists: ${inspection.exists ? 'Yes' : 'No'}`);
    console.log(`Running / Locked: ${inspection.isLocked ? '⚠️ YES (Browser is currently open)' : '✅ NO (Available for direct launch)'}`);

    if (inspection.profiles.length > 0) {
      console.log('Detected Profiles:');
      inspection.profiles.forEach((p) => {
        const isDefault = p.id === 'Default' ? ' (Default)' : '';
        const user = p.userName ? ` [${p.userName}]` : '';
        console.log(`  - Profile ID: "${p.id}"${isDefault} | Name: "${p.name}"${user}`);
      });
    } else {
      console.log('  No specific profiles found.');
    }
    console.log('');
  }

  console.log('======================================================');
  console.log('Usage tips:');
  console.log('1. To run with your real system profile: close running browser windows, then run your test.');
  console.log('2. To run while keeping your browser open: tests will automatically use a dedicated persistent profile (.browser-profile) without crashing.');
  console.log('3. To run directly inside your open browser: launch Chrome with "npm run browser:debug", then tests connect automatically via CDP.');
  console.log('======================================================\n');
}

main().catch(console.error);

