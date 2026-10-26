import { eventRecordKeys, useEventJoinForm } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eventId, optionId, plannedEvent, seat, tableId } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventJoinSheet } from "../EventJoinSheet";

const token = vi.hoisted(() => vi.fn(async () => "fresh"));
const options = { apiUrl: "https://api.test", userId: "owner", getToken: token };
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({ apiUrl: "https://api.test", userId: "owner", getToken: token }),
}));
let event = { ...plannedEvent, groupType: "PRIVATE" as const },
  failed = false,
  loadStatus = 200;
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  failed = false;
  loadStatus = 200;
  token.mockClear();
  event = { ...plannedEvent, groupType: "PRIVATE" };
  fetcher = vi.fn(async (_url: string, init: RequestInit) =>
    init?.method === "POST"
      ? new Response(JSON.stringify(failed ? {} : seat("owner")), { status: failed ? 503 : 201 })
      : new Response(JSON.stringify(event), { status: loadStatus }),
  );
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
function mount() {
  const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
    close = vi.fn();
  renderWithI18n(
    <QueryClientProvider client={client}>
      <EventJoinSheet eventId={eventId} tableId={tableId} onClose={close} />
    </QueryClientProvider>,
  );
  return { client, close };
}
const posts = () => fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
it("requires both tabs and explicit usable date/location choices before one atomic join", async () => {
  const { close } = mount();
  const confirm = screen.getByRole("button", { name: "Join table" }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.click(await screen.findByRole("button", { name: "2030-06-03 20:00: No" }));
  expect(confirm.disabled).toBe(true);
  expect(posts()).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "2030-06-03 20:00: If needed" }));
  fireEvent.click(screen.getByRole("tab", { name: "Locations" }));
  fireEvent.click(await screen.findByRole("button", { name: "Club venue: Yes" }));
  await waitFor(() => expect(confirm.disabled).toBe(false));
  expect(screen.queryByRole("button", { name: /Unknown/ })).toBeNull();
  fireEvent.click(confirm);
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(posts()).toHaveLength(1);
  expect(JSON.parse(posts()[0][1].body as string)).toEqual({
    availability: {
      version: 1,
      dateVotes: { [optionId]: "IF_NEEDED" },
      locationVotes: { [optionId]: "YES" },
    },
  });
  expect(token.mock.calls.length).toBeGreaterThanOrEqual(2);
});
it("cancels before writing and exposes load failures with retry", async () => {
  loadStatus = 503;
  const { close } = mount();
  await screen.findByRole("alert");
  expect((screen.getByRole("button", { name: "Join table" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  loadStatus = 200;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("button", { name: "2030-06-03 20:00: Yes" });
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(posts()).toHaveLength(0);
});
it("retains editable preferences after a join error and retries without saving partial votes", async () => {
  event = {
    ...event,
    myVotes: { dateVotes: { [optionId]: "YES" }, locationVotes: { [optionId]: "IF_NEEDED" } },
  };
  failed = true;
  const { close } = mount();
  const confirm = screen.getByRole("button", { name: "Join table" }) as HTMLButtonElement;
  await waitFor(() => expect(confirm.disabled).toBe(false));
  fireEvent.click(confirm);
  expect(await screen.findByText("Could not join table")).not.toBeNull();
  expect(close).not.toHaveBeenCalled();
  failed = false;
  await waitFor(() => expect(confirm.disabled).toBe(false));
  fireEvent.click(confirm);
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(posts()).toHaveLength(2);
  expect(fetcher.mock.calls.every(([url]) => !String(url).includes("/votes"))).toBe(true);
});
it("seeds only explicit votes, ignores UNKNOWN edits and trims removed options on fresh version", async () => {
  event = {
    ...event,
    myVotes: { dateVotes: { [optionId]: "UNKNOWN" }, locationVotes: { [optionId]: "YES" } },
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    close = vi.fn();
  const { result } = renderHook(() => useEventJoinForm(options, eventId, tableId, close), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.event).toBeDefined());
  await act(async () => {
    await result.current.submit();
    result.current.choose("date", optionId, "UNKNOWN");
  });
  expect(posts()).toHaveLength(0);
  expect(result.current.canSubmit).toBe(false);
  act(() => result.current.choose("date", optionId, "YES"));
  await waitFor(() => expect(result.current.canSubmit).toBe(true));
  const next = "44444444-4444-4444-8444-444444444444";
  event = { ...event, version: 2, dates: [{ id: next, day: "2030-06-04" }] };
  await act(async () => {
    await client.invalidateQueries({ queryKey: eventRecordKeys.detail(options, eventId) });
  });
  await waitFor(() => expect(result.current.event?.version).toBe(2));
  expect(result.current.canSubmit).toBe(false);
  expect(result.current.votes.dateVotes).toEqual({});
  act(() => result.current.choose("date", next, "IF_NEEDED"));
  await waitFor(() => expect(result.current.canSubmit).toBe(true));
  await act(async () => {
    await result.current.submit();
  });
  expect(JSON.parse(posts()[0][1].body as string).availability).toMatchObject({
    version: 2,
    dateVotes: { [next]: "IF_NEEDED" },
  });
});
it("hides denied cached choices and never submits nonplanning/nonprivate data", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    close = vi.fn();
  event = { ...event, myVotes: undefined };
  const { result } = renderHook(() => useEventJoinForm(options, eventId, tableId, close), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.event).toBeDefined());
  act(() => {
    result.current.choose("date", optionId, "YES");
    result.current.choose("location", optionId, "YES");
  });
  await waitFor(() => expect(result.current.canSubmit).toBe(true));
  loadStatus = 403;
  await act(async () => {
    await client.invalidateQueries({ queryKey: eventRecordKeys.detail(options, eventId) });
  });
  await waitFor(() => expect(result.current.event).toBeUndefined());
  expect(result.current.canSubmit).toBe(false);
  loadStatus = 200;
  event = { ...event, status: "CONFIRMED" } as typeof event;
  await act(async () => {
    await result.current.q.refetch();
  });
  expect(result.current.canSubmit).toBe(false);
  event = { ...event, status: "PLANNING", groupType: "PUBLIC" } as never;
  await act(async () => {
    await result.current.q.refetch();
  });
  expect(result.current.canSubmit).toBe(false);
  expect(posts()).toHaveLength(0);
});
