import type {
  GroupRecordResponse,
  PlannedEventResponse,
  PlannedTableResponse,
} from "@board-game-organizer/schemas";
import { withProtectionBypass } from "@board-game-organizer/shared";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for owned Event access acceptance`);
  return value;
}
if (required("EVENT_ACCESS_FIXTURE_ACK") !== "owned-disposable-event-access")
  throw new Error(
    "Owned Development fixtures required; no provisioning or provider synchronization",
  );
const mode = required("EVENT_ACCESS_MODE"),
  locale = required("EVENT_ACCESS_LOCALE"),
  theme = required("EVENT_ACCESS_THEME"),
  api = new URL(required("EVENT_ACCESS_API_URL"));
const input = JSON.parse(required("EVENT_ACCESS_INPUT")) as {
  eventId: string;
  tableId: string;
  eventName: string;
  tableName: string;
  playerName?: string;
  ndName?: string;
  ownOnlyName?: string;
  participantOnlyName?: string;
  catalogOnlyName?: string;
  emptyQuery?: string;
  groupName?: string;
  gameName?: string;
};
if (
  !["shared", "denied", "enroll", "picker", "finalize", "draft", "presentation"].includes(mode) ||
  !["en", "it"].includes(locale) ||
  !["light", "dark"].includes(theme) ||
  ![input.eventId, input.tableId].every((id) => /^[0-9a-f-]{36}$/i.test(id)) ||
  ![input.eventName, input.tableName].every((v) => typeof v === "string" && v.trim())
)
  throw new Error("Explicit mode, locale, theme and named Event/Table fixtures required");
for (const url of [api, new URL(required("PLAYWRIGHT_BASE_URL"))])
  if (!["localhost", "127.0.0.1"].includes(url.hostname) && !url.hostname.endsWith(".vercel.app"))
    throw new Error("Local/Preview only, never Production");
if (
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Development Clerk only");
if (
  mode === "finalize" &&
  required("EVENT_ACCESS_WRITE_ACK") !== "irreversible-owned-disposable-finalization"
)
  throw new Error("Explicit irreversible finalization acknowledgment required");
const it = locale === "it",
  l = {
    participants: it ? "Partecipanti" : "Participants",
    tables: it ? "Tavoli" : "Tables",
    results: it ? "Risultati" : "Results",
    ranking: "Ranking",
    join: it ? "Iscriviti al tavolo" : "Join table",
    leave: it ? "Abbandona tavolo" : "Leave table",
    review: it ? "Rivedi le impostazioni del tavolo" : "Review table settings",
    finalize: it ? "Finalizza evento" : "Finalize event",
    finalizeTitle: it ? "Finalizzare evento?" : "Finalize event?",
    cancel: it ? "Annulla" : "Cancel",
    share: it
      ? "Condividi i risultati con gli amici dei partecipanti"
      : "Share results with participants' friends",
    chooseGame: it ? "Scegli un gioco" : "Choose a game",
    select: it ? "Seleziona" : "Select",
    empty: it ? "Nessun gioco trovato" : "No games found",
    back: it ? "Indietro" : "Back",
    next: it ? "Avanti" : "Next",
    loadEvent: it ? "Impossibile caricare l'evento" : "Could not load event",
    loadTable: it ? "Impossibile caricare il tavolo" : "Could not load table",
    groupName: it ? "Nome del gruppo" : "Group name",
    minimum: it ? "Giocatori minimi" : "Minimum players",
    maximum: it ? "Giocatori massimi" : "Maximum players",
    increase: it ? "Aumenta" : "Increase",
    decrease: it ? "Diminuisci" : "Decrease",
    removeGame: it ? "Rimuovi gioco" : "Remove game",
    bounds: it ? "Limiti di giocatori di BoardGameGeek" : "BoardGameGeek player limits",
  };
async function request(page: Page, path: string) {
  return page.evaluate(
    async (url) => {
      const token = await (
        window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> } } }
      ).Clerk?.session?.getToken();
      if (!token) throw new Error("Authenticated owned fixture required");
      const result = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      return { status: result.status, body: await result.json() };
    },
    withProtectionBypass(
      `${api.href.replace(/\/$/, "")}/api/${path}`,
      process.env.VERCEL_PROTECTION_BYPASS,
    ),
  );
}
async function read<T>(page: Page, path: string): Promise<T> {
  const result = await request(page, path);
  expect(result.status).toBe(200);
  return result.body as T;
}

test(`owned Event access ${mode}/${locale}/${theme}`, async ({ page }) => {
  await page.setViewportSize({ width: Number(process.env.EVENT_ACCESS_WIDTH ?? 390), height: 900 });
  await page.emulateMedia({ colorScheme: theme as "light" | "dark" });
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: required("E2E_EMAIL") });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  const eventPath = `events/${input.eventId}`,
    tablePath = `${eventPath}/tables/${input.tableId}`;
  if (mode === "denied") {
    for (const path of [eventPath, tablePath])
      expect([403, 404]).toContain((await request(page, path)).status);
    await page.goto(`/${eventPath}`);
    await expect(page.getByText(l.loadEvent, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: l.finalize, exact: true })).toHaveCount(0);
    await page.goto(`/${tablePath}`);
    await expect(page.getByText(l.loadTable, { exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: l.results, exact: true })).toHaveCount(0);
    return;
  }
  const event = await read<PlannedEventResponse>(page, eventPath),
    table = await read<PlannedTableResponse>(page, tablePath);
  if (mode === "presentation") {
    if (
      !event.groupId ||
      !input.groupName ||
      !input.gameName ||
      !table.myRegistration ||
      table.myRegistration.status !== "ACCEPTED" ||
      event.sharedResultsOnly
    )
      throw new Error(
        "Owned grouped Event with accepted own Table registration and exact Group/game names required",
      );
    const group = await read<GroupRecordResponse>(page, `groups/${event.groupId}`);
    expect(group.name).toBe(input.groupName);
    expect(group.canViewEvents).toBe(true);
    expect(
      table.gamesDetail.some(
        (game) =>
          game.name === input.gameName &&
          (!table.confirmed ||
            table.eventStatus === "PLANNING" ||
            game.id === table.confirmed.gameId),
      ),
    ).toBe(true);
    const writes: string[] = [];
    page.on("request", (request) => {
      if (
        ["POST", "PATCH", "DELETE"].includes(request.method()) &&
        /\/api\/(groups|events)(\/|\?|$)/.test(request.url())
      )
        writes.push(request.url());
    });
    const assertBackground = async (name: string) => {
      const heading = page.getByRole("heading", { name, exact: true });
      await expect(heading).toBeVisible();
      const card = page.locator(".card").filter({ has: heading });
      await expect(card.locator(".absolute.inset-0").first()).toBeVisible();
      const cardBox = await card.boundingBox(),
        tabsBox = await page.getByRole("tablist").boundingBox();
      expect(cardBox && tabsBox && tabsBox.y >= cardBox.y + cardBox.height - 1).toBeTruthy();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
    };
    await page.goto(`/groups/${group.id}`);
    await assertBackground(group.name);
    await page.goto("/groups");
    await page
      .getByRole("tab", {
        name:
          group.type === "PUBLIC"
            ? it
              ? "Pubblici"
              : "Public groups"
            : it
              ? "Privati"
              : "Private groups",
        exact: true,
      })
      .click();
    await page.getByRole("searchbox").fill(group.name);
    await expect(
      page.getByRole("link", {
        name: `${it ? "Apri gruppo" : "Open group"}: ${group.name}`,
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("link", {
        name: `${it ? "Apri gruppo" : "Open group"}: ${group.name}`,
        exact: true,
      })
      .click();
    await page.getByRole("tab", { name: it ? "Eventi" : "Events", exact: true }).click();
    await page.getByRole("searchbox").fill(input.eventName);
    await page
      .getByRole("link", {
        name: `${it ? "Apri evento" : "Open event"}: ${input.eventName}`,
        exact: true,
      })
      .click();
    await assertBackground(input.eventName);
    await page.getByRole("tab", { name: l.tables, exact: true }).click();
    const open = page.getByRole("link", {
      name: `${it ? "Apri tavolo" : "Open table"}: ${input.tableName}`,
      exact: true,
    });
    const card = page.locator(".card").filter({ has: open });
    await card
      .getByRole("button", {
        name: `${it ? "Giochi da tavolo" : "Board games"}: ${input.tableName}`,
        exact: true,
      })
      .click();
    const popover = page.getByRole("dialog");
    await expect(popover.getByText(input.gameName, { exact: true })).toBeVisible();
    await expect(
      popover.getByRole("button", { name: /: (Yes|Sì|No|If needed|Se necessario)$/ }),
    ).toHaveCount(0);
    await expect(page).toHaveURL((url) => url.pathname === `/${eventPath}`);
    await page.keyboard.press("Escape");
    await page.goto("/tables");
    await page.getByRole("searchbox").fill(input.tableName);
    await card
      .getByRole("button", {
        name: `${it ? "Giochi da tavolo" : "Board games"}: ${input.tableName}`,
        exact: true,
      })
      .click();
    await expect(popover.getByText(input.gameName, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await open.click();
    await assertBackground(input.tableName);
    await expect(
      page.getByRole("region", { name: it ? "Lista posti" : "Seats list", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("tab", { name: l.participants, exact: true }).click();
    await expect(
      page.getByRole("region", { name: it ? "Lista posti" : "Seats list", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: it ? "Dettagli" : "Details", exact: true }).click();
    await expect(
      page.getByRole("region", { name: it ? "Lista posti" : "Seats list", exact: true }),
    ).toHaveCount(0);
    await test.info().attach("record-detail-presentation", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    expect(writes).toEqual([]);
    return;
  }
  if (mode === "draft") {
    if (!input.catalogOnlyName || input.catalogOnlyName.length < 4)
      throw new Error("Catalog game with verified BGG 2–4 player pair required (for example Azul)");
    expect(event).toMatchObject({ status: "PLANNING", canEdit: true, tableCount: 1 });
    expect(table).toMatchObject({ minPlayers: 2, maxPlayers: 4 });
    expect(table.games).toHaveLength(1);
    const original = table.gamesDetail.find((game) => game.id === table.games[0].gameId);
    if (!original) throw new Error("Named single-game fixture required");
    const writes: string[] = [];
    page.on("request", (request) => {
      if (
        ["POST", "PATCH", "DELETE"].includes(request.method()) &&
        /\/api\/(groups|events)(\/|\?|$)/.test(request.url())
      )
        writes.push(request.url());
    });
    await page.goto("/groups/new");
    const name = page.getByRole("textbox", { name: l.groupName, exact: true });
    await expect(name).toHaveAttribute("placeholder", l.groupName);
    await name.fill("Unsaved group draft");
    await page.goto(`/${eventPath}/edit`);
    await page.getByRole("button", { name: l.next, exact: true }).click();
    await page
      .getByRole("button", { name: `${l.removeGame}: ${original.name}`, exact: true })
      .click();
    await page.getByRole("button", { name: `${l.increase} ${l.minimum}`, exact: true }).click();
    await page.getByRole("button", { name: `${l.increase} ${l.maximum}`, exact: true }).click();
    await expect(page.getByLabel(l.minimum, { exact: true })).toHaveText("3");
    await expect(page.getByLabel(l.maximum, { exact: true })).toHaveText("5");
    await page.getByRole("button", { name: l.chooseGame, exact: true }).click();
    await expect(page.getByTestId("list-filter-collection")).toBeVisible();
    for (const filter of [
      page.getByTestId("list-filter-collection"),
      page.getByTestId("list-filter-participants"),
    ])
      if ((await filter.count()) && (await filter.getAttribute("aria-pressed")) === "true")
        await filter.click();
    await page.getByRole("searchbox").fill(input.catalogOnlyName);
    await page
      .getByRole("button", { name: `${l.select}: ${input.catalogOnlyName}`, exact: true })
      .click();
    await expect(page.getByText(`${l.bounds}: 2–4`, { exact: true })).toBeVisible();
    await expect(page.getByLabel(l.minimum, { exact: true })).toHaveText("3");
    await expect(page.getByLabel(l.maximum, { exact: true })).toHaveText("4");
    await expect(
      page.getByRole("button", { name: `${l.increase} ${l.maximum}`, exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: `${l.decrease} ${l.maximum}`, exact: true }).click();
    await expect(
      page.getByRole("button", { name: `${l.decrease} ${l.maximum}`, exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: `${l.decrease} ${l.minimum}`, exact: true }).click();
    await expect(
      page.getByRole("button", { name: `${l.decrease} ${l.minimum}`, exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: `${l.removeGame}: ${input.catalogOnlyName}`, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: `${l.increase} ${l.maximum}`, exact: true }),
    ).toBeEnabled();
    expect(writes).toEqual([]);
    return;
  }
  if (mode === "shared") {
    expect(event).toMatchObject({
      status: "TERMINATED",
      sharedResultsOnly: true,
      readOnly: true,
      groupId: null,
      groupName: null,
      groupType: null,
      canRegister: false,
      canManage: false,
    });
    expect(table).toMatchObject({
      sharedResultsOnly: true,
      groupId: null,
      groupName: null,
      groupType: null,
    });
    expect(table).not.toHaveProperty("groupRatingChanges");
    expect(table).not.toHaveProperty("resultDraft");
    expect(table.resultProfiles?.every((row) => row.email === null)).toBe(true);
    for (const path of [
      `${tablePath}/seats`,
      `${tablePath}/leaderboard`,
      `${eventPath}/participants`,
    ])
      expect((await request(page, path)).status).toBe(403);
    await page.goto(`/${eventPath}`);
    await expect(page.getByRole("heading", { name: input.eventName, exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: l.participants, exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: l.tables, exact: true }).click();
    await expect(page.getByText(input.tableName, { exact: true })).toBeVisible();
    await page.goto(`/${tablePath}`);
    await expect(page.getByRole("tab", { name: l.ranking, exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: l.results, exact: true }).click();
    for (const name of [input.playerName, input.ndName]) {
      if (!name) throw new Error("Played and ND fixture usernames required");
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: l.join, exact: true })).toHaveCount(0);
  } else if (mode === "enroll") {
    expect(event).toMatchObject({ visibility: "PUBLIC", groupType: "PUBLIC", readOnly: true });
    expect(table.myRegistration).toBeNull();
    expect(table.games).toHaveLength(1);
    expect(
      (await read<GroupRecordResponse>(page, `groups/${event.groupId}`)).myMembership,
    ).toBeNull();
    await page.goto(`/${tablePath}`);
    await page.getByRole("tab", { name: l.participants, exact: true }).click();
    await page
      .getByRole("button", {
        name: it ? /^(Posto libero|Mettiti in coda)$/ : /^(Free place|Join waiting list)$/,
      })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: l.join, exact: true }).click();
    await expect(page.getByRole("button", { name: l.leave, exact: true })).toBeVisible();
    expect((await read<PlannedTableResponse>(page, tablePath)).myRegistration).toMatchObject({
      kind: "SELF",
      status: "ACCEPTED",
    });
    expect(
      (await read<GroupRecordResponse>(page, `groups/${event.groupId}`)).myMembership,
    ).toBeNull();
  } else if (mode === "picker") {
    expect(table.canManage).toBe(true);
    expect(table.eventStatus).toBe("PLANNING");
    for (const name of [
      input.ownOnlyName,
      input.participantOnlyName,
      input.catalogOnlyName,
      input.emptyQuery,
    ])
      if (!name || name.length < 4)
        throw new Error(
          "Distinct own-only/participant-only/catalog-only titles and an empty query required",
        );
    expect(event.tableCount).toBe(1);
    await page.goto(`/${eventPath}/edit`);
    await page.getByRole("button", { name: l.next, exact: true }).click();
    await page.getByRole("button", { name: l.chooseGame, exact: true }).click();
    const search = page.getByRole("searchbox");
    await expect(page.getByTestId("list-filter-collection")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("list-filter-search")).toHaveCount(0);
    await search.fill(input.ownOnlyName!);
    await expect(
      page.getByRole("button", { name: `${l.select}: ${input.ownOnlyName}`, exact: true }),
    ).toBeVisible();
    await search.fill(input.participantOnlyName!);
    await expect(page.getByText(l.empty, { exact: true })).toBeVisible();
    await page.getByTestId("list-filter-participants").click();
    await expect(
      page.getByRole("button", { name: `${l.select}: ${input.participantOnlyName}`, exact: true }),
    ).toBeVisible();
    await page.getByTestId("list-filter-collection").click();
    await search.fill(input.ownOnlyName!);
    await expect(page.getByText(l.empty, { exact: true })).toBeVisible();
    await page.getByTestId("list-filter-participants").click();
    await search.fill(input.catalogOnlyName!);
    await expect(
      page.getByRole("button", { name: `${l.select}: ${input.catalogOnlyName}`, exact: true }),
    ).toBeVisible();
    await search.fill(input.emptyQuery!);
    await expect(page.getByText(l.empty, { exact: true })).toBeVisible();
    await expect(search).toBeFocused();
    await page.getByRole("button", { name: l.back, exact: true }).click();
  } else {
    expect(event).toMatchObject({
      status: "CONFIRMED",
      canManage: true,
      canFinalize: true,
      resultsReady: true,
    });
    if (!event.groupId || event.visibility === "PUBLIC")
      throw new Error("Private grouped Event required for irreversible sharing fixture");
    await page.goto(`/${eventPath}`);
    await page.getByRole("button", { name: l.finalize, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: l.finalizeTitle });
    const choice = dialog.getByRole("switch", { name: l.share, exact: true });
    await expect(choice).not.toBeChecked();
    await choice.click();
    await dialog.getByRole("button", { name: l.cancel, exact: true }).click();
    await page.getByRole("button", { name: l.finalize, exact: true }).click();
    await expect(choice).not.toBeChecked();
    await choice.click();
    await dialog.getByRole("button", { name: l.finalize, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await read<PlannedEventResponse>(page, eventPath)).toMatchObject({
      status: "TERMINATED",
      shareResultsWithFriends: true,
    });
    await expect(page.getByRole("button", { name: l.finalize, exact: true })).toHaveCount(0);
  }
});
