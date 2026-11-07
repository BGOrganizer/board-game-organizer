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
// Real isolated PRIVATE fixture: actor is a member and registered at the named Table;
// Event has two dates/venues, Table two games. No mocked requests, seeding or resets.
for (const width of [390, 1280])
  test(`real card metadata ${locale} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: email });
    await page.goto("/");
    await completeMobileNumberIfNeeded(page);
    const it = locale === "it";
    const open = async (path: string, name: string, kind: "group" | "event" | "table") => {
      await page.goto(path);
      await page.getByRole("searchbox", { name: it ? "Filtra" : "Filter", exact: true }).fill(name);
      const prefix = it
        ? { group: "Apri gruppo", event: "Apri evento", table: "Apri tavolo" }
        : { group: "Open group", event: "Open event", table: "Open table" };
      const card = page.getByRole("link", { name: `${prefix[kind]}: ${name}`, exact: true });
      await expect(card).toBeVisible();
      return card;
    };
    const group = await open("/groups", groupName, "group");
    const title = await group.getByText(groupName, { exact: true }).evaluate((node) => {
      const css = getComputedStyle(node);
      return { size: css.fontSize, family: css.fontFamily, weight: css.fontWeight };
    });
    const body = await group
      .getByText(it ? "Privato" : "Private", { exact: true })
      .evaluate((node) => {
        const css = getComputedStyle(node);
        return { size: css.fontSize, family: css.fontFamily };
      });
    const humanDate = new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(`${day}T${clock}Z`));
    const time = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(`${day}T${clock}Z`));
    for (const kind of ["event", "table"] as const) {
      const name = kind === "event" ? eventName : tableName;
      const card = await open(kind === "event" ? "/events" : "/tables", name, kind);
      await expect(card.getByText(name, { exact: true })).toHaveCSS("font-size", title.size);
      await expect(card.getByText(name, { exact: true })).toHaveCSS("font-family", title.family);
      await expect(card.getByText(name, { exact: true })).toHaveCSS("font-weight", title.weight);
      await expect(
        card.getByText(`${it ? "Gruppo" : "Group"}: ${groupName}`, { exact: true }),
      ).toBeVisible();
      await expect(card.getByText(humanDate, { exact: true })).toHaveCSS("font-size", body.size);
      await expect(card.getByText(humanDate, { exact: true })).toHaveCSS(
        "font-family",
        body.family,
      );
      await expect(card.getByText(time, { exact: true })).toBeVisible();
      await expect(card.getByText(venue, { exact: false })).toBeVisible();
      const dateMore = card.getByRole("img", {
        name: it ? "2 date proposte" : "2 proposed dates",
        exact: true,
      });
      const placeMore = card.getByRole("img", {
        name: it ? "2 luoghi proposti" : "2 proposed locations",
        exact: true,
      });
      await expect(dateMore).toHaveText("+2");
      await expect(placeMore).toHaveText("+2");
      const accent = await dateMore.evaluate((node) => getComputedStyle(node).color);
      await expect(placeMore).toHaveCSS("color", accent);
      if (kind === "table") {
        await expect(
          card.getByText(`${it ? "Evento" : "Event"}: ${eventName}`, { exact: true }),
        ).toBeVisible();
        await expect(card.getByText(it ? "+1 gioco" : "+1 game", { exact: true })).toHaveCSS(
          "color",
          accent,
        );
      }
    }
    const event = await open("/events", eventName, "event");
    await event.click();
    const contextual = page.getByRole("link", {
      name: `${it ? "Apri tavolo" : "Open table"}: ${tableName}`,
      exact: true,
    });
    await expect(contextual).toBeVisible();
    await expect(contextual.getByText(humanDate, { exact: true })).toHaveCount(0);
    await expect(contextual.getByText(venue, { exact: false })).toHaveCount(0);
    await expect(
      contextual.getByText(`${it ? "Evento" : "Event"}: ${eventName}`, { exact: true }),
    ).toHaveCount(0);
  });
