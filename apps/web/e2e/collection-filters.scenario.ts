import type {
  BggAccountResponse,
  BggCollectionResponse,
  ProfileView,
} from "@board-game-organizer/schemas";
import { withProtectionBypass } from "@board-game-organizer/shared";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for real shared collection acceptance`);
  return value;
}
if (required("COLLECTION_SHARED_FIXTURE_ACK") !== "owned-synchronized-readonly-profiles")
  throw new Error(
    "Owned read-only Development fixtures required; no provisioning/provider operations",
  );
const locale = required("COLLECTION_LOCALE"),
  theme = required("COLLECTION_THEME"),
  api = new URL(required("COLLECTION_API_URL"));
const p = JSON.parse(required("COLLECTION_SHARED_INPUT")) as {
  subjectId: string;
  subjectName: string;
  unsyncedId: string;
  unsyncedName: string;
  expansionName: string;
  wishlistName: string;
  emptyQuery: string;
  commonName: string;
  viewerSynced: boolean;
};
if (
  !["en", "it"].includes(locale) ||
  !["light", "dark"].includes(theme) ||
  ![p.subjectId, p.unsyncedId].every(
    (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v),
  ) ||
  ![p.subjectName, p.unsyncedName, p.expansionName, p.wishlistName, p.emptyQuery].every(
    (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 120,
  ) ||
  typeof p.viewerSynced !== "boolean" ||
  (p.viewerSynced && (!p.commonName || p.commonName.length > 120))
)
  throw new Error("Explicit authorized synced/unsynced subjects and known filter titles required");
for (const url of [api, new URL(required("PLAYWRIGHT_BASE_URL"))])
  if (!["localhost", "127.0.0.1"].includes(url.hostname) && !url.hostname.endsWith(".vercel.app"))
    throw new Error("Local/Preview only, never Production");
if (
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Development Clerk only");
const it = locale === "it",
  l = {
    collection: it ? "Collezione" : "Collection",
    filter: it ? "Filtra collezione" : "Filter collection",
    games: it ? "Giochi" : "Games",
    expansions: it ? "Espansioni" : "Expansions",
    wishlist: it ? "Lista desideri" : "Wishlist",
    common: it ? "In comune" : "In common",
    clear: it ? "Pulisci ricerca" : "Clear search",
    empty: it ? "Nessun gioco trovato" : "No games found",
    sync: it ? "Sincronizza collezione" : "Sync collection",
    more: it ? "Carica altri giochi" : "Load more games",
    logout: it ? "Esci dall'account" : "Sign out of your account",
    base: it ? "Giochi senza espansioni" : "Games without expansions",
    total: it ? "Giochi incluse le espansioni" : "Games including expansions",
  };
async function read<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(
    async (url) => {
      const token = await (
        window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> } } }
      ).Clerk?.session?.getToken();
      if (!token) throw new Error("Authenticated fixture required");
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`Fixture read ${r.status}`);
      return r.json();
    },
    withProtectionBypass(
      `${api.href.replace(/\/$/, "")}/api/${path}`,
      process.env.VERCEL_PROTECTION_BYPASS,
    ),
  );
}
for (const width of [390, 1280])
  test(`shared collection filters, privacy and sticky geometry ${locale}/${theme}/${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme as "light" | "dark" });
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: required("E2E_EMAIL") });
    await page.goto("/");
    await completeMobileNumberIfNeeded(page);
    const subject = await read<ProfileView>(page, `profiles/${p.subjectId}`),
      account = await read<BggAccountResponse>(page, "bgg/account");
    if (!subject.collection || Boolean(account.active) !== p.viewerSynced)
      throw new Error("Published subject/current viewer snapshot fixture mismatch");
    const root = `bgg/collection?subjectId=${encodeURIComponent(p.subjectId)}&snapshot=${encodeURIComponent(subject.collection.snapshot)}`;
    const fixtures: Array<[string, string]> = [
      [p.expansionName, "expansion"],
      [p.wishlistName, "wishlist"],
    ];
    if (p.viewerSynced) fixtures.push([p.commonName, "common"]);
    for (const [query, kind] of fixtures) {
      const params = new URLSearchParams({
        query,
        limit: "1",
        ...(kind === "expansion" ? { types: "expansions" } : {}),
        ...(kind === "wishlist" ? { wishlist: "true" } : {}),
        ...(kind === "common" ? { commonSnapshot: account.active?.snapshot ?? "" } : {}),
      });
      const result = await read<BggCollectionResponse>(page, `${root}&${params}`);
      if (!result.items.some((row) => row.name === query))
        throw new Error(`Missing real ${kind} fixture title`);
    }
    if (
      (await read<BggCollectionResponse>(page, `${root}&query=${encodeURIComponent(p.emptyQuery)}`))
        .items.length
    )
      throw new Error("Unmatched query fixture is not empty");
    const writes: string[] = [];
    page.on("request", (r) => {
      const url = new URL(r.url());
      if (
        url.host === api.host &&
        url.pathname.startsWith("/api/bgg/") &&
        !["GET", "OPTIONS"].includes(r.method())
      )
        writes.push(r.method());
    });
    await page.goto(`/profiles/${p.subjectId}`);
    await expect(page.getByText(p.subjectName, { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: l.collection, exact: true }).click();
    await expect(page.getByRole("button", { name: l.sync, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: l.logout, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: l.more, exact: true })).toHaveCount(0);
    const panel = page.getByRole("tabpanel"),
      input = panel.getByRole("searchbox", { name: l.filter, exact: true }),
      button = (name: string) => panel.getByRole("button", { name, exact: true });
    const cards = await Promise.all(
      [l.base, l.total, l.wishlist].map(async (name) =>
        panel.getByText(name, { exact: true }).and(panel.locator("p")).locator("..").boundingBox(),
      ),
    );
    if (cards.some((b) => !b)) throw new Error("Counter layout not measurable");
    expect(
      Math.max(...cards.map((b) => b!.height)) - Math.min(...cards.map((b) => b!.height)),
    ).toBeLessThan(1);
    await input.fill(p.emptyQuery);
    await expect(panel.getByText(l.empty, { exact: true })).toBeVisible();
    await input.blur();
    await expect(input).toHaveValue(p.emptyQuery);
    await expect(input).toBeInViewport();
    await button(l.expansions).click();
    await expect(button(l.expansions)).toHaveAttribute("aria-pressed", "false");
    await button(l.wishlist).click();
    await button(l.clear).click();
    await expect(input).toHaveValue("");
    await expect(button(l.wishlist)).toHaveAttribute("aria-pressed", "true");
    await button(l.wishlist).click();
    await button(l.expansions).click();
    await button(l.games).click();
    await input.fill(p.expansionName);
    await expect(panel.getByRole("option", { name: p.expansionName, exact: true })).toBeVisible();
    await button(l.games).click();
    await input.fill(p.wishlistName);
    await button(l.wishlist).click();
    await expect(panel.getByRole("option", { name: p.wishlistName, exact: true })).toBeVisible();
    await button(l.wishlist).click();
    if (p.viewerSynced) {
      await button(l.common).click();
      await input.fill(p.commonName);
      await expect(panel.getByRole("option", { name: p.commonName, exact: true })).toBeVisible();
    } else await expect(button(l.common)).toBeDisabled();
    const noSync = await read<ProfileView>(page, `profiles/${p.unsyncedId}`);
    if (noSync.collection) throw new Error("Unsynchronized subject fixture required");
    await page.goto(`/profiles/${p.unsyncedId}`);
    await expect(page.getByText(p.unsyncedName, { exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: l.collection, exact: true })).toHaveCount(0);
    expect(writes).toEqual([]);
  });
