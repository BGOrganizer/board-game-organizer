import { expect, test } from "@playwright/test";

/**
 * Web E2E (Playwright) against the Vercel preview deployment.
 *
 * NOTE on authentication: the full sign-in/sign-out flow is covered by the
 * Maestro E2E (mobile) which runs in the same pipeline. Automating a full
 * Clerk web sign-in from a headless browser is blocked by Clerk's security
 * (new-device email verification + dev-browser cookies), so the web tests
 * cover the signed-out UI and the sign-in form rendering.
 */

test("welcome screen shows for signed-out visitors", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Benvenuto in Board Game Organizer")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i }).first()).toBeVisible();
});

test("sign-in page renders the Clerk form", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByText("Sign in to Board Game Organizer")).toBeVisible();
  await expect(page.getByPlaceholder("Enter email or username")).toBeVisible();
  await expect(page.getByRole("button", { name: /continue/i })).toBeVisible();
});
