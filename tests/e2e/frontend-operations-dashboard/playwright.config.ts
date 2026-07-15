import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: 'operations-dashboard-visual.spec.ts', fullyParallel: false, workers: 1, timeout: 30_000,
  expect: { timeout: 8_000, toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01 } },
  reporter: [['line']], outputDir: '../../../test-results/frontend-operations-dashboard', snapshotPathTemplate: '{testDir}/snapshots/{arg}{ext}',
  use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' },
  webServer: { command: 'npm.cmd run dev -- --host 127.0.0.1 --port 15177', cwd: '../../../apps/operations-console', url: 'http://127.0.0.1:15177/ops/', reuseExistingServer: false, timeout: 120_000 },
});
