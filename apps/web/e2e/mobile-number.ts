import { expect, type Page } from "@playwright/test";

/** Completes required post-signup step, or returns when another suite already completed it. */
export async function completeMobileNumberIfNeeded(page: Page) {
  const input = page.getByLabel("Mobile number");
  const destination = await Promise.race([
    page
      .locator("#tab-content-scroll")
      .waitFor({ state: "visible", timeout: 60_000 })
      .then(() => "matches" as const),
    input.waitFor({ state: "visible", timeout: 60_000 }).then(() => "mobile-number" as const),
  ]);

  if (destination === "mobile-number") {
    const prefix = page.getByRole("button", { name: /Country calling code/ });
    await prefix.click();
    await page.getByRole("searchbox", { name: "Search countries" }).fill("DE");
    await page.getByRole("option", { name: /Germany/ }).click();
    await expect(prefix).toContainText("+49");
    await prefix.click();
    await page.getByRole("searchbox", { name: "Search countries" }).fill("IT");
    await page.getByRole("option", { name: /Italy/ }).click();
    await expect(prefix).toContainText("+39");
    await input.fill("not a formatted phone");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/matches", { timeout: 60_000 });
  }
}
