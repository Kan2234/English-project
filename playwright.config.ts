import { defineConfig, devices } from '@playwright/test';

// E2E suite against a running site (local Docker staging by default).
// In the Playwright Docker image, point it at the host: E2E_BASE_URL=http://host.docker.internal:8081
const baseURL = (process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8081').replace(/\/?$/, '/');
const CI = !!process.env.CI;

// Let media start without a click, so real-exam audio checks do not depend on
// each engine's autoplay heuristics (the app's own "click to start" path is still tested).
const chromiumAudio = { args: ['--autoplay-policy=no-user-gesture-required'] };
const firefoxAudio = { firefoxUserPrefs: { 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 } };

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  outputDir: 'test-results',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: chromiumAudio } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], launchOptions: firefoxAudio } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    {
      name: 'mobile-375',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, launchOptions: chromiumAudio },
    },
    {
      name: 'tablet-768',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, launchOptions: chromiumAudio },
    },
  ],
});
