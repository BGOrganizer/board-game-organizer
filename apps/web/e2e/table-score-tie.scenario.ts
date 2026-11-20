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

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} required for owned local-score acceptance`);
  return value;
}
if (required("SCORE_TIE_FIXTURE_ACK") !== "owned-confirmed-three-player-local-draft")
  throw new Error("Explicit owned three-player fixture required; this journey never saves results");
const api = new URL(required("SCORE_TIE_API_URL")),
  eventId = required("SCORE_TIE_EVENT_ID"),
  tableId = required("SCORE_TIE_TABLE_ID"),
  locale = required("SCORE_TIE_LOCALE");
for (const url of [api, new URL(required("PLAYWRIGHT_BASE_URL"))]) {
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (!["localhost", "127.0.0.1"].includes(url.hostname) &&
      !(url.protocol === "https:" && url.hostname.endsWith(".vercel.app")))
  )
    throw new Error("Local/Preview only; Production score fixtures are forbidden");
}
if (
  ![eventId, tableId].every((id) => /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) ||
  !["en", "it"].includes(locale) ||
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Owned UUID fixtures, EN/IT locale and Development Clerk required");
const italian = locale === "it";
const labels = {
  register: italian ? "Registra Risultato" : "Register result",
  score: italian ? "Punteggio" : "Score",
  close: italian ? "Chiudi" : "Close",
  resolve: italian ? "Risolvi parità" : "Resolve tie",
  confirm: italian ? "Conferma spareggio" : "Confirm tie-break",
  applied: italian ? "Spareggio applicato" : "Tie-break applied",
  tied: italian ? "Punteggio pari" : "Tied score",
  edit: italian ? "Modifica spareggio" : "Edit tie-break",
  remove: italian ? "Rimuovi spareggio" : "Remove tie-break",
  down: italian ? "Sposta giù" : "Move down",
  standings: italian ? "Classifica provvisoria" : "Live standings",
  lowerWins: italian ? "Vince il punteggio più basso" : "Lowest score wins",
  nd: italian ? "Non ha partecipato" : "Did not participate",
  save: italian ? "Salva risultato" : "Save result",
};
async function read<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(
    async (url) => {
      const token = await (
        window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> } } }
      ).Clerk?.session?.getToken();
      if (!token) throw new Error("Authenticated fixture session required");
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Owned fixture read failed: ${response.status}`);
      return response.json();
    },
    withProtectionBypass(
      `${api.href.replace(/\/$/, "")}/api/${path}`,
      process.env.VERCEL_PROTECTION_BYPASS,
    ),
  );
}

for (const width of [390, 1280])
  test(`score focus, document standings and three-player tie edits without saving at ${width}px`, async ({
    page,
  }) => {
    const unexpectedWrites: string[] = [];
    // Preserve real reads; prevent an accidental score write during this draft-only journey.
    await page.route("**/api/events/**", async (route) => {
      const request = route.request();
      if (!["GET", "OPTIONS"].includes(request.method())) {
        unexpectedWrites.push(`${request.method()} ${new URL(request.url()).pathname}`);
        await route.abort("blockedbyclient");
      } else await route.continue();
    });
    await page.setViewportSize({ width, height: 480 });
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: required("E2E_EMAIL") });
    await page.goto("/");
    await completeMobileNumberIfNeeded(page);
    const event = await read<PlannedEventResponse>(page, `events/${eventId}`);
    const table = await read<PlannedTableResponse>(page, `events/${eventId}/tables/${tableId}`);
    if (
      event.status !== "CONFIRMED" ||
      !event.canFinalize ||
      !table.confirmed ||
      table.confirmed.playerIds.length !== 3 ||
      table.resultDraft ||
      table.results ||
      table.eventVersion !== event.version
    )
      throw new Error(
        "Fixture requires an authorized confirmed, unsaved, three-player Table at the current Event version",
      );
    const roster = await read<CommunityPageResponse<TableSeatResponse>>(
      page,
      `events/${eventId}/tables/${tableId}/seats?limit=50`,
    );
    const names = table.confirmed.playerIds.map((id) => {
      const player = roster.items.find((row) => row.userId === id);
      if (!player)
        throw new Error("All frozen players must be present on the first owned roster page");
      return player.name ?? player.userId;
    });
    if (new Set(names).size !== 3) throw new Error("Fixture requires three distinct player labels");
    await page.goto(`/events/${eventId}/tables/${tableId}/results`);
    await expect(page.getByRole("heading", { name: labels.register, exact: true })).toBeVisible();
    const standings = page.getByRole("region", { name: labels.standings, exact: true });
    const lowerWins = page.getByRole("switch", { name: labels.lowerWins, exact: true });
    const [ruleBounds, standingBounds] = await Promise.all([
      lowerWins.boundingBox(),
      standings.boundingBox(),
    ]);
    if (!ruleBounds || !standingBounds) throw new Error("Missing standings header geometry");
    expect(ruleBounds.y + ruleBounds.height).toBeLessThanOrEqual(standingBounds.y);
    expect(await standings.evaluate((node) => getComputedStyle(node).overflowY)).not.toMatch(
      /auto|scroll/,
    );
    await expect(lowerWins).not.toBeChecked();
    await lowerWins.locator("xpath=ancestor::label[1]").click();
    await expect(lowerWins).toBeChecked();
    await lowerWins.locator("xpath=ancestor::label[1]").click();
    const save = page.getByRole("button", { name: labels.save, exact: true });
    await save.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const footer = save.locator("..");
    expect(await footer.evaluate((node) => getComputedStyle(node).position)).toBe("static");
    expect(await footer.evaluate((node) => getComputedStyle(node).borderTopWidth)).toBe("0px");
    const [listBox, footerBox, saveBox] = await Promise.all([
      standings.boundingBox(),
      footer.boundingBox(),
      save.boundingBox(),
    ]);
    if (!listBox || !footerBox || !saveBox) throw new Error("Missing result-page geometry");
    expect(listBox.y + listBox.height).toBeLessThanOrEqual(footerBox.y);
    expect(saveBox.width).toBeCloseTo(footerBox.width, 0);
    const setScore = async (name: string, value: string) => {
      const label = `${labels.score}: ${name}`;
      await page.getByRole("button", { name: label, exact: true }).click();
      const field = page.getByRole("textbox", { name: label, exact: true });
      const dialog = page.getByRole("dialog", { name, exact: true });
      await field.fill("");
      await field.focus();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const initialBox = await dialog.boundingBox();
      const inputBox = await field.boundingBox();
      if (!initialBox || !inputBox) throw new Error("Missing score editor geometry");
      for (const character of value) {
        await field.pressSequentially(character);
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        const [currentBox, currentInput] = await Promise.all([
          dialog.boundingBox(),
          field.boundingBox(),
        ]);
        if (!currentBox || !currentInput) throw new Error("Lost score editor geometry");
        expect(currentBox.height).toBeCloseTo(initialBox.height, 0);
        expect(currentInput.height).toBeCloseTo(inputBox.height, 0);
        await expect(field).toBeFocused();
      }
      const nd = dialog.getByRole("switch", { name: `${labels.nd}: ${name}`, exact: true });
      await nd.locator("xpath=ancestor::label[1]").click();
      await expect(nd).toBeChecked();
      await expect(field).toBeDisabled();
      await nd.locator("xpath=ancestor::label[1]").click();
      await expect(nd).not.toBeChecked();
      await expect(field).toBeEnabled();
      await expect(field).toHaveValue(value);
      await page.getByRole("button", { name: labels.close, exact: true }).click();
    };
    for (const name of names) await setScore(name, "10");
    await page.getByRole("button", { name: labels.resolve, exact: true }).click();
    await page.getByRole("button", { name: `${labels.down}: ${names[0]}`, exact: true }).click();
    await page.getByRole("button", { name: labels.confirm, exact: true }).click();
    await expect(page.getByText(`${labels.applied}: 10`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: labels.edit, exact: true })).toBeVisible();
    await setScore(names[0], "11");
    await expect(page.getByText(`${labels.tied}: 10`, { exact: true })).toBeVisible();
    await expect(page.getByText(`${labels.applied}: 10`, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: labels.edit, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: labels.remove, exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: labels.resolve, exact: true }).click();
    await page.getByRole("button", { name: labels.confirm, exact: true }).click();
    await expect(page.getByText(`${labels.applied}: 10`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: labels.remove, exact: true }).click();
    await expect(page.getByText(`${labels.tied}: 10`, { exact: true })).toBeVisible();
    await page.screenshot({
      path: `test-results/table-score-tie-${locale}-${width}.png`,
      fullPage: true,
    });
    expect(unexpectedWrites).toEqual([]);
    expect(
      (await read<PlannedTableResponse>(page, `events/${eventId}/tables/${tableId}`)).resultDraft,
    ).toEqual(table.resultDraft);
    expect((await read<PlannedEventResponse>(page, `events/${eventId}`)).version).toBe(
      event.version,
    );
  });
