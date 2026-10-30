import { defineConfig, devices } from '@playwright/test';

const PORT = 8931;

export default defineConfig({
  testDir: './specs',
  timeout: 30000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: `node static-server.mjs`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    cwd: '.',
    env: { PORT: String(PORT) },
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
});
