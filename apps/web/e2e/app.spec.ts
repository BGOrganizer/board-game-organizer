import { expect, test, type Page } from "@playwright/test";

// Credentials of the E2E test user provisioned by the CI (Clerk API).
const EMAIL = process.env.E2E_EMAIL ?? "e2e@example.com";
const PASSWORD = process.env.E2E_PASSWORD ?? "E2eTestPass!2026";

/** Clerk's hosted sign-in UI runs inside an iframe. */
function clerkFrame(page: Page) {
  const frame = page
    .frames()
    .find(
      (f) =>
        f !== page.mainFrame() &&
        (f.url().includes("clerk") || f.url().includes("accounts.dev")),
    );
  if (!frame) throw new Error("Clerk sign-in iframe not found");
  return frame;
}

test("welcome screen shows for signed-out visitors", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Benvenuto in Board Game Organizer")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /sign in/i }).first(),
  ).toBeVisible();
});

test("sign-in, profile data and logout", async ({ page }) => {
  await page.goto("/sign-in");

  // Wait for Clerk's iframe to mount
  await page.waitForSelector("iframe", { timeout: 30_000 });
  const frame = clerkFrame(page);

  // Step 1: identifier (username or email) → Continue
  const identifier = frame
    .locator("input[name='identifier'], input[name='username'], input[type='email']")
    .first();
  await identifier.waitFor({ timeout: 30_000 });
  await identifier.fill(EMAIL);
  await frame.getByRole("button", { name: /continue/i }).click();

  // Step 2: password → Continue
  const password = frame.locator("input[type='password']").first();
  await password.waitFor({ timeout: 30_000 });
  await password.fill(PASSWORD);
  await frame.getByRole("button", { name: /continue/i }).click();

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
