import { expect, test } from "@playwright/test";

const INTERNAL_ERROR = /Internal Error/i;

test.describe("Supabase SPA — public smoke flow", () => {
  test("1. App shell loads without a legacy server error", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status(), "app HTTP status").toBe(200);
    await expect(page.locator("body")).not.toContainText(INTERNAL_ERROR);
  });

  test("2. Unauthenticated visitors see the Supabase sign-in screen", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Remember When" }),
    ).toBeVisible();
    await expect(page.getByText("Private Family Archive")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeEnabled({ timeout: 20_000 });
    await expect(
      page.getByText(/Could not reach the server/i),
    ).not.toBeVisible();
  });

  test("3. Google sign-in begins through Supabase Auth", async ({ page }) => {
    await page.goto("/");
    const button = page.getByRole("button", { name: "Continue with Google" });
    await expect(button).toBeEnabled({ timeout: 20_000 });
    await Promise.all([
      page.waitForURL(
        /accounts\.google\.com|\.supabase\.co\/auth\/v1\/authorize/,
        { timeout: 20_000 },
      ),
      button.click(),
    ]);
  });

  test("4. Vite bundle is served directly", async ({ page }) => {
    await page.goto("/");
    const script = page.locator('script[type="module"]');
    await expect(script).toHaveCount(1);
    const source = await script.getAttribute("src");
    expect(source).toBeTruthy();
    expect((await page.request.get(source!)).status()).toBe(200);
  });
});
