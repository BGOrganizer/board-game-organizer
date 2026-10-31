import {
  type CreatePlannedEventInput,
  createPlannedEventSchema,
  type PlannedEventResponse,
} from "@board-game-organizer/schemas";
import {
  type CommunityApiOptions,
  clearSessionQueryCache,
  eventRecordKeys,
  eventRecordQuery,
  eventRecordsQuery,
  useEventRecords,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { plannedEvent } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventCard } from "../EventCard";
import { EventWizard } from "../EventWizard";

const m = vi.hoisted(() => ({
  options: {} as CommunityApiOptions,
  replace: vi.fn(),
  back: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: m.replace, back: m.back }) }));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => m.options }));
vi.mock("@/components/locations/SearchLocationPage", () => ({
  SearchLocationPage: ({ onSelect }: { onSelect: (location: object) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSelect({
          id: "33333333-3333-4333-8333-333333333333",
          name: "Club venue",
          address: "Via Roma 1",
          latitude: 41.9,
          longitude: 12.5,
          timeZone: "Europe/Rome",
        })
      }
    >
      Choose verified location
    </button>
  ),
}));
vi.mock("@/components/games/SearchGamePage", () => ({
  SearchGamePage: ({ onSelect }: { onSelect: (game: object) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSelect({ id: 1, name: "Chess", year: null, imageUrl: null, maxPlayMinutes: 60 })
      }
    >
      Choose catalog game
    </button>
  ),
}));
const clients: QueryClient[] = [];
const filters = { periods: ["future"] as const };
const realId = "66666666-6666-4666-8666-666666666666";
function PreviewList() {
  const list = useEventRecords(m.options, filters);
  return (
    <>
      {list.items.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          checking={list.isFetching}
          onVerify={() => void list.refetch({ cancelRefetch: false })}
        />
      ))}
    </>
  );
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  const options = {
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: vi.fn(async () => "fresh"),
    feedback: { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
  };
  m.options = options;
  const renderWizard = (draftId?: string) =>
    renderWithI18n(
      <QueryClientProvider client={client}>
        <EventWizard draftId={draftId} />
      </QueryClientProvider>,
    );
  const list = renderWithI18n(
    <QueryClientProvider client={client}>
      <PreviewList />
    </QueryClientProvider>,
  );
  return { client, options, list, renderWizard };
}
function review(ui: ReturnType<typeof renderWithI18n>, name: string) {
  fireEvent.change(ui.getByRole("textbox", { name: "Event name" }), { target: { value: name } });
  fireEvent.change(ui.getByLabelText("Date and time"), { target: { value: "2030-06-03T20:00" } });
  fireEvent.click(ui.getByRole("button", { name: "Add date" }));
  fireEvent.click(ui.getByRole("button", { name: "Choose a verified address" }));
  fireEvent.click(ui.getByRole("button", { name: "Choose verified location" }));
  fireEvent.click(ui.getByRole("button", { name: "Next" }));
  fireEvent.click(ui.getByRole("button", { name: "Add table" }));
  fireEvent.change(ui.getByRole("textbox", { name: "Table name" }), {
    target: { value: "First table" },
  });
  fireEvent.click(ui.getByRole("button", { name: "Choose a game" }));
  fireEvent.click(ui.getByRole("button", { name: "Choose catalog game" }));
  fireEvent.click(ui.getByRole("button", { name: "Next" }));
}
function record(input: CreatePlannedEventInput): PlannedEventResponse {
  const { tables, ...fields } = input;
  return { ...plannedEvent, ...fields, id: realId, tableCount: tables.length };
}
function page(rows: PlannedEventResponse[]) {
  return {
    items: rows.map(
      ({ myVotes: _votes, voteCounts: _counts, agreement: _agreement, ...row }) => row,
    ),
    nextCursor: null,
  };
}
afterEach(async () => {
  cleanup();
  await act(async () => {
    for (const client of clients.splice(0)) clearSessionQueryCache(client);
  });
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("leaves the actual wizard, toasts and paints a draft before POST; a GET-before-ACK deduplicates and an old receipt cannot roll back a newer detail", async () => {
  let saved: PlannedEventResponse | undefined;
  let releasePost!: (response: Response) => void;
  let postSnapshot!: PlannedEventResponse;
  let body!: CreatePlannedEventInput;
  let holdLists = false;
  const listReads: Array<(response: Response) => void> = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      body = createPlannedEventSchema.parse(JSON.parse(String(init.body)));
      saved = record(body);
      postSnapshot = saved;
      return new Promise<Response>((resolve) => {
        releasePost = resolve;
      });
    }
    if (url.includes("/events?")) {
      if (holdLists) return new Promise<Response>((resolve) => listReads.push(resolve));
      return Response.json(page(saved ? [saved] : []));
    }
    if (url.endsWith(`/events/${realId}`)) return Response.json(saved);
    return Response.json({ items: [], nextCursor: null });
  });
  vi.stubGlobal("fetch", fetch);
  const { client, options, list, renderWizard } = setup();
  const wizard = renderWizard();
  review(wizard, "Nonblocking event");
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  fireEvent.click(wizard.getByRole("button", { name: "Create event" }));
  expect(m.replace).toHaveBeenCalledWith("/events");
  await waitFor(() => expect(releasePost).toBeDefined());
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledWith("create_event");
  expect(options.feedback.onSuccess).not.toHaveBeenCalled();
  const provisional = list.getByRole("link", { name: "Saving: Nonblocking event" });
  expect(provisional.getAttribute("aria-disabled")).toBe("true");
  expect(provisional.getAttribute("href")).toBe("/events");
  expect(provisional.textContent).toContain("Players: 0");
  const sent = JSON.parse(
    String(fetch.mock.calls.find(([, init]) => init?.method === "POST")?.[1]?.body),
  );
  expect(sent).toEqual(body);
  expect(body.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(sent).not.toHaveProperty("clientDraft");
  expect(sent).not.toHaveProperty("clientGroup");
  expect(sent).not.toHaveProperty("clientInitialGroupId");
  expect(sent).not.toHaveProperty("playerIds");
  await act(async () => {
    await client.fetchInfiniteQuery({ ...eventRecordsQuery(options, filters), staleTime: 0 });
  });
  await list.findByRole("link", { name: "Open event: Nonblocking event" });
  expect(list.getAllByRole("link")).toHaveLength(1);
  saved = { ...postSnapshot, name: "Edited elsewhere", version: 2 };
  await act(async () => {
    await client.fetchQuery(eventRecordQuery(options, realId));
  });
  holdLists = true;
  await act(async () => releasePost(Response.json(postSnapshot)));
  await waitFor(() => expect(listReads).toHaveLength(1));
  expect(client.getQueryData(eventRecordKeys.detail(options, realId))).toMatchObject({
    name: "Edited elsewhere",
    version: 2,
  });
  holdLists = false;
  await act(async () => listReads[0](Response.json(page([saved as PlannedEventResponse]))));
  await list.findByRole("link", { name: "Open event: Edited elsewhere" });
  expect(list.getAllByRole("link")).toHaveLength(1);
  expect(client.getQueryData(eventRecordKeys.detail(options, realId))).toMatchObject({
    version: 2,
    myVotes: plannedEvent.myVotes,
  });
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledTimes(1);
  expect(options.feedback.onError).not.toHaveBeenCalled();
});

it("retains a rejected raw draft after immediate navigation, restores all editor inputs and retries only on another explicit submit", async () => {
  let saved: PlannedEventResponse | undefined;
  const posts: Array<{ body: CreatePlannedEventInput; resolve: (response: Response) => void }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = createPlannedEventSchema.parse(JSON.parse(String(init.body)));
        return new Promise<Response>((resolve) => posts.push({ body, resolve }));
      }
      return Response.json(
        url.includes("/events?") ? page(saved ? [saved] : []) : { items: [], nextCursor: null },
      );
    }),
  );
  const { client, options, list, renderWizard } = setup();
  const wizard = renderWizard();
  review(wizard, "Recoverable event");
  fireEvent.click(wizard.getByRole("button", { name: "Create event" }));
  expect(m.replace).toHaveBeenCalledWith("/events");
  await waitFor(() => expect(posts).toHaveLength(1));
  await list.findByRole("link", { name: "Saving: Recoverable event" });
  await act(async () =>
    posts[0].resolve(Response.json({ error: "CHOOSE_VERIFIED_ADDRESS" }, { status: 400 })),
  );
  const rejected = await list.findByRole("link", {
    name: "Not saved. Edit draft: Recoverable event",
  });
  expect(options.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "create_event");
  const raw = client.getQueryData<{ pages: Array<{ items: PlannedEventResponse[] }> }>(
    eventRecordKeys.list(options, filters),
  );
  expect(raw?.pages.flatMap((item) => item.items)).toEqual([]);
  const draftId = new URL(rejected.getAttribute("href") ?? "", "https://web.test").searchParams.get(
    "draftId",
  );
  expect(draftId).not.toBeNull();
  wizard.unmount();
  const recovered = renderWizard(draftId ?? undefined);
  expect((recovered.getByRole("textbox", { name: "Event name" }) as HTMLInputElement).value).toBe(
    "Recoverable event",
  );
  expect(recovered.getByRole("button", { name: "Remove location: Club venue" })).toBeDefined();
  expect(recovered.getByRole("button", { name: "Remove date: 2030-06-03 20:00" })).toBeDefined();
  fireEvent.click(recovered.getByRole("button", { name: "Next" }));
  expect((recovered.getByRole("textbox", { name: "Table name" }) as HTMLInputElement).value).toBe(
    "First table",
  );
  expect(recovered.getByRole("button", { name: "Remove game: Chess" })).toBeDefined();
  fireEvent.click(recovered.getByRole("button", { name: "Next" }));
  expect(posts).toHaveLength(1);
  fireEvent.click(recovered.getByRole("button", { name: "Create event" }));
  expect(m.replace).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(posts).toHaveLength(2));
  expect(posts[1].body.clientRequestId).toBe(posts[0].body.clientRequestId);
  expect(list.getAllByRole("link")).toHaveLength(1);
  saved = record(posts[1].body);
  await act(async () => posts[1].resolve(Response.json(saved)));
  await list.findByRole("link", { name: "Open event: Recoverable event" });
  expect(list.queryByRole("link", { name: /Not saved/ })).toBeNull();
  expect(posts).toHaveLength(2);
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledTimes(2);
  expect(options.feedback.onSuccess).not.toHaveBeenCalled();
});

it("allows a second real wizard while the first canonical list read is pending, without cancelling that read or losing the independent creation", async () => {
  let saved: PlannedEventResponse | undefined;
  let holdMetadata = false;
  let releaseMetadata!: (response: Response) => void;
  let metadataSignal: AbortSignal | null | undefined;
  const posts: Array<{ body: CreatePlannedEventInput; resolve: (response: Response) => void }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = createPlannedEventSchema.parse(JSON.parse(String(init.body)));
        return new Promise<Response>((resolve) => posts.push({ body, resolve }));
      }
      if (url.includes("/events?")) {
        if (holdMetadata) {
          metadataSignal = init?.signal;
          return new Promise<Response>((resolve) => {
            releaseMetadata = resolve;
          });
        }
        return Response.json(page(saved ? [saved] : []));
      }
      return Response.json({ items: [], nextCursor: null });
    }),
  );
  const { options, list, renderWizard } = setup();
  const first = renderWizard();
  review(first, "First queued event");
  fireEvent.click(first.getByRole("button", { name: "Create event" }));
  await waitFor(() => expect(posts).toHaveLength(1));
  first.unmount();
  saved = record(posts[0].body);
  holdMetadata = true;
  await act(async () => posts[0].resolve(Response.json(saved)));
  await waitFor(() => expect(releaseMetadata).toBeDefined());
  const second = renderWizard();
  review(second, "Second queued event");
  fireEvent.click(second.getByRole("button", { name: "Create event" }));
  expect(m.replace).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledTimes(2));
  expect(posts).toHaveLength(1);
  expect(metadataSignal?.aborted).toBe(false);
  expect(list.getByRole("link", { name: "Saving: First queued event" })).toBeDefined();
  expect(list.getByRole("link", { name: "Saving: Second queued event" })).toBeDefined();
  holdMetadata = false;
  await act(async () => releaseMetadata(Response.json(page([saved as PlannedEventResponse]))));
  await waitFor(() => expect(posts).toHaveLength(2));
  expect(metadataSignal?.aborted).toBe(false);
  expect(posts[0].body.clientRequestId).not.toBe(posts[1].body.clientRequestId);
  await act(async () =>
    posts[1].resolve(Response.json({ error: "CHOOSE_VERIFIED_ADDRESS" }, { status: 400 })),
  );
  await list.findByRole("link", { name: "Not saved. Edit draft: Second queued event" });
  expect(
    list.getByRole("link", { name: "Open event: First queued event" }).getAttribute("href"),
  ).toBe(`/events/${realId}`);
  expect(list.getAllByRole("link")).toHaveLength(2);
  expect(options.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "create_event");
});

it("keeps an unknown creation read-only, never retries the write and verifies a late commit through the real list query", async () => {
  let saved: PlannedEventResponse | undefined;
  let body!: CreatePlannedEventInput;
  let release!: (response: Response) => void;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      body = createPlannedEventSchema.parse(JSON.parse(String(init.body)));
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    }
    return Response.json(
      url.includes("/events?") ? page(saved ? [saved] : []) : { items: [], nextCursor: null },
    );
  });
  vi.stubGlobal("fetch", fetch);
  const { options, list, renderWizard } = setup();
  const wizard = renderWizard();
  review(wizard, "Unverified event");
  fireEvent.click(wizard.getByRole("button", { name: "Create event" }));
  expect(m.replace).toHaveBeenCalledWith("/events");
  await waitFor(() => expect(release).toBeDefined());
  await act(async () => release(Response.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 503 })));
  const check = await list.findByRole("button", { name: "Check saved changes" });
  await waitFor(() => expect((check as HTMLButtonElement).disabled).toBe(false));
  const unknown = list.getByRole("link", { name: "Checking saved changes: Unverified event" });
  expect(unknown.getAttribute("aria-disabled")).toBe("true");
  expect(unknown.getAttribute("href")).toBe("/events");
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  expect(options.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "verify_saved_changes");
  saved = record(body);
  fireEvent.click(check);
  await list.findByRole("link", { name: "Open event: Unverified event" });
  expect(list.container.querySelectorAll("a")).toHaveLength(1);
  expect(list.queryByRole("button", { name: "Check saved changes" })).toBeNull();
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledTimes(1);
});
