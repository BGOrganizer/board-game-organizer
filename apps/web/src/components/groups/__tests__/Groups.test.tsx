import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { Groups } from "../Groups";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
afterEach(() => vi.unstubAllGlobals());
it("places owned groups/creation and four-character public search in two exclusive top tabs", async () => {
  const fetcher = vi.fn(
    async (_url: string) =>
      new Response(JSON.stringify({ items: [groupRecord], nextCursor: null })),
  );
  vi.stubGlobal("fetch", fetcher);
  renderWithI18n(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Groups />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("link", { name: "Create group" })).not.toBeNull();
  expect(screen.getByRole("tab", { name: "Groups" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.queryByRole("link", { name: "Search public groups" })).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Search" }));
  expect(screen.queryByRole("link", { name: "Create group" })).toBeNull();
  expect(screen.getByText("Enter at least 4 characters to search")).not.toBeNull();
  expect(
    fetcher.mock.calls.some(([url]) => new URL(url).searchParams.get("scope") === "public"),
  ).toBe(false);
  fireEvent.change(screen.getByPlaceholderText("Search groups"), { target: { value: "Public" } });
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([url]) => new URL(url).searchParams.get("scope") === "public"),
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole("tab", { name: "Groups" }));
  expect(screen.getByRole("link", { name: "Create group" })).not.toBeNull();
});
it("keeps group failures observable and permits retry to an honest empty state", async () => {
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      fail ? new Response("{}", { status: 503 }) : new Response('{"items":[],"nextCursor":null}'),
    ),
  );
  renderWithI18n(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Groups />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Could not load groups")).not.toBeNull();
  expect(screen.queryByText("No groups found")).toBeNull();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("No groups found")).not.toBeNull();
  expect(screen.getByRole("link", { name: "Create group" })).not.toBeNull();
});
it("keeps existing discovery links on the Search tab without an eager empty search", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  renderWithI18n(
    <QueryClientProvider client={new QueryClient()}>
      <Groups initialSection="search" />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("tab", { name: "Search" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.queryByRole("link", { name: "Create group" })).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
