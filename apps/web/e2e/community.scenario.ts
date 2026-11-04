import type { CommunityActivityPage } from "@board-game-organizer/schemas";
import { withProtectionBypass } from "@board-game-organizer/shared";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for real Community acceptance`);
  return value;
}
const locale = required("COMMUNITY_LOCALE"),
  theme = required("COMMUNITY_THEME"),
  api = new URL(required("COMMUNITY_API_URL")),
  email = required("E2E_EMAIL");
const friend = required("COMMUNITY_FRIEND_ID"),
  followed = required("COMMUNITY_FOLLOWED_ID"),
  incoming = required("COMMUNITY_INCOMING_ID"),
  privateText = required("COMMUNITY_PRIVATE_TEXT"),
  beforeText = required("COMMUNITY_BEFORE_TEXT");
const eventPath = required("COMMUNITY_PUBLIC_EVENT_PATH"),
  tablePath = required("COMMUNITY_PUBLIC_TABLE_PATH"),
  tableName = required("COMMUNITY_TABLE_TEXT"),
  it = locale === "it";
if (!["en", "it"].includes(locale) || !["light", "dark"].includes(theme))
  throw new Error("Select EN/IT and light/dark");
if (new Set([friend, followed, incoming]).size !== 3)
  throw new Error("Three distinct owned peer fixtures required");
if (
  !/^\/events\/[\da-f-]{36}$/.test(eventPath) ||
  !/^\/events\/[\da-f-]{36}\/tables\/[\da-f-]{36}$/.test(tablePath)
)
  throw new Error("Canonical public fixture detail paths required");
for (const url of [api, new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000")])
  if (!["localhost", "127.0.0.1"].includes(url.hostname) && !url.hostname.endsWith(".vercel.app"))
    throw new Error("Development/Preview only");
if (
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Development Clerk only");
async function read(page: Page, network: string, cursor?: string): Promise<CommunityActivityPage> {
  const url = withProtectionBypass(
    `${api.href.replace(/\/$/, "")}/api/community/activities?${new URLSearchParams({ network, limit: "10", ...(cursor ? { cursor } : {}) })}`,
    process.env.VERCEL_PROTECTION_BYPASS,
  );
  return page.evaluate(async (url) => {
    const session = (
      window as unknown as { Clerk?: { session?: { getToken: () => Promise<string | null> } } }
    ).Clerk?.session;
    const token = await session?.getToken();
    if (!token) throw new Error("Authenticated fixture required");
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Community read failed ${response.status}`);
    return response.json();
  }, url);
}
for (const width of [390, 1280])
  test(`real Community privacy/filter/read-only/navigation ${locale}/${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme as "light" | "dark" });
    await setupClerkTestingToken({ page });
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: email });
    await page.goto("/");
    await completeMobileNumberIfNeeded(page);
    const all = await read(page, "all"),
      friends = await read(page, "friends"),
      following = await read(page, "following");
    if (
      !all.items.length ||
      !friends.items.some((i) => i.author.id === friend) ||
      !following.items.some((i) => i.author.id === followed) ||
      !all.nextCursor
    )
      throw new Error("Real first-page friend/followed and >10-row fixtures required");
    for (const data of [all, friends, following]) {
      expect(data.items.length).toBeLessThanOrEqual(10);
      expect(data.items.every((i) => i.author.id !== incoming)).toBe(true);
      expect(JSON.stringify(data)).not.toContain(privateText);
      expect(JSON.stringify(data)).not.toContain(beforeText);
    }
    expect(friends.items.every((i) => i.author.id !== followed)).toBe(true);
    expect(following.items.every((i) => i.author.id !== friend)).toBe(true);
    const next = await read(page, "all", all.nextCursor ?? undefined);
    expect(next.items.some((i) => all.items.some((first) => first.id === i.id))).toBe(false);
    await page.goto("/community");
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", {
        name: it ? "Attività della tua rete" : "Your network's activities",
      }),
    ).toBeVisible();
    for (const data of [all]) {
      const row = data.items[0];
      if (!row.href || !row.context) throw new Error("Authorized linked activity required");
      await expect(
        main
          .locator(`a[href=${JSON.stringify(row.href)}]`)
          .filter({ hasText: row.context })
          .first(),
      ).toBeVisible();
    }
    await main.getByRole("tab", { name: it ? "Mercatino" : "Marketplace", exact: true }).click();
    await expect(
      main.getByText(it ? "Prossimamente" : "Coming soon", { exact: true }),
    ).toBeVisible();
    await main.getByRole("tab", { name: it ? "Attività" : "Activities", exact: true }).click();
    await main.getByRole("button", { name: it ? "Rete" : "Network", exact: false }).click();
    await page.getByRole("option", { name: it ? "Amici" : "Friends", exact: true }).click();
    await expect(
      main.getByRole("button", { name: it ? "Rete" : "Network", exact: false }),
    ).toContainText(it ? "Amici" : "Friends");
    await page.goto(eventPath);
    await expect(
      page.getByText(
        it
          ? "Vista pubblica in sola lettura. Unisciti al gruppo per partecipare."
          : "Public read-only view. Join the group to participate.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: it ? "Conferma evento" : "Confirm event", exact: true }),
    ).toHaveCount(0);
    await page.goto(tablePath);
    await expect(page.getByRole("heading", { name: tableName, exact: true })).toBeVisible();
    await expect(page.locator('a[href$="/results"]')).toHaveCount(0);
    await page.goto("/community");
    await expect(
      page.getByRole("button", { name: it ? "Rete" : "Network", exact: false }),
    ).toContainText(it ? "Amici" : "Friends");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
