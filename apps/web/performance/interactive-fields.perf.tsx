import type { EventVote, OptionVoteVoters as VoteRoster } from "@board-game-organizer/schemas";
import { Label } from "@heroui/react";
import { fireEvent, screen, within } from "@testing-library/react";
import { UsersRound } from "lucide-react";
import { useState } from "react";
import { expect, vi } from "vitest";
import { AddUserRow } from "@/components/common/ui/AddUserRow";
import { DateTimePicker } from "@/components/common/ui/DateTimePicker";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GuestNameRow } from "@/components/common/ui/GuestNameRow";
import { HelpSectionCard } from "@/components/common/ui/HelpSectionCard";
import { EventVoteButtons } from "@/components/events/EventVoteButtons";
import { OptionVoteVoters } from "@/components/events/OptionVoteVoters";
import { LocationListRow } from "@/components/locations/LocationListRow";
import { enterDateTime } from "@/test-fixtures/dateTime";
import { measureWebFeature } from "./featureScenario";

const dateConfirmation = vi.fn();
function Appointment() {
  const [date, setDate] = useState("2030-06-03T20:00");
  return (
    <>
      <DateTimePicker
        value={date}
        onChange={setDate}
        onConfirm={dateConfirmation}
        label={<Label>Appointment</Label>}
      />
      <output>{date}</output>
    </>
  );
}

measureWebFeature(
  "DateTimePicker: select day and time in one popover and confirm only with Done",
  <Appointment />,
  async () => {
    fireEvent.click(within(screen.getByRole("group", { name: "Appointment" })).getByRole("button"));
    const picker = within(await screen.findByRole("dialog", { name: "Choose date and time" }));
    const grid = within(picker.getByRole("grid"));
    fireEvent.click(grid.getByText("15", { exact: true }));
    enterDateTime(picker.getByRole("group", { name: "Time" }), "21:45");
    expect(dateConfirmation).not.toHaveBeenCalled();
    fireEvent.click(picker.getByRole("button", { name: "Done" }));
    expect(dateConfirmation).toHaveBeenCalledExactlyOnceWith("2030-06-15T21:45");
    expect(screen.getByRole("status")).toHaveTextContent("2030-06-15T21:45");
    expect(screen.queryByRole("dialog")).toBeNull();
  },
  () => dateConfirmation.mockClear(),
);

function GuestSelection() {
  const [guest, setGuest] = useState("");
  const [showEntry, setShowEntry] = useState(false);
  return (
    <>
      <GroupedList>
        <AddUserRow label="Add a demonstrator" onPress={() => setShowEntry(true)} />
      </GroupedList>
      {showEntry ? (
        <GuestNameRow
          maxLength={30}
          onAdd={(name, reset) => {
            setGuest(name);
            reset();
          }}
        />
      ) : null}
      {guest && <p>Demonstrator: {guest}</p>}
    </>
  );
}
measureWebFeature(
  "GuestNameRow: choose a guest demonstrator through the real compact controls",
  <GuestSelection />,
  () => {
    fireEvent.click(screen.getByRole("button", { name: "Add a demonstrator" }));
    const input = screen.getByRole("textbox", { name: "Guest name" });
    const add = screen.getByRole("button", { name: "Add a guest" });
    expect(add).toBeDisabled();
    fireEvent.change(input, { target: { value: "  Ada  " } });
    fireEvent.click(add);
    expect(screen.getByText("Demonstrator: Ada")).toBeVisible();
    expect(input).toHaveValue("");
    expect(add).toBeDisabled();
  },
);

const voters: VoteRoster = {
  YES: [{ userId: "ada", name: "Ada Player", username: "ada", avatarUrl: null }],
  IF_NEEDED: [],
  NO: [{ userId: "bob", name: "Bob Player", username: "bob", avatarUrl: null }],
};
const voteChange = vi.fn();
function LocationBallot() {
  const [current, setCurrent] = useState<EventVote>("YES");
  return (
    <GroupedList>
      <LocationListRow
        name="Club room"
        address="Via Roma 1"
        disclosure={{
          label: "Vote summary: Club room",
          triggerText: "Votes",
          content: <OptionVoteVoters label="Club room" voters={voters} />,
        }}
        actions={
          <EventVoteButtons
            label="Club room"
            value={current}
            busy={false}
            voters={voters}
            onChange={(next) => {
              setCurrent(next);
              voteChange(next);
            }}
          />
        }
      />
    </GroupedList>
  );
}

measureWebFeature(
  "EventVoteButtons: browse vote tabs, then cast one explicit alternative",
  <LocationBallot />,
  async () => {
    const summary = screen.getByRole("button", { name: "Vote summary: Club room, Via Roma 1" });
    expect(summary).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(summary);
    expect(screen.getByLabelText("Votes: Club room")).toBeVisible();
    fireEvent.click(summary);
    expect(summary).toHaveAttribute("aria-expanded", "false");
    const trigger = screen.getByRole("button", { name: "Club room: Yes" });
    fireEvent.click(trigger);
    const choice = within(screen.getByRole("dialog", { name: "Choose your vote" }));
    fireEvent.click(choice.getByRole("button", { name: "Show votes" }));
    const votes = within(await screen.findByRole("dialog", { name: "Votes" }));
    expect(votes.getByText("@ada")).toBeVisible();
    expect(votes.queryByText("Ada Player")).toBeNull();
    fireEvent.click(votes.getByRole("tab", { name: "If needed" }));
    expect(votes.getByText("No votes")).toBeVisible();
    fireEvent.click(votes.getByRole("tab", { name: "No" }));
    expect(votes.getByText("@bob")).toBeVisible();
    expect(voteChange).not.toHaveBeenCalled();
    fireEvent.click(votes.getByRole("button", { name: "Close" }));
    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "If needed" }));
    expect(voteChange).toHaveBeenCalledExactlyOnceWith("IF_NEEDED");
    expect(screen.getByRole("button", { name: "Club room: If needed" })).toBeVisible();
  },
  () => voteChange.mockClear(),
);

measureWebFeature(
  "HelpSectionCard: open and close the section guide",
  <HelpSectionCard title="Participants" label="Participant guide" icon={UsersRound}>
    <p>Check who is seated and who is waiting.</p>
  </HelpSectionCard>,
  async () => {
    expect(screen.getByRole("heading", { name: "Participants" })).toBeVisible();
    expect(screen.getByText("Section guide")).toBeVisible();
    const help = screen.getByRole("button", { name: "Participant guide" });
    fireEvent.click(help);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Check who is seated and who is waiting.")).toBeVisible();
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
  },
);
