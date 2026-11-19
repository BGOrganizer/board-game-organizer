import type {
  EventProposalResponse,
  EventProposalsResponse,
  PlannedEventResponse,
  ReviewEventProposalInput,
  SubmitEventProposalInput,
} from "@board-game-organizer/schemas";
import {
  reviewEventProposalSchema,
  submitEventProposalSchema,
} from "@board-game-organizer/schemas";
import {
  clearSessionQueryCache,
  eventProposalKeys,
  eventRecordKeys,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { enterDateTime, readDateTime } from "@/test-fixtures/dateTime";
import { optionId, plannedEvent, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventProposalSection } from "../EventProposalSection";

const boundary = vi.hoisted(() => {
  const previousApi = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "https://proposal-section-decisions.test";
  return { previousApi, push: vi.fn(), getToken: vi.fn<() => Promise<string | null>>() };
});
afterAll(() => {
  if (boundary.previousApi === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = boundary.previousApi;
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: boundary.push }) }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    userId: "owner",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
const options = {
  apiUrl: "https://proposal-section-decisions.test",
  userId: "owner",
  enabled: true,
  getToken: boundary.getToken,
};
const manager: PlannedEventResponse = {
  ...plannedEvent,
  groupId: optionId,
  groupType: "PRIVATE",
  adminUserId: "creator",
  role: "admin",
  managementRole: "moderator",
  canManage: true,
  allowParticipantDates: true,
  canProposeDates: false,
};
const participant: PlannedEventResponse = {
  ...manager,
  role: "participant",
  managementRole: null,
  canManage: false,
  canProposeDates: true,
  myRegistrations: [seat("owner")],
};
const proposal: EventProposalResponse = {
  id: "44444444-4444-4444-8444-444444444444",
  eventId: manager.id,
  groupId: optionId,
  userId: "author",
  authorName: "Proposing Player",
  authorUsername: "proposer",
  clientRequestId: "55555555-5555-4555-8555-555555555555",
  label: "Second date",
  payload: { kind: "date", day: "2030-06-04", startTime: "19:00" },
  status: "PENDING",
  version: 1,
  submittedEventVersion: 1,
  groupRevision: "a".repeat(64),
  createdAt: manager.createdAt,
  updatedAt: manager.updatedAt,
};
let client: QueryClient;
let serverEvent: PlannedEventResponse;
let serverRows: EventProposalResponse[];
let reviewStatus: number;
let pendingReview: Promise<Response> | undefined, pendingSubmit: Promise<Response> | undefined;
const reviews: ReviewEventProposalInput[] = [],
  submissions: SubmitEventProposalInput[] = [];
function page(mode: "review" | "mine" = "review"): EventProposalsResponse {
  return {
    eventId: serverEvent.id,
    groupId: optionId,
    eventVersion: serverEvent.version,
    mode,
    items: mode === "review" ? serverRows : serverRows.filter((row) => row.userId === "owner"),
    nextCursor: null,
  };
}
function key(mode: "review" | "mine" = "review") {
  return eventProposalKeys.page(options, {
    eventId: manager.id,
    groupId: optionId,
    kind: "date",
    mode,
  });
}
function reviewReceipt(input: ReviewEventProposalInput) {
  const saved: EventProposalResponse = {
    ...proposal,
    version: input.version + 1,
    status: input.action === "accept" ? "ACCEPTED" : "REJECTED",
  };
  serverRows = serverRows.map((row) => (row.id === saved.id ? saved : row));
  serverEvent = { ...serverEvent, version: input.eventVersion + 1 };
  if (input.action === "accept" && saved.payload.kind === "date")
    serverEvent = {
      ...serverEvent,
      dates: [
        ...serverEvent.dates,
        { id: saved.id, day: saved.payload.day, startTime: saved.payload.startTime },
      ],
    };
  return Response.json({ proposal: saved, event: serverEvent });
}
function submitReceipt(input: SubmitEventProposalInput) {
  const saved: EventProposalResponse = {
    ...proposal,
    id: "66666666-6666-4666-8666-666666666666",
    userId: "owner",
    authorName: "Current Player",
    clientRequestId: input.clientRequestId,
    payload: input.payload,
    label: "New participant date",
    submittedEventVersion: input.eventVersion,
  };
  serverRows = [...serverRows, saved];
  return Response.json(saved, { status: 201 });
}
beforeEach(() => {
  vi.clearAllMocks();
  boundary.getToken.mockResolvedValue("fresh-section-token");
  reviews.length = submissions.length = 0;
  serverEvent = manager;
  serverRows = [proposal];
  reviewStatus = 200;
  pendingReview = pendingSubmit = undefined;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(options.apiUrl);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-section-token");
      if (
        url.pathname === `/api/events/${manager.id}/proposals/${proposal.id}` &&
        init?.method === "POST"
      ) {
        const decision = reviewEventProposalSchema.parse(JSON.parse(String(init.body)));
        reviews.push(decision);
        return (
          pendingReview ??
          (reviewStatus === 200
            ? reviewReceipt(decision)
            : Response.json({ error: "Review refused" }, { status: reviewStatus }))
        );
      }
      if (url.pathname === `/api/events/${manager.id}/proposals` && init?.method === "POST") {
        const submission = submitEventProposalSchema.parse(JSON.parse(String(init.body)));
        submissions.push(submission);
        return pendingSubmit ?? submitReceipt(submission);
      }
      if (url.pathname === `/api/events/${manager.id}/proposals`)
        return Response.json(page(url.searchParams.get("mode") === "mine" ? "mine" : "review"));
      if (url.pathname === `/api/events/${manager.id}`) return Response.json(serverEvent);
      throw new Error(`Unexpected proposal section request: ${url.pathname}`);
    }),
  );
});
afterEach(async () => {
  cleanup();
  await act(async () => clearSessionQueryCache(client));
  vi.unstubAllGlobals();
});
function Fixture({
  event = serverEvent,
  disabled = false,
}: {
  event?: PlannedEventResponse;
  disabled?: boolean;
}) {
  return (
    <QueryClientProvider client={client}>
      <EventProposalSection event={event} kind="date" disabled={disabled} />
    </QueryClientProvider>
  );
}
function mount(event = manager, disabled = false) {
  serverEvent = event;
  client.setQueryData(eventRecordKeys.detail(options, event.id), event);
  client.setQueryData(
    key(event.canManage ? "review" : "mine"),
    page(event.canManage ? "review" : "mine"),
  );
  return renderWithI18n(<Fixture event={event} disabled={disabled} />);
}
async function openReview() {
  const action = await screen.findByRole("button", { name: /^Review proposal:/ });
  await waitFor(() => expect(action).toBeEnabled());
  fireEvent.click(action);
  return screen.findByRole("dialog", { name: "Review proposal" });
}

it.each(["ACCEPTED", "REJECTED"] as const)(
  "shows a %s proposal as immutable details with no decision actions",
  async (status) => {
    serverRows = [{ ...proposal, status, version: 2 }];
    mount();
    expect(screen.getByText(status === "ACCEPTED" ? "Accepted" : "Rejected")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /^Proposal details:/ }));
    const dialog = await screen.findByRole("dialog", { name: "Proposal details" });
    expect(within(dialog).getByText("This proposal has already been reviewed.")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: "Accept" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Reject" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(reviews).toHaveLength(0);
  },
);

it("reveals grouped proposal authors in bounded batches inside the actual review dialog", async () => {
  serverRows = [
    {
      ...proposal,
      suggestions: Array.from({ length: 9 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        userId: `author-${index + 1}`,
        authorName: `Author ${index + 1}`,
        authorUsername: `author-${index + 1}`,
        version: 1,
        status: "PENDING",
      })),
    },
  ];
  mount();
  const dialog = await openReview();
  expect(within(dialog).getByText("@author-8")).toBeVisible();
  expect(within(dialog).queryByText("@author-9")).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "Load more" }));
  expect(within(dialog).getByText("@author-9")).toBeVisible();
  expect(within(dialog).queryByRole("button", { name: "Load more" })).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(reviews).toHaveLength(0);
});

it("marks a pending rejection without changing canonical status and commits only a matching receipt", async () => {
  let finish: (response: Response) => void = () => {};
  pendingReview = new Promise((resolve) => {
    finish = resolve;
  });
  mount();
  const dialog = await openReview();
  const reject = within(dialog).getByRole("button", { name: "Reject" });
  fireEvent.click(reject);
  fireEvent.click(reject);
  expect(await screen.findByText("Rejecting proposal")).toBeVisible();
  expect(reviews).toHaveLength(1);
  expect(client.getQueryData<EventProposalsResponse>(key())?.items[0].status).toBe("PENDING");
  expect(reviews[0]).toEqual({
    action: "reject",
    eventVersion: 1,
    version: 1,
    groupRevision: proposal.groupRevision,
  });
  pendingReview = undefined;
  await act(async () => finish(reviewReceipt(reviews[0])));
  expect(await screen.findByText("Rejected")).toBeVisible();
  expect(screen.queryByText("Rejecting proposal")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    client.getQueryData<PlannedEventResponse>(eventRecordKeys.detail(options, manager.id))?.dates,
  ).toEqual(manager.dates);
});

it("rolls back a refused decision and allows explicit fresh review without silently retrying the write", async () => {
  reviewStatus = 400;
  mount();
  let dialog = await openReview();
  fireEvent.click(within(dialog).getByRole("button", { name: "Reject" }));
  await waitFor(() =>
    expect(
      client
        .getMutationCache()
        .getAll()
        .some((mutation) => mutation.state.status === "error"),
    ).toBe(true),
  );
  expect(reviews).toHaveLength(1);
  expect(screen.queryByText("Rejecting proposal")).toBeNull();
  expect(client.getQueryData<EventProposalsResponse>(key())?.items[0].status).toBe("PENDING");
  reviewStatus = 200;
  dialog = await openReview();
  fireEvent.click(within(dialog).getByRole("button", { name: "Accept" }));
  expect(await screen.findByText("Accepted")).toBeVisible();
  expect(reviews).toHaveLength(2);
  expect(reviews.map((input) => input.action)).toEqual(["reject", "accept"]);
});

it("invalidates a captured decision after an authoritative row revision and requires closing before reviewing current data", async () => {
  mount();
  const dialog = await openReview();
  serverRows = [{ ...proposal, version: 2, groupRevision: "b".repeat(64) }];
  await act(async () => client.setQueryData(key(), page()));
  expect(
    await within(dialog).findByText(
      "This proposal changed or the action is unavailable. Close and review current proposals.",
    ),
  ).toBeVisible();
  expect(within(dialog).queryByRole("button", { name: "Accept" })).toBeNull();
  expect(within(dialog).queryByRole("button", { name: "Reject" })).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(reviews).toHaveLength(0);
});

it("refuses a captured decision after the event version changes even when its proposal is unchanged", async () => {
  const view = mount();
  await openReview();
  serverEvent = { ...manager, version: 2 };
  await act(async () => {
    client.setQueryData(key(), page());
    client.setQueryData(eventRecordKeys.detail(options, manager.id), serverEvent);
  });
  view.rerender(<Fixture event={serverEvent} />);
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByText(
      "This proposal changed or the action is unavailable. Close and review current proposals.",
    ),
  ).toBeVisible();
  expect(within(dialog).queryByRole("button", { name: "Accept" })).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(reviews).toHaveLength(0);
});

it("closes a private manager decision when authority is revoked and switches to the user's own proposal scope", async () => {
  const view = mount();
  await openReview();
  serverEvent = participant;
  client.setQueryData(key("mine"), page("mine"));
  view.rerender(<Fixture event={participant} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: /^Review proposal:/ })).toBeNull();
  expect(await screen.findByText("No proposals")).toBeVisible();
  expect(screen.getByRole("button", { name: "Add date" })).toBeDisabled();
  expect(reviews).toHaveLength(0);
});

it("keeps inline sending as local intent, coalesces repeated taps and clears it only after an authoritative creation receipt", async () => {
  let finish: (response: Response) => void = () => {};
  pendingSubmit = new Promise((resolve) => {
    finish = resolve;
  });
  serverRows = [];
  mount(participant);
  const input = screen.getByRole("group", { name: "Date and time" });
  enterDateTime(input, "2030-06-05T21:00");
  const add = screen.getByRole("button", { name: "Add date" });
  fireEvent.click(add);
  fireEvent.click(add);
  expect(await screen.findByText("Sending proposal")).toBeVisible();
  expect(submissions).toHaveLength(1);
  expect(client.getQueryData<EventProposalsResponse>(key("mine"))?.items).toEqual([]);
  expect(boundary.push).not.toHaveBeenCalled();
  pendingSubmit = undefined;
  await act(async () => finish(submitReceipt(submissions[0])));
  await waitFor(() => expect(screen.queryByText("Sending proposal")).toBeNull());
  expect(client.getQueryData<EventProposalsResponse>(key("mine"))?.items).toHaveLength(1);
  expect(readDateTime(await screen.findByRole("group", { name: "Date and time" }))).toBe("");
});

it("resets the inline date draft on a fresh event revision and keeps cached manager controls disabled during parent work", () => {
  serverRows = [];
  const view = mount(participant);
  enterDateTime(screen.getByRole("group", { name: "Date and time" }), "2030-06-05T21:00");
  view.rerender(<Fixture event={{ ...participant, version: 2 }} />);
  expect(readDateTime(screen.getByRole("group", { name: "Date and time" }))).toBe("");
  expect(screen.getByRole("button", { name: "Add date" })).toBeDisabled();
  serverRows = [proposal];
  client.setQueryData(key(), page());
  view.rerender(<Fixture event={manager} disabled />);
  expect(screen.getByRole("button", { name: /^Review proposal:/ })).toBeDisabled();
  expect(reviews).toHaveLength(0);
  expect(submissions).toHaveLength(0);
});
