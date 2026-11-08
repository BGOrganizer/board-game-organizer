import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Locator, test } from "@playwright/test";
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
  address = required("CARD_VENUE_ADDRESS"),
  day = required("CARD_EVENT_DAY"),
  clock = required("CARD_EVENT_TIME");
const people = JSON.parse(required("CARD_PEOPLE_INPUT")) as {
  username: string;
  groupRole: string;
  eventRole: string;
  tableStatus: string;
};
if (
  !people.username?.trim().replace(/^@+/, "") ||
  !["admin", "moderator", "member"].includes(people.groupRole) ||
  !["admin", "moderator", "participant"].includes(people.eventRole) ||
  !["participant", "awaiting", "waiting"].includes(people.tableStatus)
)
  throw new Error(
    "Known first-page username and authoritative Group/Event role/Table status fixtures required",
  );
const handle = `@${people.username.trim().replace(/^@+/, "")}`;
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
    const inspectFrame = async (card: Locator) => {
      const info = await card.evaluate((c) => {
        const buttons = [...c.querySelectorAll<HTMLElement>("[role=button],button")],
          y = buttons.map((b) => b.getBoundingClientRect().y);
        return {
          fit: getComputedStyle(c.querySelector("img")!).objectFit,
          sameRow: Math.max(...y) - Math.min(...y) < 1,
          overflow: c.scrollWidth > c.clientWidth + 1,
          transparentCanvas:
            getComputedStyle(c.querySelector("img")!.parentElement!).backgroundColor ===
            "rgba(0, 0, 0, 0)",
        };
      });
      expect(info).toEqual({
        fit: "contain",
        sameRow: true,
        overflow: false,
        transparentCanvas: true,
      });
    };
    const labels = (card: Locator) =>
      card
        .getByRole("button")
        .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("aria-label")));
    const inspectIdentity = async (name: string, expectedLabels: (string | null)[]) => {
      const card = page
        .locator(".card")
        .filter({ has: page.getByRole("heading", { name, exact: true }) });
      await expect(card).toBeVisible();
      await expect(card.locator('[class~="bg-surface/95"]')).toHaveCount(0);
      await expect(card.locator('[class~="bg-background/70"]')).toHaveCount(0);
      const caption = card.locator('[class~="bg-background/90"]');
      await expect(caption).toHaveCSS("flex-wrap", "nowrap");
      await expect(card.locator("img")).toHaveCSS("opacity", "1");
      const sameRow = await caption.evaluate((row) => {
        const heading = row.querySelector("h1")!.getBoundingClientRect(),
          toolbar = row.lastElementChild!.getBoundingClientRect();
        return Math.abs(heading.y + heading.height / 2 - toolbar.y - toolbar.height / 2) < 2;
      });
      expect(sameRow).toBe(true);
      expect(await labels(card)).toEqual(expectedLabels);
      return card;
    };
    const group = await open("/groups", groupName, "group");
    await inspectFrame(group);
    const groupLabels = await labels(group);
    const title = await group.getByText(groupName, { exact: true }).evaluate((node) => {
      const s = getComputedStyle(node);
      return { size: s.fontSize, family: s.fontFamily, weight: s.fontWeight };
    });
    const body = await group
      .getByText(it ? /^\d+ Membr[oi]$/ : /^\d+ Members?$/)
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
    await group.getByRole("link").click();
    await inspectIdentity(groupName, groupLabels);
    await expect(
      page.getByRole("tab", { name: it ? "Dettagli" : "Details", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Ranking", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: it ? "Membri" : "Members", exact: true }).click();
    const groupPerson = page.getByText(handle, { exact: true });
    await expect(groupPerson).toBeVisible();
    const groupRole =
      people.groupRole === "admin"
        ? "Admin"
        : people.groupRole === "moderator"
          ? it
            ? "Moderatore"
            : "Moderator"
          : it
            ? "Membro"
            : "Member";
    await expect(
      groupPerson.locator("xpath=ancestor::li[1]").getByText(groupRole, { exact: true }),
    ).toBeVisible();
    const event = await open("/events", eventName, "event");
    await inspectFrame(event);
    const eventLabels = await labels(event);
    for (const [property, value] of [
      ["font-size", title.size],
      ["font-family", title.family],
      ["font-weight", title.weight],
    ])
      await expect(event.getByText(eventName, { exact: true })).toHaveCSS(property, value);
    await expect(event.getByText(groupName, { exact: true })).toBeVisible();
    await expect(event.getByText(it ? /^\d+ Tavol[oi]$/ : /^\d+ Tables?$/)).toBeVisible();
    const eventGeometry = await event.evaluate((card) => {
      const frame = card.querySelector("img")!.closest(".w-20")!.getBoundingClientRect(),
        box = card.getBoundingClientRect();
      return { left: Math.abs(frame.left - box.left), height: Math.abs(frame.height - box.height) };
    });
    expect(eventGeometry.left).toBeLessThan(2);
    expect(eventGeometry.height).toBeLessThan(2);
    const accepted = event.getByRole("button", {
      name: it ? "Partecipante accettato" : "Accepted participant",
      exact: true,
    });
    await expect(accepted).toBeVisible();
    await event
      .getByRole("button", { name: it ? "In pianificazione" : "Planning", exact: true })
      .click();
    const eventInfo = page.getByRole("dialog");
    await expect(eventInfo.getByText(date, { exact: true })).toHaveCSS("font-size", body.size);
    await expect(eventInfo.getByText(date, { exact: true })).toHaveCSS("font-family", body.family);
    await expect(eventInfo.getByText(time, { exact: true })).toBeVisible();
    await expect(eventInfo.getByText(venue, { exact: false })).toBeVisible();
    const dateMore = eventInfo.getByRole("img", {
      name: it ? "2 date proposte" : "2 proposed dates",
      exact: true,
    });
    const placeMore = eventInfo.getByRole("img", {
      name: it ? "2 luoghi proposti" : "2 proposed locations",
      exact: true,
    });
    await expect(dateMore).toHaveText("+2");
    await expect(placeMore).toHaveText("+2");
    await expect(placeMore).toHaveCSS(
      "color",
      await dateMore.evaluate((node) => getComputedStyle(node).color),
    );
    await page.keyboard.press("Escape");
    await expect(eventInfo).toHaveCount(0);
    const table = await open("/tables", tableName, "table");
    const tableLabels = await labels(table);
    const here = page.url();
    const inspectTable = async () => {
      await inspectFrame(table);
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
      await table
        .getByRole("button", { name: it ? "In pianificazione" : "Planning", exact: true })
        .click();
      await expect(
        page
          .getByRole("dialog")
          .getByText(it ? "Giocatori non confermati" : "Unconfirmed players", { exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
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
        if (kind === "locations") {
          await expect(dialog.getByText(address, { exact: true })).toBeVisible();
          await expect(dialog.getByText(/^[A-Za-z_]+\/[A-Za-z_]+$/)).toHaveCount(0);
          await expect(dialog.getByText(venue, { exact: true })).toHaveCount(0);
          await expect(dialog.locator("li svg.lucide-map-pin")).toHaveCount(2);
        }
        await expect(
          dialog.getByRole("button", { name: /^(Yes|No|If needed|Sì|Se necessario)$/ }),
        ).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(page).toHaveURL(here);
      }
    };
    await inspectTable();
    await table.getByRole("link").click();
    await inspectIdentity(
      tableName,
      tableLabels.filter(
        (label) =>
          ![
            it ? "Date e orari" : "Dates and times",
            it ? "Luoghi" : "Locations",
            it ? "Giochi da tavolo" : "Board games",
          ].some((prefix) => label?.startsWith(prefix + ":")),
      ),
    );
    const parentEvent = page
      .getByRole("link", {
        name: `${it ? "Apri evento" : "Open event"}: ${eventName}`,
        exact: true,
      })
      .locator("..");
    await inspectFrame(parentEvent);
    await expect(parentEvent.getByText(it ? /^\d+ Tavol[oi]$/ : /^\d+ Tables?$/)).toBeVisible();
    await expect(
      page.getByRole("tab", { name: it ? "Dettagli" : "Details", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("tab", { name: it ? "Partecipanti" : "Participants", exact: true })
      .click();
    const tablePerson = page.getByText(handle, { exact: true });
    await expect(tablePerson).toBeVisible();
    const tableStatus =
      people.tableStatus === "awaiting"
        ? it
          ? "In attesa di accettazione"
          : "Awaiting acceptance"
        : people.tableStatus === "waiting"
          ? it
            ? "Lista d'attesa"
            : "Waiting list"
          : it
            ? "Partecipante"
            : "Participant";
    await expect(
      tablePerson
        .locator("xpath=ancestor::li[1]")
        .getByText(new RegExp(`^${tableStatus}(?: · ${it ? "Lista d'attesa" : "Waiting list"})?$`)),
    ).toBeVisible();
    const eventAgain = await open("/events", eventName, "event");
    await eventAgain.getByRole("link").click();
    await inspectIdentity(eventName, eventLabels);
    const parentGroup = page
      .getByRole("link", {
        name: `${it ? "Apri gruppo" : "Open group"}: ${groupName}`,
        exact: true,
      })
      .locator("..");
    await inspectFrame(parentGroup);
    await expect(parentGroup.getByText(it ? /^\d+ Membr[oi]$/ : /^\d+ Members?$/)).toBeVisible();
    await page
      .getByRole("tab", { name: it ? "Partecipanti" : "Participants", exact: true })
      .click();
    const eventPerson = page.getByText(handle, { exact: true });
    await expect(eventPerson).toBeVisible();
    const eventRole =
      people.eventRole === "admin"
        ? "Admin"
        : people.eventRole === "moderator"
          ? it
            ? "Moderatore"
            : "Moderator"
          : it
            ? "Partecipante"
            : "Participant";
    const eventRow = page.getByRole("row").filter({ has: eventPerson });
    await expect(
      eventRow.getByText(
        new RegExp(`^${eventRole}(?: · ${it ? "Lista d'attesa" : "Waiting list"})?$`),
      ),
    ).toBeVisible();
    await expect(eventRow.getByRole("img", { name: eventRole, exact: true })).toBeVisible();
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
