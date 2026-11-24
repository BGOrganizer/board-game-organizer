import type { EventProposalResponse } from "@board-game-organizer/schemas";
import { CommunityApiError, eventRecordKeys } from "@board-game-organizer/shared";
import type { AndroidNativeProps } from "@react-native-community/datetimepicker";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { plannedEvent, plannedTable } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventProposalSection } from "../EventProposalSection";

const boundary = vi.hoisted(() => ({
  push: vi.fn(),
  open: vi.fn<(options: AndroidNativeProps) => void>(),
  dismiss: vi.fn(),
}));
const apiUrl = "https://proposal-native-creation.test";
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl,
    userId: "proposer",
    enabled: true,
    getToken: async () => "proposal-auth-token",
  }),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: boundary.push }) }));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: { open: boundary.open, dismiss: boundary.dismiss },
}));
const event = {
  ...plannedEvent,
  canManage: false,
  managementRole: null,
  allowParticipantDates: true,
  allowParticipantLocations: true,
  canProposeDates: true,
  canProposeLocations: true,
  role: "participant" as const,
};
const table = { ...plannedTable, allowParticipantGames: true, canProposeGames: true };
const proposalPath = `/api/events/${event.id}/proposals`;
let client: QueryClient;
let writeResponse: Promise<Response> | undefined;
let receipts: EventProposalResponse[];
const writes: { input: unknown; authorization: string | null }[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  writes.length = 0;
  writeResponse = undefined;
  receipts = [];
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.origin !== apiUrl || url.pathname !== proposalPath)
        throw new Error(`Unexpected proposal request: ${url}`);
      if (init?.method === "POST") {
        writes.push({
          input: JSON.parse(String(init.body)),
          authorization: new Headers(init.headers).get("authorization"),
        });
        if (!writeResponse) throw new Error("Unexpected submission");
        return writeResponse;
      }
      return Response.json({
        eventId: event.id,
        groupId: event.groupId,
        eventVersion: event.version,
        mode: "mine",
        nextCursor: null,
        items: receipts,
      });
    }),
  );
});

afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});

function Fixture({ kind }: { kind: ComponentProps<typeof EventProposalSection>["kind"] }) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <EventProposalSection
          event={event}
          kind={kind}
          table={kind === "game" ? table : undefined}
        />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}

async function pickDate() {
  await userEvent.setup().press(screen.getByRole("button", { name: "Choose date and time" }));
  for (const pick of [
    { mode: "date", date: new Date("2030-06-05T00:00:00Z") },
    { mode: "time", date: new Date("2030-06-05T18:15:00Z") },
  ]) {
    const picker = boundary.open.mock.lastCall?.[0];
    expect(picker?.mode).toBe(pick.mode);
    await act(() =>
      picker?.onChange?.(
        { type: "set", nativeEvent: { timestamp: pick.date.getTime(), utcOffset: 0 } },
        pick.date,
      ),
    );
  }
}

it("keeps a real in-flight date proposal visible and opens its own recovery draft after rejection", async () => {
  let rejectProposal!: (value: Response) => void;
  writeResponse = new Promise((resolve) => {
    rejectProposal = resolve;
  });
  await render(<Fixture kind="date" />);
  expect(await screen.findByText("No proposals")).toBeVisible();
  await pickDate();
  expect(await screen.findByText("Sending proposal")).toBeVisible();
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toEqual({
    input: {
      eventVersion: event.version,
      clientRequestId: expect.any(String),
      payload: { kind: "date", day: "2030-06-05", startTime: "18:15" },
    },
    authorization: "Bearer proposal-auth-token",
  });
  expect(screen.queryByRole("button", { name: "Review unsent proposal" })).toBeNull();
  const [draft] = client.getMutationCache().getAll();
  await act(() =>
    rejectProposal(Response.json({ error: "Proposal no longer valid" }, { status: 422 })),
  );
  expect(await screen.findByText("Could not send proposal")).toBeVisible();
  await userEvent.setup().press(screen.getByRole("button", { name: "Review unsent proposal" }));
  expect(boundary.push).toHaveBeenCalledExactlyOnceWith({
    pathname: "/event/proposal",
    params: { eventId: event.id, kind: "date", draftId: String(draft.mutationId) },
  });
  expect(writes).toHaveLength(1);
});

it.each([
  ["location", "Choose a location"],
  ["game", "Choose a game"],
] as const)("opens the authorized %s editor in the exact proposal scope", async (kind, label) => {
  await render(<Fixture kind={kind} />);
  expect(await screen.findByText("No proposals")).toBeVisible();
  await userEvent.setup().press(screen.getByRole("button", { name: label }));
  expect(boundary.push).toHaveBeenCalledExactlyOnceWith({
    pathname: "/event/proposal",
    params: { eventId: event.id, kind, ...(kind === "game" ? { tableId: table.id } : {}) },
  });
  expect(writes).toHaveLength(0);
});

it("keeps an uncertain proposal non-retriable and replaces it only after a correlated source read", async () => {
  const clientRequestId = "55555555-5555-4555-8555-555555555555";
  const payload = { kind: "date", day: "2030-06-05", startTime: "18:15" } as const;
  const error = new CommunityApiError(503, "Verification still unavailable");
  client.getMutationCache().build(
    client,
    {
      mutationKey: [
        ...eventRecordKeys.mutation({ apiUrl, userId: "proposer" }, event.id, "propose"),
        "date",
        null,
      ],
    },
    {
      context: { operation: { uncertain: true } },
      data: undefined,
      error,
      failureCount: 1,
      failureReason: error,
      isPaused: false,
      status: "error",
      submittedAt: Date.now(),
      variables: {
        clientRequestId,
        eventVersion: event.version,
        payload,
        clientLabel: "Uncertain date",
      },
    },
  );
  await render(<Fixture kind="date" />);
  expect(await screen.findByText("Checking saved changes")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Review unsent proposal" })).toBeNull();
  expect(writes).toHaveLength(0);
  const id = "66666666-6666-4666-8666-666666666666";
  receipts = [
    {
      id,
      eventId: event.id,
      groupId: event.groupId,
      version: 1,
      submittedEventVersion: event.version,
      authorName: "Owner",
      userId: "proposer",
      clientRequestId,
      status: "PENDING",
      payload,
      label: "Verified date",
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    },
  ];
  await act(async () => {
    await client.refetchQueries();
  });
  expect(await screen.findByTestId(`event-proposal-${id}`)).toBeOnTheScreen();
  expect(screen.queryByText("Checking saved changes")).toBeNull();
  expect(screen.queryByRole("button", { name: "Review unsent proposal" })).toBeNull();
  expect(writes).toHaveLength(0);
});
