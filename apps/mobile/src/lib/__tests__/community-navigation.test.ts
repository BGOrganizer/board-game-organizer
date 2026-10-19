import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it, vi } from "vitest";

vi.mock("expo-constants", () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock("expo-device", () => ({ isDevice: false }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-notifications", () => ({}));

import { notificationHref } from "../notifications/push-notifications";

const source = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"),
  eventId = "11111111-1111-4111-8111-111111111111",
  tableId = "22222222-2222-4222-8222-222222222222";
it("exposes Tables Groups Events Contacts, with profile separate and legacy tabs hidden", () => {
  const s = source("app/(tabs)/_layout.tsx");
  for (const tab of ["tables", "groups", "events", "contacts"])
    expect(s).toContain(`name="${tab}"`);
  expect(s).toContain('name="matches" options={{ href: null }}');
  expect(s).toContain('name="organizations" options={{ href: null }}');
  expect(s).toContain("Group moderation");
  expect(source("app/index.tsx")).toContain('"/tables"');
});
it("maps only canonical authenticated event/table destinations and retires legacy links", () => {
  expect(notificationHref({ href: `/events/${eventId}` })).toBe(`/event/${eventId}`);
  expect(notificationHref({ href: `/events/${eventId}/tables/${tableId}` })).toBe(
    `/event/table?eventId=${eventId}&tableId=${tableId}`,
  );
  expect(notificationHref({ href: "/matches" })).toBe("/tables");
  expect(notificationHref({ href: "/events" })).toBe("/events");
  expect(notificationHref({ href: `/organizations/${eventId}` })).toBe("/groups");
});
it.each([
  `https://evil.test/events/${eventId}`,
  `//evil.test/events/${eventId}`,
  `/events/${eventId}?next=evil`,
  `/events/${eventId}/`,
  `/events/${eventId}/tables/wrong`,
  `/events/${eventId}/tables/${tableId}#fragment`,
])("rejects unsafe path %s", (href) => expect(notificationHref({ href })).toBe("/notifications"));
it("preserves picker header ownership, drafts and detail stack identity", () => {
  expect(source("components/locations/LocationPicker.tsx")).toContain(
    "<HeaderTitle title={children} icon={MapPin} />",
  );
  expect(source("components/events/EventWizard.tsx")).toContain("router.dismissTo(");
  expect(source("components/events/EventWizard.tsx")).toContain("BackHandler.addEventListener");
  expect(source("components/events/EventWizard.tsx")).toMatch(/gestureEnabled:\s*false/);
  expect(source("components/groups/GroupReview.tsx")).toContain('router.dismissTo("/moderation")');
});
it("keeps pending group permissions gated and event creation contextual or standalone", () => {
  const group = source("components/groups/GroupDetail.tsx");
  for (const cap of ["canViewMembers", "canViewEvents", "canViewRankings"])
    expect(group).toContain(cap);
  expect(group).toMatch(/canCreate=\{group\.role\s*===\s*"admin"\s*&&\s*group\.canInvite\}/);
  expect(source("components/events/Events.tsx")).toContain("FloatingActions");
  expect(source("components/groups/GroupWizard.tsx")).not.toContain("/match/search-user");
});
