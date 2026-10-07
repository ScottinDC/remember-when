import { defineConfig, devices } from "@playwright/test";

const localURL = "http://127.0.0.1:5174";

// Default tests are isolated from production and use a synthetic backend.
export default defineConfig({
  testDir: "e2e",
  testMatch: "archive.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  timeout: 45000,
  expect: { timeout: 12000 },
  outputDir: "e2e-results",
  use: {
    baseURL: localURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    serviceWorkers: "block",
  },
  webServer: {
    command: "npx vite --host 127.0.0.1 --port 5174",
    url: localURL,
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54399",
      VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-public-test-key",
    },
  },
  projects: [
    { name: "local", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "webkit", use: { ...devices["iPhone 13"] } },
  ],
});
