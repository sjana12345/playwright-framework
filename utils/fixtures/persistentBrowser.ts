import { test as base } from 'playwright-bdd';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import * as path from 'path';
import {
  getSystemUserDataDir,
  isProfileDirectoryLocked,
  isCdpPortAvailable,
} from '../browser/profileManager';

try {
  (process as any).loadEnvFile?.();
} catch {}

export const test = base.extend<{
  context: BrowserContext;
  page: Page;
}>({
  context: async ({}, use) => {
    const channel = process.env.BROWSER_CHANNEL || 'chrome';
    const profile = process.env.BROWSER_PROFILE || 'Default';
    const usePersistent = process.env.USE_PERSISTENT_PROFILE !== 'false'; // Default to true

    // 1. Option: Connect to already running Chrome/Edge via CDP
    const cdpPort = parseInt(process.env.CDP_PORT || '9222', 10);
    const cdpActive = await isCdpPortAvailable(cdpPort);

    if (process.env.USE_CDP === 'true' || (cdpActive && process.env.USE_CDP !== 'false')) {
      console.log(`\n[BrowserProfile] Connecting to running browser over CDP on port ${cdpPort}...`);
      const browser = await chromium.connectOverCDP(`http://localhost:${cdpPort}`);
      const context = browser.contexts()[0] || (await browser.newContext({ ignoreHTTPSErrors: true }));
      await use(context);
      return;
    }

    // 2. Persistent Context Mode (Default)
    if (usePersistent) {
      const systemDataDir = getSystemUserDataDir(channel);
      const isLocked = isProfileDirectoryLocked(systemDataDir);

      let userDataDir: string;

      if (!isLocked && process.env.USE_DEDICATED_PROFILE !== 'true') {
        // System browser is CLOSED -> We can launch directly with the user's real live system profile!
        userDataDir = systemDataDir;
        console.log(`\n[BrowserProfile] System browser is closed. Launching directly with live system profile "${profile}" from:\n  ${userDataDir}`);
      } else {
        // System browser is OPEN -> To avoid Chromium's ProcessSingleton crash (exit code 21),
        // use a dedicated project-local persistent directory (.browser-profile)
        userDataDir = path.resolve(process.cwd(), '.browser-profile', channel);
        console.log(`\n[BrowserProfile] Active browser detected. Launching isolated persistent profile "${profile}" from:\n  ${userDataDir}`);
        console.log(`[BrowserProfile] Tip: Close all open ${channel} windows or run "npm run browser:debug" to attach directly to your open browser.\n`);
      }

      const context = await chromium.launchPersistentContext(userDataDir, {
        channel,
        headless: false,
        ignoreHTTPSErrors: true,
        args: [
          `--profile-directory=${profile}`,
        ],
      });

      await use(context);
      await context.close();
    } else {
      // 3. Fallback: Ephemeral Incognito-like Sandbox (if USE_PERSISTENT_PROFILE=false)
      const browser = await chromium.launch({
        channel,
        headless: false,
      });
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
      });
      await use(context);
      await context.close();
      await browser.close();
    }
  },

  page: async ({ context }, use) => {
    const page = context.pages()[0] || (await context.newPage());
    await use(page);
  },
});
