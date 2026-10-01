import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { isStartupAuthPending, isStartupDestinationSettled, remainingSplashMs } from "../startup";

const url = "https://api.example.test";
const userId = "user-1";
const settled = (client: QueryClient, path: string) =>
  isStartupDestinationSettled(client, path, url, userId);

describe("startup destination", () => {
  it("keeps splash while Clerk restores a pending session", () => {
    expect(isStartupAuthPending(false, undefined, undefined, false)).toBe(true);
    expect(isStartupAuthPending(true, undefined, undefined, false)).toBe(true);
    expect(isStartupAuthPending(true, true, false, true)).toBe(true);
    expect(isStartupAuthPending(true, true, undefined, true)).toBe(true);
    expect(isStartupAuthPending(true, true, true, false)).toBe(true);
    expect(isStartupAuthPending(true, true, true, true)).toBe(false);
    expect(isStartupAuthPending(true, false, false, false)).toBe(false);
  });

  it("caps splash at five seconds from boot rather than adding five seconds after auth", () => {
    expect(remainingSplashMs(1000, 1000)).toBe(5000);
    expect(remainingSplashMs(1000, 3500)).toBe(2500);
    expect(remainingSplashMs(1000, 6000)).toBe(0);
  });

  it("waits for redirect and the exact unfiltered first page, then accepts an empty page", () => {
    const client = new QueryClient();
    expect(settled(client, "/")).toBe(false);
    expect(settled(client, "/matches")).toBe(false);
    client.setQueryData(["matches", "paged", url, "jwt", "", "admin"], { matches: [] });
    expect(settled(client, "/matches")).toBe(false);
    client.setQueryData(["matches", "paged", url, "jwt", "", "admin,invited,accepted"], {
      pages: [{ matches: [], nextCursor: null }],
      pageParams: [""],
    });
    expect(settled(client, "/matches")).toBe(true);
    expect(settled(client, "/groups")).toBe(false);
    client.setQueryData(["groups", "paged", url, "jwt", "", "admin,invited,accepted"], {
      groups: [],
    });
    expect(settled(client, "/groups")).toBe(true);
  });

  it("waits for visible contact lists without requiring device address-book access", () => {
    const client = new QueryClient();
    for (const type of ["friends", "pending", "following", "followers"]) {
      client.setQueryData(["contacts", type, url, "jwt"], []);
      expect(settled(client, "/contacts")).toBe(false);
    }
    client.setQueryData(["contacts", "suggestions", url, "jwt"], {
      users: [],
      hasContacts: false,
    });
    expect(settled(client, "/contacts")).toBe(true);
  });

  it("distinguishes inbox page from bell and follows deep-linked details", () => {
    const client = new QueryClient();
    client.setQueryData(["notifications", url, userId, 3], { notifications: [] });
    expect(settled(client, "/notifications")).toBe(false);
    client.setQueryData(["notifications", url, userId, 20], { notifications: [] });
    expect(settled(client, "/notifications")).toBe(true);
    expect(settled(client, "/match/m1")).toBe(false);
    client.setQueryData(["matches", "detail", "m1", url, "jwt"], { match: {} });
    expect(settled(client, "/match/m1")).toBe(true);
    expect(settled(client, "/match/m2")).toBe(false);
    expect(settled(client, "/group/g1")).toBe(false);
    client.setQueryData(["groups", url, "jwt"], { groups: [] });
    expect(settled(client, "/group/g1")).toBe(true);
    client.setQueryData(["profile", url, userId], { id: userId });
    expect(settled(client, "/profile")).toBe(true);
    expect(settled(client, "/mobile-number")).toBe(true);
    expect(settled(client, "/match/results")).toBe(true);
    expect(settled(client, "/match/wizard")).toBe(true);
    expect(settled(client, "/match/search-game")).toBe(true);
    expect(settled(client, "/match/search-user")).toBe(true);
    expect(settled(client, "/group/wizard")).toBe(true);
  });

  it("does not wait forever on an API error or hide while a request is pending", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ["matches", "paged", url, "jwt", "", "admin,invited,accepted"];
    let reject!: (reason: Error) => void;
    const pending = client.fetchQuery({
      queryKey: key,
      queryFn: () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    });
    expect(settled(client, "/matches")).toBe(false);
    reject(new Error("offline"));
    await expect(pending).rejects.toThrow("offline");
    expect(settled(client, "/matches")).toBe(true);
  });
});
