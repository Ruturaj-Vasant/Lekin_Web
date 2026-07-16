import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: externalBaseURL ? undefined : {
    command: `npm run build && npm run start -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    gracefulShutdown: { signal: "SIGTERM", timeout: 2_000 },
  },
});
