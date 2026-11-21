import type { EventVote, OptionVoteVoters } from "@board-game-organizer/schemas";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { EventVoteButtons } from "../EventVoteButtons";
import { OptionVoteVoters as VoterList } from "../OptionVoteVoters";

it.each([
  ["YES", "Yes", "text-success"],
  ["NO", "No", "text-danger"],
  ["IF_NEEDED", "If needed", "text-warning"],
] as const)(
  "uses one secondary status button for %s with three explicit choices and cancellation",
  (value, text, color) => {
    const change = vi.fn();
    renderWithI18n(<EventVoteButtons label="Game" value={value} busy={false} onChange={change} />);
    const trigger = screen.getByRole("button", { name: `Game: ${text}` });
    expect(trigger.className).toContain("button--secondary");
    expect(trigger.querySelector("svg")?.getAttribute("class")).toContain(color);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Choose your vote" });
    expect(within(dialog).queryByRole("button", { name: "Unknown" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: text }));
    expect(change).toHaveBeenCalledWith(value);
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);
it("represents missing/historical ballots as an unselected prompt, never as a fabricated vote", () => {
  const change = vi.fn(),
    view = renderWithI18n(<EventVoteButtons label="Date" busy onChange={change} />);
  fireEvent.click(screen.getByRole("button", { name: "Date: Choose your vote" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  view.rerender(
    <EventVoteButtons label="Date" value={"invalid" as EventVote} busy={false} onChange={change} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Date: Choose your vote" }));
  expect(screen.queryByText("Unknown")).toBeNull();
  view.rerender(<EventVoteButtons label="Date" busy onChange={change} />);
  expect(
    (within(screen.getByRole("dialog")).getByRole("button", { name: "Yes" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(change).not.toHaveBeenCalled();
});
it("disables last-positive rejection but not switching between positive choices", () => {
  const change = vi.fn(),
    view = renderWithI18n(
      <EventVoteButtons
        label="Date"
        value="YES"
        busy={false}
        disabledVotes={["NO"]}
        onChange={change}
      />,
    );
  fireEvent.click(screen.getByRole("button", { name: "Date: Yes" }));
  const no = screen.getByRole("button", { name: "No" }) as HTMLButtonElement;
  expect(no.disabled).toBe(true);
  fireEvent.click(no);
  expect(change).not.toHaveBeenCalled();
  expect(
    screen.getByText("Keep at least one Yes or If needed among the available options."),
  ).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "If needed" }));
  expect(change).toHaveBeenCalledWith("IF_NEEDED");
  view.rerender(
    <EventVoteButtons
      label="Date"
      value="YES"
      busy={false}
      inline
      disabledVotes={["NO"]}
      onChange={change}
    />,
  );
  expect((screen.getByRole("button", { name: "Date: No" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.getAllByRole("button")).toHaveLength(3);
});
const voters: OptionVoteVoters = {
  YES: [
    { userId: "ella", name: "Ella Reed", username: "ella", avatarUrl: null },
    { userId: "jon", name: null, username: "jon", avatarUrl: null },
  ],
  IF_NEEDED: [],
  NO: [{ userId: "unknown", name: null, username: null, avatarUrl: null }],
};

it("shows compact voter avatars at the vote-icon size and omits empty choices", () => {
  const view = renderWithI18n(<VoterList label="Game" voters={voters} compact />);
  const summary = screen.getByRole("list", { name: "Votes: Game" });
  const yes = within(summary).getByRole("listitem", { name: "Yes: Ella Reed, @jon" });
  expect(yes.querySelector("svg")).toHaveAttribute("width", "16");
  expect(yes.querySelector("svg")).toHaveAttribute("height", "16");
  const avatars = yes.querySelectorAll(".avatar.size-4");
  expect(avatars).toHaveLength(2);
  expect(avatars[0]).toHaveClass("pointer-coarse:translate-x-3");
  expect(avatars[1]).toHaveClass("pointer-coarse:-translate-x-3");
  expect(within(summary).getByRole("listitem", { name: "No: Unknown" })).toBeVisible();
  expect(within(summary).getAllByRole("listitem")).toHaveLength(2);
  expect(within(summary).queryByRole("listitem", { name: /If needed/ })).toBeNull();
  view.rerender(<VoterList label="Game" voters={{ YES: [], IF_NEEDED: [], NO: [] }} compact />);
  expect(screen.queryByRole("list", { name: "Votes: Game" })).toBeNull();
});

it("opens a read-only identity row from a voter avatar and dismisses it with Escape", async () => {
  renderWithI18n(<VoterList label="Game" voters={voters} compact />);
  const avatar = screen.getByRole("button", { name: "Ella Reed (Yes)" });
  fireEvent.click(avatar);
  const dialog = await screen.findByRole("dialog", { name: "Ella Reed" });
  expect(within(dialog).getByText("Ella Reed")).toBeVisible();
  expect(within(dialog).getByText("@ella")).toBeVisible();
  expect(within(dialog).queryByRole("button")).toBeNull();
  expect(within(dialog).queryByRole("link")).toBeNull();
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("opens the bottom drawer from the Ghost action without casting a vote", async () => {
  const change = vi.fn();
  renderWithI18n(
    <EventVoteButtons label="Game" value="YES" busy={false} onChange={change} voters={voters} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Game: Yes" }));
  const dialog = screen.getByRole("dialog", { name: "Choose your vote" });
  const show = within(dialog).getByRole("button", { name: "Show votes" });
  expect(show).toHaveClass("button--ghost");
  expect(within(dialog).getAllByRole("button").at(-1)).toBe(show);
  fireEvent.click(show);

  const drawer = await screen.findByRole("dialog", { name: "Votes" });
  expect(drawer.closest(".drawer__content--bottom")).not.toBeNull();
  expect(screen.queryByRole("dialog", { name: "Choose your vote" })).toBeNull();
  const yes = within(drawer).getByRole("tabpanel", { name: "Yes" });
  expect(within(yes).getByText("Ella Reed")).toBeVisible();
  expect(within(yes).getByText("@ella")).toBeVisible();
  expect(within(yes).getByText("@jon")).toBeVisible();
  expect(
    within(drawer).getByRole("tab", { name: "Yes", selected: true }).querySelector("svg"),
  ).toHaveClass("text-success");
  const ifNeededTab = within(drawer).getByRole("tab", { name: "If needed" });
  expect(ifNeededTab.querySelector("svg")).toHaveClass("text-warning");
  fireEvent.click(ifNeededTab);
  const ifNeeded = within(drawer).getByRole("tabpanel", { name: "If needed" });
  expect(within(drawer).queryByText("Ella Reed")).toBeNull();
  expect(within(ifNeeded).getByText("No votes")).toBeVisible();
  const noTab = within(drawer).getByRole("tab", { name: "No" });
  expect(noTab.querySelector("svg")).toHaveClass("text-danger");
  fireEvent.click(noTab);
  expect(
    within(within(drawer).getByRole("tabpanel", { name: "No" })).getByText("Unknown"),
  ).toBeVisible();
  expect(change).not.toHaveBeenCalled();

  fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog", { name: "Votes" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Game: Yes" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "If needed" }));
  expect(change).toHaveBeenCalledExactlyOnceWith("IF_NEEDED");
});

it("shows a read-only breakdown without a ballot action", async () => {
  const change = vi.fn();
  renderWithI18n(
    <EventVoteButtons label="Game" busy={false} onChange={change} voters={voters} readOnly />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Game: Show votes" }));
  const drawer = await screen.findByRole("dialog", { name: "Votes" });
  expect(within(drawer).getAllByRole("tab")).toHaveLength(3);
  expect(within(drawer).queryByRole("button", { name: "Yes" })).toBeNull();
  expect(screen.queryByRole("dialog", { name: "Choose your vote" })).toBeNull();
  fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
  expect(change).not.toHaveBeenCalled();
});

it("leaves only the three inline choices during enrollment even with voter data", () => {
  const change = vi.fn();
  renderWithI18n(
    <EventVoteButtons label="Game" busy={false} onChange={change} voters={voters} inline />,
  );
  expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
    "Game: Yes",
    "Game: If needed",
    "Game: No",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Game: Yes" }));
  expect(change).toHaveBeenCalledExactlyOnceWith("YES");
  expect(screen.queryByRole("dialog")).toBeNull();
});
