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
  name: "Username",
  email: "Email",
  addGuest: it ? "Aggiungi un ospite" : "Add a guest",
  add: it ? "Aggiungi" : "Add",
  participants: it ? "Partecipanti" : "Participants",
  details: it ? "Dettagli" : "Details",
  place: it ? "Posto libero" : "Free place",
  invite: it ? "Invita giocatori" : "Invite players",
  guest: it ? "Ospite" : "Guest",
  help: it ? "Come funzionano gli ospiti" : "About guests",
  games: it ? "Giochi" : "Games",
  vote: it ? "Vota" : "Vote",
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
  await page.getByRole("button", { name: labels.place }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: labels.invite }).click();
  await page.getByRole("button", { name: labels.help }).click();
  await expect(page.getByRole("dialog", { name: labels.guest })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: labels.addGuest, exact: true }).click();
  const guestForm = page.getByRole("dialog", { name: labels.addGuest });
  const save = guestForm.getByRole("button", { name: labels.add, exact: true });
  await expect(save).toBeDisabled();
  await guestForm.getByRole("textbox", { name: labels.name }).fill(input.name);
  const email = guestForm.getByRole("textbox", { name: labels.email });
  await email.fill("invalid-email");
  await email.press("Tab");
  await expect(save).toBeDisabled();
  await email.fill("guest@example.test");
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === `/api${path}/guests`,
  );
  await save.click();
  const result = await created;
  expect(result.ok()).toBeTruthy();
  const receipt = await result.json();
  expect(JSON.stringify(receipt)).not.toContain("guest@example.test");
  expect(receipt).toMatchObject({
    kind: "GUEST",
    guestName: input.name,
    status: "ACCEPTED",
    gameVotes: {},
  });
  await expect(page).toHaveURL(new RegExp(`${path}(?:\\?.*)?$`));
  await expect(page.getByRole("tab", { name: labels.participants, selected: true })).toBeVisible();
  const roster = page.getByRole("listitem").filter({
    has: page.getByRole("button", { name: `${labels.edit}: ${input.name}` }),
  });
  await expect(
    roster.getByText(`@${input.name.trim().replace(/^@+/, "")}`, { exact: true }),
  ).toBeVisible();
  await expect(roster.getByText(labels.guest, { exact: true })).toBeVisible();
  await roster.getByRole("button", { name: labels.guest, exact: true }).click();
  await expect(page.getByRole("dialog", { name: labels.guest })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(roster.getByRole("link")).toHaveCount(0);
  await roster.getByRole("button", { name: `${labels.edit}: ${input.name}` }).click();
  const dialog = page.getByRole("dialog", { name: labels.edit });
  await dialog.getByRole("tab", { name: labels.games }).click();
  const yes = dialog.getByRole("button", { name: `${input.game}: ${labels.yes}` });
  await expect(yes).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.getByRole("button", { name: `${input.game}: ${labels.no}` })).toBeDisabled();
  const optionSubmit = dialog.getByRole("button", { name: labels.vote, exact: true });
  await expect(optionSubmit).toBeDisabled();
  let voteRequests = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/guests\/[^/]+\/votes$/.test(new URL(request.url()).pathname)
    )
      voteRequests++;
  });
  await yes.click();
  await expect(yes).toHaveAttribute("aria-pressed", "true");
  expect(voteRequests).toBe(0);
  await optionSubmit.click();
  await expect(dialog).toBeHidden();
  expect(voteRequests).toBe(1);
  await page.getByRole("tab", { name: labels.details, exact: true }).click();
  const title = it ? "Voti" : "Votes";
  const tally = page.getByRole("list", { name: `${title}: ${input.game}` });
  await expect(tally.getByRole("button", { name: `${input.name} (${labels.yes})` })).toHaveCount(0);
  await tally
    .getByRole("button", {
      name: `${input.game}: ${it ? "Mostra voti" : "Show votes"} — ${labels.yes}`,
      exact: true,
    })
    .click();
  const breakdown = page.getByRole("dialog", { name: title, exact: true });
  await expect(
    breakdown.getByRole("tab", { name: labels.yes, exact: true, selected: true }),
  ).toBeVisible();
  await expect(
    breakdown
      .getByRole("tabpanel", { name: labels.yes, exact: true })
      .getByText(input.name, { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(breakdown).toBeHidden();
  await page.goto(`${path}/invite`);
  await expect(page.getByText(input.name, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: labels.addGuest, exact: true }).click();
  await expect(guestForm.getByRole("textbox", { name: labels.name })).toHaveValue("");
  await expect(guestForm.getByRole("textbox", { name: labels.email })).toHaveValue("");
});
