import type {
  EventProposalResponse,
  EventProposalsResponse,
  PlannedEventResponse,
  PlannedTableResponse,
} from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  eventProposalKeys,
  eventRecordKeys,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { enterDateTime } from "@/test-fixtures/dateTime";
import { optionId, plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventProposalSection } from "../EventProposalSection";

const boundary = vi.hoisted(() => ({ push: vi.fn(), getToken: vi.fn() }));
const options = {
  apiUrl: "https://proposal-navigation-fixtures.test",
  userId: "actor",
  getToken: boundary.getToken,
  enabled: true,
};
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: boundary.push }) }));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
const event: PlannedEventResponse = {
  ...plannedEvent,
  adminUserId: "creator",
  groupId: optionId,
  groupType: "PRIVATE",
  role: "participant",
  canManage: false,
  allowParticipantDates: true,
  allowParticipantLocations: true,
  canProposeDates: true,
  canProposeLocations: true,
  myRegistrations: [seat("actor")],
  canVote: true,
};
const table: PlannedTableResponse = {
  ...plannedTable,
  groupId: optionId,
  groupType: "PRIVATE",
  allowParticipantGames: true,
  canProposeGames: true,
  myRegistration: seat("actor"),
  myPosition: "SEATED",
};
const proposal: EventProposalResponse = {
  id: optionId,
  eventId: event.id,
  groupId: optionId,
  userId: "actor",
  authorName: "Proposing player",
  clientRequestId: optionId,
  label: "New date",
  payload: { kind: "date", day: "2030-06-04", startTime: "20:00" },
  status: "PENDING",
  version: 1,
  submittedEventVersion: 1,
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
};
const page = (
  items: EventProposalResponse[] = [],
  nextCursor: string | null = null,
): EventProposalsResponse => ({
  eventId: event.id,
  groupId: optionId,
  eventVersion: event.version,
  mode: "mine",
  items,
  nextCursor,
});
let client: QueryClient;
let readStatus: number;
let pendingPage: Promise<Response> | undefined;
const reads: URL[] = [];
const writes: { path: string; body: unknown }[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  boundary.getToken.mockResolvedValue("fresh-proposal-token");
  readStatus = 200;
  pendingPage = undefined;
  reads.length = writes.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(eventRecordKeys.detail(options, event.id), event);
  client.setQueryData(eventRecordKeys.table(options, event.id, table.id), table);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(options.apiUrl);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-proposal-token");
      if (url.pathname !== `/api/events/${event.id}/proposals`)
        throw new Error(`Unexpected proposal fixture: ${url.pathname}`);
      if (init?.method === "POST") {
        writes.push({ path: url.pathname, body: JSON.parse(String(init.body)) });
        return Response.json({ error: "Fixture proposal validation failure" }, { status: 400 });
      }
      reads.push(url);
      if (pendingPage && url.searchParams.has("cursor")) return pendingPage;
      return Response.json(
        readStatus === 200 ? page() : { error: "Fixture proposals unavailable" },
        { status: readStatus },
      );
    }),
  );
});
afterEach(() => {
  clearSessionQueryCache(client);
  vi.unstubAllGlobals();
});
function mount(kind: "date" | "location" | "game") {
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <EventProposalSection event={event} kind={kind} table={kind === "game" ? table : undefined} />
    </QueryClientProvider>,
  );
}

it.each([
  ["location", "Choose a location"],
  ["game", "Choose a game"],
] as const)(
  "opens the real %s proposal editor from its row without submitting anything",
  async (kind, name) => {
    mount(kind);
    await screen.findByText("No proposals");
    fireEvent.click(screen.getByRole("button", { name }));
    expect(boundary.push).toHaveBeenCalledOnce();
    const destination = new URL(String(boundary.push.mock.calls[0][0]), "https://web.fixture.test");
    expect(destination.pathname).toBe(`/events/${event.id}/proposals/new`);
    expect(destination.searchParams.get("kind")).toBe(kind);
    expect(destination.searchParams.get("tableId")).toBe(kind === "game" ? table.id : null);
    expect(destination.searchParams.has("draftId")).toBe(false);
    expect(writes).toEqual([]);
  },
);

it("navigates fixed source proposal pages without replacing a pending read with an empty result", async () => {
  const key = eventProposalKeys.page(options, {
    eventId: event.id,
    groupId: optionId,
    kind: "date",
    mode: "mine",
  });
  client.setQueryData(key, page([proposal], "next-page"));
  mount("date");
  expect(screen.getByText("Page 1")).toBeVisible();
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  let finish: (response: Response) => void = () => {
    throw new Error("Expected pending proposal page");
  };
  pendingPage = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.queryByText("No proposals")).toBeNull();
  await act(() =>
    finish(
      Response.json(
        page([
          {
            ...proposal,
            id: "later-proposal",
            payload: { kind: "date", day: "2030-06-08", startTime: "21:00" },
          },
        ]),
      ),
    ),
  );
  expect(await screen.findByText("Page 2")).toBeVisible();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(reads.at(-1)?.searchParams.get("cursor")).toBe("next-page");
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  expect(screen.getByText("Page 1")).toBeVisible();
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  expect(reads).toHaveLength(1);
  expect(writes).toEqual([]);
});

it("retries a real proposal queue failure through the section action", async () => {
  readStatus = 503;
  mount("date");
  const alert = await screen.findByRole("alert", {}, { timeout: 2500 });
  expect(within(alert).getByText("Could not load proposals")).toBeVisible();
  expect(screen.queryByText("No proposals")).toBeNull();
  readStatus = 200;
  fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No proposals")).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(writes).toEqual([]);
});

it("retains a rejected inline proposal as an editable local intent and routes to its exact unsent draft", async () => {
  mount("date");
  await screen.findByText("No proposals");
  enterDateTime(screen.getByRole("group", { name: "Date and time" }), "2030-06-05T21:00");
  fireEvent.click(screen.getByRole("button", { name: "Add date" }));
  expect(await screen.findByText("Could not send proposal")).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].body).toMatchObject({
    eventVersion: event.version,
    payload: { kind: "date", day: "2030-06-05", startTime: "21:00" },
  });
  expect(boundary.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Review unsent proposal" }));
  await waitFor(() => expect(boundary.push).toHaveBeenCalledOnce());
  const destination = new URL(String(boundary.push.mock.calls[0][0]), "https://web.fixture.test");
  expect(destination.pathname).toBe(`/events/${event.id}/proposals/new`);
  expect(destination.searchParams.get("kind")).toBe("date");
  const intent = client
    .getMutationCache()
    .getAll()
    .find((mutation) => mutation.state.status === "error");
  if (!intent) throw new Error("Expected the actual failed proposal mutation");
  expect(destination.searchParams.get("draftId")).toBe(String(intent.mutationId));
  expect(destination.searchParams.has("tableId")).toBe(false);
  expect(writes).toHaveLength(1);
});
