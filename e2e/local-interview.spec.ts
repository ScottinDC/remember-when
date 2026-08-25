import { expect, test } from "@playwright/test";

test.describe("Local — Supabase SPA smoke flow", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name !== "local") test.skip();
    try {
      await page.goto("/", { waitUntil: "domcontentloaded", timeout: 10_000 });
    } catch {
      test.skip(true, "Local Vite server is not running on 127.0.0.1:5173 — run npm run client");
    }
  });

  test("1. Local app bootstraps Supabase Auth without an Express API", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Remember When" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
    await expect(page.getByText(/Could not reach the server/i)).not.toBeVisible();
  });
});
