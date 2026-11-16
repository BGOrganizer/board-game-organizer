import type {
  GroupRecordResponse,
  PlannedEventResponse,
  PlannedTableResponse,
} from "@board-game-organizer/schemas";
import { withProtectionBypass } from "@board-game-organizer/shared";
import {
  createResourceArtwork,
  type ResourceArtworkKind,
} from "@board-game-organizer/shared/artwork";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for owned resource-artwork acceptance`);
  return value;
}
if (required("ARTWORK_FIXTURE_ACK") !== "owned-read-only-development-resources")
  throw new Error("Owned, read-only Development Group/Event/Table fixtures are required");
const locale = required("ARTWORK_LOCALE"),
  api = new URL(required("ARTWORK_API_URL")),
  eventId = required("ARTWORK_EVENT_ID"),
  tableId = required("ARTWORK_TABLE_ID"),
  groupId = required("ARTWORK_GROUP_ID"),
  logoGroupId = required("ARTWORK_LOGO_GROUP_ID"),
  email = required("E2E_EMAIL");
for (const url of [api, new URL(required("PLAYWRIGHT_BASE_URL"))])
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (!["localhost", "127.0.0.1"].includes(url.hostname) &&
      !(url.protocol === "https:" && url.hostname.endsWith(".vercel.app")))
  )
    throw new Error("Use local/Preview resources, never Production");
if (
  !["en", "it"].includes(locale) ||
  [eventId, tableId, groupId, logoGroupId].some(
    (id) => !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id),
  ) ||
  groupId === logoGroupId ||
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("EN/IT, distinct owned resources and Development Clerk are required");

async function read<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(
    async (url) => {
      const token = await (
        window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> } } }
      ).Clerk?.session?.getToken();
      if (!token) throw new Error("A fresh authenticated fixture token is required");
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Fixture read failed (${response.status})`);
      return response.json();
    },
    withProtectionBypass(
      `${api.href.replace(/\/$/, "")}/api/${path}`,
      process.env.VERCEL_PROTECTION_BYPASS,
    ),
  );
}
async function inspectArtwork(frame: Locator, kind: ResourceArtworkKind, id: string) {
  await expect(frame).toHaveAttribute("data-theme", "light");
  await expect(frame).toHaveAttribute("data-artwork-kind", kind);
  await expect(frame).toHaveAttribute("aria-hidden", "true");
  const image = frame.locator("img");
  await expect(image).toHaveAttribute("alt", "");
  await expect(image).toHaveAttribute(
    "src",
    `data:image/svg+xml,${encodeURIComponent(createResourceArtwork(kind, id).svg)}`,
  );
  await expect(image).toHaveCSS("object-fit", "contain");
  await expect(image).toHaveCSS("animation-name", "none");
  await expect
    .poll(() =>
      image.evaluate(
        (node) => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0,
      ),
    )
    .toBe(true);
  return image;
}

// A is a private logo-less Group containing a manager's scheduled Event and its Table.
// B is another readable Group with a real uploaded logo. Both must be visible on their first pages.
// The actor is already complete in Clerk. No provisioning, phone updates or domain writes occur.
for (const theme of ["light", "dark"] as const)
  for (const width of [390, 1280])
    test(`approved resource artwork ${locale}/${theme}/${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1100 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "no-preference" });
      await setupClerkTestingToken({ page });
      await page.goto("/");
      await clerk.signIn({ page, emailAddress: email });
      await page.goto("/");
      const complete = await page.evaluate(() => {
        const number = (
          window as unknown as {
            Clerk?: { user?: { unsafeMetadata?: { mobileNumber?: unknown } } };
          }
        ).Clerk?.user?.unsafeMetadata?.mobileNumber;
        return typeof number === "string" && number.trim().length > 0;
      });
      if (!complete) throw new Error("A pre-existing complete Development account is required");
      const writes: string[] = [],
        errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (
          ["POST", "PATCH", "PUT", "DELETE"].includes(request.method()) &&
          /\/api\/(groups|events)(\/|\?|$)/.test(request.url())
        )
          writes.push(new URL(request.url()).pathname);
      });
      const [group, logoGroup, event, table] = await Promise.all([
        read<GroupRecordResponse>(page, `groups/${groupId}`),
        read<GroupRecordResponse>(page, `groups/${logoGroupId}`),
        read<PlannedEventResponse>(page, `events/${eventId}`),
        read<PlannedTableResponse>(page, `events/${eventId}/tables/${tableId}`),
      ]);
      if (
        group.logo ||
        !logoGroup.logo ||
        group.type !== "PRIVATE" ||
        event.groupId !== groupId ||
        !event.canManage ||
        event.status === "TERMINATED" ||
        table.eventId !== eventId
      )
        throw new Error(
          "Readable owned logo/no-logo Groups and a managed scheduled Event/Table are required",
        );
      const it = locale === "it";
      const openCard = async (path: string, name: string, label: string) => {
        await page.goto(path);
        await page
          .getByRole("searchbox", { name: it ? "Filtra" : "Filter", exact: true })
          .fill(name);
        const link = page.getByRole("link", { name: `${label}: ${name}`, exact: true });
        await expect(link).toBeVisible();
        return page.locator(".card").filter({ has: link });
      };
      const groupCard = await openCard("/groups", group.name, it ? "Apri gruppo" : "Open group");
      const groupImage = await inspectArtwork(
        groupCard.locator('[data-slot="resource-artwork"]'),
        "groups",
        group.id,
      );
      expect(await groupImage.evaluate((image) => image.getBoundingClientRect().width)).toBe(96);
      const moving = await groupImage.screenshot({ animations: "allow" });
      await expect
        .poll(async () => !moving.equals(await groupImage.screenshot({ animations: "allow" })), {
          timeout: 10_000,
        })
        .toBe(true);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(groupImage).toHaveAttribute(
        "src",
        `data:image/svg+xml,${encodeURIComponent(createResourceArtwork("groups", group.id, "none").svg)}`,
      );
      await groupImage.evaluate((image) => (image as HTMLImageElement).decode());
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      );
      const still = await groupImage.screenshot({ animations: "allow" });
      await page.evaluate(async () => {
        for (let i = 0; i < 30; i++)
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      });
      expect(await groupImage.screenshot({ animations: "allow" })).toEqual(still);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.goto(`/groups/${group.id}`);
      await expect(page.getByRole("heading", { name: group.name, exact: true })).toBeVisible();
      await inspectArtwork(
        page.locator('[data-slot="resource-artwork"]').first(),
        "groups",
        group.id,
      );
      await page.screenshot({ path: test.info().outputPath(`group-${theme}-${width}.png`) });
      await page.goto(`/groups/${logoGroup.id}`);
      const logoCard = page.locator(".card").filter({
        has: page.getByRole("heading", { name: logoGroup.name, exact: true }),
      });
      await expect(logoCard.locator("img")).toHaveAttribute("src", logoGroup.logo!);
      await expect(page.locator('[data-artwork-kind="groups"]')).toHaveCount(0);
      // Exercise image failure locally, preserving the owned fixture and its server permissions.
      const logoEndpoint = new URL(`${api.href.replace(/\/$/, "")}/api/groups/${logoGroup.id}`);
      const logoRoute = (url: URL) =>
        url.origin === logoEndpoint.origin && url.pathname === logoEndpoint.pathname;
      await page.route(logoRoute, async (route) => {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        const body = await response.json();
        await route.fulfill({ response, json: { ...body, logo: "data:image/png;base64,invalid" } });
      });
      await page.reload();
      await inspectArtwork(
        page.locator('[data-artwork-kind="groups"]').first(),
        "groups",
        logoGroup.id,
      );
      await page.unroute(logoRoute);

      const eventCard = await openCard("/events", event.name, it ? "Apri evento" : "Open event");
      await inspectArtwork(eventCard.locator('[data-slot="resource-artwork"]'), "events", event.id);
      await page.goto(`/events/${event.id}`);
      await expect(page.getByRole("heading", { name: event.name, exact: true })).toBeVisible();
      await inspectArtwork(
        page.locator('[data-artwork-kind="events"]').first(),
        "events",
        event.id,
      );
      await page.screenshot({ path: test.info().outputPath(`event-${theme}-${width}.png`) });
      await page.getByRole("tab", { name: it ? "Tavoli" : "Tables", exact: true }).click();
      const tableCard = page.locator(".card").filter({
        has: page.getByRole("link", {
          name: `${it ? "Apri tavolo" : "Open table"}: ${table.name}`,
          exact: true,
        }),
      });
      await inspectArtwork(tableCard.locator('[data-slot="resource-artwork"]'), "tables", table.id);
      await page.goto(`/events/${event.id}/tables/${table.id}`);
      await expect(page.getByRole("heading", { name: table.name, exact: true })).toBeVisible();
      await inspectArtwork(
        page.locator('[data-artwork-kind="tables"]').first(),
        "tables",
        table.id,
      );
      await page.screenshot({ path: test.info().outputPath(`table-${theme}-${width}.png`) });
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(writes).toEqual([]);
      expect(errors).toEqual([]);
    });
