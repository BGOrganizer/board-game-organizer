import type { EventVote } from "@board-game-organizer/schemas";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { EventVoteButtons } from "../EventVoteButtons";
import { EventVoteCounts } from "../EventVoteCounts";

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
it("shows three authoritative totals, hides UNKNOWN and skeletons only missing totals", () => {
  const view = renderWithI18n(<EventVoteCounts label="Game" />);
  expect(view.container.querySelector(".skeleton")).not.toBeNull();
  view.rerender(
    <EventVoteCounts label="Game" counts={{ YES: 2, NO: 1, IF_NEEDED: 3, UNKNOWN: 4 }} />,
  );
  const counts = screen.getByLabelText("Votes: Game");
  expect(counts.tagName).toBe("DL");
  expect(within(counts).getByText("If needed")).not.toBeNull();
  expect(within(counts).getByText("2")).not.toBeNull();
  expect(within(counts).queryByText("4")).toBeNull();
  expect(within(counts).queryByText("Unknown")).toBeNull();
  expect(counts.querySelectorAll("dd")).toHaveLength(3);
});
