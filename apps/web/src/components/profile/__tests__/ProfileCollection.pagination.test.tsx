import type { BggCollectionItem, BggCollectionResponse } from "@board-game-organizer/schemas";
import { bggCollectionQuery } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { ProfileCollection } from "../ProfileCollection";

const API = "https://collection-paging-fixtures.test";
const owner = vi.hoisted(() => ({ userId: "owner", getToken: vi.fn<() => Promise<string>>() }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://collection-paging-fixtures.test",
    userId: owner.userId,
    getToken: owner.getToken,
    enabled: true,
  }),
}));
const counts = { withoutExpansions: 2, withExpansions: 2, wishlist: 0 };
const game = (id: number): BggCollectionItem => ({
  id,
  name: `Collection game ${id}`,
  imageUrl: null,
  year: 2020,
  source: "collection",
  userRating: id === 1 ? 8.5 : null,
  isExpansion: false,
  wishlist: false,
});
const page = (
  items: BggCollectionItem[],
  nextCursor: string | null = null,
  snapshot = "snapshot-one",
): BggCollectionResponse => ({ snapshot, counts, items, nextCursor });
let client: QueryClient;
let status: number;
let pageStatus: number;
let pending: Promise<Response> | undefined;
const reads: URL[] = [];
const query = (snapshot = "snapshot-one", subjectId?: string) =>
  bggCollectionQuery({
    apiUrl: API,
    userId: owner.userId,
    getToken: owner.getToken,
    snapshot,
    subjectId,
    query: "",
    types: "all",
    wishlist: false,
  });
beforeEach(() => {
  vi.clearAllMocks();
  owner.userId = "owner";
  owner.getToken.mockImplementation(async () => `token-for-${owner.userId}`);
  status = pageStatus = 200;
  pending = undefined;
  reads.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      expect(url.origin).toBe(API);
      expect(url.pathname).toBe("/api/bgg/collection");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        `Bearer token-for-${owner.userId}`,
      );
      reads.push(url);
      const next = url.searchParams.has("cursor");
      if (pending && (next || url.searchParams.get("snapshot") === "snapshot-two")) return pending;
      const responseStatus = next ? pageStatus : status;
      return Response.json(
        responseStatus !== 200
          ? { error: "Fixture collection unavailable" }
          : page(
              [game(next ? 2 : 1)],
              next ? null : "next-page",
              url.searchParams.get("snapshot") ?? "",
            ),
        { status: responseStatus },
      );
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});
function mount(snapshot = "snapshot-one", subjectId?: string) {
  return renderWithI18n(
    <QueryClientProvider client={client}>
      <ProfileCollection snapshot={snapshot} subjectId={subjectId} />
    </QueryClientProvider>,
  );
}
async function documentFrame() {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}
async function reachEnd() {
  const list = await screen.findByRole("list", { name: "Collection games" });
  expect(list.style.overflowY).toBe("");
  fireEvent.wheel(window);
  fireEvent.scroll(window);
  await documentFrame();
}

it("reveals retained canonical pages once despite duplicate document scroll events and never refetches them", async () => {
  const key = query().queryKey;
  const cached = {
    pages: [page([game(1)], "next-page"), page([game(2)])],
    pageParams: ["", "next-page"],
  };
  client.setQueryData(key, cached);
  mount();
  expect(await screen.findByText("Collection game 1", { exact: true })).toBeVisible();
  expect(screen.queryByText("Collection game 2", { exact: true })).toBeNull();
  fireEvent.scroll(window);
  await documentFrame();
  expect(screen.queryByText("Collection game 2", { exact: true })).toBeNull();
  fireEvent.wheel(window);
  fireEvent.wheel(window);
  fireEvent.scroll(window);
  await documentFrame();
  expect(await screen.findByText("Collection game 2", { exact: true })).toBeVisible();
  expect(screen.getByText("Collection game 1", { exact: true })).toBeVisible();
  expect(client.getQueryData(key)).toBe(cached);
  expect(reads).toHaveLength(0);
});

it("retains rows and snapshot totals while one real next page is pending and coalesces repeated document scroll events", async () => {
  mount();
  await screen.findByText("Collection game 1", { exact: true });
  let finish: (response: Response) => void = () => {
    throw new Error("Expected pending collection page");
  };
  pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await reachEnd();
  await waitFor(() => expect(reads).toHaveLength(2));
  fireEvent.wheel(window);
  fireEvent.scroll(window);
  fireEvent.scroll(window);
  await documentFrame();
  expect(reads).toHaveLength(2);
  expect(screen.getByText("Collection game 1", { exact: true })).toBeVisible();
  expect(screen.getByText("Games including expansions")).toBeVisible();
  expect(screen.queryByText("No games found")).toBeNull();
  pending = undefined;
  await act(() => finish(Response.json(page([game(2)]))));
  expect(await screen.findByText("Collection game 2", { exact: true })).toBeVisible();
  expect(reads.at(-1)?.searchParams.get("cursor")).toBe("next-page");
  expect(
    client.getQueryData<{ pages: BggCollectionResponse[] }>(query().queryKey)?.pages[0].counts,
  ).toEqual(counts);
});

it("keeps a failed page observable without losing cached rows and resumes paging after deliberate retry", async () => {
  mount();
  await screen.findByText("Collection game 1", { exact: true });
  pageStatus = 400;
  await reachEnd();
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load collection");
  expect(screen.getByText("Collection game 1", { exact: true })).toBeVisible();
  await reachEnd();
  expect(reads).toHaveLength(2);
  pageStatus = 200;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  await reachEnd();
  expect(await screen.findByText("Collection game 2", { exact: true })).toBeVisible();
  expect(reads.map((url) => url.searchParams.get("cursor"))).toEqual([
    null,
    "next-page",
    null,
    "next-page",
  ]);
});

it("resets the visible window for a new account/snapshot without bridging old collection rows", async () => {
  const cached = {
    pages: [page([game(1)], "next-page"), page([game(2)])],
    pageParams: ["", "next-page"],
  };
  const oldKey = query().queryKey;
  client.setQueryData(oldKey, cached);
  const view = mount();
  await reachEnd();
  await screen.findByText("Collection game 2", { exact: true });
  let finish: (response: Response) => void = () => {
    throw new Error("Expected pending new owned snapshot");
  };
  pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  owner.userId = "other-owner";
  view.rerender(
    <QueryClientProvider client={client}>
      <ProfileCollection snapshot="snapshot-two" />
    </QueryClientProvider>,
  );
  expect(screen.queryByText("Collection game 1", { exact: true })).toBeNull();
  expect(screen.queryByText("Collection game 2", { exact: true })).toBeNull();
  expect(screen.queryByText("No games found")).toBeNull();
  await act(() =>
    finish(
      Response.json({
        ...page([game(9)], null, "snapshot-two"),
        counts: { withoutExpansions: 1, withExpansions: 1, wishlist: 0 },
      }),
    ),
  );
  expect(await screen.findByText("Collection game 9", { exact: true })).toBeVisible();
  expect(client.getQueryData(oldKey)).toBe(cached);
  expect(reads.at(-1)?.searchParams.get("snapshot")).toBe("snapshot-two");
});

it("quarantines a denied foreign collection while retaining the unrelated owner's snapshot", async () => {
  const foreignKey = query("snapshot-one", "subject").queryKey;
  const ownKey = query("owner-snapshot").queryKey;
  const own = {
    pages: [
      {
        ...page([game(8)], null, "owner-snapshot"),
        counts: { withoutExpansions: 1, withExpansions: 1, wishlist: 0 },
      },
    ],
    pageParams: [""],
  };
  client.setQueryData(ownKey, own);
  mount("snapshot-one", "subject");
  await screen.findByText("Collection game 1", { exact: true });
  status = 403;
  await act(() => client.invalidateQueries({ queryKey: foreignKey, exact: true }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load collection");
  expect(screen.queryByText("Collection game 1", { exact: true })).toBeNull();
  expect(screen.queryByText("No games found")).toBeNull();
  expect(client.getQueryData(ownKey)).toBe(own);
});
