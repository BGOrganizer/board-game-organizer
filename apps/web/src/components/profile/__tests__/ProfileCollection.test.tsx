import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
      items: items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())),
      nextCursor: null,
    });
  });
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => vi.unstubAllGlobals());
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
  expect(screen.getByText("Wishlist")).not.toBeNull();
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
