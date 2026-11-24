// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CatalogResults, supportsCatalogResult } from "./CatalogResults";

const operation = "list_bgg_collection";
const chess = { id: 1, name: "Chess", imageUrl: null, year: 1475 };
const root = { id: 2, name: "Root", imageUrl: null, year: 2018 };
const i18n = setupI18n({ locale: "en" });
const openLink = vi.fn<App["openLink"]>();
const callServerTool = vi.fn<App["callServerTool"]>();
const app = { callServerTool, openLink } as unknown as App;
const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });

function show(tool: string, data: unknown, input?: unknown) {
  return render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <CatalogResults operation={tool} data={data} input={input} app={app} />
      </QueryClientProvider>
    </I18nProvider>,
  );
}

function page(items: unknown[], nextCursor?: string | null) {
  return { content: [], structuredContent: { operation, data: { items, nextCursor } } };
}

beforeEach(() => {
  callServerTool.mockReset();
  openLink.mockReset();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    })),
  );
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

it("renders one game from the detail receipt and passes BGG attribution to the host", async () => {
  openLink.mockResolvedValueOnce({ isError: true }).mockResolvedValueOnce({});
  show("get_bgg_games", chess);
  expect(screen.getByRole("heading", { name: "Games" })).toBeVisible();
  expect(screen.getByText(chess.name)).toBeVisible();
  expect(screen.queryByRole("button", { name: chess.name })).toBeNull();
  const link = screen.getByRole("link", { name: /Powered by BGG/ });
  fireEvent.click(link);
  expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  fireEvent.click(link);
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(openLink).toHaveBeenCalledTimes(2);
  expect(openLink).toHaveBeenLastCalledWith({ url: "https://boardgamegeek.com" });
  expect(callServerTool).not.toHaveBeenCalled();
  expect(supportsCatalogResult("list_bgg_game_picker")).toBe(true);
  expect(supportsCatalogResult("list_events")).toBe(false);
});

it("keeps loaded games visible on paging failure, retries the same query and merges refreshed rows", async () => {
  const input = { params: { userId: "owner" }, query: { snapshot: "current", limit: 1 } };
  const later = Promise.withResolvers<Awaited<ReturnType<App["callServerTool"]>>>();
  callServerTool.mockReturnValueOnce(later.promise);
  callServerTool.mockResolvedValueOnce(page([{ ...chess, name: "Classic Chess" }, root], "next"));
  show(operation, { items: [chess], nextCursor: "next" }, input);
  expect(screen.getByRole("heading", { name: "Collection" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByLabelText("Loading…")).toBeVisible();
  expect(screen.getByText(chess.name)).toBeVisible();
  later.reject(new Error("Host unavailable"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  expect(screen.getByText(chess.name)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText(root.name)).toBeVisible();
  expect(screen.getByText("Classic Chess")).toBeVisible();
  expect(screen.queryByText(chess.name)).toBeNull();
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(callServerTool).toHaveBeenCalledTimes(2);
  for (const call of callServerTool.mock.calls) {
    expect(call).toEqual([
      { name: operation, arguments: { ...input, query: { ...input.query, cursor: "next" } } },
      { signal: expect.any(AbortSignal) },
    ]);
  }
});

it("distinguishes an empty search from an invalid game batch", () => {
  const view = show("search_bgg_games", { items: [] });
  expect(screen.getByText("No games found")).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  view.unmount();
  show("get_bgg_games", { items: [{ id: 1, name: "Wrong shape" }] });
  expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
  expect(screen.queryByText("No games found")).toBeNull();
  expect(callServerTool).not.toHaveBeenCalled();
});

it("fetches visible game metadata through MCP and explicitly retries a failed lookup", async () => {
  let seen: IntersectionObserverCallback | undefined;
  const observer = {
    observe: vi.fn(),
    disconnect: vi.fn(),
  };
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        seen = callback;
      }
      observe = observer.observe;
      disconnect = observer.disconnect;
    },
  );
  callServerTool.mockRejectedValueOnce(new Error("Metadata temporarily unavailable"));
  callServerTool.mockResolvedValueOnce({
    content: [],
    structuredContent: {
      operation: "get_bgg_games",
      data: { items: [{ ...chess, categories: ["Abstract Strategy"], average: 8.2 }] },
    },
  });
  show("search_bgg_games", { items: [chess] });
  expect(observer.observe).toHaveBeenCalledTimes(1);
  expect(callServerTool).not.toHaveBeenCalled();
  act(() =>
    seen?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      observer as unknown as IntersectionObserver,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Game information: Chess" }));
  const game = within(await screen.findByRole("dialog"));
  expect(await game.findByRole("alert")).toHaveTextContent("Could not load game information");
  fireEvent.click(game.getByRole("button", { name: "Try again" }));
  expect(await game.findByText("Abstract Strategy")).toBeVisible();
  expect(game.getByText("8.20")).toBeVisible();
  expect(game.queryByRole("alert")).toBeNull();
  expect(callServerTool).toHaveBeenCalledTimes(2);
  for (const call of callServerTool.mock.calls)
    expect(call).toEqual([
      { name: "get_bgg_games", arguments: { query: { ids: "1" } } },
      { signal: expect.any(AbortSignal) },
    ]);
});
