import type {
  EventProposalResponse,
  PlannedEventResponse,
  PlannedTableResponse,
} from "@board-game-organizer/schemas";
import {
  type ClientEventProposal,
  eventProposalKeys,
  eventProposalLabel,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { plannedEvent, plannedTable } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventProposalReviewDialog } from "../EventProposalReviewDialog";
import { EventProposalSection } from "../EventProposalSection";

const API = "https://proposal-native-fixtures.test";
const boundary = vi.hoisted(() => ({
  userId: "owner",
  enabled: true,
  push: vi.fn(),
  picker: { open: vi.fn(), dismiss: vi.fn() },
  feedback: { onError: vi.fn(), onSuccess: vi.fn(), onOptimisticUpdate: vi.fn() },
}));
const options = () => ({
  apiUrl: API,
  userId: boundary.userId,
  enabled: boundary.enabled,
  getToken: async () => "fixture-proposal-token",
  feedback: boundary.feedback,
});
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options() }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: boundary.push }) }));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: boundary.picker,
}));
let client: QueryClient;
let rows: ClientEventProposal[];
let readStatus: number;
let writeStatus: number;
let pendingRead: Promise<Response> | undefined;
let pendingWrite: Promise<Response> | undefined;
const reads: URL[] = [];
const writes: { path: string; input: Record<string, unknown> }[] = [];
type Category = "date" | "location" | "game";
function proposal(
  kind: Category = "date",
  patch: Partial<EventProposalResponse> = {},
): EventProposalResponse {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    eventId: plannedEvent.id,
    groupId: null,
    userId: "proposer",
    clientRequestId: "77777777-7777-4777-8777-777777777777",
    payload:
      kind === "date"
        ? { kind, day: "2030-06-04", startTime: "19:30" }
        : kind === "location"
          ? { kind, location: plannedEvent.locations[0] }
          : { kind, tableId: plannedTable.id, gameId: 2 },
    label:
      kind === "game"
        ? "Proposed strategy game"
        : kind === "location"
          ? "Club venue"
          : "June proposal",
    status: "PENDING",
    version: 1,
    submittedEventVersion: 1,
    createdAt: plannedEvent.createdAt,
    updatedAt: plannedEvent.updatedAt,
    authorName: "Proposing Player",
    authorUsername: "@proposer",
    ...(kind === "game"
      ? {
          game: {
            id: 2,
            name: "Proposed strategy game",
            imageUrl: null,
            year: 2024,
            rank: 12,
            average: 7.5,
          },
        }
      : {}),
    ...patch,
  };
}
function allowedEvent(patch: Partial<PlannedEventResponse> = {}): PlannedEventResponse {
  return {
    ...plannedEvent,
    allowParticipantDates: true,
    allowParticipantLocations: true,
    canManage: true,
    managementRole: "admin",
    ...patch,
  };
}
function allowedTable(patch: Partial<PlannedTableResponse> = {}): PlannedTableResponse {
  return { ...plannedTable, allowParticipantGames: true, ...patch };
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
function page(items = rows, nextCursor: string | null = null) {
  return {
    eventId: plannedEvent.id,
    groupId: null,
    eventVersion: 1,
    mode: "review",
    items,
    nextCursor,
  };
}
function pageKey(kind: Category = "date") {
  return eventProposalKeys.page(options(), {
    eventId: plannedEvent.id,
    groupId: null,
    mode: "review",
    kind,
    ...(kind === "game" ? { tableId: plannedTable.id } : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  boundary.userId = "owner";
  boundary.enabled = true;
  rows = [proposal()];
  readStatus = writeStatus = 200;
  pendingRead = pendingWrite = undefined;
  reads.length = writes.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== API) throw new Error(`Unexpected proposal fixture origin: ${url.origin}`);
      if ((init?.method ?? "GET") !== "GET") {
        const body = JSON.parse(String(init?.body));
        writes.push({ path: url.pathname, input: body });
        if (pendingWrite) return pendingWrite;
        if (writeStatus !== 200) return json({ error: "Fixture proposal rejected" }, writeStatus);
        const prior = rows.find((row) => url.pathname.endsWith(row.id));
        if (!prior) throw new Error(`Unexpected proposal write: ${url.pathname}`);
        const saved: EventProposalResponse = {
          ...prior,
          status: body.action === "accept" ? "ACCEPTED" : "REJECTED",
          version: prior.version + 1,
        };
        rows = rows.map((row) => (row.id === saved.id ? saved : row));
        return json({ proposal: saved, event: allowedEvent({ version: 2 }) });
      }
      reads.push(url);
      if (url.pathname !== `/api/events/${plannedEvent.id}/proposals`)
        throw new Error(`Unexpected proposal read: ${url.pathname}`);
      return (
        pendingRead ??
        json(
          readStatus === 200
            ? page(
                url.searchParams.has("cursor")
                  ? [
                      proposal("date", {
                        id: "88888888-8888-4888-8888-888888888888",
                        label: "Next source page",
                        payload: { kind: "date", day: "2030-06-05", startTime: "20:00" },
                      }),
                    ]
                  : rows,
                url.searchParams.has("cursor") ? null : cursor,
              )
            : { error: "Fixture proposals unavailable" },
          readStatus,
        )
      );
    }),
  );
});
let cursor: string | null = null;
afterEach(() => {
  client.clear();
  cursor = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture({
  event = allowedEvent(),
  table,
  kind = "date",
  ...props
}: Partial<ComponentProps<typeof EventProposalSection>>) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <EventProposalSection event={event} table={table} kind={kind} {...props} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function press(name: string) {
  await userEvent.setup().press(await screen.findByRole("button", { name }));
}
function reviewName(row = rows[0]) {
  return `${row.status === "PENDING" ? "Review proposal" : "Proposal details"}: ${eventProposalLabel(row.payload, row.label, "en")}`;
}

it.each(["date", "location", "game"] as const)(
  "renders no %s category UI or remote proposal query when that category is disabled",
  async (kind) => {
    await render(
      <Fixture
        kind={kind}
        event={allowedEvent({ allowParticipantDates: false, allowParticipantLocations: false })}
        table={allowedTable({ allowParticipantGames: false })}
      />,
    );
    expect(screen.queryByTestId(`event-proposal-${rows[0].id}`)).toBeNull();
    expect(screen.queryByText("No proposals")).toBeNull();
    expect(reads).toHaveLength(0);
  },
);

it.each(["date", "location", "game"] as const)(
  "renders and reviews the actual %s proposal without conflating the action with consent",
  async (kind) => {
    rows = [proposal(kind)];
    await render(<Fixture kind={kind} table={allowedTable()} />);
    const trigger = await screen.findByRole("button", { name: reviewName() });
    expect(trigger).toBeVisible();
    expect(trigger).toHaveStyle({ width: 36, height: 36, minWidth: 36, minHeight: 36 });
    expect(trigger).toHaveProp("hitSlop", 4);
    expect(trigger.parent).toHaveStyle({ width: 44, height: 44, justifyContent: "center" });
    expect(
      trigger.queryAll(
        (node) => node.type.startsWith("RNSVG") && Number(node.props.bbWidth) === 16,
      ),
    ).toHaveLength(1);
    await userEvent.setup().press(trigger);
    expect(
      screen.getByText(
        "Accept adds this choice to the available options. Reject discards the pending proposal. The decision applies to every pending proposal for this same choice.",
      ),
    ).toBeVisible();
    expect(screen.getByText("@proposer")).toBeVisible();
    expect(writes).toHaveLength(0);
    await press("Cancel");
    expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
    expect(writes).toHaveLength(0);
  },
);

it.each(["PENDING", "ACCEPTED", "REJECTED"] as const)(
  "preserves distinct %s proposal status and only enables valid decisions",
  async (status) => {
    rows = [proposal("date", { status })];
    await render(<Fixture />);
    await press(reviewName());
    if (status === "PENDING") expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
    else {
      expect(screen.getByText("This proposal has already been reviewed.")).toBeVisible();
      expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    }
    expect(writes).toHaveLength(0);
  },
);

it.each(["accept", "reject"] as const)(
  "submits one explicit %s decision with the captured event/proposal versions and grouped revision",
  async (action) => {
    rows = [proposal("game", { groupRevision: "a".repeat(64) })];
    await render(<Fixture kind="game" table={allowedTable()} />);
    await press(reviewName());
    await press(action === "accept" ? "Accept" : "Reject");
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      path: `/api/events/${plannedEvent.id}/proposals/${rows[0].id}`,
      input: { action, version: 1, eventVersion: 1, groupRevision: "a".repeat(64) },
    });
    await waitFor(() => expect(screen.queryByTestId("confirmation-dialog")).toBeNull());
    if (action === "accept") {
      await waitFor(() => expect(screen.queryByTestId(`event-proposal-${rows[0].id}`)).toBeNull());
    } else {
      expect(await screen.findByText("Rejected")).toBeVisible();
    }
  },
);

it("does not expose moderator decisions to an ordinary participant while keeping its own authorized proposals visible", async () => {
  rows = [proposal("date", { userId: "owner" })];
  await render(
    <Fixture
      event={allowedEvent({ canManage: false, managementRole: null, role: "participant" })}
    />,
  );
  expect(await screen.findByTestId(`event-proposal-${rows[0].id}`)).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: reviewName() })).toBeNull();
  expect(reads[0].searchParams.get("mode")).toBe("mine");
});

it.each(["disabled", "unverified", "accepting", "rejecting"] as const)(
  "retains the real review guard for a %s projection",
  async (guard) => {
    if (guard === "accepting" || guard === "rejecting")
      rows = [{ ...proposal(), clientAction: guard === "accepting" ? "accept" : "reject" }];
    client.setQueryData(pageKey(), page());
    if (guard === "unverified") {
      boundary.enabled = false;
      await client.invalidateQueries({ queryKey: pageKey(), refetchType: "none" });
    }
    await render(<Fixture disabled={guard === "disabled"} />);
    const trigger = await screen.findByRole("button", { name: reviewName() });
    expect(trigger).toBeDisabled();
    await userEvent.setup().press(trigger);
    expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
    expect(writes).toHaveLength(0);
    if (guard === "accepting" || guard === "rejecting")
      expect(
        screen.getByText(guard === "accepting" ? "Accepting proposal" : "Rejecting proposal"),
      ).toBeVisible();
  },
);

it.each(["version", "revoked", "changed-row"] as const)(
  "expires a captured proposal review after %s changes, keeping stale decisions unwritable",
  async (change) => {
    const record = allowedEvent();
    const view = await render(<Fixture event={record} />);
    await press(reviewName());
    if (change === "changed-row")
      await act(() => client.setQueryData(pageKey(), page([proposal("date", { version: 2 })])));
    else
      await view.rerender(
        <Fixture
          event={{
            ...record,
            ...(change === "version" ? { version: 2 } : { canManage: false, managementRole: null }),
          }}
        />,
      );
    if (change === "revoked") expect(screen.queryByTestId("confirmation-dialog")).toBeNull();
    else {
      expect(
        await screen.findByText(
          "This proposal changed or the action is unavailable. Close and review current proposals.",
        ),
      ).toBeVisible();
      expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    }
    expect(writes).toHaveLength(0);
  },
);

it("keeps genuine empty proposals distinct from pending and denied reads", async () => {
  let finish: (value: Response) => void = () => {};
  pendingRead = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  expect(screen.queryByText("No proposals")).toBeNull();
  expect(screen.queryByRole("button", { name: reviewName() })).toBeNull();
  await act(() => finish(json(page([]))));
  expect(await screen.findByText("No proposals")).toBeVisible();
});

it("keeps a denied proposal request observable and retries only after an explicit action", async () => {
  readStatus = 403;
  await render(<Fixture />);
  expect(await screen.findByText("Could not load proposals")).toBeVisible();
  expect(screen.queryByText("No proposals")).toBeNull();
  readStatus = 200;
  await press("Try again");
  expect(await screen.findByRole("button", { name: reviewName() })).toBeVisible();
});

it("paginates the fixed five-row source without expanding every cached page into one parent section", async () => {
  cursor = "next-source-page";
  await render(<Fixture />);
  await screen.findByRole("button", { name: reviewName() });
  expect(screen.getByText("Page 1")).toBeVisible();
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  await press("Next");
  await waitFor(() => expect(screen.getByText("Page 2")).toBeVisible());
  expect(
    await screen.findByTestId("event-proposal-88888888-8888-4888-8888-888888888888"),
  ).toBeOnTheScreen();
  expect(screen.queryByTestId(`event-proposal-${rows[0].id}`)).toBeNull();
  await press("Previous");
  expect(await screen.findByTestId(`event-proposal-${rows[0].id}`)).toBeOnTheScreen();
  expect(screen.getByText("Page 1")).toBeVisible();
});

it.each(["location", "game"] as const)(
  "opens the actual %s proposal route only when current participant capability permits it",
  async (kind) => {
    rows = [];
    await render(
      <Fixture
        kind={kind}
        table={kind === "game" ? allowedTable({ canProposeGames: true }) : undefined}
        event={allowedEvent({
          canManage: false,
          managementRole: null,
          role: "participant",
          canProposeLocations: true,
        })}
      />,
    );
    await press(kind === "game" ? "Choose a game" : "Choose a location");
    expect(boundary.push).toHaveBeenCalledWith({
      pathname: "/event/proposal",
      params: {
        eventId: plannedEvent.id,
        kind,
        ...(kind === "game" ? { tableId: plannedTable.id } : {}),
      },
    });
    expect(writes).toHaveLength(0);
  },
);

it("limits proposal authors to eight initially, deduplicates repeated sources, and reveals more explicitly", async () => {
  const author = (index: number) => ({
    id: `source-${index}`,
    userId: `author-${index}`,
    authorName: `Author ${index}`,
    authorUsername: index === 0 ? null : `@handle-${index}`,
    version: 1,
    status: "PENDING" as const,
  });
  const row = proposal("game", {
    suggestions: [...Array.from({ length: 10 }, (_, index) => author(index)), author(0)],
  });
  const cancel = vi.fn(),
    decision = vi.fn();
  await render(
    <NativeTestProviders>
      <EventProposalReviewDialog row={row} valid onCancel={cancel} onDecision={decision} />
    </NativeTestProviders>,
  );
  expect(screen.getByText("Author 0")).toBeVisible();
  expect(screen.getAllByText("Author 0")).toHaveLength(1);
  expect(screen.getByText("@handle-7")).toBeVisible();
  expect(screen.queryByText("@handle-8")).toBeNull();
  await press("Load more");
  expect(screen.getByText("@handle-9")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  expect(decision).not.toHaveBeenCalled();
  await press("Cancel");
  expect(cancel).toHaveBeenCalledOnce();
});

it("disables repeated review actions during a real in-flight mutation and reconciles its receipt", async () => {
  let finish: (value: Response) => void = () => {};
  pendingWrite = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  await press(reviewName());
  await press("Accept");
  await waitFor(() => expect(writes).toHaveLength(1));
  const trigger = screen.getByRole("button", { name: reviewName() });
  expect(trigger).toBeDisabled();
  expect(screen.getByText("Accepting proposal")).toBeVisible();
  await userEvent.setup().press(trigger);
  expect(writes).toHaveLength(1);
  const saved = { ...rows[0], status: "ACCEPTED" as const, version: 2 };
  rows = [saved];
  pendingWrite = undefined;
  await act(() => finish(json({ proposal: saved, event: allowedEvent({ version: 2 }) })));
  expect(await screen.findByText("Accepted")).toBeVisible();
  expect(screen.queryByText("Accepting proposal")).toBeNull();
});

it("rolls back a known rejected review and exposes the actual mutation failure without fabricating acceptance", async () => {
  writeStatus = 400;
  await render(<Fixture />);
  await press(reviewName());
  await press("Reject");
  await waitFor(() => expect(boundary.feedback.onError).toHaveBeenCalled());
  expect(screen.queryByText("Rejected")).toBeNull();
  expect(screen.getByRole("button", { name: reviewName() })).toBeEnabled();
  expect(writes).toHaveLength(1);
});
