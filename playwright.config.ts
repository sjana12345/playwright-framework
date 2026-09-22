import { defineConfig, devices } from '@playwright/test';
import { defineBddProject } from 'playwright-bdd';

try {
    (process as any).loadEnvFile?.();
} catch {}

const proxyServer =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;

export default defineConfig({
    fullyParallel: false,
    workers: 1, // Single worker avoids multi-process lockfile collisions on persistent browser profiles
    retries: process.env.CI ? 2 : 1,
    reporter: [
        ['html', {
            open: 'never'
        }]
    ],
    use: {
        headless: false,
        ignoreHTTPSErrors: true, // Bypass corporate SSL/TLS inspection (Zscaler, Netskope, etc.)
        proxy: proxyServer ? { server: proxyServer } : undefined,
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        trace: 'retain-on-failure',
        channel: process.env.BROWSER_CHANNEL || 'chrome', // Directly launches pre-installed Google Chrome (or 'msedge') without downloading Playwright browsers
        launchOptions: {
            executablePath: process.env.BROWSER_PATH || undefined, // Optional custom enterprise path to chrome.exe / msedge.exe
            args: [
                `--profile-directory=${process.env.BROWSER_PROFILE || 'Default'}`, // Defaults to browser's "Default" profile (or custom via BROWSER_PROFILE)
            ],
        },
        extraHTTPHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
        }
    },
    projects: [
        {
            ...defineBddProject({
                name: 'App1',
                features: 'App1/features/**/*.feature',
                steps: 'App1/steps/**/*.ts',
                importTestFrom: 'utils/fixtures/persistentBrowser.ts',
                disableWarnings: { importTestFrom: true },
            }),
            use: {
                ...devices['Desktop Chrome'],
                channel: process.env.BROWSER_CHANNEL || 'chrome',
            }
        },
        {
            ...defineBddProject({
                name: 'App2',
                features: 'App2/features/**/*.feature',
                steps: 'App2/steps/**/*.ts',
                importTestFrom: 'utils/fixtures/persistentBrowser.ts',
                disableWarnings: { importTestFrom: true },
            }),
            use: {
                ...devices['Desktop Chrome'],
                channel: process.env.BROWSER_CHANNEL || 'chrome',
            }
        },
        {
            ...defineBddProject({
                name: 'App3',
                features: 'App3/features/**/*.feature',
                steps: 'App3/steps/**/*.ts',
                importTestFrom: 'utils/fixtures/persistentBrowser.ts',
                disableWarnings: { importTestFrom: true },
            }),
            use: {
                ...devices['Desktop Chrome'],
                channel: process.env.BROWSER_CHANNEL || 'chrome',
            }
        }
    ]
});