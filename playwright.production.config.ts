import { defineConfig, devices } from "@playwright/test";

// Explicit opt-in: these smoke tests contact the deployed site and Google Auth.
export default defineConfig({
  testDir: "e2e",
  testMatch: "production-flow.spec.ts",
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  retries: 0,
  timeout: 45000,
  expect: { timeout: 12000 },
  reporter: "list",
  outputDir: "e2e-results/production",
  use: {
    ...devices["Desktop Chrome"],
    baseURL:
      process.env.E2E_PRODUCTION_URL ??
      "https://chic-sherbet-39bee5.netlify.app",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
