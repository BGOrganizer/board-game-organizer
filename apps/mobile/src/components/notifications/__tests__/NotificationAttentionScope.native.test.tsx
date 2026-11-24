import { emptyAttentionSummary } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { NotificationAttentionScope } from "../NotificationAttentionScope";

it("retries the failed attention read while keeping the content visible and leaving alerts unread", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const target = { kind: "group", id: "2d71b28f-7d8e-4f61-97c6-cc1e8d653c11" } as const;
  const options = {
    apiUrl: "https://section-attention.test",
    userId: "owner",
    getToken: vi.fn(async () => "fresh-token"),
  };
  const summary = emptyAttentionSummary();
  const request = vi
    .fn<(input: string, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 }))
    .mockResolvedValueOnce(
      Response.json({
        asOf: "2030-06-01T10:00:00.000Z",
        unreadCount: 1,
        summary: { ...summary, groups: 1 },
        targets: [{ target, count: 1, direct: 1, events: 0, sections: summary.sections }],
      }),
    );
  vi.stubGlobal("fetch", request);
  try {
    const view = await render(
      <NativeTestProviders>
        <QueryClientProvider client={client}>
          <NotificationAttentionScope options={options} targets={[target]}>
            <Text>Visible group content</Text>
          </NotificationAttentionScope>
        </QueryClientProvider>
      </NativeTestProviders>,
    );
    expect(await screen.findByText("Could not load notifications")).toBeVisible();
    expect(screen.getByText("Visible group content")).toBeVisible();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByText("Could not load notifications")).toBeNull());
    expect(screen.getByText("Visible group content")).toBeVisible();
    expect(request).toHaveBeenCalledTimes(2);
    for (const [input, init] of request.mock.calls) {
      const url = new URL(input);
      expect(url.pathname).toBe("/api/notifications/attention");
      expect(JSON.parse(url.searchParams.get("targets") ?? "[]")).toEqual([target]);
      expect(init?.method).toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fresh-token");
    }
    expect(options.getToken).toHaveBeenCalledTimes(2);
    await view.unmount();
  } finally {
    client.clear();
    vi.unstubAllGlobals();
  }
});
