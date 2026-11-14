import {
  CommunityApiError,
  profileQueryOptions,
  usePreferredLanguageSync,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";

const options = {
  apiUrl: "https://api.example.test",
  userId: "viewer" as string | null,
  getToken: vi.fn(async () => "fresh" as string | null),
  enabled: true,
  protectionBypass: "bypass",
};
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
const profileKey = (userId = "viewer") => ["profile", options.apiUrl, userId];
beforeEach(() => {
  vi.clearAllMocks();
  options.getToken.mockResolvedValue("fresh");
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (_url: unknown, init?: RequestInit) =>
        new Response(JSON.stringify(JSON.parse(String(init?.body)))),
    ),
  );
});
it("syncs independently of push, uses fresh tokens/bypass, and preserves other profile fields/owners", async () => {
  const { client, wrapper } = setup();
  client.setQueryData(profileKey(), { name: "Kept", preferredLanguage: "en" });
  client.setQueryData(profileKey("other"), { name: "Foreign", preferredLanguage: "en" });
  const hook = renderHook(({ locale }) => usePreferredLanguageSync(options, locale), {
    wrapper,
    initialProps: { locale: "it" as "en" | "it" },
  });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(client.getQueryData(profileKey())).toEqual({ name: "Kept", preferredLanguage: "it" });
  expect(client.getQueryData(profileKey("other"))).toEqual({
    name: "Foreign",
    preferredLanguage: "en",
  });
  expect(fetch).toHaveBeenCalledWith(
    "https://api.example.test/api/profiles?x-vercel-protection-bypass=bypass",
    expect.objectContaining({
      method: "PATCH",
      headers: expect.objectContaining({ Authorization: "Bearer fresh" }),
      body: JSON.stringify({ preferredLanguage: "it" }),
      signal: expect.any(AbortSignal),
    }),
  );
  options.getToken.mockResolvedValue("rotated");
  hook.rerender({ locale: "en" });
  await waitFor(() =>
    expect(client.getQueryData(profileKey())).toMatchObject({ preferredLanguage: "en" }),
  );
  expect(vi.mocked(fetch).mock.calls.at(-1)?.[1]).toMatchObject({
    headers: expect.objectContaining({ Authorization: "Bearer rotated" }),
  });
  expect(options.getToken).toHaveBeenCalledTimes(2);
});
it("does not create a fabricated profile and applies bounded transient-only retries", async () => {
  const { client, wrapper } = setup();
  const hook = renderHook(() => usePreferredLanguageSync(options, "it"), { wrapper });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(client.getQueryData(profileKey())).toBeUndefined();
  const retry = client.getMutationCache().getAll()[0].options.retry as (
    n: number,
    error: Error,
  ) => boolean;
  expect(retry(0, new TypeError("offline"))).toBe(true);
  for (const status of [400, 401, 403, 404, 422])
    expect(retry(0, new CommunityApiError(status, "failure"))).toBe(false);
  for (const status of [429, 500])
    expect(retry(0, new CommunityApiError(status, "failure"))).toBe(true);
  expect(retry(2, new Error("offline"))).toBe(false);
  expect(retry(0, Object.assign(new Error("Aborted"), { name: "AbortError" }))).toBe(false);
});
it.each([{ enabled: false }, { userId: null }, { apiUrl: "" }])(
  "does not sync disabled/missing scopes %j",
  async (gate) => {
    const { wrapper } = setup();
    renderHook(() => usePreferredLanguageSync({ ...options, ...gate }, "it"), { wrapper });
    expect(fetch).not.toHaveBeenCalled();
    expect(options.getToken).not.toHaveBeenCalled();
  },
);
it("restarts an uncached startup profile read instead of leaving its loader canceled", async () => {
  const { client, wrapper } = setup();
  let release!: (response: Response) => void;
  let reads = 0;
  vi.mocked(fetch).mockImplementation(async (_url, init) => {
    if (init?.method === "PATCH") return new Response(JSON.stringify({ preferredLanguage: "it" }));
    reads++;
    if (reads === 1)
      return new Promise((done) => {
        release = done;
      });
    return new Response(JSON.stringify({ name: "Loaded", preferredLanguage: "it" }));
  });
  const prefetch = client.prefetchQuery(profileQueryOptions(options));
  await waitFor(() => expect(reads).toBe(1));
  const hook = renderHook(() => usePreferredLanguageSync(options, "it"), { wrapper });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(reads).toBe(2);
  expect(client.getQueryData(profileKey())).toEqual({ name: "Loaded", preferredLanguage: "it" });
  await act(async () =>
    release(new Response(JSON.stringify({ name: "Stale", preferredLanguage: "en" }))),
  );
  await prefetch;
  expect(client.getQueryData(profileKey())).toEqual({ name: "Loaded", preferredLanguage: "it" });
});

it("keeps cached profile on authorization failure without retry or user-action toasts", async () => {
  const { client, wrapper } = setup();
  client.setQueryData(profileKey(), { name: "Kept", preferredLanguage: "en" });
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  );
  const hook = renderHook(() => usePreferredLanguageSync(options, "it"), { wrapper });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(client.getQueryData(profileKey())).toEqual({ name: "Kept", preferredLanguage: "en" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("aborts old identity before resolving a rotating session token", async () => {
  const { client, wrapper } = setup();
  client.setQueryData(profileKey(), { preferredLanguage: "en" });
  let resolve!: (token: string) => void;
  options.getToken.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const hook = renderHook(({ userId }) => usePreferredLanguageSync({ ...options, userId }, "it"), {
    wrapper,
    initialProps: { userId: "viewer" },
  });
  await waitFor(() => expect(options.getToken).toHaveBeenCalledOnce());
  hook.rerender({ userId: "other" });
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  await act(async () => resolve("old-session"));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(profileKey())).toEqual({ preferredLanguage: "en" });
});
it("ignores an acknowledged request after unmount", async () => {
  const { client, wrapper } = setup();
  client.setQueryData(profileKey(), { preferredLanguage: "en" });
  let release!: (response: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise((done) => {
        release = done;
      }),
  );
  const hook = renderHook(() => usePreferredLanguageSync(options, "it"), { wrapper });
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  hook.unmount();
  await act(async () => release(new Response(JSON.stringify({ preferredLanguage: "it" }))));
  expect(client.getQueryData(profileKey())).toEqual({ preferredLanguage: "en" });
});
it("rechecks ownership after canceling a conflicting profile read", async () => {
  const { client, wrapper } = setup();
  client.setQueryData(profileKey(), { preferredLanguage: "en" });
  let release!: () => void;
  vi.spyOn(client, "cancelQueries").mockImplementationOnce(
    () =>
      new Promise((done) => {
        release = done;
      }),
  );
  const hook = renderHook(() => usePreferredLanguageSync(options, "it"), { wrapper });
  await waitFor(() => expect(client.cancelQueries).toHaveBeenCalled());
  hook.unmount();
  await act(async () => release());
  expect(client.getQueryData(profileKey())).toEqual({ preferredLanguage: "en" });
});
