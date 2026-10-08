import { useInvites } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useInvites", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("confirms immediately and reports a failed invite creation", async () => {
    const feedback = { onOptimisticUpdate: vi.fn(), onError: vi.fn() };
    let failRequest = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            failRequest = () => resolve(new Response("failed", { status: 500 }));
          }),
      ),
    );
    const { result } = renderHook(
      () =>
        useInvites({
          apiUrl: "https://api.example.com",
          token: "token",
          feedback,
        }),
      { wrapper },
    );

    act(() => result.current.mutate());
    await waitFor(() => expect(feedback.onOptimisticUpdate).toHaveBeenCalledWith("create_invite"));
    expect(feedback.onError).not.toHaveBeenCalled();

    failRequest();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "create_invite");
  });
});
