import type { Page } from "@playwright/test";

/** Completes required post-signup step, or returns when another suite already completed it. */
export async function completeMobileNumberIfNeeded(page: Page) {
  const input = page.getByLabel("Mobile number");
  const destination = await Promise.race([
    page
      .getByText("Matches", { exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 60_000 })
      .then(() => "matches" as const),
    input.waitFor({ state: "visible", timeout: 60_000 }).then(() => "mobile-number" as const),
  ]);

  if (destination === "mobile-number") {
    await input.fill("not a formatted phone");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/matches", { timeout: 60_000 });
  }
}
