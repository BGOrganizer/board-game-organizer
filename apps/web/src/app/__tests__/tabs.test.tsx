import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/components/groups/Groups", () => ({
  Groups: ({ initialSection = "groups" }: { initialSection?: string }) => (
    <p>groups:{initialSection === "search" ? "public" : "mine"}</p>
  ),
}));
vi.mock("@/components/groups/GroupDetail", () => ({
  GroupDetail: ({ groupId }: { groupId: string }) => <p>{groupId}</p>,
}));
vi.mock("@/components/events/Tables", () => ({ Tables: () => <p>tables</p> }));
vi.mock("@/components/events/Events", () => ({
  Events: ({ initialSection }: { initialSection?: string }) => <p>events:{initialSection}</p>,
}));
vi.mock("@/components/events/EventDetail", () => ({
  EventDetail: ({ eventId }: { eventId: string }) => <p>{eventId}</p>,
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

import Event from "../(tabs)/events/[eventId]/page";
import OldEventResults from "../(tabs)/events/[eventId]/results/page";
import OldEditTable from "../(tabs)/events/[eventId]/tables/[tableId]/edit/page";
import Events from "../(tabs)/events/page";
import Group from "../(tabs)/groups/[groupId]/page";
import OldGroupOrganizations from "../(tabs)/groups/organizations/page";
import Groups from "../(tabs)/groups/page";
import Search from "../(tabs)/groups/search/page";
import OldMatch from "../(tabs)/matches/[matchId]/page";
import OldMatches from "../(tabs)/matches/page";
import OldEditOrganization from "../(tabs)/organizations/[organizationId]/edit/page";
import OldOrganizationEvents from "../(tabs)/organizations/[organizationId]/events/page";
import OldOrganizationInvite from "../(tabs)/organizations/[organizationId]/invite/page";
import OldOrganization from "../(tabs)/organizations/[organizationId]/page";
import OldNewOrganization from "../(tabs)/organizations/new/page";
import OldOrganizations from "../(tabs)/organizations/page";
import Tables from "../(tabs)/tables/page";

it("owns four client section entrypoints and public search", async () => {
  render(
    <>
      <Groups />
      <Search />
      <Tables />
      {await Events({ searchParams: Promise.resolve({}) })}
    </>,
  );
  for (const value of ["groups:mine", "groups:public", "tables", "events:mine"])
    expect(screen.getByText(value)).not.toBeNull();
});
it.each(["available", "terminated", "unknown"])(
  "main Event navigation validates the presentation-only section %s",
  async (section) => {
    render(await Events({ searchParams: Promise.resolve({ section }) }));
    expect(
      screen.getByText(
        `events:${section === "available" || section === "terminated" ? section : "mine"}`,
      ),
    ).toBeTruthy();
  },
);
it("awaits framework params for unified detail routes", async () => {
  render(
    <>
      {await Group({ params: Promise.resolve({ groupId: "group-id" }) })}
      {await Event({ params: Promise.resolve({ eventId: "event-id" }) })}
    </>,
  );
  expect(screen.getByText("group-id")).not.toBeNull();
  expect(screen.getByText("event-id")).not.toBeNull();
});
it("legacy navigation cannot resurrect old editors or models", () => {
  expect(() => OldMatches()).toThrow("redirect:/tables");
  expect(() => OldOrganizations()).toThrow("redirect:/groups");
});

it.each([
  [OldEditTable, "/events"],
  [OldGroupOrganizations, "/events"],
  [OldMatch, "/tables"],
  [OldOrganization, "/groups"],
  [OldEditOrganization, "/groups"],
  [OldOrganizationEvents, "/groups"],
  [OldOrganizationInvite, "/groups"],
  [OldNewOrganization, "/groups"],
] as const)("keeps a retired entry point on its replacement route %s", (page, destination) => {
  expect(page).toThrow(`redirect:${destination}`);
});

it("redirects old Event results links to their encoded Event detail", async () => {
  await expect(
    OldEventResults({ params: Promise.resolve({ eventId: "friday / games" }) }),
  ).rejects.toThrow("redirect:/events/friday%20%2F%20games");
});
