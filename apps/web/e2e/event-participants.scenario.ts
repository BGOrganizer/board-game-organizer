import type {
  CommunityPageResponse,
  EventParticipantsResponse,
  GroupPersonResponse,
  PlannedEventResponse,
} from "@board-game-organizer/schemas";
import { formatUsername, withProtectionBypass } from "@board-game-organizer/shared";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for owned Event-participant acceptance`);
  return value;
}
if (required("EVENT_PEOPLE_FIXTURE_ACK") !== "owned-disposable-event-participants")
  throw new Error(
    "An owned disposable Development fixture is required. Remove/ban are real and may remain committed after failure; no automatic reset runs.",
  );
const api = new URL(required("EVENT_PEOPLE_API_URL")),
  locale = required("EVENT_PEOPLE_LOCALE");
const input = JSON.parse(required("EVENT_PEOPLE_INPUT")) as {
  eventId: string;
  groupId: string;
  targetId: string;
  targetName: string;
  targetOffset: number;
  mode: "remove" | "ban";
};
if (
  !["en", "it"].includes(locale) ||
  ![input.eventId, input.groupId].every((id) =>
    /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id),
  ) ||
  !/^[A-Za-z0-9_-]{1,128}$/.test(input.targetId) ||
  !input.targetName ||
  input.targetName.length < 4 ||
  !Number.isInteger(input.targetOffset) ||
  input.targetOffset < 20 ||
  input.targetOffset >= 50 ||
  !["remove", "ban"].includes(input.mode)
)
  throw new Error(
    "Valid private Event/Group, unique target, source offset20–49 and remove|ban mode required",
  );
for (const url of [api, new URL(required("PLAYWRIGHT_BASE_URL"))])
  if (!["localhost", "127.0.0.1"].includes(url.hostname) && !url.hostname.endsWith(".vercel.app"))
    throw new Error("Use local/Preview fixtures, never Production");
if (
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Development Clerk keys required");
const it = locale === "it";
const labels = {
  details: it ? "Dettagli" : "Details",
  tables: it ? "Tavoli" : "Tables",
  people: it ? "Partecipanti" : "Participants",
  edit: it ? "Modifica evento" : "Edit event",
  manage: it ? "Gestisci partecipante" : "Manage participant",
  remove: it ? "Rimuovi dall’evento" : "Remove from event",
  ban: it ? "Banna dal gruppo" : "Ban from group",
  cancel: it ? "Annulla" : "Cancel",
  more: it ? "Carica altro" : "Load more",
};
async function read<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(
    async (url) => {
      const token = await (
        window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> } } }
      ).Clerk?.session?.getToken();
      if (!token) throw new Error("Authenticated owned fixture required");
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
test("real Event tabs, paged attendance and distinct confirmed Event removal or Group ban", async ({
  page,
}) => {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: required("E2E_EMAIL") });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  const event = await read<PlannedEventResponse>(page, `events/${input.eventId}`);
  const roster = await read<EventParticipantsResponse>(
    page,
    `events/${input.eventId}/participants?limit=50`,
  );
  const person = roster.items[input.targetOffset];
  if (
    roster.items.length !== 50 ||
    !roster.nextCursor ||
    event.status !== "PLANNING" ||
    event.groupType !== "PRIVATE" ||
    event.groupId !== input.groupId ||
    !event.canManage ||
    !event.canEdit ||
    event.myRegistrations.some((r) => r.status === "ACCEPTED") ||
    person?.userId !== input.targetId ||
    formatUsername(person.username, person.name) !== input.targetName ||
    !person.canRemove ||
    !person.canBanGroup
  )
    throw new Error(
      "Current manager without automatic attendance and ordinary accepted target at the declared source offset required",
    );
  const membershipPath = `groups/${input.groupId}/members?mode=accepted&limit=50&query=${encodeURIComponent(person.username || person.name)}`;
  const membershipBefore = (
    await read<CommunityPageResponse<GroupPersonResponse>>(page, membershipPath)
  ).items.find((p) => p.userId === input.targetId)?.membership;
  if (membershipBefore?.status !== "ACCEPTED") throw new Error("Accepted Group member required");
  const writes: { path: string; method: string }[] = [];
  page.on("request", (request) => {
    const u = new URL(request.url());
    if (u.host === api.host && !["GET", "OPTIONS"].includes(request.method()))
      writes.push({ path: u.pathname, method: request.method() });
  });
  await page.goto(`/events/${input.eventId}`);
  await expect(page.getByRole("link", { name: labels.edit, exact: true })).toBeVisible();
  await page.getByRole("tab", { name: labels.tables, exact: true }).click();
  await expect(page.getByRole("link", { name: labels.edit, exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: labels.people, exact: true }).click();
  await expect(page.getByRole("link", { name: labels.edit, exact: true })).toHaveCount(0);
  for (let n = 0; n < Math.floor(input.targetOffset / 20); n++) {
    const next = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname.endsWith("/participants") &&
        new URL(r.url()).searchParams.has("cursor"),
    );
    await page.getByRole("button", { name: labels.more, exact: true }).click();
    expect((await next).status()).toBe(200);
  }
  const grid = page.getByRole("grid", { name: labels.people, exact: true });
  await grid.focus();
  await grid.press("Control+Home");
  for (let n = 0; n < input.targetOffset; n++) await grid.press("ArrowDown");
  const manage = page.getByRole("button", {
    name: `${labels.manage}: ${input.targetName}`,
    exact: true,
  });
  await expect(manage).toBeVisible();
  const action = input.mode === "remove" ? labels.remove : labels.ban;
  const open = async () => {
    await manage.click();
    await page
      .getByRole("dialog", { name: `${labels.manage}: ${input.targetName}`, exact: true })
      .getByRole("button", { name: action, exact: true })
      .click();
  };
  await open();
  const title = input.mode === "remove" ? action : `${action}: ${input.targetName}`;
  let confirmation = page.getByRole("dialog", { name: title, exact: true });
  await confirmation.getByRole("button", { name: labels.cancel, exact: true }).click();
  expect(
    writes.filter((r) => r.path.includes("/participants/") || r.path.endsWith("/bans")),
  ).toEqual([]);
  await open();
  confirmation = page.getByRole("dialog", { name: title, exact: true });
  const mutation = page.waitForResponse((r) =>
    input.mode === "remove"
      ? new URL(r.url()).pathname ===
          `/api/events/${input.eventId}/participants/${input.targetId}` &&
        r.request().method() === "DELETE"
      : new URL(r.url()).pathname === `/api/groups/${input.groupId}/bans` &&
        r.request().method() === "POST",
  );
  await confirmation.getByRole("button", { name: action, exact: true }).click();
  expect((await mutation).status()).toBe(input.mode === "remove" ? 200 : 201);
  await expect(confirmation).toHaveCount(0);
  expect(
    writes.filter((r) => r.path.includes("/participants/") || r.path.endsWith("/bans")),
  ).toEqual([
    input.mode === "remove"
      ? { path: `/api/events/${input.eventId}/participants/${input.targetId}`, method: "DELETE" }
      : { path: `/api/groups/${input.groupId}/bans`, method: "POST" },
  ]);
  const after = await read<EventParticipantsResponse>(
    page,
    `events/${input.eventId}/participants?limit=50`,
  );
  expect(after.items.some((p) => p.userId === input.targetId)).toBe(false);
  const memberAfter = (
    await read<CommunityPageResponse<GroupPersonResponse>>(page, membershipPath)
  ).items.find((p) => p.userId === input.targetId)?.membership;
  if (input.mode === "remove") expect(memberAfter).toEqual(membershipBefore);
  else expect(memberAfter).toBeUndefined();
  await page.reload();
  await page.getByRole("tab", { name: labels.people, exact: true }).click();
  for (let n = 0; n < Math.floor(input.targetOffset / 20); n++)
    await page.getByRole("button", { name: labels.more, exact: true }).click();
  const restored = page.getByRole("grid", { name: labels.people, exact: true });
  await restored.focus();
  await restored.press("Control+Home");
  for (let n = 0; n < input.targetOffset; n++) await restored.press("ArrowDown");
  await expect(
    page.getByRole("button", { name: `${labels.manage}: ${input.targetName}`, exact: true }),
  ).toHaveCount(0);
});
