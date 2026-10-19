import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { plannedEvent } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { Events } from "../Events";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
afterEach(() => vi.unstubAllGlobals());
const render = (props: Parameters<typeof Events>[0] = {}) =>
  renderWithI18n(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Events {...props} />
    </QueryClientProvider>,
  );
it("source-pages canonical group/period/search lists and exposes contextual creation", async () => {
  const fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify({
          items: [{ ...plannedEvent, id: url.includes("cursor=") ? "second" : plannedEvent.id }],
          nextCursor: url.includes("cursor=") ? null : "next",
        }),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  render({ groupId: "group", canCreate: true });
  expect(await screen.findByRole("link", { name: "Open event: Friday games" })).not.toBeNull();
  expect(new URL(fetch.mock.calls[0][0]).searchParams.get("groupId")).toBe("group");
  expect(screen.getByRole("link", { name: "Create event" }).getAttribute("href")).toBe(
    "/events/new?groupId=group",
  );
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() =>
    expect(screen.getAllByRole("link", { name: "Open event: Friday games" })).toHaveLength(2),
  );
  expect(fetch.mock.calls.some(([url]) => new URL(url).searchParams.get("cursor") === "next")).toBe(
    true,
  );
});
it("keeps failure observable and retries without displaying an empty success state", async () => {
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      fail ? new Response("{}", { status: 503 }) : new Response('{"items":[],"nextCursor":null}'),
    ),
  );
  render({ canCreate: false });
  expect(await screen.findByText("Could not load events")).not.toBeNull();
  expect(screen.queryByText("No events found")).toBeNull();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No events found")).not.toBeNull();
  expect(screen.queryByRole("link", { name: "Create event" })).toBeNull();
});
it("requires four search characters, then automatically queries after debounce", async () => {
  const fetch = vi.fn(async (_url: string) => new Response('{"items":[],"nextCursor":null}'));
  vi.stubGlobal("fetch", fetch);
  render();
  await screen.findByText("No events found");
  const search = screen.getByRole("searchbox");
  fireEvent.change(search, { target: { value: "abc" } });
  await new Promise((resolve) => setTimeout(resolve, 350));
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.change(search, { target: { value: "friday" } });
  await waitFor(() =>
    expect(fetch.mock.calls.some(([url]) => String(url).includes("query=friday"))).toBe(true),
  );
  expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
});
