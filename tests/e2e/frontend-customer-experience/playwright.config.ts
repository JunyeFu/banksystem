import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'customer-experience-visual.spec.ts', fullyParallel: false, workers: 1, timeout: 30_000,
  expect: { timeout: 8_000, toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 } }, reporter: [['line']],
  outputDir: '../../../test-results/frontend-customer-experience', snapshotPathTemplate: '{testDir}/snapshots/{arg}{ext}',
  use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' },
  webServer: { command: 'npm.cmd run dev -- --host 127.0.0.1 --port 15176', cwd: '../../../apps/customer-portal', url: 'http://127.0.0.1:15176/portal/', reuseExistingServer: false, timeout: 120_000 },
});
