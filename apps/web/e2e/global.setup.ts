import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

/**
 * Project-based global setup (NOT a function-based `globalSetup`): it runs in
 * the same process as the test workers, so the env vars set here
 * (`CLERK_TESTING_TOKEN` + `CLERK_FAPI`) propagate to every test.
 *
 * `clerkSetup()` mints a short-lived Testing Token via the Clerk Backend API
 * (requires `CLERK_SECRET_KEY`; the publishable key is read from
 * `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`). The token lets the headless browser
 * bypass Clerk's bot detection, which is what blocks a plain Playwright
 * sign-in without it.
 *
 * Locally it loads `apps/web/.env.local` (dotenv default); in CI the values
 * come from the `e2e-playwright` job env.
 */
setup.describe.configure({ mode: "serial" });

setup("clerk testing token setup", async () => {
  await clerkSetup();
});
