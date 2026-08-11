import { expect, test, type Page } from "@playwright/test";

// Credentials of the E2E test user provisioned by the CI (Clerk API).
const EMAIL = process.env.E2E_EMAIL ?? "e2e@example.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "E2eTestPass!2026";

test("welcome screen shows for signed-out visitors", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Benvenuto in Board Game Organizer")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /sign in/i }).first(),
  ).toBeVisible();
});

test("sign-in, profile data and logout", async ({ page }) => {
  await page.goto("/sign-in");

  // Clerk v7 renders the sign-in form inline (no iframe)
  const identifier = page.getByPlaceholder("Enter email or username");
  await identifier.waitFor({ timeout: 30_000 });
  await identifier.fill(EMAIL);
  await page.getByRole("button", { name: /continue/i }).click();

  const password = page.getByPlaceholder(/enter your password/i);
  await password.waitFor({ timeout: 30_000 });
  await password.fill(PASSWORD);
  await page.getByRole("button", { name: /continue/i }).click();

  // Signed in: we land on /matches with the Counter
  await expect(page.getByText("Counter (Zustand)")).toBeVisible({
    timeout: 30_000,
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
