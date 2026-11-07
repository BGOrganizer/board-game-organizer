import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupModeration } from "../GroupModeration";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "moderator",
    getToken: async () => "fresh",
  }),
}));
afterEach(() => vi.unstubAllGlobals());
const pending: GroupRecordResponse = {
  ...groupRecord,
  type: "PUBLIC",
  name: "Pending club",
  proposal: { name: "Pending club" },
  reviewStatus: "PENDING",
  role: "none",
  canViewEvents: false,
  eventCount: null,
  location: {
    id: groupRecord.id,
    name: "Club venue",
    address: "Via Roma 1, Roma, Italia",
    latitude: 41.9,
    longitude: 12.5,
  },
};
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = renderWithI18n(
    <QueryClientProvider client={client}>
      <GroupModeration />
    </QueryClientProvider>,
  );
  return { client, ...view };
}
const page = (items: GroupRecordResponse[], nextCursor: string | null = null) =>
  new Response(JSON.stringify({ items, nextCursor }));

it("uses Group cards with metadata and review destinations, source paging and automatic search", async () => {
  const second = { ...pending, id: "22222222-2222-4222-8222-222222222222", name: "Second club" };
  const fetcher = vi.fn(async (url: string) => {
    const query = new URL(url).searchParams;
    if (query.get("query")) return page([second]);
    return query.get("cursor") ? page([second]) : page([pending], "next-review");
  });
  vi.stubGlobal("fetch", fetcher);
  mount();
  const card = await screen.findByRole("link", { name: "Open group: Pending club" });
  expect(card.getAttribute("href")).toBe(`/moderation/${pending.id}`);
  expect(card.textContent).toContain("Public");
  expect(card.textContent).toContain("Via Roma");
  expect(screen.queryByRole("button", { name: pending.name })).toBeNull();
  expect(screen.queryByRole("link", { name: "Create group" })).toBeNull();
  expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("scope")).toBe("moderation");
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByRole("link", { name: "Open group: Second club" })).not.toBeNull();
  expect(screen.getByRole("link", { name: "Open group: Pending club" })).not.toBeNull();
  expect(
    fetcher.mock.calls.some(([url]) => new URL(url).searchParams.get("cursor") === "next-review"),
  ).toBe(true);
  fireEvent.change(screen.getByPlaceholderText("Search groups"), { target: { value: "Sec" } });
  await new Promise((resolve) => setTimeout(resolve, 350));
  expect(fetcher.mock.calls.some(([url]) => new URL(url).searchParams.has("query"))).toBe(false);
  fireEvent.change(screen.getByPlaceholderText("Search groups"), { target: { value: "Second" } });
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([url]) => new URL(url).searchParams.get("query") === "Second"),
    ).toBe(true),
  );
  await waitFor(() =>
    expect(screen.queryByRole("link", { name: "Open group: Pending club" })).toBeNull(),
  );
});

it("keeps initial loading distinct from an empty queue", async () => {
  let finish: (value: Response) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const { container } = mount();
  expect(container.querySelectorAll(".h-24")).toHaveLength(3);
  expect(screen.queryByText("No pending reviews")).toBeNull();
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  await act(async () => finish(page([])));
  expect(await screen.findByText("No pending reviews")).not.toBeNull();
  expect(container.querySelectorAll(".h-24")).toHaveLength(0);
});

it("keeps queue failures observable and retries without claiming an empty success", async () => {
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => (fail ? new Response("{}", { status: 503 }) : page([]))),
  );
  mount();
  expect(await screen.findByRole("alert")).not.toBeNull();
  expect(screen.queryByText("No pending reviews")).toBeNull();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No pending reviews")).not.toBeNull();
});

it.each([403, 503])(
  "handles cached proposals safely after a %s revalidation failure",
  async (status) => {
    let fail = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (fail ? new Response("{}", { status }) : page([pending]))),
    );
    const { client } = mount();
    expect(await screen.findByRole("link", { name: "Open group: Pending club" })).not.toBeNull();
    fail = true;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["groups"] });
    });
    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(Boolean(screen.queryByRole("link", { name: "Open group: Pending club" }))).toBe(
      status !== 403,
    );
    expect(screen.queryByText("No pending reviews")).toBeNull();
  },
);

it("keeps loaded cards during next-page loading and permits retry after page failure", async () => {
  let finish: (value: Response) => void = () => {};
  let retry = false;
  const fetcher = vi.fn(async (url: string) => {
    if (!new URL(url).searchParams.get("cursor")) return page([pending], "next-review");
    if (retry) return page([]);
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const { container } = mount();
  await screen.findByRole("link", { name: "Open group: Pending club" });
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(container.querySelectorAll(".h-24")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Open group: Pending club" })).not.toBeNull();
  await act(async () => finish(new Response("{}", { status: 503 })));
  expect(await screen.findByRole("alert")).not.toBeNull();
  retry = true;
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Load more" })).toBeNull());
  expect(screen.getByRole("link", { name: "Open group: Pending club" })).not.toBeNull();
});
