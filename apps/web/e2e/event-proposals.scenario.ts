import type {
  EventProposalsResponse,
  PlannedEventResponse,
  PlannedTableResponse,
  ReviewEventProposalResponse,
} from "@board-game-organizer/schemas";
import { withProtectionBypass } from "@board-game-organizer/shared";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
import { completeMobileNumberIfNeeded } from "./mobile-number";

function required(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} required for real owned proposal acceptance`);
  return value;
}
if (required("EVENT_PROPOSAL_FIXTURE_ACK") !== "owned-disposable-event-proposals")
  throw new Error(
    "Owned disposable Development fixture required; real writes may remain after failure. No provisioning/reset runs.",
  );
const locale = required("EVENT_PROPOSAL_LOCALE"),
  api = new URL(required("EVENT_PROPOSAL_API_URL"));
const input = JSON.parse(required("EVENT_PROPOSAL_INPUT")) as {
  eventId: string;
  groupId: string;
  tableId: string;
  mode: "submit-game" | "accept" | "reject";
  gameId: number;
  gameName: string;
  gameQuery?: string;
  proposerName?: string;
  proposalId?: string;
  proposalOffset: number;
};
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
if (
  !["en", "it"].includes(locale) ||
  ![input.eventId, input.groupId, input.tableId].every((id) => uuid.test(id)) ||
  !["submit-game", "accept", "reject"].includes(input.mode) ||
  !Number.isSafeInteger(input.gameId) ||
  input.gameId < 1 ||
  !input.gameName ||
  input.gameName.length > 120 ||
  !Number.isInteger(input.proposalOffset) ||
  input.proposalOffset < 0 ||
  input.proposalOffset > 24 ||
  (input.mode === "submit-game"
    ? !input.gameQuery || input.gameQuery.trim().length < 4
    : !input.proposalId || !uuid.test(input.proposalId) || !input.proposerName)
)
  throw new Error(
    "Valid private fixture, base game and explicit source-paged proposal action required",
  );
for (const url of [api, new URL(required("PLAYWRIGHT_BASE_URL"))])
  if (!["localhost", "127.0.0.1"].includes(url.hostname) && !url.hostname.endsWith(".vercel.app"))
    throw new Error("Local/Preview only, never Production");
if (
  process.env.CLERK_SECRET_KEY?.startsWith("sk_live_") ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_")
)
  throw new Error("Development Clerk only");
const it = locale === "it",
  labels = {
    own: it ? "Le tue proposte" : "Your proposals",
    review: it ? "Proposte dei partecipanti" : "Participant proposals",
    add: it ? "Aggiungi proposta" : "Add proposal",
    choose: it ? "Scegli un gioco" : "Choose a game",
    search: it ? "Cerca giochi da tavolo" : "Search board games",
    select: it ? "Seleziona" : "Select",
    cancel: it ? "Annulla" : "Cancel",
    send: it ? "Invia proposta" : "Send proposal",
    next: it ? "Avanti" : "Next",
    page: it ? "Pagina" : "Page",
    pending: it ? "In attesa" : "Pending",
    action:
      input.mode === "accept"
        ? it
          ? "Accetta proposta"
          : "Accept proposal"
        : it
          ? "Rifiuta proposta"
          : "Reject proposal",
    result:
      input.mode === "accept" ? (it ? "Accettato" : "Accepted") : it ? "Rifiutata" : "Rejected",
  };
async function read<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(
    async (url) => {
      const token = await (
        window as unknown as { Clerk?: { session?: { getToken(): Promise<string | null> } } }
      ).Clerk?.session?.getToken();
      if (!token) throw new Error("Authenticated owned fixture required");
      const result = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!result.ok) throw new Error(`Fixture read failed: ${result.status}`);
      return result.json();
    },
    withProtectionBypass(
      `${api.href.replace(/\/$/, "")}/api/${path}`,
      process.env.VERCEL_PROTECTION_BYPASS,
    ),
  );
}
test("real private own-Table proposal or current-manager decision; cancel writes nothing", async ({
  page,
}) => {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: required("E2E_EMAIL") });
  await page.goto("/");
  await completeMobileNumberIfNeeded(page);
  const event = await read<PlannedEventResponse>(page, `events/${input.eventId}`),
    table = await read<PlannedTableResponse>(
      page,
      `events/${input.eventId}/tables/${input.tableId}`,
    );
  if (
    event.groupId !== input.groupId ||
    event.groupType !== "PRIVATE" ||
    event.status !== "PLANNING" ||
    table.eventId !== input.eventId ||
    table.games.some((g) => g.gameId === input.gameId)
  )
    throw new Error("Private planning Event with an unselected base-game candidate required");
  const base = `events/${input.eventId}/proposals?kind=game&tableId=${input.tableId}`;
  const writes: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (
      u.host === api.host &&
      u.pathname.startsWith(`/api/events/${input.eventId}/proposals`) &&
      r.method() !== "GET" &&
      r.method() !== "OPTIONS"
    )
      writes.push(r.method() + " " + u.pathname);
  });
  await page.goto(`/events/${input.eventId}/tables/${input.tableId}`);
  if (input.mode === "submit-game") {
    if (
      event.canManage ||
      table.myRegistration?.status !== "ACCEPTED" ||
      table.myPosition !== "SEATED" ||
      !table.canProposeGames
    )
      throw new Error(
        "Ordinary genuinely seated actor and enabled own-Table game proposals required",
      );
    const before = await read<EventProposalsResponse>(page, base + "&mode=mine&limit=5");
    if (before.items.length || before.nextCursor)
      throw new Error("Empty own queue required for disposable submit fixture");
    const region = page.getByRole("region", { name: labels.own, exact: true });
    const choose = async () => {
      await page.getByRole("button", { name: labels.choose, exact: true }).click();
      await page.getByPlaceholder(labels.search, { exact: true }).fill(input.gameQuery!);
      await page
        .getByRole("button", { name: `${labels.select}: ${input.gameName}`, exact: true })
        .click();
    };
    await region.getByRole("button", { name: labels.add, exact: true }).click();
    await choose();
    await page.getByRole("button", { name: labels.cancel, exact: true }).click();
    expect(writes).toEqual([]);
    expect((await read<EventProposalsResponse>(page, base + "&mode=mine&limit=5")).items).toEqual(
      [],
    );
    await region.getByRole("button", { name: labels.add, exact: true }).click();
    await choose();
    expect(writes).toEqual([]);
    const posted = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === `/api/events/${input.eventId}/proposals` &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: labels.send, exact: true }).click();
    const response = await posted;
    expect(response.status()).toBe(201);
    const created = (await response.json()) as EventProposalsResponse["items"][number];
    expect(created.payload).toEqual({ kind: "game", tableId: input.tableId, gameId: input.gameId });
    expect(created.status).toBe("PENDING");
    await page.goto(`/events/${input.eventId}/tables/${input.tableId}`);
    await expect(page.getByTestId(`event-proposal-${created.id}`).getByRole("status")).toHaveText(
      labels.pending,
    );
    expect(
      (await read<PlannedTableResponse>(page, `events/${input.eventId}/tables/${input.tableId}`))
        .games,
    ).toEqual(table.games);
    expect(writes).toHaveLength(1);
  } else {
    if (!event.canManage)
      throw new Error("Current manager required, historical authorship is insufficient");
    const candidates = await read<EventProposalsResponse>(page, base + "&mode=review&limit=25"),
      target = candidates.items[input.proposalOffset];
    if (
      target?.id !== input.proposalId ||
      target.status !== "PENDING" ||
      target.authorName !== input.proposerName ||
      target.label !== input.gameName
    )
      throw new Error("Declared pending target at exact source offset required");
    const region = page.getByRole("region", { name: labels.review, exact: true });
    for (let n = 0; n < Math.floor(input.proposalOffset / 5); n++) {
      await region.getByRole("button", { name: labels.next, exact: true }).click();
      await expect(region.getByText(`${labels.page} ${n + 2}`, { exact: true })).toBeVisible();
    }
    const action = region.getByRole("button", {
      name: `${labels.action}: ${input.proposerName} — ${input.gameName}`,
      exact: true,
    });
    await action.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: labels.cancel, exact: true })
      .click();
    expect(writes).toEqual([]);
    await action.click();
    const posted = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname ===
          `/api/events/${input.eventId}/proposals/${input.proposalId}` &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: labels.action, exact: true })
      .click();
    expect((await posted).status()).toBe(200);
    await expect(
      page.getByTestId(`event-proposal-${input.proposalId}`).getByRole("status"),
    ).toHaveText(labels.result);
    const receipt = await read<ReviewEventProposalResponse>(
      page,
      `events/${input.eventId}/proposals/${input.proposalId}`,
    );
    expect(receipt.proposal.status).toBe(input.mode === "accept" ? "ACCEPTED" : "REJECTED");
    const after = await read<PlannedTableResponse>(
      page,
      `events/${input.eventId}/tables/${input.tableId}`,
    );
    expect(after.games.some((g) => g.gameId === input.gameId)).toBe(input.mode === "accept");
    expect(after.myRegistration?.gameVotes).toEqual(table.myRegistration?.gameVotes);
    expect(writes).toHaveLength(1);
  }
});
