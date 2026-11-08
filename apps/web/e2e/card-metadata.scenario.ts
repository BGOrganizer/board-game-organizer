import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} required for manual card metadata acceptance`);
  return value;
}
const email = required("E2E_EMAIL"),
  groupName = required("CARD_GROUP_NAME"),
  eventName = required("CARD_EVENT_NAME"),
  tableName = required("CARD_TABLE_NAME"),
  venue = required("CARD_VENUE"),
  day = required("CARD_EVENT_DAY"),
  clock = required("CARD_EVENT_TIME");
const locale = required("CARD_LOCALE");
if (!["en", "it"].includes(locale)) throw new Error("CARD_LOCALE must be en or it");
if (
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Manual card acceptance requires Development Clerk keys");
const target = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000");
if (
  [
    "board-game-organizer.com",
    "www.board-game-organizer.com",
    "api.board-game-organizer.com",
  ].includes(target.hostname)
)
  throw new Error("Manual card acceptance must not target production");
// Owned PRIVATE planning fixture: accepted member and Table registration, two dates/venues/games.
// Real data only. No seeding, resets, provider mutation or mocked acceptance.
for (const width of [390, 1280])
  test(`real card metadata ${locale} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: email });
    await page.goto("/");
    await completeMobileNumberIfNeeded(page);
    const it = locale === "it",
      writes: string[] = [];
    page.on("request", (request) => {
      if (
        ["POST", "PATCH", "DELETE"].includes(request.method()) &&
        /\/api\/(groups|events)(\/|\?|$)/.test(request.url())
      )
        writes.push(request.url());
    });
    const open = async (path: string, name: string, kind: "group" | "event" | "table") => {
      await page.goto(path);
      await page.getByRole("searchbox", { name: it ? "Filtra" : "Filter", exact: true }).fill(name);
      const prefix = it
        ? { group: "Apri gruppo", event: "Apri evento", table: "Apri tavolo" }
        : { group: "Open group", event: "Open event", table: "Open table" };
      const link = page.getByRole("link", { name: `${prefix[kind]}: ${name}`, exact: true });
      await expect(link).toBeVisible();
      return link.locator("..");
    };
    const group = await open("/groups", groupName, "group");
    const title = await group.getByText(groupName, { exact: true }).evaluate((node) => {
      const s = getComputedStyle(node);
      return { size: s.fontSize, family: s.fontFamily, weight: s.fontWeight };
    });
    const body = await group
      .getByText(it ? "Privato" : "Private", { exact: true })
      .evaluate((node) => {
        const s = getComputedStyle(node);
        return { size: s.fontSize, family: s.fontFamily };
      });
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
      new Date(`${day}T${clock}Z`),
    );
    const time = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(`${day}T${clock}Z`));
    const event = await open("/events", eventName, "event");
    for (const [property, value] of [
      ["font-size", title.size],
      ["font-family", title.family],
      ["font-weight", title.weight],
    ])
      await expect(event.getByText(eventName, { exact: true })).toHaveCSS(property, value);
    await expect(
      event.getByText(`${it ? "Gruppo" : "Group"}: ${groupName}`, { exact: true }),
    ).toBeVisible();
    await expect(event.getByText(date, { exact: true })).toHaveCSS("font-size", body.size);
    await expect(event.getByText(date, { exact: true })).toHaveCSS("font-family", body.family);
    await expect(event.getByText(time, { exact: true })).toBeVisible();
    await expect(event.getByText(venue, { exact: false })).toBeVisible();
    const dateMore = event.getByRole("img", {
      name: it ? "2 date proposte" : "2 proposed dates",
      exact: true,
    });
    const placeMore = event.getByRole("img", {
      name: it ? "2 luoghi proposti" : "2 proposed locations",
      exact: true,
    });
    await expect(dateMore).toHaveText("+2");
    await expect(placeMore).toHaveText("+2");
    await expect(placeMore).toHaveCSS(
      "color",
      await dateMore.evaluate((node) => getComputedStyle(node).color),
    );
    const table = await open("/tables", tableName, "table");
    const here = page.url();
    const inspectTable = async () => {
      await expect(table.getByText(tableName, { exact: true })).toHaveCSS("font-size", title.size);
      await expect(table.getByText(groupName, { exact: true })).toBeVisible();
      await expect(table.getByText(eventName, { exact: true })).toBeVisible();
      await expect(
        table.getByText(it ? /^\d+\/\d+ partecipant[ei]$/ : /^\d+\/\d+ participants?$/),
      ).toBeVisible();
      const geometry = await table.evaluate((card) => {
        const image = card.querySelector("img")!.closest(".w-20")!.getBoundingClientRect(),
          box = card.getBoundingClientRect();
        return {
          left: Math.abs(image.left - box.left),
          height: Math.abs(image.height - box.height),
        };
      });
      expect(geometry.left).toBeLessThan(2);
      expect(geometry.height).toBeLessThan(2);
      for (const name of [
        it ? "In pianificazione" : "Planning",
        it ? "Classifica attiva" : "Rating enabled",
      ])
        await expect(table.getByRole("button", { name, exact: true })).toBeVisible();
      for (const kind of ["dates", "locations", "games"] as const) {
        const label =
          kind === "dates"
            ? it
              ? "Date e orari"
              : "Dates and times"
            : kind === "locations"
              ? it
                ? "Luoghi"
                : "Locations"
              : it
                ? "Giochi da tavolo"
                : "Board games";
        const trigger = table.getByRole("button", { name: `${label}: ${tableName}`, exact: true });
        const small = await trigger.evaluate((button) => {
          const icon = button.querySelector("svg")!.getBoundingClientRect(),
            frame = button.querySelector("span")!.getBoundingClientRect();
          return { icon: icon.width, frame: frame.width };
        });
        expect(small.icon).toBe(16);
        expect(small.frame).toBe(28);
        await trigger.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("listitem")).toHaveCount(2);
        if (kind === "dates") {
          await expect(dialog.getByText(date, { exact: true })).toBeVisible();
          await expect(dialog.getByText(time, { exact: true })).toBeVisible();
        }
        if (kind === "locations")
          await expect(dialog.getByText(venue, { exact: false })).toBeVisible();
        await expect(
          dialog.getByRole("button", { name: /^(Yes|No|If needed|Sì|Se necessario)$/ }),
        ).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(page).toHaveURL(here);
      }
    };
    await inspectTable();
    const eventAgain = await open("/events", eventName, "event");
    await eventAgain.getByRole("link").click();
    await page.getByRole("tab", { name: it ? "Tavoli" : "Tables", exact: true }).click();
    const contextual = page
      .getByRole("link", {
        name: `${it ? "Apri tavolo" : "Open table"}: ${tableName}`,
        exact: true,
      })
      .locator("..");
    await expect(contextual.getByText(groupName, { exact: true })).toBeVisible();
    await expect(contextual.getByText(eventName, { exact: true })).toBeVisible();
    await expect(
      contextual.getByRole("button", {
        name: `${it ? "Date e orari" : "Dates and times"}: ${tableName}`,
        exact: true,
      }),
    ).toBeVisible();
    expect(writes).toEqual([]);
  });
