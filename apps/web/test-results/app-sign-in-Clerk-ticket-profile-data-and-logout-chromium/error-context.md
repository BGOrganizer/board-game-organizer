# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: app.spec.ts >> sign-in (Clerk ticket), profile data and logout
- Location: e2e/app.spec.ts:12:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Counter (Zustand)')
Expected: visible
Timeout: 60000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 60000ms
  - waiting for getByText('Counter (Zustand)')

```

```yaml
- paragraph: Secured by
- link "Clerk logo":
  - /url: https://www.clerk.com?utm_source=clerk&utm_medium=account_portal
  - img
- paragraph: Development mode. You are signed in, but Clerk cannot redirect to your application
- banner:
  - img
  - button "Open organization switcher":
    - img "E2E Test's logo"
    - text: Personal account
    - img
  - button "Open user menu":
    - img "E2E Test's logo"
- heading "Welcome, E2E Test" [level=1]
- paragraph: You are signed in. Now, it's time to connect Clerk to your application.
- link "Start building":
  - /url: https://dashboard.clerk.com/redirect?instance_url=singular-marten-79.accounts.dev
- img "Default redirect illustration"
- alert: My account | Board Game Organizer
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | // Credentials of the E2E test user provisioned by the CI (Clerk API).
  4  | const SIGNIN_URL = process.env.E2E_SIGNIN_URL ?? "";
  5  | 
  6  | test("welcome screen shows for signed-out visitors", async ({ page }) => {
  7  |   await page.goto("/");
  8  |   await expect(page.getByText("Benvenuto in Board Game Organizer")).toBeVisible();
  9  |   await expect(page.getByRole("button", { name: /sign in/i }).first()).toBeVisible();
  10 | });
  11 | 
  12 | test("sign-in (Clerk ticket), profile data and logout", async ({ page }) => {
  13 |   // Clerk sign-in ticket: authenticates without password and without the
  14 |   // "new device" verification, then redirects to the app.
  15 |   await page.goto(SIGNIN_URL);
  16 | 
  17 |   // Signed in: we land on /matches with the Counter
> 18 |   await expect(page.getByText("Counter (Zustand)")).toBeVisible({
     |                                                     ^ Error: expect(locator).toBeVisible() failed
  19 |     timeout: 60_000,
  20 |   });
  21 | 
  22 |   // Profile page shows the API data (name of the provisioned user)
  23 |   await page.goto("/profile");
  24 |   await expect(page.getByText("E2E Test")).toBeVisible({ timeout: 30_000 });
  25 | 
  26 |   // Logout (full-screen spinner placeholder) → back to the welcome screen
  27 |   await page.getByRole("button", { name: /logout/i }).click();
  28 |   await expect(page.getByText("Benvenuto in Board Game Organizer")).toBeVisible({
  29 |     timeout: 30_000,
  30 |   });
  31 | });
  32 | 
```