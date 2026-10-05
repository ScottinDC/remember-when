import { defineConfig, devices } from "@playwright/test";

const productionBaseURL = process.env.E2E_PRODUCTION_URL ?? "https://chic-sherbet-39bee5.netlify.app";
const localBaseURL = process.env.E2E_LOCAL_URL ?? "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off"
  },
  projects: [
    {
      name: "production",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: productionBaseURL
      }
    },
    {
      name: "local",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: localBaseURL
      }
    }
  ],
  outputDir: "e2e-results"
});
