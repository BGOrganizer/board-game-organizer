import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SearchUserPage } from "@/components/SearchUserPage";
import { renderWithI18n } from "@/test-utils";

afterEach(() => vi.unstubAllGlobals());

it("renders friends returned by the relationships API", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          fromUserId: "user_viewer",
          toUserId: "user_friend",
          profile: {
            id: "user_friend",
            name: "E2E Target",
            email: "target@example.com",
            avatarUrl: "https://example.com/friend.jpg",
          },
        },
        {
          fromUserId: "user_viewer",
          toUserId: "user_excluded",
          profile: {
            id: "user_excluded",
            name: "Already invited",
            email: "invited@example.com",
            avatarUrl: null,
          },
        },
      ],
    }),
  );

  const onSelect = vi.fn();
  renderWithI18n(
    <SearchUserPage
      apiUrl="https://api.example.com"
      token="token"
      getToken={vi.fn().mockResolvedValue("token")}
      excludeIds={["user_excluded"]}
      onSelect={onSelect}
      onClose={vi.fn()}
    />,
  );

  expect(await screen.findByText("E2E Target")).toBeTruthy();
  expect(screen.getByText("E")).toBeTruthy();
  expect(screen.queryByText("Already invited")).toBeNull();
  const add = screen.getByRole("button", { name: "Add: E2E Target" });
  expect(add.closest("li")?.className).toContain("p-3 pl-4");
  expect(add.closest("ul")?.className).toContain("rounded-xl bg-surface");
  expect(screen.getByPlaceholderText(/Search users/i).className).toContain("bg-surface");
  expect(screen.queryByText("Add")).toBeNull();
  fireEvent.click(add);
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({ id: "user_friend", name: "E2E Target" }),
  );
});

it("filters global user-search matches to existing friends", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("relationships?type=friends")) {
      return {
        ok: true,
        json: async () => [
          {
            fromUserId: "user_viewer",
            toUserId: "user_friend",
            profile: {
              id: "user_friend",
              name: "Existing Friend",
              email: "friend@example.com",
              avatarUrl: null,
            },
          },
        ],
      } as Response;
    }
    return {
      ok: true,
      json: async () => ({
        users: [
          { id: "user_friend", name: "Matching Friend", email: "friend@example.com" },
          { id: "user_stranger", name: "Matching Stranger", email: "stranger@example.com" },
        ],
      }),
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);

  renderWithI18n(
    <SearchUserPage
      apiUrl="https://api.example.com"
      token="token"
      getToken={vi.fn().mockResolvedValue("token")}
      excludeIds={[]}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  await screen.findByText("Existing Friend");
  fireEvent.change(screen.getByPlaceholderText(/Search users/i), {
    target: { value: "Matching" },
  });

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(await screen.findByText("Matching Friend")).toBeTruthy();
  expect(screen.queryByText("Matching Stranger")).toBeNull();
});
