import { configure, measureRenders } from "@callstack/reassure-measure";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { test, vi } from "vitest";
import { AnimatedDicebearArtwork } from "@/components/common/ui/AnimatedDicebearArtwork";
import { EventCard } from "@/components/events/EventCard";
import { EventCardIndicators } from "@/components/events/EventCardIndicators";
import { EventTableCard } from "@/components/events/EventTableCard";
import { EventTableCardIndicators } from "@/components/events/EventTableCardIndicators";
import { GroupArtwork } from "@/components/groups/GroupArtwork";
import { GroupCard } from "@/components/groups/GroupCard";
import { GroupCardIndicators } from "@/components/groups/GroupCardIndicators";
import { groupRecord, plannedEvent, plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

// Authentication/API ownership is external to these controlled resource-card snapshots.
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    userId: "owner",
    apiUrl: "https://api.example.test",
    getToken: async () => null,
  }),
}));

configure({ testingLibrary: { render: renderWithI18n, cleanup }, runs: 10, warmupRuns: 1 });

const id = (index: number) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
const groupWindow = Array.from({ length: 12 }, (_, index) => ({
  ...groupRecord,
  id: id(index),
  name: `Group ${index + 1}`,
}));
const eventWindow = Array.from({ length: 12 }, (_, index) => ({
  ...plannedEvent,
  id: id(index),
  name: `Event ${index + 1}`,
}));
const tableWindow = Array.from({ length: 12 }, (_, index) => ({
  ...plannedTable,
  id: id(index),
  name: `Table ${index + 1}`,
}));

const cases: { name: string; element: ReactElement; scenario: () => Promise<void> }[] = [
  {
    name: "GroupCard: actual private-group card and generated artwork",
    element: <GroupCard group={groupRecord} />,
    scenario: async () => {
      screen.getByRole("link", { name: "Open group: Friday group" });
      screen.getByRole("button", { name: "Private" });
    },
  },
  {
    name: "EventCard: actual planning-event card and indicators",
    element: <EventCard event={plannedEvent} />,
    scenario: async () => {
      screen.getByRole("link", { name: "Open event: Friday games" });
      screen.getByRole("button", { name: "Private event" });
    },
  },
  {
    name: "EventTableCard: actual planning-table card and indicators",
    element: <EventTableCard table={plannedTable} />,
    scenario: async () => {
      screen.getByRole("link", { name: "Open table: Table #1" });
      screen.getByText("Friday games");
    },
  },
  {
    name: "GroupCard window: twelve cached private groups",
    element: (
      <div>
        {groupWindow.map((group) => (
          <GroupCard key={group.id} group={group} />
        ))}
      </div>
    ),
    scenario: async () => {
      screen.getByRole("link", { name: "Open group: Group 12" });
    },
  },
  {
    name: "EventCard window: twelve cached planning events",
    element: (
      <div>
        {eventWindow.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    ),
    scenario: async () => {
      screen.getByRole("link", { name: "Open event: Event 12" });
    },
  },
  {
    name: "EventTableCard window: twelve cached planning tables",
    element: (
      <div>
        {tableWindow.map((table) => (
          <EventTableCard key={table.id} table={table} />
        ))}
      </div>
    ),
    scenario: async () => {
      screen.getByRole("link", { name: "Open table: Table 12" });
    },
  },
  {
    name: "GroupCardIndicators: open real privacy explanation",
    element: <GroupCardIndicators group={groupRecord} />,
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Private" }));
      await screen.findByText("Private groups are invitation-only.");
    },
  },
  {
    name: "EventCardIndicators: open real event privacy explanation",
    element: <EventCardIndicators event={plannedEvent} />,
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Private event" }));
      await screen.findByText(
        "Participation is limited to authorized group members or invited users.",
      );
    },
  },
  {
    name: "EventTableCardIndicators: open real rating explanation",
    element: <EventTableCardIndicators table={plannedTable} />,
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Rating enabled" }));
      await screen.findByText(
        "This table contributes to player ratings when eligible results are finalized.",
      );
    },
  },
  {
    name: "GroupArtwork: generated deterministic resource image",
    element: <GroupArtwork group={groupRecord} />,
    scenario: async () => {
      const image = document.querySelector('[data-artwork-kind="groups"] img');
      if (!image?.getAttribute("src")?.startsWith("data:image/svg+xml,"))
        throw new Error("Expected a generated group image");
    },
  },
  ...(["groups", "events", "tables"] as const).map((variant) => ({
    name: `AnimatedDicebearArtwork: ${variant} detail background`,
    element: (
      <AnimatedDicebearArtwork seed="owned-resource" variant={variant} presentation="background" />
    ),
    scenario: async () => {
      const image = document.querySelector(`[data-artwork-kind="${variant}"] img`);
      if (!image?.getAttribute("src")?.startsWith("data:image/svg+xml,"))
        throw new Error("Expected generated resource artwork");
    },
  })),
];

for (const { name, element, scenario } of cases) {
  test(name, async () => {
    const result = await measureRenders(element, { scenario });
    assertRenderMeasurement(result, name);
  });
}
