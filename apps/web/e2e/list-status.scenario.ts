import { withProtectionBypass } from "@board-game-organizer/shared";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for real lifecycle-filter acceptance`);
  return value;
}
const locale = required("STATUS_LOCALE"),
  theme = required("STATUS_THEME"),
  query = required("STATUS_QUERY"),
  email = required("E2E_EMAIL"),
  api = new URL(required("STATUS_API_URL"));
if (!["en", "it"].includes(locale) || !["light", "dark"].includes(theme))
  throw new Error("STATUS_LOCALE must be en/it; STATUS_THEME must be light/dark");
if (query.length > 120) throw new Error("STATUS_QUERY must be at most 120 characters");
for (const url of [api, new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000")])
  if (!["localhost", "127.0.0.1"].includes(url.hostname) && !url.hostname.endsWith(".vercel.app"))
    throw new Error("Use local/Preview fixtures, never Production");
if (
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Use Development Clerk keys only");
const states = ["CONFIRMED", "PLANNING", "TERMINATED"] as const,
  it = locale === "it";
async function read(page: Page, resource: "events" | "tables", status: string) {
  const params = new URLSearchParams({
    limit: "1",
    query,
    statuses: status,
    ...(resource === "events" ? { section: "mine" } : {}),
  });
  return page.evaluate(
    async (url) => {
      const session = (
        window as unknown as { Clerk?: { session?: { getToken: () => Promise<string | null> } } }
      ).Clerk?.session;
      const token = await session?.getToken();
      if (!token) throw new Error("Authenticated fixture session required");
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Fixture read failed: ${response.status}`);
      return response.json();
    },
    withProtectionBypass(
      `${api.href.replace(/\/$/, "")}/api/${resource}?${params}`,
      process.env.VERCEL_PROTECTION_BYPASS,
    ),
  );
}
for (const resource of ["events", "tables"] as const)
  for (const width of [390, 1280])
    test(`real ${resource} lifecycle and name filters ${locale}/${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ colorScheme: theme as "light" | "dark" });
      await setupClerkTestingToken({ page });
      await page.goto("/");
      await clerk.signIn({ page, emailAddress: email });
      await page.goto("/");
      await completeMobileNumberIfNeeded(page);
      const fixtures = new Map<string, { id: string; name: string; eventId?: string }>();
      for (const state of states) {
        const data = await read(page, resource, state);
        if (!data.items.length)
          throw new Error(`Owned ${resource} fixture required for ${state} and STATUS_QUERY`);
        fixtures.set(state, data.items[0]);
      }
      await page.goto(`/${resource}`);
      const main = page.getByRole("main"),
        input = main.getByRole("searchbox", { name: it ? "Filtra" : "Filter", exact: true });
      await input.fill(query);
      const names =
        resource === "events"
          ? [
              it ? "Confermati" : "Confirmed events",
              it ? "In pianificazione" : "Planning",
              it ? "Terminati" : "Terminated events",
            ]
          : [
              it ? "Confermati" : "Confirmed tables",
              it ? "In pianificazione" : "Planning",
              it ? "Terminati" : "Terminated tables",
            ];
      const selected = new Set<string>(states);
      for (const wanted of states) {
        const response = page.waitForResponse((response) => {
          const url = new URL(response.url());
          return (
            url.pathname === `/api/${resource}` &&
            url.searchParams.get("query") === query &&
            url.searchParams.get("statuses") === wanted
          );
        });
        for (const [index, state] of states.entries())
          if (selected.has(state) !== (state === wanted)) {
            await main.getByRole("button", { name: names[index], exact: true }).click();
            if (selected.has(state)) selected.delete(state);
            else selected.add(state);
          }
        const saved = await response;
        expect(saved.ok()).toBe(true);
        const body = await saved.json();
        expect(body.items.length).toBeGreaterThan(0);
        for (const row of body.items)
          expect(resource === "events" ? row.status : row.eventStatus).toBe(wanted);
        const fixture = fixtures.get(wanted);
        if (!fixture) throw new Error("Missing owned fixture");
        const href =
          resource === "events"
            ? `/events/${fixture.id}`
            : `/events/${fixture.eventId}/tables/${fixture.id}`;
        await expect(main.locator(`a[href="${href}"]`)).toBeVisible();
        for (const [index, state] of states.entries())
          await expect(
            main.getByRole("button", { name: names[index], exact: true }),
          ).toHaveAttribute("aria-pressed", String(state === wanted));
      }
      await main.getByRole("button", { name: names[2], exact: true }).click();
      await expect(
        main.getByText(
          it
            ? resource === "events"
              ? "Nessun evento trovato"
              : "Nessun tavolo trovato"
            : resource === "events"
              ? "No events found"
              : "No tables found",
          { exact: true },
        ),
      ).toBeVisible();
      expect((await read(page, resource, "")).items).toEqual([]);
      await main
        .getByRole("button", { name: it ? "Cancella filtro" : "Clear filter", exact: true })
        .click();
      await expect(input).toHaveValue("");
      expect(await main.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    });
