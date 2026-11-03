import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for real Table schedule acceptance`);
  return value;
}
const locale = required("SCHEDULE_LOCALE");
if (!["en", "it"].includes(locale)) throw new Error("SCHEDULE_LOCALE must be en or it");
if (
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Use Development Clerk keys only");
if (
  [
    "board-game-organizer.com",
    "www.board-game-organizer.com",
    "api.board-game-organizer.com",
  ].includes(new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").hostname)
)
  throw new Error("Production must not be targeted");
const email = required("E2E_EMAIL"),
  guide = required("SCHEDULE_DEMONSTRATOR"),
  minutes = Number(required("SCHEDULE_MINUTES"));
if (!Number.isSafeInteger(minutes) || minutes < 1)
  throw new Error("SCHEDULE_MINUTES must be positive");
const fixtures = ["PUBLIC", "PRIVATE", "EXCLUDED", "PLANNING"].map((kind) => {
  const path = required(`SCHEDULE_${kind}_PATH`);
  if (!/^\/events\/[\da-f-]{36}\/tables\/[\da-f-]{36}$/.test(path))
    throw new Error(`Invalid SCHEDULE_${kind}_PATH`);
  return { kind, path };
});
const dates = {
  PUBLIC: required("SCHEDULE_PUBLIC_DATE"),
  PRIVATE: required("SCHEDULE_PRIVATE_DATE"),
};
const clocks = {
  PUBLIC: required("SCHEDULE_PUBLIC_TIME"),
  PRIVATE: required("SCHEDULE_PRIVATE_TIME"),
};
for (const width of [390, 1280])
  test(`real included/excluded Table schedule ${locale} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: email });
    await page.goto("/");
    await completeMobileNumberIfNeeded(page);
    const region = page.getByRole("region", {
      name: locale === "it" ? "Programma del tavolo" : "Table schedule",
      exact: true,
    });
    for (const { kind, path } of fixtures) {
      await page.goto(path);
      await expect(
        page
          .getByRole("region", { name: locale === "it" ? "Impostazioni" : "Settings", exact: true })
          .getByRole("heading", { level: 1 }),
      ).toBeVisible();
      if (kind === "EXCLUDED" || kind === "PLANNING") {
        if (kind === "EXCLUDED")
          await expect(
            page.getByText(
              locale === "it" ? "Escluso dalla conferma" : "Excluded from confirmation",
              { exact: true },
            ),
          ).toBeVisible();
        await expect(region).toHaveCount(0);
        continue;
      }
      const key = kind as "PUBLIC" | "PRIVATE";
      await expect(region).toBeVisible();
      await expect(region.getByText(dates[key], { exact: true })).toBeVisible();
      await expect(region.getByText(clocks[key], { exact: true })).toBeVisible();
      if (kind === "PUBLIC") {
        const amount = new Intl.NumberFormat(locale).format(minutes);
        const unit =
          locale === "it"
            ? minutes === 1
              ? "minuto"
              : "minuti"
            : minutes === 1
              ? "minute"
              : "minutes";
        await expect(
          region.getByText(`${locale === "it" ? "Durata" : "Duration"}: ${amount} ${unit}`, {
            exact: true,
          }),
        ).toBeVisible();
        const row = region.getByRole("listitem");
        await expect(row.getByText(guide, { exact: true })).toBeVisible();
        await expect(
          row.getByText(locale === "it" ? "Dimostratore" : "Demonstrator", { exact: true }),
        ).toBeVisible();
        await expect(row.locator(".avatar")).toBeVisible();
      } else {
        await expect(
          region.getByText(locale === "it" ? "Durata: Non indicato" : "Duration: Unknown", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(region.getByRole("listitem")).toHaveCount(0);
      }
      const order = await region.evaluate((node) => {
        const overview = node.parentElement?.querySelector("section[aria-label]");
        return Boolean(
          overview &&
            overview !== node &&
            overview.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
      });
      expect(order).toBe(true);
    }
  });
