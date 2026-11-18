import { configure, measureRenders } from "@callstack/reassure-measure";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { Check, Info, ShieldCheck, UsersRound } from "lucide-react";
import { type ReactElement, useState } from "react";
import { test } from "vitest";
import { ContactConfirmDialog } from "@/components/common/ui/ContactConfirmDialog";
import { FilterChips } from "@/components/common/ui/FilterChips";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { GroupBanDialog } from "@/components/common/ui/GroupBanDialog";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconBadge } from "@/components/common/ui/IconBadge";
import { InfoSection } from "@/components/common/ui/InfoSection";
import { ListSearch } from "@/components/common/ui/ListSearch";
import { ListSearchFilters } from "@/components/common/ui/ListSearchFilters";
import { MemberActions } from "@/components/common/ui/MemberActions";
import { NameInput } from "@/components/common/ui/NameInput";
import { SearchHelpLabel } from "@/components/common/ui/SearchHelpLabel";
import { SearchInput } from "@/components/common/ui/SearchInput";
import { UserAvatar } from "@/components/common/ui/UserAvatar";
import { UserIdentity } from "@/components/common/ui/UserIdentity";
import { UserRelationshipBadge } from "@/components/common/ui/UserRelationshipBadge";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { WizardSteps } from "@/components/common/ui/WizardSteps";
import { renderWithI18n } from "@/test-utils";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

configure({ testingLibrary: { render: renderWithI18n, cleanup }, runs: 10, warmupRuns: 1 });

function Search() {
  const [query, setQuery] = useState("Cascadia");
  return (
    <SearchInput value={query} onChange={setQuery} label="Find a game" placeholder="Game name" />
  );
}

function FilterList() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<"owned"[]>([]);
  return (
    <ListSearch
      query={query}
      onQueryChange={setQuery}
      label="Filter resources"
      placeholder="Resource name"
      mode="filter"
      options={[{ key: "owned", label: "Owned", icon: UsersRound }]}
      selected={selected}
      onToggle={() => setSelected((previous) => (previous.length ? [] : ["owned"]))}
    />
  );
}

function FilterRoles() {
  const [query, setQuery] = useState("");
  const [roles, setRoles] = useState<("admin" | "accepted" | "invited")[]>([]);
  return (
    <ListSearchFilters
      query={query}
      onQueryChange={setQuery}
      roles={roles}
      onToggle={(role) =>
        setRoles((previous) =>
          previous.includes(role)
            ? previous.filter((value) => value !== role)
            : [...previous, role],
        )
      }
      label="Find people"
      placeholder="Name"
    />
  );
}

function ToggleFilter() {
  const [selected, setSelected] = useState<"owned"[]>([]);
  return (
    <FilterChips
      options={[{ key: "owned", label: "Owned", icon: Check }]}
      selected={selected}
      onToggle={() => setSelected((previous) => (previous.length ? [] : ["owned"]))}
    />
  );
}

function BadgeAction() {
  const [locked, setLocked] = useState(false);
  return (
    <IconBadge
      icon={ShieldCheck}
      label={locked ? "Unlock player" : "Lock player"}
      onPress={() => setLocked((previous) => !previous)}
    />
  );
}

function EditAction() {
  const [opened, setOpened] = useState(false);
  return (
    <>
      <FloatingActions label="Edit group" onPress={() => setOpened(true)}>
        <Info aria-hidden />
      </FloatingActions>
      {opened ? <p>Editor opened</p> : null}
    </>
  );
}

function ConfirmRemoval() {
  const [completed, setCompleted] = useState(false);
  return completed ? (
    <p>Friend removed</p>
  ) : (
    <ContactConfirmDialog
      title="Remove friend"
      description="Remove this friendship?"
      onCancel={() => setCompleted(true)}
      actions={[{ label: "Remove", variant: "danger", onPress: () => setCompleted(true) }]}
    />
  );
}

function ConfirmBan() {
  const [completed, setCompleted] = useState(false);
  return completed ? (
    <p>Exclusion submitted</p>
  ) : (
    <GroupBanDialog
      name="Alice"
      timeZone="UTC"
      busy={false}
      onCancel={() => setCompleted(true)}
      onConfirm={() => setCompleted(true)}
    />
  );
}

function ManageMember() {
  const [chosen, setChosen] = useState("");
  return (
    <>
      <MemberActions
        title="Manage Alice"
        busy={false}
        items={[{ action: "remove", label: "Remove member", icon: <UsersRound aria-hidden /> }]}
        onAction={setChosen}
      />
      {chosen ? <p>Action: {chosen}</p> : null}
    </>
  );
}

const cases: { name: string; element: ReactElement; scenario: () => Promise<void> }[] = [
  {
    name: "UserAvatar: online user with two real visual badges",
    element: (
      <UserAvatar
        name="Alice Smith"
        online
        badge={<IconBadge icon={UsersRound} label="Accepted member" />}
        topBadge={<IconBadge icon={ShieldCheck} label="Locked player" />}
      />
    ),
    scenario: async () => {
      screen.getByRole("img", { name: "Online" });
      screen.getByRole("img", { name: "Accepted member" });
      screen.getByRole("img", { name: "Locked player" });
    },
  },
  {
    name: "UserIdentity: full name, mandatory username and metadata",
    element: (
      <UserIdentity name="Alice Smith" secondary="@alice" titleAccessory={<span>Moderator</span>}>
        <p>Joined recently</p>
      </UserIdentity>
    ),
    scenario: async () => {
      screen.getByText("Alice Smith");
      screen.getByText("@alice");
      screen.getByText("Moderator");
    },
  },
  {
    name: "UserRelationshipBadge: reveal all independent relationships",
    element: (
      <UserRelationshipBadge
        user={{
          id: "alice",
          isFriend: true,
          isFollower: true,
          isFollowing: true,
          blockedByMe: false,
        }}
      />
    ),
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Friends · Following · Followers" }));
      await screen.findByText("Friendship accepted.");
      screen.getByText("People you follow.");
      screen.getByText("People who follow you.");
    },
  },
  {
    name: "UserRoleBadge: reveal independent moderator and participant roles",
    element: <UserRoleBadge roles={["moderator", "acceptedParticipant"]} />,
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Moderator · Accepted participant" }));
      await screen.findByText("Moderator");
      screen.getByText("Accepted participant");
    },
  },
  {
    name: "IconBadge: run the explicit lock toggle action",
    element: <BadgeAction />,
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Lock player" }));
      await screen.findByRole("button", { name: "Unlock player" });
    },
  },
  {
    name: "HelpPopover: open the actual informational overlay",
    element: (
      <HelpPopover label="Read details" title="Details">
        <p>Actual information</p>
      </HelpPopover>
    ),
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Read details" }));
      await screen.findByText("Actual information");
    },
  },
  {
    name: "SearchHelpLabel: reveal real filter guidance",
    element: (
      <>
        <SearchHelpLabel
          label="Filter events"
          htmlFor="events-filter"
          help="Filter this list by name."
        />
        <input id="events-filter" />
      </>
    ),
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Filter events: Search help" }));
      await screen.findByText("Filter this list by name.");
    },
  },
  {
    name: "SearchInput: controlled text editing and clear action",
    element: <Search />,
    scenario: async () => {
      const field = screen.getByRole("searchbox", { name: "Find a game" });
      fireEvent.change(field, { target: { value: "Ark Nova" } });
      if ((field as HTMLInputElement).value !== "Ark Nova")
        throw new Error("Expected the controlled search value");
      fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
      if ((field as HTMLInputElement).value !== "") throw new Error("Expected search to clear");
    },
  },
  {
    name: "NameInput: random-name control with resource limits",
    element: <NameInput category="evento" aria-label="Event name" onGenerate={() => {}} />,
    scenario: async () => {
      screen.getByRole("textbox", { name: "Event name" });
      screen.getByRole("button", { name: "Generate a random name" });
    },
  },
  {
    name: "FilterChips: controlled role filter selection",
    element: <ToggleFilter />,
    scenario: async () => {
      const button = screen.getByRole("button", { name: "Owned" });
      fireEvent.click(button);
      if (button.getAttribute("aria-pressed") !== "true")
        throw new Error("Expected selected filter");
    },
  },
  {
    name: "ListSearch: controlled filter text and selection",
    element: <FilterList />,
    scenario: async () => {
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Friday" } });
      fireEvent.click(screen.getByRole("button", { name: "Owned" }));
      screen.getByRole("button", { name: "Clear filter" });
    },
  },
  {
    name: "ListSearchFilters: actual relationship role filters",
    element: <FilterRoles />,
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Admin" }));
      if (screen.getByRole("button", { name: "Admin" }).getAttribute("aria-pressed") !== "true")
        throw new Error("Expected the selected admin role");
    },
  },
  {
    name: "WizardSteps: five progress steps",
    element: <WizardSteps current={3} count={5} />,
    scenario: async () => {
      const step = screen.getByText("3");
      if (step.getAttribute("aria-current") !== "step")
        throw new Error("Expected current wizard step");
    },
  },
  {
    name: "FloatingActions: open the editor through the real button",
    element: <EditAction />,
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Edit group" }));
      await screen.findByText("Editor opened");
    },
  },
  {
    name: "InfoSection: labeled rows and informational overlay",
    element: (
      <InfoSection
        label="Places"
        helpLabel="Places help"
        help="Vote for a proposed place."
        icon={Info}
      >
        <li>Community centre</li>
      </InfoSection>
    ),
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Places help" }));
      await screen.findByText("Vote for a proposed place.");
    },
  },
  {
    name: "ContactConfirmDialog: explicit destructive confirmation",
    element: <ConfirmRemoval />,
    scenario: async () => {
      await screen.findByRole("dialog", { name: "Remove friend" });
      fireEvent.click(screen.getByRole("button", { name: "Remove" }));
      await screen.findByText("Friend removed");
    },
  },
  {
    name: "GroupBanDialog: explicit permanent group exclusion",
    element: <ConfirmBan />,
    scenario: async () => {
      await screen.findByRole("dialog", { name: "Ban from group: Alice" });
      fireEvent.click(screen.getByRole("button", { name: "Ban from group" }));
      await screen.findByText("Exclusion submitted");
    },
  },
  {
    name: "MemberActions: open real manager actions and choose one",
    element: <ManageMember />,
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Manage Alice" }));
      const action = await screen.findByRole("button", { name: "Remove member" });
      fireEvent.click(action);
      await screen.findByText("Action: remove");
    },
  },
];

for (const { name, element, scenario } of cases) {
  test(name, async () => {
    const result = await measureRenders(element, { scenario });
    assertRenderMeasurement(result, name);
  });
}
