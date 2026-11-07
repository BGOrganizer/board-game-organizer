import {
  currentLocationAddressQuery,
  useCurrentLocationAddress,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const address = { id: "address.gps", address: "Verified address", longitude: 12.5, latitude: 41.9 };
const options = {
  apiUrl: "https://api.example.test",
  userId: "viewer",
  getToken: vi.fn(async () => "fresh-token" as string | null),
  protectionBypass: "preview-bypass",
};
const clients: QueryClient[] = [];
function client() {
  const value = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(value);
  return value;
}
afterEach(() => {
  for (const value of clients.splice(0)) value.clear();
  options.getToken.mockReset().mockResolvedValue("fresh-token");
  vi.unstubAllGlobals();
});

it("uses the authenticated reverse lookup with fresh tokens, scoped keys and cancellation signals", async () => {
  const fetchMock = vi.fn().mockImplementation(async () => Response.json({ items: [address] }));
  vi.stubGlobal("fetch", fetchMock);
  const query = currentLocationAddressQuery(options, 12.5, 41.9);
  expect(query.queryKey).toEqual(["locations", "reverse", options.apiUrl, "viewer", 12.5, 41.9]);
  expect(query.gcTime).toBe(0);
  expect(query.retry).toBe(false);
  const cache = client();
  options.getToken.mockResolvedValueOnce("first").mockResolvedValueOnce("rotated");
  expect(await cache.fetchQuery(query)).toEqual(address);
  expect(await cache.fetchQuery(query)).toEqual(address);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  for (const [index, [url, request]] of fetchMock.mock.calls.entries()) {
    const parsed = new URL(url);
    expect(parsed.searchParams.get("query")).toBe("12.5000000,41.9000000");
    expect(parsed.searchParams.get("x-vercel-protection-bypass")).toBe("preview-bypass");
    expect(request.headers.Authorization).toBe(`Bearer ${index ? "rotated" : "first"}`);
    expect(request.signal).toBeInstanceOf(AbortSignal);
  }
  expect(
    currentLocationAddressQuery({ ...options, userId: "other" }, 12.5, 41.9).queryKey,
  ).not.toEqual(query.queryKey);
  expect(
    currentLocationAddressQuery({ ...options, apiUrl: "https://other.test" }, 12.5, 41.9).queryKey,
  ).not.toEqual(query.queryKey);
});

it("formats the valid zero position without triggering the four-character search guard", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ items: [address] }));
  vi.stubGlobal("fetch", fetchMock);
  await client().fetchQuery(currentLocationAddressQuery(options, 0, 0));
  expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("query")).toBe("0.0000000,0.0000000");
});

it.each([
  [181, 0],
  [0, 91],
  [Number.NaN, 0],
  [0, Number.POSITIVE_INFINITY],
])("rejects invalid coordinates %s,%s before a request", (longitude, latitude) => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  expect(() => currentLocationAddressQuery(options, longitude, latitude)).toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("does not make unauthenticated requests", async () => {
  options.getToken.mockResolvedValue(null);
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await expect(client().fetchQuery(currentLocationAddressQuery(options, 12, 41))).rejects.toThrow(
    "Unauthorized",
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each([
  [() => Promise.resolve(new Response(null, { status: 502 })), "Geocoding unavailable"],
  [() => Promise.resolve(Response.json({ items: [] })), "No address found"],
  [() => Promise.reject(new Error("Offline")), "Offline"],
])("keeps lookup failures observable", async (response, message) => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(response));
  await expect(client().fetchQuery(currentLocationAddressQuery(options, 12, 41))).rejects.toThrow(
    message,
  );
});

it.each(["cancel", "unmount"])(
  "aborts an in-flight lookup on %s, without cancelling foreign queries",
  async (action) => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, request: RequestInit) => {
        signal = request.signal as AbortSignal;
        return new Promise((_resolve, reject) =>
          signal?.addEventListener("abort", () => reject(new Error("Aborted")), { once: true }),
        );
      }),
    );
    const cache = client();
    cache.setQueryData(["locations", "reverse", options.apiUrl, "other", 12, 41], address);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    );
    const view = renderHook(() => useCurrentLocationAddress(options), { wrapper });
    view.result.current.cancel(); // Safe before the first lookup (also the unmount cleanup).
    const lookup = view.result.current.lookup(12, 41).catch((error: unknown) => error);
    await waitFor(() => expect(signal).toBeDefined());
    if (action === "cancel") view.result.current.cancel();
    else view.unmount();
    await lookup;
    expect(signal?.aborted).toBe(true);
    expect(cache.getQueryData(["locations", "reverse", options.apiUrl, "other", 12, 41])).toEqual(
      address,
    );
  },
);

it("can unmount before any lookup", () => {
  const cache = client();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useCurrentLocationAddress(options), { wrapper });
  view.unmount();
});
