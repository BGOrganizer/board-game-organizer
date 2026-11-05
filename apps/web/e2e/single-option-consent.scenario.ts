import type {
  JoinTableInput,
  PlannedEventResponse,
  PlannedTableResponse,
} from "@board-game-organizer/schemas";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for real singleton-consent acceptance`);
  return value;
}
if (required("SINGLE_OPTION_FIXTURE_ACK") !== "owned-disposable-development-fixture")
  throw new Error(
    "Explicit permission for a disposable Development fixture required; this test joins/accepts it",
  );
const input = JSON.parse(required("SINGLE_OPTION_INPUT")) as {
  mask: number;
  mode: "join" | "accept";
  path: string;
  name: string;
};
if (
  !Number.isInteger(input.mask) ||
  input.mask < 0 ||
  input.mask > 7 ||
  !["join", "accept"].includes(input.mode) ||
  !/^\/events\/[\da-f-]{36}\/tables\/[\da-f-]{36}$/.test(input.path)
)
  throw new Error("SINGLE_OPTION_INPUT needs mask 0..7, join/accept mode and an owned Table path");
const locale = required("SINGLE_OPTION_LOCALE"),
  width = Number(required("SINGLE_OPTION_WIDTH"));
if (!["en", "it"].includes(locale) || ![390, 1280].includes(width))
  throw new Error("Use EN/IT and width 390/1280");
const origin = new URL(required("PLAYWRIGHT_BASE_URL"));
if (
  (!["localhost", "127.0.0.1"].includes(origin.hostname) &&
    !origin.hostname.endsWith(".vercel.app")) ||
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Use local/Preview and Development Clerk only, never Production");
const italian = locale === "it",
  eventId = input.path.split("/")[2],
  tableId = input.path.split("/")[4];
const action =
  input.mode === "join"
    ? italian
      ? "Iscriviti al tavolo"
      : "Join table"
    : italian
      ? "Accetta invito"
      : "Accept invitation";

test(`real singleton consent ${input.mode}/${input.mask}/${locale}/${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 });
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: required("E2E_EMAIL") });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  const eventRead = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname.endsWith(`/events/${eventId}`) &&
      r.request().method() === "GET" &&
      r.ok(),
  );
  const tableRead = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname.endsWith(`/tables/${tableId}`) &&
      r.request().method() === "GET" &&
      r.ok(),
  );
  await page.goto(input.path);
  const event: PlannedEventResponse = await (await eventRead).json(),
    table: PlannedTableResponse = await (await tableRead).json();
  expect(event.status).toBe("PLANNING");
  expect(event.groupType).toBe("PRIVATE");
  expect(table.canInvite).toBe(false);
  expect(table.maxPlayers).toBe(2);
  expect(event.dates).toHaveLength(input.mask & 1 ? 2 : 1);
  expect(event.locations).toHaveLength(input.mask & 2 ? 2 : 1);
  expect(table.games).toHaveLength(input.mask & 4 ? 2 : 1);
  if (input.mode === "accept")
    expect(table.myRegistration).toMatchObject({ status: "PENDING", kind: "INVITATION" });
  else {
    expect(table.myRegistration).toBeNull();
    expect(table.canRegister).toBe(true);
  }
  const main = page.getByRole("main"),
    title = italian ? "Rivedi le impostazioni del tavolo" : "Review table settings";
  const writes: unknown[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      (request.method() === "POST" && path.endsWith(`/tables/${tableId}/registrations`)) ||
      (request.method() === "PATCH" &&
        path.endsWith(`/table-registrations/${table.myRegistration?.id}`))
    )
      writes.push(request.postDataJSON());
  });
  async function open() {
    if (input.mode === "accept")
      await main.getByRole("button", { name: action, exact: true }).click();
    else {
      await main
        .getByRole("button", { name: italian ? "Posto libero" : "Free place", exact: true })
        .click();
      await page.getByRole("dialog").getByRole("button", { name: action, exact: true }).click();
    }
    await expect(page.getByRole("dialog", { name: title })).toBeVisible();
  }
  await open();
  const dialog = page.getByRole("dialog", { name: title });
  await dialog
    .getByRole("button", { name: italian ? "Annulla" : "Cancel", exact: true })
    .last()
    .click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toHaveLength(0);
  await open();
  const tabs = [
    italian ? "Date" : "Dates",
    italian ? "Luoghi" : "Locations",
    italian ? "Giochi" : "Games",
  ];
  await expect(dialog.getByRole("tab")).toHaveCount(
    [1, 2, 4].filter((bit) => input.mask & bit).length,
  );
  const submit = dialog.getByRole("button", { name: action, exact: true });
  for (let index = 0; index < tabs.length; index++) {
    if (!(input.mask & (1 << index))) {
      await expect(dialog.getByRole("tab", { name: tabs[index], exact: true })).toHaveCount(0);
      continue;
    }
    await dialog.getByRole("tab", { name: tabs[index], exact: true }).click();
    const no = dialog.getByRole("tabpanel").getByRole("button", { name: /: No$/ });
    await expect(no).toHaveCount(2);
    for (const button of await no.all()) await button.click();
    await expect(submit).toBeDisabled();
  }
  expect(writes).toHaveLength(0);
  for (let index = 0; index < tabs.length; index++) {
    if (!(input.mask & (1 << index))) continue;
    await dialog.getByRole("tab", { name: tabs[index], exact: true }).click();
    const yes = dialog
      .getByRole("tabpanel")
      .getByRole("button", { name: italian ? /: Sì$/ : /: Yes$/ });
    await expect(yes).toHaveCount(2);
    for (const button of await yes.all()) await button.click();
  }
  await expect(submit).toBeEnabled();
  const saved = page.waitForResponse((r) =>
    input.mode === "join"
      ? r.request().method() === "POST" &&
        new URL(r.url()).pathname.endsWith(`/tables/${tableId}/registrations`)
      : r.request().method() === "PATCH" &&
        new URL(r.url()).pathname.endsWith(`/table-registrations/${table.myRegistration?.id}`),
  );
  await submit.click();
  await expect(dialog).toHaveCount(0);
  expect((await saved).ok()).toBe(true);
  expect(writes).toHaveLength(1);
  const choices: JoinTableInput = {
    version: event.version,
    gameVotes:
      input.mask & 4
        ? Object.fromEntries(table.games.map((row) => [String(row.gameId), "YES"]))
        : {},
    availability: {
      version: event.version,
      dateVotes:
        input.mask & 1 ? Object.fromEntries(event.dates.map((row) => [row.id, "YES"])) : {},
      locationVotes:
        input.mask & 2 ? Object.fromEntries(event.locations.map((row) => [row.id, "YES"])) : {},
    },
  };
  expect(writes[0]).toEqual(
    input.mode === "join"
      ? choices
      : { action: "accept", version: table.myRegistration!.version, participation: choices },
  );
  await expect(
    main.getByRole("button", { name: italian ? "Abbandona tavolo" : "Leave table", exact: true }),
  ).toBeVisible();
});
