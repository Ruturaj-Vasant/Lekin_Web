import { defineConfig, devices } from "@playwright/test";

const port = 3101;

export default defineConfig({
  testDir: "./scripts/benchmarks",
  testMatch: "browser-capacity.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 600_000,
  expect: { timeout: 120_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run start -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    gracefulShutdown: { signal: "SIGTERM", timeout: 2_000 },
  },
});

