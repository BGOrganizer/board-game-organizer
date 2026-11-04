import type {
  CommunityPageResponse,
  PlannedEventResponse,
  PlannedTableResponse,
  TableSeatResponse,
} from "@board-game-organizer/schemas";
import { withProtectionBypass } from "@board-game-organizer/shared";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for owned Table-result acceptance`);
  return value;
}
const locale = required("RESULTS_LOCALE"),
  api = new URL(required("RESULTS_API_URL")),
  eventId = required("RESULTS_EVENT_ID"),
  tableId = required("RESULTS_TABLE_ID"),
  excludedId = required("RESULTS_EXCLUDED_TABLE_ID"),
  email = required("E2E_EMAIL");
if (required("RESULTS_FIXTURE_ACK") !== "owned-unfinalized-development-event")
  throw new Error(
    "An owned disposable Development/Preview Event is mandatory: this scenario saves scores and irreversibly finalizes it",
  );
if (
  !["en", "it"].includes(locale) ||
  [eventId, tableId, excludedId].some(
    (id) => !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id),
  ) ||
  tableId === excludedId
)
  throw new Error("Invalid locale or fixture identifiers");
for (const url of [api, new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000")])
  if (!["localhost", "127.0.0.1"].includes(url.hostname) && !url.hostname.endsWith(".vercel.app"))
    throw new Error("Use local/Preview fixtures, never Production");
if (
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Development Clerk keys required");
const it = locale === "it",
  labels = {
    register: it ? "Registra Risultato" : "Register result",
    save: it ? "Salva risultato" : "Save result",
    score: it ? "Punteggio" : "Score",
    close: it ? "Chiudi" : "Close",
    cancel: it ? "Annulla" : "Cancel",
    finalize: it ? "Finalizza evento" : "Finalize event",
    results: it ? "Risultati" : "Results",
  };
async function read<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(
    async (url) => {
      const token = await (
        window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> } } }
      ).Clerk?.session?.getToken();
      if (!token) throw new Error("Authenticated fixture session required");
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Fixture read failed: ${response.status}`);
      return response.json();
    },
    withProtectionBypass(
      `${api.href.replace(/\/$/, "")}/api/${path}`,
      process.env.VERCEL_PROTECTION_BYPASS,
    ),
  );
}
test("owned admin saves editable scores across reloads; excluded Tables never block atomic Event finalization", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1100 });
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  const event = await read<PlannedEventResponse>(page, `events/${eventId}`),
    tables = await read<CommunityPageResponse<PlannedTableResponse>>(
      page,
      `events/${eventId}/tables?limit=20`,
    );
  const table = tables.items.find((row) => row.id === tableId),
    excluded = tables.items.find((row) => row.id === excludedId);
  if (
    event.status !== "CONFIRMED" ||
    !event.canFinalize ||
    tables.nextCursor ||
    tables.items.filter((row) => row.confirmed).length !== 1 ||
    !table?.confirmed ||
    table.resultDraft ||
    !excluded ||
    excluded.confirmed ||
    table.confirmed.playerIds.length !== 2
  )
    throw new Error(
      "Fixture must have exactly one included unsaved two-player Table and one excluded Table",
    );
  const roster = await read<CommunityPageResponse<TableSeatResponse>>(
    page,
    `events/${eventId}/tables/${tableId}/seats?limit=50`,
  );
  const players = table.confirmed.playerIds.map((id) =>
    roster.items.find((row) => row.userId === id),
  );
  if (
    players.some((row) => !row) ||
    new Set(players.map((row) => row?.name ?? row?.userId)).size !== 2
  )
    throw new Error("Fixture requires two distinct mirrored player names on the first roster page");
  const stats = new Map<string, number>();
  for (const id of table.confirmed.playerIds)
    stats.set(
      id,
      (await read<{ player: { gamesPlayed: number } }>(page, `profiles/${id}`)).player.gamesPlayed,
    );
  await page.goto(`/events/${eventId}/tables/${excludedId}`);
  await expect(page.getByRole("heading", { name: excluded.name, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: labels.register, exact: true })).toHaveCount(0);
  await page.goto(`/events/${eventId}/tables/${tableId}`);
  await page.getByRole("link", { name: labels.register, exact: true }).click();
  await expect(page.getByRole("heading", { name: labels.register, exact: true })).toBeVisible();
  for (const [index, player] of players.entries()) {
    if (!player) throw new Error("Missing frozen player");
    const label = `${labels.score}: ${player.name ?? player.userId}`;
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("textbox", { name: label, exact: true }).fill(index === 0 ? "2.25" : "1");
    await page.getByRole("button", { name: labels.close, exact: true }).click();
  }
  await page.getByRole("button", { name: labels.save, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: labels.cancel, exact: true }).click();
  expect(
    (await read<PlannedTableResponse>(page, `events/${eventId}/tables/${tableId}`)).resultDraft,
  ).toBeUndefined();
  await page.getByRole("button", { name: labels.save, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: labels.save, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/events/${eventId}/tables/${tableId}$`));
  const saved = await read<PlannedTableResponse>(page, `events/${eventId}/tables/${tableId}`);
  expect(saved.resultDraft?.entries.map((row) => row.score)).toEqual(["2.25", "1"]);
  expect(saved.results).toBeUndefined();
  expect((await read<PlannedEventResponse>(page, `events/${eventId}`)).status).toBe("CONFIRMED");
  for (const id of table.confirmed.playerIds)
    expect(
      (await read<{ player: { gamesPlayed: number } }>(page, `profiles/${id}`)).player.gamesPlayed,
    ).toBe(stats.get(id));
  await page.reload();
  await page.getByRole("link", { name: labels.register, exact: true }).click();
  const first = players[0];
  if (!first) throw new Error("Missing first player");
  const score = `${labels.score}: ${first.name ?? first.userId}`;
  await page.getByRole("button", { name: score, exact: true }).click();
  await expect(page.getByRole("textbox", { name: score, exact: true })).toHaveValue("2.25");
  await page.getByRole("textbox", { name: score, exact: true }).fill("3.5");
  await page.getByRole("button", { name: labels.close, exact: true }).click();
  await page.getByRole("button", { name: labels.save, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: labels.save, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/events/${eventId}/tables/${tableId}$`));
  expect(
    (await read<PlannedTableResponse>(page, `events/${eventId}/tables/${tableId}`)).resultDraft
      ?.entries[0].score,
  ).toBe("3.5");
  for (const id of table.confirmed.playerIds)
    expect(
      (await read<{ player: { gamesPlayed: number } }>(page, `profiles/${id}`)).player.gamesPlayed,
    ).toBe(stats.get(id));
  await page.goto(`/events/${eventId}`);
  await page.getByRole("button", { name: labels.finalize, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: labels.cancel, exact: true }).click();
  expect((await read<PlannedEventResponse>(page, `events/${eventId}`)).status).toBe("CONFIRMED");
  await page.getByRole("button", { name: labels.finalize, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: labels.finalize, exact: true })
    .click();
  await expect(page.getByRole("button", { name: labels.finalize, exact: true })).toHaveCount(0);
  expect((await read<PlannedEventResponse>(page, `events/${eventId}`)).status).toBe("TERMINATED");
  expect(
    (await read<PlannedTableResponse>(page, `events/${eventId}/tables/${excludedId}`)).results,
  ).toBeUndefined();
  for (const id of table.confirmed.playerIds)
    expect(
      (await read<{ player: { gamesPlayed: number } }>(page, `profiles/${id}`)).player.gamesPlayed,
    ).toBe(stats.get(id)! + 1);
  await page.goto(`/events/${eventId}/tables/${tableId}`);
  await expect(page.getByRole("link", { name: labels.register, exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: labels.results, exact: true }).click();
  await page.screenshot({ path: `test-results/table-results-${locale}.png`, fullPage: true });
});
