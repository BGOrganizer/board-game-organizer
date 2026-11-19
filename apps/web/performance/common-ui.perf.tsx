import { configure, measureRenders } from "@callstack/reassure-measure";
import { Tabs } from "@heroui/react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { CalendarDays, Info, UsersRound } from "lucide-react";
import { type ReactElement, useState } from "react";
import { test } from "vitest";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { IconLegend } from "@/components/common/ui/IconLegend";
import { InvitationActions } from "@/components/common/ui/InvitationActions";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCard } from "@/components/common/ui/ListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { ListCardCoverContent } from "@/components/common/ui/ListCardCoverContent";
import { ListPage } from "@/components/common/ui/ListPage";
import { NotificationCountBadge } from "@/components/common/ui/NotificationCountBadge";
import { PendingArtworkBadge } from "@/components/common/ui/PendingArtworkBadge";
import { RecordIdentityCard } from "@/components/common/ui/RecordIdentityCard";
import { TabBar } from "@/components/common/ui/TabBar";
import { TabTrigger } from "@/components/common/ui/TabTrigger";
import { renderWithI18n } from "@/test-utils";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

configure({ testingLibrary: { render: renderWithI18n, cleanup }, runs: 10, warmupRuns: 1 });

const initialTime = "2030-06-12T17:00:00.000Z";
const members = Array.from({ length: 12 }, (_, index) => ({
  id: `member-${index + 1}`,
  name: `Member ${index + 1}`,
}));

function InvitationDecision() {
  const [decision, setDecision] = useState("No decision");
  return (
    <>
      <InvitationActions
        pending={false}
        onAccept={() => setDecision("Accepted")}
        onDecline={() => setDecision("Declined")}
      />
      <p>{decision}</p>
    </>
  );
}

function DetailTabs() {
  const [selected, setSelected] = useState("details");
  return (
    <Tabs selectedKey={selected} onSelectionChange={(key) => setSelected(String(key))}>
      <TabBar label="Resource sections">
        <TabTrigger id="details" icon={Info}>
          Details
        </TabTrigger>
        <TabTrigger id="members" icon={UsersRound}>
          Members
        </TabTrigger>
      </TabBar>
      <Tabs.Panel id="details">Resource details</Tabs.Panel>
      <Tabs.Panel id="members">Resource members</Tabs.Panel>
    </Tabs>
  );
}

const cases: { name: string; element: ReactElement; scenario: () => Promise<void> }[] = [
  {
    name: "EmptyList: accessible empty state",
    element: <EmptyList icon={<UsersRound aria-hidden />}>No resources</EmptyList>,
    scenario: async () => {
      screen.getByRole("status");
      screen.getByText("No resources");
    },
  },
  {
    name: "GroupedList and GroupedRow: twelve cached records",
    element: (
      <GroupedList>
        {members.map((member) => (
          <GroupedRow key={member.id}>{member.name}</GroupedRow>
        ))}
      </GroupedList>
    ),
    scenario: async () => {
      screen.getByText("Member 12");
    },
  },
  {
    name: "IconLegend: three role descriptions",
    element: (
      <IconLegend
        items={[
          { icon: UsersRound, description: "Participant" },
          { icon: Info, description: "Moderator" },
          { icon: CalendarDays, description: "Organiser" },
        ]}
      />
    ),
    scenario: async () => {
      screen.getByText("Participant");
      screen.getByText("Organiser");
    },
  },
  {
    name: "ListCard: full resource composition",
    element: (
      <ListCard>
        <ListCardBody title="Resource" unread>
          <p>Six members</p>
        </ListCardBody>
      </ListCard>
    ),
    scenario: async () => {
      screen.getByText("Resource");
      screen.getByRole("img", { name: "Unread updates" });
    },
  },
  {
    name: "ListCardBody: unread title, icon and metadata",
    element: (
      <ListCardBody title="Game night" titleIcon={<CalendarDays aria-hidden />} unread>
        <p>Friday evening</p>
      </ListCardBody>
    ),
    scenario: async () => {
      screen.getByText("Game night");
      screen.getByText("Friday evening");
    },
  },
  {
    name: "ListCardCoverContent: complete heading and control row",
    element: (
      <ListCard>
        <ListCardCoverContent
          artwork={<span>Artwork</span>}
          heading={<h2>Game night</h2>}
          controls={<button type="button">Show roles</button>}
        >
          <p>Six players</p>
        </ListCardCoverContent>
      </ListCard>
    ),
    scenario: async () => {
      screen.getByRole("heading", { name: "Game night" });
      screen.getByRole("button", { name: "Show roles" });
    },
  },
  {
    name: "LinkedListCard: cover layout with independent resource link",
    element: (
      <LinkedListCard
        href="#resource"
        label="Open resource"
        artwork={<span>Artwork</span>}
        artworkLayout="cover"
        heading={<h2>Group one</h2>}
        leadingActions={<button type="button">Visibility</button>}
      >
        <p>Six members</p>
      </LinkedListCard>
    ),
    scenario: async () => {
      screen.getByRole("link", { name: "Open resource" });
      screen.getByRole("button", { name: "Visibility" });
    },
  },
  {
    name: "ListPage: populated list with floating-action clearance",
    element: (
      <ListPage hasFloatingActions>
        <h1>Resources</h1>
        <GroupedList>
          <GroupedRow>First resource</GroupedRow>
        </GroupedList>
      </ListPage>
    ),
    scenario: async () => {
      screen.getByRole("heading", { name: "Resources" });
      screen.getByText("First resource");
    },
  },
  {
    name: "NotificationCountBadge: counted attention",
    element: <NotificationCountBadge count={123} counted corner />,
    scenario: async () => {
      screen.getByRole("img", { name: "Notifications: 123" });
      screen.getByText("99+");
    },
  },
  {
    name: "PendingArtworkBadge: invitation annotation",
    element: <PendingArtworkBadge kind="invitation" label="Invitation pending" />,
    scenario: async () => {
      screen.getByRole("img", { name: "Invitation pending" });
    },
  },
  {
    name: "RecordIdentityCard: full detail heading and metadata",
    element: (
      <RecordIdentityCard
        title="Group detail"
        icon={UsersRound}
        background={<svg aria-hidden />}
        titleAction={<button type="button">Updates</button>}
      >
        <span>Six members</span>
      </RecordIdentityCard>
    ),
    scenario: async () => {
      screen.getByRole("heading", { name: "Group detail" });
      screen.getByRole("button", { name: "Updates" });
    },
  },
  {
    name: "DateTimeInfo: date, start and end in the venue timezone",
    element: (
      <DateTimeInfo
        startsAt={initialTime}
        endsAt="2030-06-12T19:00:00.000Z"
        timeZone="Europe/Rome"
      />
    ),
    scenario: async () => {
      screen.getByText("Start time:");
      screen.getByText("End time:");
    },
  },
  {
    name: "InvitationActions: explicit accept and decline",
    element: <InvitationDecision />,
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
      await screen.findByText("Accepted");
      fireEvent.click(screen.getByRole("button", { name: "Decline invitation" }));
      await screen.findByText("Declined");
    },
  },
  {
    name: "TabBar and TabTrigger: real HeroUI detail-tab changes",
    element: <DetailTabs />,
    scenario: async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Members" }));
      await screen.findByText("Resource members");
      fireEvent.click(screen.getByRole("tab", { name: "Details" }));
      await screen.findByText("Resource details");
    },
  },
];

for (const { name, element, scenario } of cases) {
  test(name, async () => {
    const result = await measureRenders(element, { scenario });
    assertRenderMeasurement(result, name);
  });
}
