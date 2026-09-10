import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

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

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test("welcome screen shows for signed-out visitors", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await expect(page.getByText("Welcome to Board Game Organizer")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i }).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("sign-in page renders the Clerk form", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByText("Sign in to Board Game Organizer")).toBeVisible();
  await expect(page.getByPlaceholder("Enter email or username")).toBeVisible();
  await expect(page.getByRole("button", { name: /continue/i })).toBeVisible();
});

test("sign-in (testing token + ticket), profile and logout", async ({ page }) => {
  test.setTimeout(300_000);
  test.skip(!E2E_EMAIL, "E2E_EMAIL not set (CI provisions the user)");

  // Bypass bot detection for this test's browser context.
  await setupClerkTestingToken({ page });

  // Load Clerk on a public page, then sign in via a server-side ticket.
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: E2E_EMAIL });

  // signIn() completes in-page (no navigation): reload so the server component
  // sees the session and redirects to /matches.
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  await expect(page.getByText("Matches")).toBeVisible({
    timeout: 60_000,
  });

  // Profile page shows the API data (name of the provisioned user). The
  // header also shows the first name, so target the page heading.
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "E2E Test" })).toBeVisible({
    timeout: 30_000,
  });

  // Every authenticated page stays fluid at phone, tablet and desktop widths.
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const path of ["/matches", "/contacts", "/profile", "/groups", "/organizations"]) {
      await page.goto(path);
      await expectNoHorizontalOverflow(page);
    }
  }

  await page.goto("/profile");
  // UI logout (full-screen spinner placeholder) → back to the welcome screen.
  await page.getByRole("button", { name: /logout/i }).click();
  await expect(page.getByText("Welcome to Board Game Organizer")).toBeVisible({
    timeout: 30_000,
  });
});
