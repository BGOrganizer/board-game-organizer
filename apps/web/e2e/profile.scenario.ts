import { withProtectionBypass } from "@board-game-organizer/shared";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for real Profile acceptance`);
  return value;
}
const locale = required("PROFILE_LOCALE"),
  theme = required("PROFILE_THEME"),
  api = new URL(required("PROFILE_API_URL"));
if (!["en", "it"].includes(locale) || !["light", "dark"].includes(theme))
  throw new Error("PROFILE_LOCALE must be en/it; PROFILE_THEME must be light/dark");
for (const url of [api, new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000")])
  if (!["localhost", "127.0.0.1"].includes(url.hostname) && !url.hostname.endsWith(".vercel.app"))
    throw new Error("Use explicit local/Preview fixtures, never Production");
if (
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Use Development Clerk keys only");
const email = required("E2E_EMAIL"),
  ownerName = required("PROFILE_OWNER_NAME"),
  target = required("PROFILE_TARGET_ID"),
  targetName = required("PROFILE_TARGET_NAME"),
  empty = required("PROFILE_EMPTY_ID"),
  emptyName = required("PROFILE_EMPTY_NAME"),
  gameName = required("PROFILE_GAME_NAME"),
  gameId = Number(required("PROFILE_GAME_ID")),
  publicText = required("PROFILE_PUBLIC_ACTIVITY_TEXT"),
  privateText = required("PROFILE_PRIVATE_ACTIVITY_TEXT"),
  blocks = [required("PROFILE_BLOCKED_BY_ME_ID"), required("PROFILE_BLOCKED_ME_ID")];
if (
  targetName.length < 4 ||
  !Number.isSafeInteger(gameId) ||
  gameId < 1 ||
  [target, empty, ...blocks].some((id) => !/^[A-Za-z0-9_-]{1,128}$/.test(id))
)
  throw new Error("Invalid Profile fixture identifiers");
const it = locale === "it",
  labels = {
    activities: it ? "Attività" : "Activities",
    player: it ? "Giocatore" : "Player",
    collection: it ? "Collezione" : "Collection",
    clearGame: it ? "Azzera gioco selezionato" : "Clear selected game",
    bgg: it ? "La tua collezione BGG" : "Your BGG collection",
    logout: it ? "Esci dall'account" : "Sign out of your account",
    sync: it ? "Sincronizza collezione" : "Sync collection",
    username: it ? "Nome utente BGG" : "BGG username",
    success: it ? "Collezione aggiornata" : "Collection up to date",
    failed: it
      ? "Impossibile sincronizzare la collezione BGG. La collezione precedente è conservata."
      : "Could not synchronize BGG collection. Your previous collection is retained.",
    disconnect: it ? "Scollega BoardGameGeek" : "Disconnect BoardGameGeek",
    cancel: it ? "Annulla" : "Cancel",
    all: it ? "Visualizza tutte le attività" : "View all activities",
    chart: it ? "Andamento del rating OpenSkill" : "OpenSkill rating history",
    boardGame: it ? "Gioco da tavolo" : "Board game",
    filter: it ? "Filtra giochi" : "Filter games",
    unavailable: it ? "Profilo non disponibile" : "Profile unavailable",
    noGames: it ? "Ancora nessuna partita classificata" : "No rated games yet",
    noActivities: it ? "Ancora nessuna attività" : "No activities yet",
  };
async function signIn(page: Page) {
  await page.emulateMedia({ colorScheme: theme as "light" | "dark" });
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
}
async function read(page: Page, path: string) {
  const url = withProtectionBypass(
    `${api.href.replace(/\/$/, "")}/api/${path}`,
    process.env.VERCEL_PROTECTION_BYPASS,
  );
  return page.evaluate(async (url) => {
    const session = (
      window as unknown as { Clerk?: { session?: { getToken: () => Promise<string | null> } } }
    ).Clerk?.session;
    if (!session) throw new Error("Authenticated fixture session required");
    const token = await session.getToken();
    if (!token) throw new Error("Fresh fixture token required");
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  }, url);
}
for (const width of [390, 1280]) {
  test(`real owner/other profile, ordinal GLOBAL history and authorized source pages ${locale}/${theme}/${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1100 });
    await signIn(page);
    await page.goto("/profile");
    const main = page.getByRole("main");
    await expect(main.getByText(ownerName, { exact: true })).toBeVisible();
    for (const tab of await main.getByRole("tab").all()) {
      await expect(tab).toHaveCSS("flex-direction", "row");
      await expect(tab).toHaveCSS("white-space", "nowrap");
      await expect(tab).toHaveCSS("font-size", "14px");
    }
    await main.getByRole("tab", { name: labels.collection, exact: true }).click();
    await expect(main.getByRole("heading", { name: labels.bgg })).toBeVisible();
    await expect(main.getByRole("button", { name: labels.logout, exact: true })).toBeVisible();
    await page.goto("/contacts");
    await main.getByRole("tab", { name: it ? "Ricerca" : "Search", exact: true }).click();
    await main
      .getByRole("searchbox", {
        name: it ? "Cerca utenti per nome o email" : "Search users by name or email",
        exact: true,
      })
      .fill(targetName);
    const contact = main
      .getByRole("listitem")
      .filter({ has: page.getByText(targetName, { exact: true }) });
    await expect(contact).toBeVisible();
    await contact.getByRole("button", { name: it ? "Azioni" : "Actions", exact: true }).click();
    await page
      .getByRole("menuitem", { name: it ? "Visualizza profilo" : "View profile", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/profiles/${target}$`));
    await expect(main.getByText(targetName, { exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: labels.bgg })).toHaveCount(0);
    await expect(main.getByRole("tab", { name: labels.collection, exact: true })).toHaveCount(0);
    await expect(main.getByRole("button", { name: labels.logout, exact: true })).toHaveCount(0);
    await expect(main.getByText(publicText, { exact: true })).toBeVisible();
    await expect(main.getByText(privateText, { exact: true })).toHaveCount(0);
    const profile = await read(page, `profiles/${target}`);
    expect(profile.status).toBe(200);
    expect(Object.keys(profile.body).sort()).toEqual([
      "avatarUrl",
      "id",
      "name",
      "player",
      "social",
      "username",
    ]);
    const feed = await read(page, `profiles/${target}/activities?limit=10`);
    expect(feed.status).toBe(200);
    expect(JSON.stringify(feed.body)).not.toContain(privateText);
    expect(feed.body.items.length).toBeLessThanOrEqual(10);
    await main.getByRole("tab", { name: labels.player, exact: true }).click();
    await main.getByRole("button", { name: new RegExp(labels.boardGame) }).click();
    await page.getByRole("searchbox", { name: labels.filter }).fill(gameName);
    await page.getByRole("option", { name: gameName, exact: true }).click();
    await expect(main.getByRole("img", { name: labels.chart })).toBeVisible();
    const history = await read(page, `profiles/${target}/games/${gameId}`);
    expect(history.status).toBe(200);
    expect(history.body.points.length).toBeGreaterThanOrEqual(2);
    for (const point of history.body.points)
      expect(Object.keys(point).sort()).toEqual(["delta", "ordinal", "rating"]);
    await main.getByRole("button", { name: labels.clearGame, exact: true }).click();
    await expect(main.getByRole("img", { name: labels.chart })).toHaveCount(0);
    await expect(main.getByRole("button", { name: labels.clearGame, exact: true })).toHaveCount(0);
    await main.getByRole("tab", { name: labels.activities, exact: true }).click();
    await main.getByRole("tab", { name: labels.player, exact: true }).click();
    await expect(main.getByRole("img", { name: labels.chart })).toHaveCount(0);
    await main.getByRole("tab", { name: labels.activities, exact: true }).click();
    await main.getByRole("button", { name: labels.all, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/profiles/${target}/activities$`));
    await expect(main.getByText(publicText, { exact: true })).toBeVisible();
    await expect(main.getByText(privateText, { exact: true })).toHaveCount(0);
    expect(await main.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  });
  test(`real empty and both blocked direct profiles ${locale}/${theme}/${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1100 });
    await signIn(page);
    await page.goto(`/profiles/${empty}`);
    const main = page.getByRole("main");
    await expect(main.getByText(emptyName, { exact: true })).toBeVisible();
    await expect(main.getByText(labels.noActivities, { exact: true })).toBeVisible();
    await main.getByRole("tab", { name: labels.player, exact: true }).click();
    await expect(main.getByText(labels.noGames, { exact: true })).toBeVisible();
    for (const subject of blocks) {
      await page.goto(`/profiles/${subject}`);
      await expect(main.getByText(labels.unavailable, { exact: true })).toBeVisible();
      const denied = await read(page, `profiles/${subject}`);
      expect(denied.status).toBe(404);
      expect(denied.body).toEqual({ error: "PROFILE_NOT_FOUND" });
      await expect(main.getByRole("heading", { name: labels.bgg })).toHaveCount(0);
    }
  });
}
test("real provider BGG failure/success/retained snapshot/unlink and confirmed logout", async ({
  page,
}) => {
  test.setTimeout(420_000);
  if (required("PROFILE_MUTABLE_BGG_FIXTURE_ACK") !== "owned-unlinked-development-account")
    throw new Error("An owned unlinked Development/Preview test account is mandatory");
  const username = required("PROFILE_BGG_USERNAME"),
    invalid = required("PROFILE_BGG_INVALID_USERNAME"),
    hosts = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) hosts.add(url.host);
  });
  await signIn(page);
  await page.goto("/profile");
  const main = page.getByRole("main");
  await expect(main.getByText(ownerName, { exact: true })).toBeVisible();
  await main.getByRole("tab", { name: labels.collection, exact: true }).click();
  await expect(main.getByRole("button", { name: labels.sync, exact: true })).toBeEnabled();
  expect([...hosts]).toEqual([api.host]);
  const before = await read(page, "bgg/account");
  expect(before.status).toBe(200);
  expect(before.body.active).toBeNull();
  expect(before.body.pending).toBeNull();
  const sync = main.getByRole("button", { name: labels.sync, exact: true });
  await sync.click();
  let dialog = page.getByRole("dialog", { name: labels.username, exact: true });
  await dialog.getByRole("textbox", { name: labels.username }).fill(invalid);
  await dialog.getByRole("button", { name: labels.sync, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(main.getByText(labels.failed, { exact: true })).toBeVisible();
  await sync.click();
  dialog = page.getByRole("dialog", { name: labels.username, exact: true });
  await dialog.getByRole("textbox", { name: labels.username }).fill(username);
  await dialog.getByRole("button", { name: labels.sync, exact: true }).click();
  await expect(main.getByText(labels.success, { exact: true })).toBeVisible({ timeout: 300_000 });
  const published = await read(page, "bgg/account");
  expect(published.body.active.username).toBe(username);
  expect(published.body.lastAttempt.status).toBe("success");
  await main
    .getByRole("button", { name: it ? "Cambia username BGG" : "Change BGG username" })
    .click();
  dialog = page.getByRole("dialog", { name: labels.username, exact: true });
  await dialog.getByRole("textbox", { name: labels.username }).fill(invalid);
  await dialog.getByRole("button", { name: labels.sync, exact: true }).click();
  await expect(main.getByText(labels.failed, { exact: true })).toBeVisible();
  expect((await read(page, "bgg/account")).body.active).toEqual(published.body.active);
  await main.getByRole("button", { name: labels.disconnect, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: labels.cancel, exact: true }).click();
  expect((await read(page, "bgg/account")).body.active).toEqual(published.body.active);
  await main.getByRole("button", { name: labels.disconnect, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: it ? "Scollega" : "Disconnect", exact: true })
    .click();
  await expect.poll(async () => (await read(page, "bgg/account")).body.active).toBeNull();
  await main.getByRole("button", { name: labels.logout, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: labels.cancel, exact: true }).click();
  await expect(main.getByText(ownerName, { exact: true })).toBeVisible();
  await main.getByRole("button", { name: labels.logout, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: it ? "Esci" : "Sign out", exact: true })
    .click();
  await expect(
    page.getByText(it ? "Benvenuto in Board Game Organizer" : "Welcome to Board Game Organizer", {
      exact: true,
    }),
  ).toBeVisible();
});
