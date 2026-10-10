import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  isStartupAuthPending,
  isStartupDestinationSettled,
  isStartupEssentialsSettled,
  remainingSplashMs,
  startupLinkPath,
  startupRelationshipTypes,
} from "../startup";

it("distinguishes external deep links from normal app startup", () => {
  expect(startupLinkPath(null)).toBeNull();
  expect(startupLinkPath("exp+mobile://expo-development-client")).toBeNull();
  expect(startupLinkPath("bgo:///group/123?source=push")).toBe("/group/123");
  expect(startupLinkPath("bgo://groups")).toBe("/groups");
});

const url = "https://api.example.test";
const userId = "user-1";
const settled = (client: QueryClient, path: string) =>
  isStartupDestinationSettled(client, path, url, userId);

function seedLists(client: QueryClient) {
  client.setQueryData(["profile", url, userId], { id: userId });
  for (const type of ["matches", "groups"]) {
    client.setQueryData([type, "paged", url, userId, "", "admin,invited,accepted"], {
      pages: [{ [type]: [], nextCursor: null }],
      pageParams: [""],
    });
  }
  for (const type of startupRelationshipTypes)
    client.setQueryData(["contacts", type, url, userId], []);
  client.setQueryData(["contacts", "suggestions", url, userId], { users: [], hasContacts: false });
}

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

  it("waits for every ordinary first page, then accepts empty pages", () => {
    const client = new QueryClient();
    expect(isStartupEssentialsSettled(client, url, userId)).toBe(false);
    seedLists(client);
    expect(isStartupEssentialsSettled(client, url, userId)).toBe(true);
    client.removeQueries({ queryKey: ["contacts", "blocked"] });
    expect(isStartupEssentialsSettled(client, url, userId)).toBe(false);
    expect(settled(client, "/matches")).toBe(true);
    expect(settled(client, "/groups")).toBe(true);
  });

  it("waits for redirect and exact unfiltered first page", () => {
    const client = new QueryClient();
    expect(settled(client, "/")).toBe(false);
    client.setQueryData(["matches", "paged", url, userId, "", "admin"], { matches: [] });
    expect(settled(client, "/matches")).toBe(false);
    seedLists(client);
    expect(settled(client, "/matches")).toBe(true);
    expect(settled(client, "/contacts")).toBe(true);
  });

  it("distinguishes inbox page from bell and follows deep-linked details", () => {
    const client = new QueryClient();
    client.setQueryData(["notifications", url, userId, 3], { notifications: [] });
    expect(settled(client, "/notifications")).toBe(false);
    client.setQueryData(["notifications", url, userId, 20], { notifications: [] });
    expect(settled(client, "/notifications")).toBe(true);
    expect(settled(client, "/match/m1")).toBe(false);
    client.setQueryData(["matches", "detail", "m1", url, userId], { match: {} });
    expect(settled(client, "/match/m1")).toBe(true);
    expect(settled(client, "/match/m2")).toBe(false);
    expect(settled(client, "/group/g1")).toBe(false);
    client.setQueryData(["groups", "detail", "g1", url, userId], { group: {} });
    expect(settled(client, "/group/g1")).toBe(true);
    client.setQueryData(["profile", url, userId], { id: userId });
    expect(settled(client, "/profile")).toBe(true);
    for (const path of [
      "/mobile-number",
      "/match/results",
      "/match/wizard",
      "/match/search-game",
      "/match/search-user",
      "/group/wizard",
    ])
      expect(settled(client, path)).toBe(true);
  });

  it("does not wait forever on an API error or hide while a request is pending", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = ["matches", "paged", url, userId, "", "admin,invited,accepted"];
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
