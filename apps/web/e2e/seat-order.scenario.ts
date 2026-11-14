import type {
  PlannedEventResponse,
  PlannedTableResponse,
  TableSeatOrderSnapshot,
} from "@board-game-organizer/schemas";
import { formatUsername, withProtectionBypass } from "@board-game-organizer/shared";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for owned sparse-seat acceptance`);
  return value;
}
if (required("SEAT_ORDER_ACK") !== "owned-disposable-development-seats")
  throw new Error(
    "Explicit permission for real saves/removals on a disposable Development Table required",
  );
const cases = [
  "swap",
  "pending",
  "demote",
  "manual-remove",
  "manual-exit",
  "assisted-remove",
  "save-409",
  "save-503",
  "scroll",
] as const;
const input = JSON.parse(required("SEAT_ORDER_INPUT")) as {
  case: (typeof cases)[number];
  eventId: string;
  tableId: string;
  version: number;
  a: string;
  b: string;
  c: string;
  last: string;
  initial: Record<string, number | null>;
};
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
function validPositions(value: unknown): value is Record<string, number | null> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.entries(value).length &&
      Object.entries(value).every(
        ([id, seat]) =>
          uuid.test(id) && (seat === null || (Number.isSafeInteger(seat) && Number(seat) >= 0)),
      ),
  );
}
const locale = required("SEAT_ORDER_LOCALE"),
  theme = required("SEAT_ORDER_THEME"),
  width = Number(required("SEAT_ORDER_WIDTH")),
  api = new URL(required("SEAT_ORDER_API_URL"));
if (
  !cases.includes(input.case) ||
  ![input.eventId, input.tableId, input.a, input.b, input.c, input.last].every((id) =>
    uuid.test(id),
  ) ||
  new Set([input.a, input.b, input.c]).size !== 3 ||
  !Number.isSafeInteger(input.version) ||
  input.version < 1 ||
  !validPositions(input.initial) ||
  !["en", "it"].includes(locale) ||
  !["light", "dark"].includes(theme) ||
  ![390, 1280].includes(width)
)
  throw new Error(
    "Valid case, exact owned roster/positions/version, EN/IT, light/dark and width390/1280 required",
  );
for (const url of [api, new URL(required("PLAYWRIGHT_BASE_URL"))])
  if (
    (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) ||
    (!["localhost", "127.0.0.1"].includes(url.hostname) && !url.hostname.endsWith(".vercel.app")) ||
    url.username ||
    url.password
  )
    throw new Error("Local/Preview acceptance only, never Production");
if (
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Development Clerk keys required");
const removing = ["manual-remove", "manual-exit", "assisted-remove"].includes(input.case);
const expected = { ...input.initial };
if (removing) {
  delete expected[input.a];
  if (input.case === "assisted-remove") expected[input.c] = 0;
} else if (input.case === "demote") expected[input.a] = null;
else if (!["scroll", "save-409", "save-503"].includes(input.case)) {
  expected[input.a] = 2;
  expected[input.c] = 0;
}
if (
  (input.case !== "scroll" &&
    (Object.keys(input.initial).length !== 3 ||
      ![input.a, input.b, input.c].every((id) => id in input.initial))) ||
  (removing && input.last === input.a)
)
  throw new Error(
    "A/B/C-only fresh fixture required except for the long-list scroll case; last must survive",
  );
const it = locale === "it",
  labels = {
    participants: it ? "Partecipanti" : "Participants",
    reorder: it ? "Riordina posti" : "Reorder seats",
    save: it ? "Salva ordine dei posti" : "Save seat order",
    discard: it ? "Scarta ordine non salvato" : "Discard unsaved order",
    position: it ? "Posizione" : "Position",
    waiting: it ? "Lista d'attesa" : "Waiting list",
    lock: it ? "Blocca giocatore" : "Lock player",
    unlock: it ? "Sblocca giocatore" : "Unlock player",
    review: it ? "Verifica l'elenco aggiornato" : "Review latest roster",
    failed: it ? "Impossibile salvare l'ordine dei posti" : "Could not save seat order",
    stale: it
      ? "L'elenco dei giocatori è cambiato. Verifica l'elenco aggiornato prima di salvare."
      : "The roster changed. Review a fresh snapshot before saving.",
    leave: it ? "Abbandona tavolo" : "Leave table",
    remove: it ? "Rimuovi giocatore" : "Remove player",
    confirm: it ? "Conferma" : "Confirm",
    freeFirst: it ? "Posto libero: 1" : "Free place: 1",
  };
test.use({ locale, colorScheme: theme as "light" | "dark", viewport: { width, height: 850 } });
type Snapshot = Omit<TableSeatOrderSnapshot, "registrations"> & {
  registrations: Array<
    TableSeatOrderSnapshot["registrations"][number] & { seatIndex: number | null }
  >;
};
const path = `events/${input.eventId}/tables/${input.tableId}`,
  orderPath = `/api/${path}/seats/order`;
const isOrder = (url: string) =>
  new URL(url).origin === api.origin && new URL(url).pathname === orderPath;
async function read<T>(page: Page, suffix: string): Promise<T> {
  return page.evaluate(
    async (url) => {
      const token = await (
        window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> } } }
      ).Clerk?.session?.getToken();
      if (!token) throw new Error("Authenticated fixture owner required");
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Owned fixture read failed: ${response.status}`);
      return response.json();
    },
    withProtectionBypass(
      `${api.href.replace(/\/$/, "")}/api/${suffix}`,
      process.env.VERCEL_PROTECTION_BYPASS,
    ),
  );
}
const positions = (snapshot: Snapshot) =>
  Object.fromEntries(snapshot.registrations.map((row) => [row.id, row.seatIndex]));
const row = (page: Page, id: string) => page.locator(`[data-seat-order-row="${id}"]`);
async function editor(page: Page) {
  await page.getByRole("button", { name: labels.reorder, exact: true }).click();
  await expect(page.getByRole("button", { name: labels.save, exact: true })).toBeEnabled();
}
async function assertPlaces(page: Page, expected: Record<string, number | null>) {
  for (const [id, index] of Object.entries(expected)) {
    if (index === null)
      await expect(
        page
          .getByRole("region", { name: labels.waiting, exact: true })
          .locator(`[data-seat-order-row="${id}"]`),
      ).toHaveCount(1);
    else await expect(row(page, id)).toContainText(`${labels.position}: ${index + 1}`);
  }
}
async function bottomClearance(page: Page) {
  const last = row(page, input.last);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(last).toBeVisible();
  await expect
    .poll(
      async () => {
        const [item, save, discard] = await Promise.all([
          last.boundingBox(),
          page.getByRole("button", { name: labels.save, exact: true }).boundingBox(),
          page.getByRole("button", { name: labels.discard, exact: true }).boundingBox(),
        ]);
        return Boolean(
          item &&
            save &&
            discard &&
            item.y >= 0 &&
            item.y + item.height <= Math.min(save.y, discard.y) - 8,
        );
      },
      { message: "The entire last row must scroll above both floating actions" },
    )
    .toBe(true);
}

test(`owned sparse seat order ${input.case}/${locale}/${theme}/${width}`, async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: required("E2E_EMAIL") });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  const event = await read<PlannedEventResponse>(page, `events/${input.eventId}`);
  const table = await read<PlannedTableResponse>(page, path);
  const before = await read<Snapshot>(page, `${path}/seats/order`);
  expect(event.status).toBe("PLANNING");
  expect(event.planningMode).toBe(input.case === "assisted-remove" ? "ASSISTED" : "MANUAL");
  expect(table.canManage).toBe(true);
  expect(before.version).toBe(input.version);
  expect(before.capacity).toBeGreaterThanOrEqual(3);
  expect(positions(before)).toEqual(input.initial);
  const byId = new Map(before.registrations.map((registration) => [registration.id, registration]));
  const a = byId.get(input.a),
    b = byId.get(input.b),
    c = byId.get(input.c);
  if (!a || !b || !c || !byId.has(input.last))
    throw new Error("Owned A/B/C/last registrations required");
  expect([a.seatIndex, b.seatIndex, c.seatIndex]).toEqual([0, 1, 2]);
  expect([a.status, b.status]).toEqual(["ACCEPTED", "ACCEPTED"]);
  expect([Boolean(a.locked), Boolean(b.locked), Boolean(c.locked)]).toEqual([false, true, false]);
  expect(c.status).toBe(input.case === "pending" ? "PENDING" : "ACCEPTED");
  if (input.case === "pending") expect(c.kind).toBe("INVITATION");
  if (input.case === "demote")
    expect(before.registrations.every((registration) => registration.seatIndex !== null)).toBe(
      true,
    );
  await page.goto(`/${path}`);
  await page.getByRole("tab", { name: labels.participants, exact: true }).click();
  if (removing) {
    const action =
      input.case === "manual-exit"
        ? labels.leave
        : `${labels.remove}: ${formatUsername(a.username, a.name ?? a.userId)}`;
    await page.getByRole("button", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: input.case === "manual-exit" ? labels.leave : labels.remove,
      exact: true,
    });
    await dialog.getByRole("button", { name: labels.confirm, exact: true }).click();
    await expect(dialog).not.toBeVisible();
  } else {
    await editor(page);
    await assertPlaces(
      page,
      Object.fromEntries([input.a, input.b, input.c].map((id) => [id, input.initial[id]])),
    );
    await expect(
      row(page, input.b).getByRole("button", { name: labels.unlock, exact: true }),
    ).toBeVisible();
    if (input.case === "scroll") {
      expect(before.registrations.length).toBeGreaterThan(12);
      expect(before.registrations.at(-1)?.id).toBe(input.last);
      await bottomClearance(page);
      await page.getByRole("button", { name: labels.discard, exact: true }).click();
      expect(await read<Snapshot>(page, `${path}/seats/order`)).toEqual(before);
      return;
    }
    const draft = { ...input.initial };
    if (input.case === "demote") {
      await page.getByTestId(`seat-order-waiting-${input.a}`).click();
      draft[input.a] = null;
    } else {
      await page.getByTestId(`seat-order-up-${input.c}`).click();
      draft[input.a] = 2;
      draft[input.c] = 0;
      if (input.case === "pending")
        await row(page, input.c).getByRole("button", { name: labels.lock, exact: true }).click();
    }
    await assertPlaces(page, draft);
    const failure = input.case === "save-409" ? 409 : input.case === "save-503" ? 503 : null;
    if (failure)
      await page.route(
        (url) => isOrder(url.href),
        (route) =>
          route.request().method() === "PATCH"
            ? route.fulfill({
                status: failure,
                json: { error: failure === 409 ? "EVENT_CHANGED" : "TEMPORARY" },
              })
            : route.continue(),
      );
    const request = page.waitForRequest(
      (request) => request.method() === "PATCH" && isOrder(request.url()),
    );
    const response = page.waitForResponse(
      (response) => response.request().method() === "PATCH" && isOrder(response.url()),
    );
    await page.getByRole("button", { name: labels.save, exact: true }).click();
    const sent = (await request).postDataJSON() as {
      version: number;
      allocationKey: string;
      registrations: Array<{
        id: string;
        version: number;
        locked: boolean;
        seatIndex: number | null;
      }>;
    };
    expect(sent.version).toBe(before.version);
    expect(sent.allocationKey).toBe(before.allocationKey);
    expect(
      Object.fromEntries(
        sent.registrations.map((registration) => [registration.id, registration.seatIndex]),
      ),
    ).toEqual(draft);
    for (const registration of sent.registrations)
      expect(registration.version).toBe(byId.get(registration.id)?.version);
    if (failure) {
      expect((await response).status()).toBe(failure);
      await expect(
        page.getByRole("alert").filter({ hasText: failure === 409 ? labels.stale : labels.failed }),
      ).toBeVisible();
      await assertPlaces(page, draft);
      expect(await read<Snapshot>(page, `${path}/seats/order`)).toEqual(before);
      if (failure === 409)
        await expect(page.getByRole("button", { name: labels.save, exact: true })).toBeDisabled();
      await page.unrouteAll({ behavior: "wait" });
      await page.getByRole("button", { name: labels.review, exact: true }).click();
      await assertPlaces(page, input.initial);
      await expect(page.getByRole("button", { name: labels.save, exact: true })).toBeEnabled();
      await page.getByRole("button", { name: labels.discard, exact: true }).click();
      return;
    }
    expect((await response).ok()).toBe(true);
    await expect(page.getByRole("button", { name: labels.reorder, exact: true })).toBeVisible();
  }
  await expect
    .poll(async () => (await read<Snapshot>(page, `${path}/seats/order`)).version)
    .toBe(before.version + 1);
  const saved = await read<Snapshot>(page, `${path}/seats/order`);
  expect(saved.registrations.at(-1)?.id).toBe(input.last);
  expect(positions(saved)).toEqual(expected);
  expect(saved.capacity).toBe(before.capacity);
  expect(saved.seatedCount).toBe(Object.values(expected).filter((index) => index !== null).length);
  expect(saved.allocationKey).not.toBe(before.allocationKey);
  for (const registration of saved.registrations) {
    const original = byId.get(registration.id);
    if (!original) throw new Error("Saving cannot fabricate registrations");
    expect({
      userId: registration.userId,
      kind: registration.kind,
      status: registration.status,
      gameVotes: registration.gameVotes,
    }).toEqual({
      userId: original.userId,
      kind: original.kind,
      status: original.status,
      gameVotes: original.gameVotes,
    });
    expect(registration.version).toBe(original.version + (removing ? 0 : 1));
    expect(Boolean(registration.locked)).toBe(
      Boolean(original.locked) || (input.case === "pending" && registration.id === input.c),
    );
    if (original.locked)
      expect({ locked: registration.locked, seatIndex: registration.seatIndex }).toEqual({
        locked: true,
        seatIndex: original.seatIndex,
      });
  }
  if (input.case === "pending")
    expect(saved.registrations.find((registration) => registration.id === input.c)?.locked).toBe(
      true,
    );
  if (removing)
    expect(saved.registrations.some((registration) => registration.id === input.a)).toBe(false);
  await page.reload();
  await page.getByRole("tab", { name: labels.participants, exact: true }).click();
  await editor(page);
  await assertPlaces(page, expected);
  if (["demote", "manual-remove", "manual-exit"].includes(input.case))
    await expect(page.getByText(labels.freeFirst, { exact: true })).toBeVisible();
  await bottomClearance(page);
  await page.getByRole("button", { name: labels.discard, exact: true }).click();
  expect(positions(await read<Snapshot>(page, `${path}/seats/order`))).toEqual(expected);
});
