import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { GroupLeaderboard } from "../GroupLeaderboard";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: "owner", getToken: async () => "fresh-token" }),
}));
afterEach(() => vi.unstubAllGlobals());
it("keeps the exact focused search input mounted through each debounced game-query transition", async () => {
  const requests = new Set<string>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const query = new URL(url).searchParams.get("query") ?? "";
      requests.add(query);
      if (query) return new Promise<Response>(() => {});
      return Response.json({
        games: [{ id: 1, name: "Cascadia", imageUrl: null }],
        players: [],
        nextCursor: 25,
      });
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = renderWithI18n(
    <QueryClientProvider client={client}>
      <GroupLeaderboard groupId="11111111-1111-4111-8111-111111111111" />
    </QueryClientProvider>,
  );
  try {
    fireEvent.click(await screen.findByRole("button", { name: /Board game/ }));
    const input = await screen.findByRole("searchbox", { name: "Search board games" });
    input.focus();
    for (const query of ["casc", "casca", "cascad", "zzzz"]) {
      fireEvent.change(input, { target: { value: query } });
      await waitFor(() => expect(requests.has(query)).toBe(true));
      expect(screen.getByRole("searchbox", { name: "Search board games" })).toBe(input);
      expect(document.activeElement).toBe(input);
      expect((input as HTMLInputElement).value).toBe(query);
      const more = screen.queryByRole("button", {
        name: "Load more games",
      }) as HTMLButtonElement | null;
      expect(more?.disabled ?? true).toBe(true);
      expect(screen.queryByText("No games found")).toBeNull();
    }
  } finally {
    view.unmount();
    await act(async () => client.clear());
  }
});
