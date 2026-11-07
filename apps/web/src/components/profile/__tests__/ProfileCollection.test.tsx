import { useBggCollectionFilters } from "@board-game-organizer/shared";
import { act, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { ProfileCollection } from "../ProfileCollection";

// Row/query unit checks only. Real Virtualizer measurements belong to browser acceptance.
vi.mock("@heroui/react/rac", async (original) => ({
  ...(await original<typeof import("@heroui/react/rac")>()),
  Virtualizer: ({ children }: { children: ReactNode }) => children,
}));
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
    source: "collection",
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
    source: "collection",
    userRating: null,
    isExpansion: true,
    wishlist: true,
  },
];
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
afterEach(() => vi.unstubAllGlobals());
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
  await screen.findByRole("option", { name: /Chess/ });
  fireEvent.click(screen.getByRole("button", { name: "Expansions" }));
  await waitFor(() => expect(screen.queryByRole("option", { name: /Expansion/ })).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Wishlist" }));
  await screen.findByRole("option", { name: /Expansion/ });
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
  await screen.findByRole("option", { name: /Expansion/ });
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
  await waitFor(() => expect(screen.queryByRole("option", { name: /Expansion/ })).toBeNull());
  expect(screen.getByRole("option", { name: /Chess/ })).toBeTruthy();
});
it("renders global snapshot counters before filter, personal votes/N/A in place of selection controls", async () => {
  renderWithI18n(<ProfileCollection snapshot="snapshot" />);
  await screen.findByRole("option", { name: /Chess/ });
  expect(
    within(screen.getByRole("option", { name: /Chess/ })).getByText("8.5").parentElement
      ?.textContent,
  ).toContain("Personal BGG rating: 8.5");
  expect(
    within(screen.getByRole("option", { name: /Expansion/ })).getByText("N/A").parentElement
      ?.textContent,
  ).toContain("Personal BGG rating: N/A");
  expect(screen.queryByRole("button", { name: /Select:/ })).toBeNull();
  expect(screen.getByText("Games without expansions")).not.toBeNull();
  expect(screen.getByText("Games including expansions")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Wishlist" }).getAttribute("aria-pressed")).toBe(
    "false",
  );
  expect(screen.getAllByText("Wishlist")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "Load more games" })).toBeNull();
  expect(within(screen.getByRole("option", { name: /Chess/ })).queryByText("8.5")).not.toBeNull();
  fireEvent.change(screen.getByRole("searchbox", { name: "Filter collection" }), {
    target: { value: "c" },
  });
  await waitFor(() =>
    expect(fetch.mock.calls.some(([url]) => new URL(url).searchParams.get("query") === "c")).toBe(
      true,
    ),
  );
  await waitFor(() => expect(screen.queryByRole("option", { name: /Expansion/ })).toBeNull());
  expect(screen.getByText("Games including expansions").parentElement?.textContent).toContain("2");
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  await screen.findByRole("option", { name: /Expansion/ });
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
  await screen.findByRole("option", { name: /Chess/ });
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
