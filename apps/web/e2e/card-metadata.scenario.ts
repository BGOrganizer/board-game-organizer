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
  tableName = required("CARD_TABLE_NAME");
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
        const buttons = [...c.querySelectorAll<HTMLElement>("[role=button],button")];
        const content = c.querySelector(".card__content")!;
        const heading = c.querySelector('[data-slot="card-heading"]')!.getBoundingClientRect();
        const row = c.querySelector('[data-slot="card-body-row"]')!.getBoundingClientRect();
        const image = c.querySelector('[data-slot="card-artwork"]')!.getBoundingClientRect();
        const facts = c.querySelector('[data-slot="card-facts"]')!.getBoundingClientRect();
        const controls = c.querySelector('[data-slot="card-controls"]')!;
        const controlRow = controls.firstElementChild!;
        const viewport = controls.getBoundingClientRect();
        const centers = buttons.map((button) => {
          const bounds = button.getBoundingClientRect();
          return bounds.top + bounds.height / 2;
        });
        const initialScroll = controls.scrollLeft;
        controls.scrollLeft = 0;
        const firstReachable = buttons[0].getBoundingClientRect().left >= viewport.left - 1;
        controls.scrollLeft = controls.scrollWidth;
        const lastReachable = buttons.at(-1)!.getBoundingClientRect().right <= viewport.right + 1;
        controls.scrollLeft = initialScroll;
        const frame = content.getBoundingClientRect();
        const padding = getComputedStyle(content);
        return {
          fit: getComputedStyle(c.querySelector("img")!).objectFit,
          fullWidthHeading:
            Math.abs(heading.left - frame.left - Number.parseFloat(padding.paddingLeft)) <= 1 &&
            Math.abs(heading.right - frame.right + Number.parseFloat(padding.paddingRight)) <= 1,
          titleAbove: heading.bottom <= row.top + 1,
          artworkBottomAligned: Math.abs(image.bottom - row.bottom) <= 1,
          factsToRight: facts.left >= image.right,
          singleControlRow: Math.max(...centers) - Math.min(...centers) < 2,
          controlsNoWrap: getComputedStyle(controlRow).flexWrap === "nowrap",
          controlsSpanArtwork:
            Math.abs(viewport.left - image.left) <= 1 && Math.abs(viewport.right - row.right) <= 1,
          factsAboveControls:
            c.querySelector('[data-slot="card-facts"]')!.firstElementChild!.getBoundingClientRect()
              .bottom <=
            viewport.top + 1,
          overflowReachable: firstReachable && lastReachable,
          overflow: c.scrollWidth > c.clientWidth + 1,
          generated: Boolean(c.querySelector('[data-slot="resource-artwork"]')),
          generatedLightScope: c
            .querySelector('[data-slot="resource-artwork"]')
            ?.getAttribute("data-theme"),
        };
      });
      expect(info).toMatchObject({
        fit: "contain",
        fullWidthHeading: true,
        titleAbove: true,
        artworkBottomAligned: true,
        factsToRight: true,
        singleControlRow: true,
        controlsNoWrap: true,
        controlsSpanArtwork: true,
        factsAboveControls: true,
        overflowReachable: true,
        overflow: false,
      });
      if (info.generated) expect(info.generatedLightScope).toBe("light");
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
      const navigationGap = await card.evaluate((element) => {
        const toolbar = document.querySelector("[data-page-toolbar]");
        if (!toolbar) throw new Error("The detail page toolbar is required");
        return element.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom;
      });
      expect(navigationGap).toBeCloseTo(16, 0);
      await expect(card.locator('[class~="bg-surface/95"]')).toHaveCount(0);
      await expect(card.locator('[class~="bg-background/70"]')).toHaveCount(0);
      await expect(card.locator('[class~="bg-background/90"]')).toHaveCount(0);
      const caption = card.locator("h1").locator("xpath=../..");
      await expect(caption).toHaveCSS("flex-direction", "column");
      await expect(card.locator("img")).toHaveCSS("opacity", "1");
      await expect(card.locator("h1")).toHaveCSS("text-shadow", "none");
      await expect(card.locator('[class~="bg-background/80"]')).toHaveCount(1);
      const layout = await caption.evaluate((content) => {
        const bandElement = content.firstElementChild!;
        const band = bandElement.getBoundingClientRect();
        const artwork = content
          .closest(".card")!
          .querySelector('[data-slot="card-background"]')!
          .getBoundingClientRect();
        const viewport = content.lastElementChild!;
        const toolbar = viewport.firstElementChild!;
        const frame = viewport.getBoundingClientRect();
        const card = content.closest(".card")!.getBoundingClientRect();
        const centers = [...toolbar.querySelectorAll("button")].map((button) => {
          const bounds = button.getBoundingClientRect();
          return bounds.y + bounds.height / 2;
        });
        return {
          titleAbove: band.bottom <= frame.top + 1,
          artworkFillsCard:
            Math.abs(artwork.left - card.left) <= 1 &&
            Math.abs(artwork.top - card.top) <= 1 &&
            Math.abs(artwork.width - card.width) <= 1 &&
            Math.abs(artwork.height - card.height) <= 1,
          artworkMinimum: artwork.height >= 224,
          bandInside: band.left >= card.left - 1 && band.right <= card.right + 1,
          controlsInside:
            frame.left >= card.left - 1 &&
            frame.right <= card.right + 1 &&
            frame.bottom <= card.bottom + 1,
          bottomAligned: card.bottom - frame.bottom <= 6,
          compactBand:
            Number.parseFloat(getComputedStyle(bandElement).paddingTop) <= 2 &&
            Number.parseFloat(getComputedStyle(bandElement).paddingBottom) <= 2,
          singleRow: Math.max(...centers) - Math.min(...centers) < 2,
          noWrap: getComputedStyle(toolbar).flexWrap === "nowrap",
          rightAligned: getComputedStyle(toolbar).justifyContent === "flex-end",
        };
      });
      expect(layout).toEqual({
        titleAbove: true,
        artworkFillsCard: true,
        artworkMinimum: true,
        bandInside: true,
        controlsInside: true,
        bottomAligned: true,
        compactBand: true,
        singleRow: true,
        noWrap: true,
        rightAligned: true,
      });
      expect(await labels(card)).toEqual(expectedLabels);
      return card;
    };
    await page.goto("/groups");
    for (const [tab, label] of it
      ? [
          ["Privati", "Aiuto sui gruppi privati"],
          ["Pubblici", "Aiuto sui gruppi pubblici"],
          ["Ricerca", "Aiuto sulla ricerca dei gruppi"],
        ]
      : [
          ["Private groups", "Private groups help"],
          ["Public groups", "Public groups help"],
          ["Search", "Group search help"],
        ]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      const heading =
        label === (it ? "Aiuto sulla ricerca dei gruppi" : "Group search help")
          ? it
            ? "Ricerca Gruppi"
            : "Group search"
          : tab;
      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
      await page.getByRole("button", { name: label, exact: true }).click();
      const help = page.getByRole("dialog");
      await expect(help.locator("p")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(help).toHaveCount(0);
    }
    const searchGroups = it ? "Cerca gruppi" : "Search groups";
    await expect(page.getByRole("searchbox", { name: searchGroups, exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: `${searchGroups}: ${it ? "Aiuto ricerca" : "Search help"}`,
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: it ? "Amici" : "Friends", pressed: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: it ? "Vicino a me" : "Near me", pressed: false }),
    ).toBeVisible();
    const group = await open("/groups", groupName, "group");
    await inspectFrame(group);
    const groupLabels = await labels(group);
    const groupRoleTrigger = group
      .getByRole("button")
      .filter({ has: page.locator(".lucide-id-card") });
    await expect(groupRoleTrigger).toBeVisible();
    await groupRoleTrigger.click();
    await expect(
      page.getByRole("dialog", { name: it ? "Ruolo" : "Role", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    const title = await group.getByText(groupName, { exact: true }).evaluate((node) => {
      const s = getComputedStyle(node);
      return { size: s.fontSize, family: s.fontFamily, weight: s.fontWeight };
    });
    await group.getByRole("link").click();
    await inspectIdentity(groupName, groupLabels);
    const groupIdentity = page.locator(".card").filter({
      has: page.getByRole("heading", { name: groupName, exact: true }),
    });
    await groupIdentity
      .getByRole("button")
      .filter({ has: page.locator(".lucide-id-card") })
      .click();
    await expect(
      page.getByRole("dialog", { name: it ? "Ruolo" : "Role", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("tab", { name: it ? "Dettagli" : "Details", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: it ? "Classifiche" : "Rankings", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: it ? "Aiuto sulla sede del gruppo" : "Group venue help",
        exact: true,
      }),
    ).toHaveCount(0);
    for (const [tab, help, copy] of it
      ? [
          [
            "Dettagli",
            "Aiuto sui dettagli del gruppo",
            "Nei gruppi privati si entra solo su invito.",
          ],
          [
            "Eventi",
            "Aiuto sugli eventi del gruppo",
            "Gli eventi di un gruppo privato sono riservati ai suoi membri.",
          ],
          [
            "Membri",
            "Aiuto sui membri del gruppo",
            "Qui trovi i membri del gruppo e i loro ruoli.",
          ],
        ]
      : [
          ["Details", "Group details help", "Private groups are invitation-only."],
          ["Events", "Group events help", "Events in a private group are for its members."],
          [
            "Members",
            "Group members help",
            "See who belongs to the group and what role each person has.",
          ],
        ]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.getByRole("heading", { name: tab, exact: true })).toBeVisible();
      await page.getByRole("button", { name: help, exact: true }).click();
      const popover = page.getByRole("dialog");
      await expect(popover.getByText(copy, { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(popover).toHaveCount(0);
      if (tab === (it ? "Eventi" : "Events")) {
        const search = page.getByRole("searchbox", { name: it ? "Filtra" : "Filter", exact: true });
        const planning = page.getByRole("button", {
          name: it ? "In pianificazione" : "Planning",
          exact: true,
          pressed: true,
        });
        await expect(planning).toHaveCount(0);
        await search.focus();
        await expect(planning).toBeVisible();
        await expect(page.getByRole("tab", { name: tab, exact: true })).toHaveCount(0);
        await page.getByRole("button", { name: it ? "Indietro" : "Back", exact: true }).click();
        await expect(
          page.getByRole("tab", { name: tab, exact: true, selected: true }),
        ).toBeVisible();
        await expect(planning).toHaveCount(0);
      }
    }
    const groupPerson = page.getByText(handle, { exact: true });
    await expect(groupPerson).toBeVisible();
    const groupRole =
      people.groupRole === "admin"
        ? it
          ? "Amministratore"
          : "Admin"
        : people.groupRole === "moderator"
          ? it
            ? "Moderatore"
            : "Moderator"
          : it
            ? "Membro accettato"
            : "Accepted member";
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
      const frame = card.querySelector("img")!.closest(".size-24")!.getBoundingClientRect();
      return { width: frame.width, height: frame.height };
    });
    expect(eventGeometry).toEqual({ width: 96, height: 96 });
    const rolesLabel = it ? "Ruoli e partecipazione" : "Roles and participation";
    const eventRolesIntro = it
      ? "In questo evento, hai i seguenti ruoli:"
      : "Your roles in this event:";
    const roleButton = event.getByRole("button", { name: rolesLabel, exact: true });
    await expect(roleButton).toBeVisible();
    await roleButton.click();
    await expect(
      page.getByRole("dialog").getByText(eventRolesIntro, { exact: true }),
    ).toBeVisible();
    const acceptedRole = page
      .getByRole("dialog")
      .getByText(it ? "Partecipante accettato" : "Accepted participant", { exact: true });
    await expect(acceptedRole).toBeVisible();
    expect(
      await acceptedRole.evaluate((text) => {
        const bounds = text.getBoundingClientRect();
        const dialog = text.closest('[role="dialog"]')!.getBoundingClientRect();
        return (
          bounds.left >= dialog.left &&
          bounds.right <= dialog.right &&
          text.scrollWidth <= text.clientWidth + 1
        );
      }),
    ).toBe(true);
    await expect(acceptedRole.locator("..").locator(".lucide-user-round-check")).toBeVisible();
    await page.keyboard.press("Escape");
    await event
      .getByRole("button", { name: it ? "In pianificazione" : "Planning", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    for (const label of [it ? "Date e Orari" : "Dates and times", it ? "Luoghi" : "Locations"])
      await expect(
        event.getByRole("button", { name: `${label}: ${eventName}`, exact: true }),
      ).toHaveCount(0);
    await event.getByRole("link").click();
    const eventIdentity = await inspectIdentity(eventName, eventLabels);
    await eventIdentity.getByRole("button", { name: rolesLabel, exact: true }).click();
    await expect(
      page.getByRole("dialog").getByText(eventRolesIntro, { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: it ? "Tavoli" : "Tables", exact: true }).click();
    const table = page
      .getByRole("link", {
        name: `${it ? "Apri tavolo" : "Open table"}: ${tableName}`,
        exact: true,
      })
      .locator("..");
    const tableLabels = await labels(table);
    const inspectTable = async () => {
      await inspectFrame(table);
      await expect(table.getByText(tableName, { exact: true })).toHaveCSS("font-size", title.size);
      await expect(table.getByText(groupName, { exact: true })).toBeVisible();
      await expect(table.getByText(eventName, { exact: true })).toBeVisible();
      await expect(
        table.getByText(it ? /^\d+\/\d+ partecipant[ei]$/ : /^\d+\/\d+ participants?$/),
      ).toBeVisible();
      const geometry = await table.evaluate((card) => {
        const image = card.querySelector("img")!.closest(".size-24")!.getBoundingClientRect();
        return { width: image.width, height: image.height };
      });
      expect(geometry).toEqual({ width: 96, height: 96 });
      for (const name of [
        it ? "In pianificazione" : "Planning",
        it ? "Classifica attiva" : "Rating enabled",
      ])
        await expect(table.getByRole("button", { name, exact: true })).toBeVisible();
      await table
        .getByRole("button", { name: it ? "In pianificazione" : "Planning", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(table.getByRole("button", { name: rolesLabel, exact: true })).toBeVisible();
      for (const label of [
        it ? "Date e Orari" : "Dates and times",
        it ? "Luoghi" : "Locations",
        it ? "Giochi da tavolo" : "Board games",
      ])
        await expect(
          table.getByRole("button", { name: `${label}: ${tableName}`, exact: true }),
        ).toHaveCount(0);
    };
    await inspectTable();
    await table.getByRole("link").click();
    await inspectIdentity(tableName, tableLabels);
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
          ? "Giocatore con invito pendente"
          : "Player with pending invitation"
        : people.tableStatus === "waiting"
          ? it
            ? "Giocatore in lista d'attesa"
            : "Player on the waiting list"
          : it
            ? "Giocatore confermato"
            : "Confirmed player";
    await expect(
      tablePerson.locator("xpath=ancestor::li[1]").getByText(tableStatus, { exact: true }),
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
        ? it
          ? "Amministratore"
          : "Admin"
        : people.eventRole === "moderator"
          ? it
            ? "Moderatore"
            : "Moderator"
          : it
            ? "Partecipante accettato"
            : "Accepted participant";
    const eventRow = page.getByRole("row").filter({ has: eventPerson });
    await expect(eventRow.getByText(eventRole, { exact: true })).toBeVisible();
    const roles = eventRow.getByRole("button", { name: new RegExp(`^${eventRole}(?: ·|$)`) });
    await expect(roles).toBeVisible();
    await roles.click();
    await expect(page.getByRole("dialog").getByText(eventRole, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
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
        name: `${it ? "Date e Orari" : "Dates and times"}: ${tableName}`,
        exact: true,
      }),
    ).toHaveCount(0);
    expect(writes).toEqual([]);
  });
