import type {
  NotificationChangesPage,
  NotificationListResponse,
} from "@board-game-organizer/schemas";
import { withProtectionBypass } from "@board-game-organizer/shared";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for owned notification acceptance`);
  return value;
}
if (required("NOTIFICATION_POPOVER_ACK") !== "owned-disposable-notifications")
  throw new Error(
    "Owned disposable fixture required: this journey marks resource information as read.",
  );
const input = JSON.parse(required("NOTIFICATION_POPOVER_INPUT")) as {
  kind: "group" | "event" | "table";
  id: string;
  eventId?: string;
  locale: "en" | "it";
  mode: "empty" | "read" | "pending" | "overflow" | "query-error" | "read-error";
  expectedText: string;
  historicalIds: string[];
  protectedIds: string[];
};
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
if (
  !["group", "event", "table"].includes(input.kind) ||
  !uuid.test(input.id) ||
  (input.kind === "table" && !uuid.test(input.eventId ?? "")) ||
  !["en", "it"].includes(input.locale) ||
  !["empty", "read", "pending", "overflow", "query-error", "read-error"].includes(input.mode) ||
  !input.expectedText ||
  !Array.isArray(input.historicalIds) ||
  !Array.isArray(input.protectedIds) ||
  [...input.historicalIds, ...input.protectedIds].some((id) => !/^[a-f\d]{24}$/i.test(id))
)
  throw new Error(
    "Valid isolated resource, locale, case and owned notification identifiers required",
  );
const api = new URL(required("NOTIFICATION_POPOVER_API_URL"));
for (const url of [api, new URL(required("PLAYWRIGHT_BASE_URL"))])
  if (!["localhost", "127.0.0.1"].includes(url.hostname) && !url.hostname.endsWith(".vercel.app"))
    throw new Error("Local/Preview acceptance only, never Production");
const it = input.locale === "it";
test.use({ locale: input.locale });
const labels = {
  open: it ? "Aggiornamenti" : "New changes",
  read: it ? "Segna tutte le modifiche come lette" : "Mark all changes as read",
  retry: it ? "Riprova" : "Try again",
  empty: it ? "Nessuna nuova modifica" : "No new changes",
};
async function read<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(
    async (url) => {
      const token = await (
        window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> } } }
      ).Clerk?.session?.getToken();
      if (!token) throw new Error("Authenticated owned fixture required");
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
const changesPath = `notifications/changes?${new URLSearchParams({ kind: input.kind, id: input.id, tab: "all", limit: "50", locale: input.locale })}`;

test("resource popover preserves history, pending decisions and unrelated attention", async ({
  page,
}) => {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: required("E2E_EMAIL") });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  const before = await read<NotificationChangesPage>(page, changesPath);
  expect(before.nextCursor, "Prepared acceptance resource must fit in50 source rows").toBeNull();
  const inboxBefore = await read<NotificationListResponse>(
    page,
    `notifications?limit=50&locale=${input.locale}`,
  );
  for (const id of input.historicalIds)
    expect(inboxBefore.notifications.some((row) => row.id === id)).toBe(true);
  for (const id of input.protectedIds) {
    const row = inboxBefore.notifications.find((row) => row.id === id);
    expect(row, "Protected fixtures must be within the owned recent inbox page").toBeTruthy();
    expect(row?.readAt).toBeNull();
  }
  for (const change of before.changes) {
    const inbox = inboxBefore.notifications.find((row) => row.id === change.notificationId);
    expect(inbox, "Prepared source rows must be within the recent owned inbox page").toBeTruthy();
    expect(change.title).toBe(inbox?.title);
    expect(change.description).toBe(inbox?.description);
  }
  if (input.mode === "empty") expect(before.changes).toHaveLength(0);
  else expect(before.changes.length).toBeGreaterThan(0);
  if (input.mode === "pending")
    expect(before.changes.every((row) => row.requiresResponse)).toBe(true);
  if (input.mode === "overflow") await page.setViewportSize({ width: 390, height: 400 });
  const endpoint = "**/api/notifications/changes**";
  if (input.mode === "query-error")
    await page.route(endpoint, (route) =>
      route.request().method() === "GET" ? route.abort("failed") : route.continue(),
    );
  const path =
    input.kind === "group"
      ? `/groups/${input.id}`
      : input.kind === "event"
        ? `/events/${input.id}`
        : `/events/${input.eventId}/tables/${input.id}`;
  await page.goto(path);
  const trigger = page.getByRole("button", { name: labels.open, exact: true });
  await expect(trigger).toHaveCount(1);
  await trigger.click();
  const popover = page.getByRole("dialog", { name: labels.open, exact: true });
  await expect(popover).toBeVisible();
  if (input.mode === "query-error") {
    await expect(popover.getByRole("alert")).toBeVisible();
    await page.unroute(endpoint);
    await popover.getByRole("button", { name: labels.retry, exact: true }).click();
  }
  await expect(popover.getByText(input.expectedText, { exact: true })).toHaveCount(1);
  if (before.changes[0]) {
    await expect(popover.getByText(before.changes[0].title, { exact: true }).first()).toBeVisible();
    await expect(
      popover.getByText(before.changes[0].description, { exact: true }).first(),
    ).toBeVisible();
  }

  const bounds = await popover.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds?.y).toBeGreaterThanOrEqual(0);
  expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
    await page.evaluate(() => innerHeight),
  );
  if (input.mode === "overflow")
    await expect
      .poll(() =>
        popover
          .getByTestId("notification-changes-list")
          .evaluate((node) => node.scrollHeight > node.clientHeight),
      )
      .toBe(true);
  const action = popover.getByRole("button", { name: labels.read, exact: true });
  if (input.mode === "empty" || input.mode === "pending") {
    await expect(action).toBeDisabled();
    return;
  }
  const opened = await read<NotificationChangesPage>(page, changesPath);
  expect(opened.changes.map((row) => row.readReference)).toEqual(
    before.changes.map((row) => row.readReference),
  );
  if (input.mode === "read-error") {
    await page.route(endpoint, (route) =>
      route.request().method() === "PATCH" ? route.abort("failed") : route.continue(),
    );
    await action.click();
    await expect(popover.getByRole("alert")).toBeVisible();
    await page.unroute(endpoint);
    await popover.getByRole("button", { name: labels.retry, exact: true }).click();
  } else await action.click();
  await expect
    .poll(
      async () =>
        (await read<NotificationChangesPage>(page, changesPath)).changes.filter(
          (row) => !row.requiresResponse,
        ).length,
    )
    .toBe(0);
  const inboxAfter = await read<NotificationListResponse>(
    page,
    `notifications?limit=50&locale=${input.locale}`,
  );
  for (const id of input.historicalIds)
    expect(inboxAfter.notifications.some((row) => row.id === id)).toBe(true);
  for (const id of input.protectedIds)
    expect(inboxAfter.notifications.find((row) => row.id === id)?.readAt).toBeNull();
  await expect(popover.getByRole("button", { name: labels.read, exact: true })).toBeDisabled();
});
