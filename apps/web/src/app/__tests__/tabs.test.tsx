import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/components/groups/GroupList", () => ({
  GroupList: ({ scope = "mine" }: { scope?: string }) => <p>groups:{scope}</p>,
}));
vi.mock("@/components/groups/GroupDetail", () => ({
  GroupDetail: ({ groupId }: { groupId: string }) => <p>{groupId}</p>,
}));
vi.mock("@/components/events/Tables", () => ({ Tables: () => <p>tables</p> }));
vi.mock("@/components/events/Events", () => ({ Events: () => <p>events</p> }));
vi.mock("@/components/events/EventDetail", () => ({
  EventDetail: ({ eventId }: { eventId: string }) => <p>{eventId}</p>,
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

import Event from "../(tabs)/events/[eventId]/page";
import Events from "../(tabs)/events/page";
import Group from "../(tabs)/groups/[groupId]/page";
import Groups from "../(tabs)/groups/page";
import Search from "../(tabs)/groups/search/page";
import OldMatches from "../(tabs)/matches/page";
import OldOrganizations from "../(tabs)/organizations/page";
import Tables from "../(tabs)/tables/page";

it("owns four client section entrypoints and public search", () => {
  render(
    <>
      <Groups />
      <Search />
      <Tables />
      <Events />
    </>,
  );
  for (const value of ["groups:mine", "groups:public", "tables", "events"])
    expect(screen.getByText(value)).not.toBeNull();
});
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
