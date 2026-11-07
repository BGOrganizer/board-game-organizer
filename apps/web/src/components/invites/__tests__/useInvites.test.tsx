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

  it("does not announce an uncreated link and reports a failed invite creation", async () => {
    const feedback = { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() };
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
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(feedback.onOptimisticUpdate).not.toHaveBeenCalled();
    expect(feedback.onSuccess).not.toHaveBeenCalled();
    expect(feedback.onError).not.toHaveBeenCalled();

    failRequest();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "create_invite");
    expect(feedback.onSuccess).not.toHaveBeenCalled();
  });
  it("announces a shareable link only after the server returns it", async () => {
    const feedback = { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() };
    let complete!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve;
          }),
      ),
    );
    const { result } = renderHook(
      () => useInvites({ apiUrl: "https://api.example.com", token: "token", feedback }),
      { wrapper },
    );
    act(() => result.current.mutate());
    await waitFor(() => expect(complete).toBeDefined());
    expect(feedback.onSuccess).not.toHaveBeenCalled();
    const row = {
      token: "generated-token",
      link: "https://api.example.com/invite/generated-token",
      email: null,
      expiresAt: "2030-01-08T00:00:00Z",
    };
    await act(async () => complete(Response.json(row)));
    await waitFor(() => expect(result.current.data).toEqual(row));
    expect(feedback.onSuccess).toHaveBeenCalledWith("create_invite");
    expect(feedback.onOptimisticUpdate).not.toHaveBeenCalled();
  });
});
