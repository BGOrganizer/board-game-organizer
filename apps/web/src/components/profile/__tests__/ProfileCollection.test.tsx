import { bggCollectionQuery, useBggCollectionFilters } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { ProfileCollection } from "../ProfileCollection";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
const items = [
  {
    id: 1,
    name: "Chess",
    imageUrl: null,
    year: 2020,
    average: 6,
    rank: 2,
    source: "collection" as const,
    userRating: 8.5,
    isExpansion: false,
    wishlist: false,
  },
  {
    id: 2,
    name: "Expansion",
    imageUrl: null,
    year: null,
    average: null,
    rank: null,
    source: "collection" as const,
    userRating: null,
    isExpansion: true,
    wishlist: true,
  },
];
function collectionRow(name: string) {
  const row = screen.getByText(name, { exact: true }).closest("li");
  if (!row) throw new Error(`Missing collection row: ${name}`);
  return row;
}
let failed: boolean, legacy: boolean;
let fetch: ReturnType<typeof vi.fn>;
beforeEach(() => {
  failed = legacy = false;
  fetch = vi.fn(async (url: string) => {
    if (failed) return Response.json({ error: "unavailable" }, { status: 503 });
    const query = new URL(url).searchParams.get("query") ?? "";
    return Response.json({
      snapshot: "snapshot",
      counts: legacy ? null : { withoutExpansions: 1, withExpansions: 2, wishlist: 1 },
      items: items.filter((item) => {
        const params = new URL(url).searchParams,
          types = params.get("types") ?? "all";
        return (
          item.name.toLowerCase().includes(query.toLowerCase()) &&
          types !== "none" &&
          (types !== "games" || !item.isExpansion) &&
          (types !== "expansions" || item.isExpansion) &&
          (params.get("wishlist") !== "true" || item.wishlist) &&
          (!params.get("commonSnapshot") || item.id === 1)
        );
      }),
      nextCursor: null,
    });
  });
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("covers every type combination, toggle direction and common eligibility without duplicating Query data", () => {
  const h = renderHook(
    ({ snapshot }: { snapshot: string | undefined }) => useBggCollectionFilters(snapshot),
    { initialProps: { snapshot: undefined as string | undefined } },
  );
  expect(h.result.current.types).toBe("all");
  act(() => h.result.current.toggle("common"));
  expect(h.result.current.selected).not.toContain("common");
  act(() => h.result.current.toggle("expansions"));
  expect(h.result.current.types).toBe("games");
  act(() => h.result.current.toggle("games"));
  expect(h.result.current.types).toBe("none");
  act(() => h.result.current.toggle("expansions"));
  expect(h.result.current.types).toBe("expansions");
  act(() => h.result.current.toggle("games"));
  expect(h.result.current.types).toBe("all");
  act(() => h.result.current.toggle("wishlist"));
  expect(h.result.current.wishlist).toBe(true);
  act(() => h.result.current.toggle("games"));
  act(() => h.result.current.toggle("expansions"));
  expect(h.result.current.types).toBe("all");
  act(() => h.result.current.toggle("wishlist"));
  expect(h.result.current.wishlist).toBe(false);
  h.rerender({ snapshot: "viewer" });
  act(() => h.result.current.toggle("common"));
  expect(h.result.current.commonSnapshot).toBe("viewer");
  h.rerender({ snapshot: undefined });
  expect(h.result.current.selected).not.toContain("common");
  expect(h.result.current.commonSnapshot).toBeUndefined();
  h.rerender({ snapshot: "new" });
  act(() => h.result.current.toggle("common"));
  expect(h.result.current.commonSnapshot).toBeUndefined();
});
it("keeps search/chips on blur and empty results, clears only text, and combines source filters without changing snapshot totals", async () => {
  renderWithI18n(<ProfileCollection snapshot="snapshot" />);
  await screen.findByText("Chess");
  fireEvent.click(screen.getByRole("button", { name: "Expansions" }));
  await waitFor(() => expect(screen.queryByText("Expansion", { exact: true })).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Wishlist" }));
  await screen.findByText("Expansion");
  const input = screen.getByRole("searchbox", { name: "Filter collection" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "missing" } });
  fireEvent.blur(input);
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(([url]) => new URL(url).searchParams.get("query") === "missing"),
    ).toBe(true),
  );
  await screen.findByText("No games found");
  expect((input as HTMLInputElement).value).toBe("missing");
  expect(screen.getByRole("button", { name: "Wishlist" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect((input as HTMLInputElement).value).toBe("");
  expect(screen.getByRole("button", { name: "Wishlist" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Games" }));
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(
        ([url]) =>
          new URL(url).searchParams.get("types") === "all" &&
          new URL(url).searchParams.get("wishlist") === "true",
      ),
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "Expansions" }));
  await screen.findByText("Expansion");
  expect(screen.getByText("Games including expansions").parentElement?.textContent).toContain("2");
  expect(screen.queryByRole("button", { name: "Load more games" })).toBeNull();
});
it("disables common without viewer synchronization, otherwise pins viewer and subject epochs", async () => {
  const view = renderWithI18n(<ProfileCollection snapshot="snapshot" subjectId="guest" />);
  await screen.findByText("Synchronize your BGG collection to find games in common.");
  expect((screen.getByRole("button", { name: "In common" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  view.rerender(
    <ProfileCollection snapshot="snapshot" subjectId="guest" viewerSnapshot="viewer" />,
  );
  fireEvent.click(screen.getByRole("button", { name: "In common" }));
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(
        ([url]) => new URL(url).searchParams.get("commonSnapshot") === "viewer",
      ),
    ).toBe(true),
  );
  await waitFor(() => expect(screen.queryByText("Expansion", { exact: true })).toBeNull());
  expect(collectionRow("Chess")).toBeTruthy();
});
it("renders global snapshot counters before filter, personal votes/N/A in place of selection controls", async () => {
  renderWithI18n(<ProfileCollection snapshot="snapshot" />);
  await screen.findByText("Chess");
  expect(
    within(collectionRow("Chess"))
      .getByLabelText("Personal BGG rating: 8.5")
      .getAttribute("aria-label"),
  ).toContain("Personal BGG rating: 8.5");
  expect(screen.getByLabelText("Personal BGG rating: 8.5").className).toContain("chip--accent");
  expect(
    within(collectionRow("Expansion"))
      .getByLabelText("Personal BGG rating: N/A")
      .getAttribute("aria-label"),
  ).toContain("Personal BGG rating: N/A");
  expect(screen.getByLabelText("Personal BGG rating: N/A").className).toContain("chip--default");
  expect(screen.queryByRole("button", { name: /Select:/ })).toBeNull();
  expect(screen.getByText("Games without expansions")).not.toBeNull();
  expect(screen.getByText("Games including expansions")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Wishlist" }).getAttribute("aria-pressed")).toBe(
    "false",
  );
  expect(screen.getAllByText("Wishlist")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "Load more games" })).toBeNull();
  expect(within(collectionRow("Chess")).queryByText("8.5")).not.toBeNull();
  fireEvent.change(screen.getByRole("searchbox", { name: "Filter collection" }), {
    target: { value: "c" },
  });
  await waitFor(() =>
    expect(fetch.mock.calls.some(([url]) => new URL(url).searchParams.get("query") === "c")).toBe(
      true,
    ),
  );
  await waitFor(() => expect(screen.queryByText("Expansion", { exact: true })).toBeNull());
  expect(screen.getByText("Games including expansions").parentElement?.textContent).toContain("2");
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  await screen.findByText("Expansion");
  expect(fetch.mock.calls.every(([url]) => String(url).includes("/bgg/collection?"))).toBe(true);
});
it("does not confuse missing legacy totals with zero and requests an explicit new sync", async () => {
  legacy = true;
  renderWithI18n(<ProfileCollection snapshot="snapshot" />);
  await screen.findByText("Synchronize again to include expansions and collection counts.");
  expect(screen.getAllByText("N/A")).toHaveLength(4);
  expect(screen.queryByText("0")).toBeNull();
});
it("keeps empty and network-error paths distinct", async () => {
  renderWithI18n(<ProfileCollection snapshot="snapshot" />);
  await screen.findByText("Chess");
  fireEvent.change(screen.getByRole("searchbox", { name: "Filter collection" }), {
    target: { value: "not-matching" },
  });
  await screen.findByText("No games found");
  failed = true;
  fireEvent.change(screen.getByRole("searchbox", { name: "Filter collection" }), {
    target: { value: "failed" },
  });
  await screen.findByText("Could not load collection", {}, { timeout: 8000 });
  expect(screen.queryByText("No games found")).toBeNull();
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("No games found");
});

it("reveals retained pages on document interaction, resets the entry budget, and isolates a changed snapshot", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const options = {
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
    snapshot: "snapshot",
    query: "",
    types: "all" as const,
  };
  const key = bggCollectionQuery(options).queryKey;
  const first = {
    snapshot: "snapshot",
    counts: { withoutExpansions: 1, withExpansions: 2, wishlist: 1 },
    items: [items[0]],
    nextCursor: "next",
  };
  client.setQueryData(key, {
    pages: [first, { ...first, items: [items[1]], nextCursor: null }],
    pageParams: ["", "next"],
  });
  const mount = (snapshot: string) => (
    <QueryClientProvider client={client}>
      <ProfileCollection snapshot={snapshot} />
    </QueryClientProvider>
  );
  const view = renderWithI18n(mount("snapshot"));
  await screen.findByText("Chess");
  expect(screen.queryByText("Expansion", { exact: true })).toBeNull();
  const list = screen.getByRole("list", { name: "Collection games" });
  expect(list.style.overflowY).toBe("");
  fireEvent.wheel(window);
  await screen.findByText("Expansion");
  expect(fetch).not.toHaveBeenCalled();
  expect(client.getQueryData(key)).toMatchObject({ pages: [first, { items: [items[1]] }] });
  view.rerender(<p>Closed</p>);
  view.rerender(mount("snapshot"));
  await screen.findByText("Chess");
  expect(screen.queryByText("Expansion", { exact: true })).toBeNull();
  const nextKey = bggCollectionQuery({ ...options, snapshot: "new-snapshot" }).queryKey;
  client.setQueryData(nextKey, {
    pages: [
      {
        ...first,
        snapshot: "new-snapshot",
        items: [{ ...items[0], name: "New source game" }],
        nextCursor: null,
      },
    ],
    pageParams: [""],
  });
  view.rerender(mount("new-snapshot"));
  await screen.findByText("New source game");
  expect(screen.queryByText("Chess", { exact: true })).toBeNull();
  expect(screen.queryByText("Expansion", { exact: true })).toBeNull();
  fireEvent.wheel(window);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  expect(fetch).not.toHaveBeenCalled();
});
