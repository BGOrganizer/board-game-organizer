import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

/**
 * Web E2E (Playwright) against the Vercel preview deployment.
 *
 * Auth strategy: the CI provisions a Clerk test user via the Backend API (see
 * the `provision` job in pr-ci.yml) and exposes its email as `E2E_EMAIL`. This
 * spec signs in with that user using:
 *  - a Testing Token (bypasses Clerk bot detection in headless browsers), and
 *  - `clerk.signIn()` from @clerk/testing, which creates a server-side
 *    sign-in ticket via the Backend API — no password, no email verification,
 *    no cross-domain redirects (unlike a plain UI/URL-ticket sign-in).
 * The provisioned user is deleted after the run by the `cleanup-e2e-user` job
 * (see .github/scripts/cleanup-e2e-clerk-users.sh).
 */

const E2E_EMAIL = process.env.E2E_EMAIL ?? "";

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

test("sign-in (testing token + ticket), profile and logout", async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(!E2E_EMAIL, "E2E_EMAIL not set (CI provisions the user)");

  // Bypass bot detection for this test's browser context.
  await setupClerkTestingToken({ page });

  // Load Clerk on a public page, then sign in via a server-side ticket.
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: E2E_EMAIL });

  // signIn() completes in-page (no navigation): reload so the server component
  // sees the session and redirects to /matches with the Counter.
  await page.goto("/");
  await page.waitForURL("**/matches", { timeout: 60_000 });
  await expect(page.getByText("Counter (Zustand)")).toBeVisible({
    timeout: 60_000,
  });

  // Profile page shows the API data (name of the provisioned user).
  await page.goto("/profile");
  await expect(page.getByText("E2E Test")).toBeVisible({ timeout: 30_000 });

  // UI logout (full-screen spinner placeholder) → back to the welcome screen.
  await page.getByRole("button", { name: /logout/i }).click();
  await expect(page.getByText("Benvenuto in Board Game Organizer")).toBeVisible({
    timeout: 30_000,
  });
});
