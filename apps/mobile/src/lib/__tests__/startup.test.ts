import {
  eventRecordKeys,
  eventRecordsQuery,
  groupRecordKeys,
  groupRecordsPageQuery,
  recordTablesQuery,
} from "@board-game-organizer/shared";
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

const apiUrl = "https://api.example.test",
  userId = "user-1",
  o = { apiUrl, userId, getToken: async () => null };
const settled = (client: QueryClient, path: string) =>
  isStartupDestinationSettled(client, path, apiUrl, userId);
function seed(client: QueryClient) {
  client.setQueryData(["profile", apiUrl, userId], { id: userId });
  for (const key of [
    recordTablesQuery(o, null).queryKey,
    eventRecordsQuery(o).queryKey,
    groupRecordsPageQuery(o).queryKey,
  ])
    client.setQueryData(key, { pages: [{ items: [], nextCursor: null }], pageParams: [""] });
  for (const type of startupRelationshipTypes)
    client.setQueryData(["contacts", type, apiUrl, userId], []);
  client.setQueryData(["contacts", "suggestions", apiUrl, userId], {
    users: [],
    hasContacts: false,
  });
}
it("normalizes only owned bgo deep links and never treats development-client links as app destinations", () => {
  for (const input of [
    null,
    undefined,
    "https://evil.test",
    "exp+mobile://expo-development-client",
  ])
    expect(startupLinkPath(input)).toBeNull();
  expect(startupLinkPath("bgo:///group/123?source=push")).toBe("/group/123");
  expect(startupLinkPath("bgo://groups")).toBe("/groups");
  expect(startupLinkPath("bgo:event/123")).toBe("/event/123");
});
it("retains the total five-second budget including slow Clerk restoration", () => {
  expect(remainingSplashMs(1000, 1000)).toBe(5000);
  expect(remainingSplashMs(1000, 3500)).toBe(2500);
  expect(remainingSplashMs(1000, 6000)).toBe(0);
  for (const args of [
    [false, undefined, undefined, false],
    [true, undefined, undefined, false],
    [true, true, false, true],
    [true, true, undefined, true],
    [true, true, true, false],
  ] as const)
    expect(isStartupAuthPending(args[0], args[1], args[2], args[3])).toBe(true);
  expect(isStartupAuthPending(true, true, true, true)).toBe(false);
  expect(isStartupAuthPending(true, false, false, false)).toBe(false);
});
it("waits for canonical first pages, not filtered or retired Match pages", () => {
  const client = new QueryClient();
  expect(isStartupEssentialsSettled(client, apiUrl, userId)).toBe(false);
  client.setQueryData(["matches", "paged", apiUrl, userId, "", "admin,invited,accepted"], {
    pages: [],
  });
  expect(settled(client, "/tables")).toBe(false);
  expect(settled(client, "/")).toBe(false);
  seed(client);
  expect(isStartupEssentialsSettled(client, apiUrl, userId)).toBe(true);
  for (const path of ["/tables", "/groups", "/events", "/contacts"])
    expect(settled(client, path)).toBe(true);
  client.removeQueries({ queryKey: ["contacts", "blocked"] });
  expect(isStartupEssentialsSettled(client, apiUrl, userId)).toBe(false);
  client.clear();
});
it("prioritizes exact Group/Event/Table details and separates inbox page from bell", () => {
  const client = new QueryClient();
  client.setQueryData(["notifications", apiUrl, userId, 3], {});
  expect(settled(client, "/notifications")).toBe(false);
  client.setQueryData(["notifications", apiUrl, userId, 20], {});
  expect(settled(client, "/notifications")).toBe(true);
  expect(settled(client, "/group/g1")).toBe(false);
  client.setQueryData(groupRecordKeys.detail(o, "g1"), {});
  expect(settled(client, "/group/g1")).toBe(true);
  expect(settled(client, "/group/g2")).toBe(false);
  expect(settled(client, "/event/e1")).toBe(false);
  client.setQueryData(eventRecordKeys.detail(o, "e1"), {});
  expect(settled(client, "/event/e1")).toBe(true);
  expect(settled(client, "/event/table")).toBe(false);
  client.setQueryData(eventRecordKeys.table(o, "e1", "t1"), {});
  expect(settled(client, "/event/table")).toBe(true);
  expect(settled(client, "/profile")).toBe(false);
  client.setQueryData(["profile", apiUrl, userId], {});
  expect(settled(client, "/profile")).toBe(true);
  for (const path of ["/mobile-number", "/event/wizard", "/event/results", "/group/wizard"])
    expect(settled(client, path)).toBe(true);
  client.clear();
});
it("treats an observable API error as settled but never a pending request", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let reject!: (reason: Error) => void;
  const pending = client.fetchQuery({
    queryKey: recordTablesQuery(o, null).queryKey,
    queryFn: () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  });
  expect(settled(client, "/tables")).toBe(false);
  reject(new Error("offline"));
  await expect(pending).rejects.toThrow("offline");
  expect(settled(client, "/tables")).toBe(true);
  client.clear();
});
