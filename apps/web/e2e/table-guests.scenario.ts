import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required for owned guest acceptance`);
  return value;
}

const base = new URL(required("PLAYWRIGHT_BASE_URL"));
if (
  required("TABLE_GUEST_ACK") !== "owned-disposable-private-planning-table" ||
  (base.hostname !== "localhost" &&
    base.hostname !== "127.0.0.1" &&
    (base.protocol !== "https:" || !base.hostname.endsWith(".vercel.app"))) ||
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Use an owned disposable fixture and local/Preview Development Clerk only");

const locale = required("TABLE_GUEST_LOCALE");
const input = JSON.parse(required("TABLE_GUEST_INPUT")) as {
  eventId: string;
  tableId: string;
  name: string;
  game: string;
};
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
if (
  !["en", "it"].includes(locale) ||
  !uuid.test(input.eventId) ||
  !uuid.test(input.tableId) ||
  !input.name?.trim() ||
  !input.game?.trim()
)
  throw new Error(
    "An owned private Table with multiple games and a unique guest display name is required",
  );

const it = locale === "it";
const labels = {
  name: it ? "Nome dell’ospite" : "Guest name",
  add: it ? "Aggiungi un ospite" : "Add a guest",
  participants: it ? "Partecipanti" : "Participants",
  guest: it ? "Ospite" : "Guest",
  edit: it ? "Modifica voti dell’ospite" : "Edit guest votes",
  yes: it ? "Sì" : "Yes",
  no: "No",
};

test("manager adds an unregistered guest and later records a ballot without a profile", async ({
  page,
}) => {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: required("E2E_EMAIL") });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);

  const path = `/events/${input.eventId}/tables/${input.tableId}`;
  await page.goto(path);
  await page.getByRole("tab", { name: labels.participants }).click();
  await page.goto(`${path}/invite`);
  await page.getByRole("textbox", { name: labels.name }).fill(input.name);
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api${path}/guests`,
  );
  await page.getByRole("button", { name: labels.add }).click();
  const result = await created;
  expect(result.ok()).toBeTruthy();
  expect(await result.json()).toMatchObject({
    kind: "GUEST",
    guestName: input.name,
    status: "ACCEPTED",
    gameVotes: {},
  });
  await expect(page).toHaveURL(new RegExp(`${path}(?:\\?.*)?$`));
  await page.getByRole("tab", { name: labels.participants }).click();
  const roster = page.getByRole("listitem").filter({
    has: page.getByRole("button", { name: `${labels.edit}: ${input.name}` }),
  });
  await expect(roster.getByText(input.name, { exact: true })).toBeVisible();
  await expect(roster.getByText(labels.guest, { exact: true })).toBeVisible();
  await expect(roster.getByRole("link")).toHaveCount(0);
  await roster.getByRole("button", { name: `${labels.edit}: ${input.name}` }).click();
  const dialog = page.getByRole("dialog", { name: labels.edit });
  const yes = dialog.getByRole("button", { name: `${input.game}: ${labels.yes}` });
  await expect(yes).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByRole("button", { name: `${input.game}: ${labels.no}` })).toBeDisabled();
  await yes.click();
  await expect(yes).toHaveAttribute("aria-pressed", "true");
});
