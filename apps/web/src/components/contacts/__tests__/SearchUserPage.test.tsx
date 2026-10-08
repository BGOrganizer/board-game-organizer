import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SearchUserPage } from "@/components/contacts/SearchUserPage";
import { renderWithI18n } from "@/test-utils";

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ userId: "user_viewer" }) }));
afterEach(() => vi.unstubAllGlobals());

const friend = (id: string, name: string) => ({
  fromUserId: "user_viewer",
  toUserId: id,
  profile: { id, name, email: `${id}@example.com`, avatarUrl: null },
});

function renderPicker(onSelect = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderWithI18n(
    <QueryClientProvider client={client}>
      <SearchUserPage
        apiUrl="https://api.example.com"
        token="token"
        getToken={vi.fn().mockResolvedValue("fresh-token")}
        excludeIds={["user_excluded"]}
        onSelect={onSelect}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return onSelect;
}

it("renders cached first-page friends, excludes invited users, and loads the next page", async () => {
  let onIntersect: IntersectionObserverCallback | undefined;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        onIntersect = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => ({
    ok: true,
    json: async () =>
      String(input).includes("cursor=user_friend")
        ? { rows: [friend("user_later", "Later Friend")], nextCursor: null }
        : {
            rows: [friend("user_friend", "E2E Target"), friend("user_excluded", "Already invited")],
            nextCursor: "user_friend",
          },
  }));
  vi.stubGlobal("fetch", fetchMock);
  const onSelect = renderPicker();
  expect(await screen.findByText("E2E Target")).toBeTruthy();
  expect(screen.queryByText("Already invited")).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(onIntersect).toBeDefined());
  onIntersect?.(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
  expect(await screen.findByText("Later Friend")).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const add = screen.getByRole("button", { name: "Add: E2E Target" });
  expect(add.closest("li")?.className).toContain("p-3 pl-4");
  expect(add.closest("ul")?.className).toContain("rounded-xl bg-surface");
  fireEvent.click(add);
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "user_friend" }));
  const search = screen.getByPlaceholderText(/Search users/i) as HTMLInputElement;
  fireEvent.change(search, { target: { value: "E2E Target" } });
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));
  expect(search.value).toBe("");
});

it("lets search find a friend beyond the currently loaded page using server relationship state", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => ({
    ok: true,
    json: async () =>
      String(input).includes("/api/users/search")
        ? {
            users: [
              {
                id: "user_later",
                name: "Matching Friend",
                email: "later@example.com",
                isFriend: true,
              },
              {
                id: "user_stranger",
                name: "Matching Stranger",
                email: "stranger@example.com",
                isFriend: false,
              },
            ],
          }
        : { rows: [friend("user_friend", "Existing Friend")], nextCursor: "user_friend" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  renderPicker();
  expect(await screen.findByText("Existing Friend")).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText(/Search users/i), { target: { value: "Matching" } });
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/users/search"))).toBe(
      true,
    ),
  );
  expect(await screen.findByText("Matching Friend")).toBeTruthy();
  expect(screen.queryByText("Matching Stranger")).toBeNull();
});
