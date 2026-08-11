import { expect, test } from "@playwright/test";

// Credentials of the E2E test user provisioned by the CI (Clerk API).
const SIGNIN_URL = process.env.E2E_SIGNIN_URL ?? "";

test("welcome screen shows for signed-out visitors", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Benvenuto in Board Game Organizer")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i }).first()).toBeVisible();
});

test("sign-in (Clerk ticket), profile data and logout", async ({ page }) => {
  // Clerk sign-in ticket: authenticates without password and without the
  // "new device" verification, then redirects to the app.
  await page.goto(SIGNIN_URL);

  // Signed in: we land on /matches with the Counter
  await expect(page.getByText("Counter (Zustand)")).toBeVisible({
    timeout: 60_000,
  });

  // Profile page shows the API data (name of the provisioned user)
  await page.goto("/profile");
  await expect(page.getByText("E2E Test")).toBeVisible({ timeout: 30_000 });

  // Logout (full-screen spinner placeholder) → back to the welcome screen
  await page.getByRole("button", { name: /logout/i }).click();
  await expect(page.getByText("Benvenuto in Board Game Organizer")).toBeVisible({
    timeout: 30_000,
  });
});
