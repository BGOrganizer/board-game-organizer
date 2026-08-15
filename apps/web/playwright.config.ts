import { defineConfig, devices } from "@playwright/test";

// Web E2E tests. Run against the Vercel PREVIEW deployment by default:
//   PLAYWRIGHT_BASE_URL=https://<web-preview>.vercel.app pnpm --filter web test:e2e
// Locally: PLAYWRIGHT_BASE_URL=http://localhost:3000
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["junit", { outputFile: "playwright-report/junit.xml" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Clerk keeps the session on the accounts.dev domain while the app lives
    // on the Vercel preview domain: allow third-party cookies in the browser.
    launchOptions: {
      args: ["--disable-features=ThirdPartyCookiesBlocking,BlockThirdPartyCookies"],
    },
  },
  projects: [
    // Project-based global setup (runs in-process, so CLERK_TESTING_TOKEN and
    // CLERK_FAPI set by clerkSetup() reach the test workers).
    { name: "clerk setup", testMatch: /global\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["clerk setup"],
    },
  ],
});
