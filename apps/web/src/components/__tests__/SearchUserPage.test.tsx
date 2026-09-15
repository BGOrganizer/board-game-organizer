import { screen } from "@testing-library/react";
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
            avatarUrl: null,
          },
        },
      ],
    }),
  );

  renderWithI18n(
    <SearchUserPage
      apiUrl="https://api.example.com"
      token="token"
      getToken={vi.fn().mockResolvedValue("token")}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  );

  expect(await screen.findByText("E2E Target")).toBeTruthy();
});
