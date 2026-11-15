import {
  claimInvite,
  clearSessionQueryCache,
  createInvite,
  developmentInviteAppLink,
  useInvites,
} from "@board-game-organizer/shared";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => vi.unstubAllGlobals());

describe("useInvites", () => {
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
          userId: "owner",
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
      () =>
        useInvites({
          apiUrl: "https://api.example.com",
          token: "token",
          userId: "owner",
          feedback,
        }),
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

it("uses the stable owner/table key, fresh token and contextual body with cancellation", async () => {
  const getToken = vi.fn().mockResolvedValue("fresh");
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      token: "token",
      link: "https://api.example.com/invite/token",
      email: null,
      expiresAt: "2030-01-01",
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const { result } = renderHook(
    () =>
      useInvites({
        apiUrl: "https://api.example.com",
        userId: "owner",
        token: "stale",
        getToken,
        tableId: "table",
        protectionBypass: "bypass",
      }),
    { wrapper },
  );
  await act(async () => {
    await result.current.mutateAsync();
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(fetcher).toHaveBeenCalledWith(
    "https://api.example.com/api/invites?x-vercel-protection-bypass=bypass",
    expect.objectContaining({
      signal: expect.any(AbortSignal),
      body: JSON.stringify({ tableId: "table" }),
      headers: expect.objectContaining({ Authorization: "Bearer fresh" }),
    }),
  );
});

it.each([null, "reject"])(
  "never falls back to a stale JWT when fresh auth fails: %s",
  async (failure) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const getToken =
      failure === "reject"
        ? vi.fn().mockRejectedValue(new Error("expired"))
        : vi.fn().mockResolvedValue(null);
    const { result } = renderHook(
      () => useInvites({ apiUrl: "api", userId: "owner", token: "stale", getToken }),
      { wrapper },
    );
    await expect(result.current.mutateAsync()).rejects.toThrow("No session token");
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it.each([
  { userId: undefined, token: "token" },
  { userId: "owner", token: null },
])("rejects missing owner/token before dispatch: %j", async (auth) => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const { result } = renderHook(() => useInvites({ apiUrl: "api", ...auth }), { wrapper });
  await expect(result.current.mutateAsync()).rejects.toThrow(
    auth.userId ? "No session token" : "No session owner",
  );
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(["token", "request"])(
  "cancels creation and suppresses late feedback on session purge during %s",
  async (phase) => {
    let finishToken!: (value: string) => void;
    let finishRequest!: (value: Response) => void;
    const getToken =
      phase === "token"
        ? vi.fn(
            () =>
              new Promise<string>((resolve) => {
                finishToken = resolve;
              }),
          )
        : vi.fn().mockResolvedValue("fresh");
    const fetcher = vi.fn(
      (_url: unknown, _input: RequestInit) =>
        new Promise<Response>((resolve) => {
          finishRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    const client = new QueryClient();
    const feedback = { onSuccess: vi.fn(), onError: vi.fn() };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useInvites({ apiUrl: "api", userId: "owner", token: "stale", getToken, feedback }),
      { wrapper },
    );
    const pending = result.current.mutateAsync();
    await waitFor(() => expect(phase === "token" ? finishToken : finishRequest).toBeDefined());
    clearSessionQueryCache(client);
    if (phase === "token") finishToken("another-owner-token");
    else {
      expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(true);
      finishRequest(
        Response.json({ token: "t", link: "link", email: null, expiresAt: "2030-01-01" }),
      );
    }
    await expect(pending).rejects.toThrow("MUTATION_OWNER_CHANGED");
    expect(fetcher).toHaveBeenCalledTimes(phase === "token" ? 0 : 1);
    expect(feedback.onSuccess).not.toHaveBeenCalled();
    expect(feedback.onError).not.toHaveBeenCalled();
  },
);

it("does not publish success if the session is purged between receipt and success callback", async () => {
  const client = new QueryClient({
    mutationCache: new MutationCache({
      onSuccess: () => {
        clearSessionQueryCache(client);
      },
    }),
  });
  const feedback = { onSuccess: vi.fn() };
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ token: "t", link: "link", email: null, expiresAt: "2030-01-01" }),
      ),
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => useInvites({ apiUrl: "api", userId: "owner", token: "token", feedback }),
    { wrapper },
  );
  await result.current.mutateAsync();
  expect(feedback.onSuccess).not.toHaveBeenCalled();
});

it("preserves legacy full-link/bare-token claim requests and HTTP failure", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ success: true, inviter: null }))
    .mockResolvedValueOnce(new Response(null, { status: 410 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    claimInvite("https://api.test", "session", " https://api.test/invite/opaque "),
  ).resolves.toEqual({ success: true, inviter: null });
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ token: "opaque" });
  await expect(claimInvite("https://api.test", "session", "bare")).rejects.toThrow("HTTP 410");
});

it("preserves createInvite HTTP rejection without an abort signal", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
  await expect(createInvite("api", "token")).rejects.toThrow("HTTP 403");
});

it.each(["valid", "untrusted", "mismatch"])(
  "uses only an exact server-approved stable share link (%s)",
  async (mode) => {
    const token = "abcdefghijklmnopqrstuv";
    const link = `https://api-development-pr-25-board-game-organizers-projects.vercel.app/invite/${token}`;
    const appLink =
      mode === "valid"
        ? developmentInviteAppLink(link)
        : mode === "untrusted"
          ? "https://evil.test/invite/" + token
          : developmentInviteAppLink(link.replace(token, "zyxwvutsrqponmlkjihgfe"));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ token, link, appLink, email: null, expiresAt: "2030-01-08" }),
        ),
    );
    const { result } = renderHook(
      () => useInvites({ apiUrl: "https://api.test", token: "session", userId: "owner" }),
      { wrapper },
    );
    const row = await result.current.mutateAsync();
    expect(row.link).toBe(mode === "valid" ? appLink : link);
  },
);
it("extracts only the invite token from a stable app URL and keeps the configured authenticated API", async () => {
  const token = "abcdefghijklmnopqrstuv";
  const link = `https://api-development-pr-25-board-game-organizers-projects.vercel.app/invite/${token}`;
  const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, inviter: null }));
  vi.stubGlobal("fetch", fetcher);
  await claimInvite("https://configured-api.test", "session", developmentInviteAppLink(link)!);
  expect(fetcher.mock.calls[0][0]).toBe("https://configured-api.test/api/invites/claim");
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ token });
});
