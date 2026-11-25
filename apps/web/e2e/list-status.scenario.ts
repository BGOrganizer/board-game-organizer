import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import { withProtectionBypass } from "@board-game-organizer/shared";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for real Event sections and History acceptance`);
  return value;
}
type Fixture = { id: string; name: string };
const locale = required("STATUS_LOCALE"),
  theme = required("STATUS_THEME"),
  query = required("STATUS_QUERY"),
  email = required("E2E_EMAIL"),
  api = new URL(required("STATUS_API_URL")),
  input = JSON.parse(required("STATUS_INPUT")) as {
    scheduled: Fixture;
    available: Fixture & {
      kind: "public-outsider" | "private-member" | "public-group-private-member";
    };
    terminated: Fixture;
    history: Fixture & { eventId: string; winnerHandles: string[] };
    emptyQuery: string;
  };
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
if (
  required("STATUS_ACK") !== "owned-development-list-fixtures" ||
  !["en", "it"].includes(locale) ||
  !["light", "dark"].includes(theme) ||
  query.length > 80 ||
  !input ||
  ![input.scheduled, input.available, input.terminated, input.history].every(
    (row) =>
      row &&
      uuid.test(row.id) &&
      typeof row.name === "string" &&
      row.name.length <= 120 &&
      row.name.toLowerCase().includes(query.toLowerCase()),
  ) ||
  new Set([input.scheduled.name, input.available.name, input.terminated.name, input.history.name])
    .size !== 4 ||
  !uuid.test(input.history.eventId) ||
  !["public-outsider", "private-member", "public-group-private-member"].includes(
    input.available.kind,
  ) ||
  !Array.isArray(input.history.winnerHandles) ||
  !input.history.winnerHandles.length ||
  !input.history.winnerHandles.every((handle) => /^@[^\s@]+$/.test(handle)) ||
  new Set(input.history.winnerHandles).size !== input.history.winnerHandles.length ||
  typeof input.emptyQuery !== "string" ||
  !input.emptyQuery.trim() ||
  input.emptyQuery.length > 80
)
  throw new Error(
    "Valid acknowledged owned fixtures, names containing STATUS_QUERY, real winner handles and an unmatched query required",
  );
for (const url of [api, new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000")])
  if (!["localhost", "127.0.0.1"].includes(url.hostname) && !url.hostname.endsWith(".vercel.app"))
    throw new Error("Use local/Preview fixtures, never Production");
if (
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Use Development Clerk keys only");
const it = locale === "it",
  labels = {
    mine: it ? "Schedulati" : "Scheduled",
    available: it ? "Disponibili" : "Available",
    terminated: it ? "Terminati" : "Terminated events",
    history: it ? "Storico" : "History",
    filter: it ? "Filtra" : "Filter",
    clear: it ? "Cancella filtro" : "Clear filter",
    retry: it ? "Riprova" : "Try again",
  },
  cases = [
    {
      section: "mine",
      resource: "events",
      states: ["CONFIRMED", "PLANNING"],
      fixture: input.scheduled,
    },
    { section: "available", resource: "events", states: ["PLANNING"], fixture: input.available },
    {
      section: "terminated",
      resource: "events",
      states: ["TERMINATED"],
      fixture: input.terminated,
    },
    { section: "history", resource: "tables", states: ["TERMINATED"], fixture: input.history },
  ] as const;
async function read(
  page: Page,
  resource: string,
  section: string,
  statuses: readonly string[],
  text: string,
) {
  const params = new URLSearchParams({ limit: "20", query: text, statuses: statuses.join(",") });
  if (resource === "events") params.set("section", section);
  return page.evaluate(
    async (url) => {
      const token = await (
        window as unknown as {
          Clerk?: { session?: { getToken: () => Promise<string | null> } };
        }
      ).Clerk?.session?.getToken();
      if (!token) throw new Error("Authenticated fixture session required");
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Fixture read failed: ${response.status}`);
      return response.json();
    },
    withProtectionBypass(
      `${api.href.replace(/\/$/, "")}/api/${resource}?${params}`,
      process.env.VERCEL_PROTECTION_BYPASS,
    ),
  ) as Promise<{
    items: Array<PlannedEventResponse & PlannedTableResponse>;
    nextCursor: string | null;
  }>;
}
async function checkEventListControls(
  page: Page,
  section: "mine" | "available" | "terminated",
  matches: (url: string, text: string) => boolean,
) {
  const main = page.getByRole("main");
  const roleLabels = [
    "Admin",
    it ? "Moderatore" : "Moderator",
    it ? "Partecipante" : "Participant",
    it ? "In attesa" : "Pending",
  ];
  const count = section === "mine" ? 4 : section === "terminated" ? 3 : 0;
  const filter = (label: string, pressed: boolean) =>
    main.getByRole("button", { name: label, exact: true, pressed });
  for (const [index, label] of roleLabels.entries()) {
    if (index < count) await expect(filter(label, true)).toBeVisible();
    else {
      await expect(filter(label, true)).toHaveCount(0);
      await expect(filter(label, false)).toHaveCount(0);
    }
  }

  const initial = section === "terminated" ? "desc" : "asc";
  const reversed = initial === "asc" ? "desc" : "asc";
  const sortBy = it ? "Ordina per" : "Sort by";
  const labels = { date: it ? "Data" : "Date", name: it ? "Nome" : "Name" };
  const ascending = it ? "Ordina in ordine crescente" : "Sort ascending";
  const descending = it ? "Ordina in ordine decrescente" : "Sort descending";
  const sort = (field: keyof typeof labels) =>
    main.getByRole("button", { name: `${sortBy} ${labels[field]}`, exact: true });
  const reverse = (direction: "asc" | "desc") =>
    main.getByRole("button", {
      name: direction === "asc" ? descending : ascending,
      exact: true,
    });
  const verifySort = async (
    field: keyof typeof labels,
    direction: "asc" | "desc",
    action: () => Promise<void>,
  ) => {
    const result = page.waitForResponse((response) => {
      if (!matches(response.url(), query)) return false;
      const { searchParams } = new URL(response.url());
      return (
        !searchParams.has("cursor") &&
        searchParams.get("sort") === field &&
        searchParams.get("direction") === direction
      );
    });
    await action();
    const response = await result;
    expect(response.ok()).toBe(true);
    const { items } = (await response.json()) as { items: PlannedEventResponse[] };
    expect(items.length).toBeGreaterThan(0);
    if (field === "name") {
      const names = items.map((row) => row.name);
      const expected = [...names].sort((first, second) =>
        Buffer.from(first).compare(Buffer.from(second)),
      );
      expect(names).toEqual(direction === "asc" ? expected : expected.reverse());
    }
    await expect(
      main
        .getByRole("list", { name: it ? "Eventi" : "Events", exact: true })
        .getByRole("listitem")
        .first()
        .getByRole("link", { name: it ? /^Apri evento:/ : /^Open event:/ }),
    ).toHaveAttribute("href", `/events/${items[0].id}`);
  };
  await expect(reverse(initial)).toBeVisible();
  await sort("date").click();
  await verifySort("name", initial, () =>
    page.getByRole("menuitemradio", { name: labels.name, exact: true }).click(),
  );
  await verifySort("name", reversed, () => reverse(initial).click());
  await sort("name").click();
  await verifySort("date", reversed, () =>
    page.getByRole("menuitemradio", { name: labels.date, exact: true }).click(),
  );
  await reverse(reversed).click();

  const roles = roleLabels.slice(0, count);
  if (!roles.length) return;
  const cleared = page.waitForResponse(
    (response) =>
      matches(response.url(), query) && new URL(response.url()).searchParams.get("roles") === "",
  );
  for (const label of roles) await filter(label, true).click();
  expect((await cleared).ok()).toBe(true);
  await expect(
    main.getByText(it ? "Nessun evento trovato" : "No events found", { exact: true }),
  ).toBeVisible();
  for (const label of roles) await filter(label, false).click();
}
for (const width of [390, 1280])
  for (const current of cases)
    test(`real ${current.section} sections, filtering and retry ${locale}/${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme as "light" | "dark" });
      await setupClerkTestingToken({ page });
      await page.goto("/");
      await clerk.signIn({ page, emailAddress: email });
      await page.goto("/");
      await completeMobileNumberIfNeeded(page);
      const actor = await page.evaluate(
        () => (window as unknown as { Clerk?: { user?: { id: string } } }).Clerk?.user?.id,
      );
      if (!actor) throw new Error("Signed-in fixture actor required");
      const rows = await read(page, current.resource, current.section, current.states, query);
      expect(
        rows.items.some(
          (row) => row.id === current.fixture.id && row.name === current.fixture.name,
        ),
      ).toBe(true);
      for (const row of rows.items) {
        if (current.resource === "tables") {
          expect(row.eventStatus).toBe("TERMINATED");
          expect(row.confirmed).toBeTruthy();
          expect(
            row.confirmed?.playerIds.includes(actor) ||
              row.demonstratorUserId === actor ||
              row.canManage === true,
          ).toBe(true);
        } else {
          expect(current.states).toContain(row.status);
          const involved = row.canManage === true || row.myDemonstrator === true;
          if (current.section === "available") {
            expect(involved).toBe(false);
            expect(row.myRegistrations).toEqual([]);
            expect(row.canRegister).toBe(true);
          } else if (current.section === "terminated") {
            expect(involved || row.myRegistrations.some((reg) => reg.position === "FROZEN")).toBe(
              true,
            );
          } else
            expect(
              involved ||
                row.myRegistrations.some((reg) => ["PENDING", "ACCEPTED"].includes(reg.status)),
            ).toBe(true);
        }
      }
      if (current.section === "available") {
        const row = rows.items.find((row) => row.id === current.fixture.id);
        if (!row) throw new Error("Missing Available fixture");
        expect(row.groupId).toBeTruthy();
        expect(row.groupType).toBe(
          input.available.kind === "private-member" ? "PRIVATE" : "PUBLIC",
        );
        expect(row.visibility).toBe(
          input.available.kind === "public-outsider" ? "PUBLIC" : "PRIVATE",
        );
        expect(Boolean(row.readOnly)).toBe(input.available.kind === "public-outsider");
      }
      expect(
        (await read(page, current.resource, current.section, current.states, input.emptyQuery))
          .items,
      ).toEqual([]);
      const writes: string[] = [];
      page.on("request", (request) => {
        if (
          ["POST", "PATCH", "DELETE"].includes(request.method()) &&
          /\/api\/(events|tables)(\/|\?|$)/.test(new URL(request.url()).pathname)
        )
          writes.push(request.method());
      });
      await page.goto("/events");
      const main = page.getByRole("main");
      await expect(page.getByRole("tab", { name: labels.mine, exact: true })).toBeVisible();
      await expect(page.getByRole("tab", { name: labels.available, exact: true })).toBeVisible();
      const ended = page.getByRole("tab", { name: labels.terminated, exact: true });
      await ended.scrollIntoViewIfNeeded();
      await expect(ended).toBeVisible();
      if (current.section === "history") {
        if (width === 390)
          await page
            .getByRole("button", {
              name: it ? "Attiva/disattiva menu" : "Toggle menu",
              exact: true,
            })
            .click();
        await page.getByRole("link", { name: labels.history, exact: true }).click();
        await expect(main.getByRole("list", { name: labels.history, exact: true })).toBeVisible();
      } else await page.getByRole("tab", { name: labels[current.section], exact: true }).click();
      const sectionHelp = {
        mine: it ? "Aiuto sugli eventi schedulati" : "Scheduled events help",
        available: it ? "Aiuto sugli eventi disponibili" : "Available events help",
        terminated: it ? "Aiuto sugli eventi terminati" : "Terminated events help",
        history: it ? "Aiuto sullo storico dei tavoli" : "Table history help",
      };
      await expect(
        main.getByRole("heading", { name: labels[current.section], exact: true }),
      ).toBeVisible();
      await expect(
        main.getByText(it ? "Guida alla sezione" : "Section guide", { exact: true }),
      ).toBeVisible();
      await main.getByRole("button", { name: sectionHelp[current.section], exact: true }).click();
      const sectionPopover = page.getByRole("dialog");
      await expect(sectionPopover.locator("p")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(sectionPopover).toHaveCount(0);
      const filter = main.getByRole("searchbox", { name: labels.filter, exact: true });
      const matches = (url: string, text: string) => {
        const parsed = new URL(url);
        return (
          parsed.origin === api.origin &&
          parsed.pathname === `/api/${current.resource}` &&
          parsed.searchParams.get("query") === text &&
          parsed.searchParams.get("statuses") === current.states.join(",") &&
          (current.resource === "events"
            ? parsed.searchParams.get("section") === current.section
            : !parsed.searchParams.has("section"))
        );
      };
      const received = page.waitForResponse((response) => matches(response.url(), query));
      await filter.fill(query);
      const initialResponse = await received;
      expect(initialResponse.ok()).toBe(true);
      const initialOrder = new URL(initialResponse.url()).searchParams;
      if (current.resource === "events") {
        expect(initialOrder.get("sort")).toBe("date");
        expect(initialOrder.get("direction")).toBe(
          current.section === "terminated" ? "desc" : "asc",
        );
      } else {
        expect(initialOrder.has("sort")).toBe(false);
        expect(initialOrder.has("direction")).toBe(false);
      }
      const href =
        current.resource === "events"
          ? `/events/${current.fixture.id}`
          : `/events/${input.history.eventId}/tables/${input.history.id}`;
      const link = main.locator(`a[href="${href}"]`);
      await expect(link).toBeVisible();
      if (current.section === "history") {
        await expect(main.locator("[aria-pressed]")).toHaveCount(0);
        await expect(main.getByRole("button", { name: /^(Sort by|Ordina per) / })).toHaveCount(0);
      } else {
        await checkEventListControls(page, current.section, matches);
        await expect(link).toBeVisible();
      }
      if (current.section === "mine") {
        const source = rows.items.find((row) => row.id === current.fixture.id);
        const confirmed = source?.cardSummary?.tables.filter(
          (table) =>
            table.confirmed && (table.myParticipation === "CONFIRMED" || table.myDemonstrator),
        );
        if (source?.status === "CONFIRMED" && confirmed?.length) {
          const card = main.getByRole("listitem").filter({ has: link });
          await card
            .getByRole("button", { name: it ? "Confermata" : "Confirmed", exact: true })
            .click();
          const popup = page.getByRole("dialog");
          await expect(popup.getByText(it ? "Data e Ora:" : "Date and time:")).toBeVisible();
          await expect(popup.getByText(it ? "Luogo:" : "Location:")).toBeVisible();
          const heading = popup.getByText(it ? "Tavoli:" : "Tables:", { exact: true });
          await expect(heading).toBeVisible();
          await expect(
            heading.locator("xpath=following-sibling::ul[1]").getByRole("listitem"),
          ).toHaveText(
            confirmed
              .slice(0, 8)
              .map(
                (table) =>
                  table.confirmedGameName ??
                  `${it ? "Tavolo" : "Table"} #${(table.order ?? 0) + 1}`,
              ),
          );
          await page.keyboard.press("Escape");
        }
      }
      if (current.section === "terminated") {
        const card = main.getByRole("listitem").filter({ has: link });
        await card
          .getByRole("button", { name: it ? "Terminata" : "Terminated", exact: true })
          .click();
        const popup = page.getByRole("dialog", {
          name: it ? "Terminata" : "Terminated",
          exact: true,
        });
        await expect(popup).toBeVisible();
        await expect(popup.getByText(it ? "Data e Ora:" : "Date and time:")).toBeVisible();
        await expect(popup.getByText(it ? "Luogo:" : "Location:")).toBeVisible();
        await expect(popup.getByText(it ? "Tavoli:" : "Tables:", { exact: true })).toHaveCount(0);
        expect(await popup.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        const summary = rows.items.find((row) => row.id === current.fixture.id)?.cardSummary;
        if (!summary) throw new Error("Actual terminated Event summary required");
        for (const table of summary.tables.filter((table) => table.confirmed).slice(0, 8)) {
          const title =
            table.confirmedGameName ?? `${it ? "Tavolo" : "Table"} #${(table.order ?? 0) + 1}`;
          const line = popup.getByText(title, { exact: true }).locator("..");
          const winners = table.winners
            .map((winner) =>
              winner.username
                ? `@${winner.username.replace(/^@/, "")}`
                : it
                  ? "Nome utente non disponibile"
                  : "Username unavailable",
            )
            .join(", ");
          await expect(line).toHaveText(
            `${title} ${winners || (it ? "Nessun vincitore." : "No winners.")}`,
          );
          if (table.winners.length)
            await expect(line.locator(".lucide-trophy.text-warning-soft-foreground")).toBeVisible();
        }
        await page.keyboard.press("Escape");
        await link.click();
        const identity = page.getByTestId("record-identity-card");
        await expect(
          identity.getByRole("heading", { name: current.fixture.name, exact: true }),
        ).toBeVisible();
        await identity
          .getByRole("button", { name: it ? "Terminata" : "Terminated", exact: true })
          .click();
        await expect(popup.getByText(it ? "Data e Ora:" : "Date and time:")).toBeVisible();
        await expect(popup.getByText(it ? "Luogo:" : "Location:")).toBeVisible();
        await page.keyboard.press("Escape");
        await page.goBack();
      }
      if (current.section === "history") {
        await filter.fill(current.fixture.name);
        const card = main.getByRole("listitem").filter({ has: link });
        const state = it ? "Terminata" : "Terminated";
        for (const panel of [card, main]) {
          for (const prefix of it
            ? ["Date e Orari", "Luoghi", "Giochi da tavolo"]
            : ["Dates and times", "Locations", "Board games"])
            await expect(
              panel.getByRole("button", {
                name: `${prefix}: ${current.fixture.name}`,
                exact: true,
              }),
            ).toHaveCount(0);
          const roles = it ? "Ruoli e partecipazione" : "Roles and participation";
          await panel.getByRole("button", { name: roles, exact: true }).click();
          await expect(
            page
              .getByRole("dialog", { name: roles, exact: true })
              .getByText(
                it ? "In questo tavolo, hai i seguenti ruoli:" : "Your roles at this table:",
                { exact: true },
              ),
          ).toBeVisible();
          await page.keyboard.press("Escape");
          await panel.getByRole("button", { name: state, exact: true }).click();
          const popup = page.getByRole("dialog", { name: state, exact: true });
          await expect(popup).toBeVisible();
          await expect(
            popup.getByText(it ? "La partita è terminata." : "The game has ended.", {
              exact: true,
            }),
          ).toBeVisible();
          const heading = popup.getByText(
            input.history.winnerHandles.length === 1
              ? it
                ? "Vincitore"
                : "Winner"
              : it
                ? "Vincitori"
                : "Winners",
            { exact: true },
          );
          await expect(
            heading.locator(".lucide-trophy.text-warning-soft-foreground"),
          ).toBeVisible();
          await expect(popup.getByRole("listitem")).toHaveText(input.history.winnerHandles);
          expect(await popup.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(
            true,
          );
          for (const text of it
            ? ["Giocatori minimi", "Giocatori massimi", "Lista d'attesa"]
            : ["Minimum players", "Maximum players", "Waiting list"])
            await expect(popup.getByText(text, { exact: true })).toHaveCount(0);
          await page.keyboard.press("Escape");
          if (panel === card) await link.click();
        }
        await page.goBack();
      }
      const emptyText = it
        ? current.resource === "events"
          ? "Nessun evento trovato"
          : "Nessun tavolo trovato"
        : current.resource === "events"
          ? "No events found"
          : "No tables found";
      await filter.fill(input.emptyQuery);
      const empty = main.getByRole("status").filter({ hasText: emptyText });
      await expect(empty.getByText(emptyText, { exact: true })).toBeVisible();
      await expect(empty).toHaveCSS("align-items", "center");
      await expect(empty).toHaveCSS("flex-direction", "column");
      await expect(empty.locator('span[aria-hidden="true"] svg')).toBeVisible();
      await main.getByRole("button", { name: labels.clear, exact: true }).click();
      await expect(filter).toHaveValue("");
      const failureQuery = `${input.emptyQuery}-failure-${current.section}`;
      const failed = (url: URL) => matches(url.href, failureQuery);
      await page.route(failed, (route) =>
        route.fulfill({ status: 503, json: { error: "CONTROLLED_ACCEPTANCE_FAILURE" } }),
      );
      await filter.fill(failureQuery);
      await expect(
        main.getByText(
          it
            ? current.resource === "events"
              ? "Impossibile caricare gli eventi"
              : "Impossibile caricare i tavoli"
            : current.resource === "events"
              ? "Could not load events"
              : "Could not load tables",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(main.getByText(emptyText, { exact: true })).toHaveCount(0);
      await page.unroute(failed);
      await main.getByRole("button", { name: labels.retry, exact: true }).click();
      await expect(main.getByText(emptyText, { exact: true })).toBeVisible();
      await filter.fill(query);
      await expect(link).toBeVisible();
      expect(writes).toEqual([]);
      expect(await main.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    });
