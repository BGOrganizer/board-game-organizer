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
    {
      userId: "ella",
      name: "Ella Reed",
      username: "ella",
      avatarUrl: null,
      role: "acceptedParticipant",
    },
    { userId: "jon", name: null, username: "jon", avatarUrl: null },
  ],
  IF_NEEDED: [],
  NO: [{ userId: "unknown", name: null, username: null, avatarUrl: null }],
};

it("overlaps decorative avatars and separates only the choices that have votes", () => {
  const view = renderWithI18n(<VoterList label="Game" voters={voters} />);
  const summary = screen.getByRole("list", { name: "Votes: Game" });
  const yes = within(summary).getByRole("listitem", { name: "Yes: Ella Reed, @jon" });
  expect(yes.querySelector("svg")).toHaveAttribute("width", "16");
  const avatars = yes.querySelectorAll(".avatar.size-4");
  expect(avatars).toHaveLength(2);
  for (const avatar of avatars) {
    expect(avatar).toHaveClass("-ms-1");
    expect(avatar.parentElement).toHaveAttribute("aria-hidden", "true");
  }
  fireEvent.click(avatars[0]);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(within(yes).getAllByRole("button")).toHaveLength(1);
  expect(within(yes).getByRole("button")).toHaveClass("size-7", "justify-center", "p-0");
  expect(within(summary).getAllByRole("listitem")).toHaveLength(2);
  expect(yes.querySelector(":scope > span[aria-hidden]")).toBeNull();
  const no = within(summary).getByRole("listitem", { name: "No: Unknown" });
  expect(no.querySelector(":scope > span[aria-hidden]")).toHaveClass("bg-muted");
  expect(within(summary).queryByRole("button", { name: /If needed/ })).toBeNull();
  view.rerender(<VoterList label="Game" voters={{ YES: [], IF_NEEDED: [], NO: [] }} />);
  expect(screen.queryByRole("list", { name: "Votes: Game" })).toBeNull();
});

it.each([
  ["Yes", "@ella"],
  ["If needed", "@Guest Carla"],
  ["No", "Username unavailable"],
])(
  "opens the existing breakdown directly on %s and resets to that choice on reopen",
  async (choice, voter) => {
    renderWithI18n(
      <VoterList
        label="Game"
        voters={{
          ...voters,
          IF_NEEDED: [
            {
              userId: "guest:carla",
              guestName: "Guest Carla",
              name: null,
              username: null,
              avatarUrl: null,
            },
          ],
        }}
      />,
    );
    const trigger = screen.getByRole("button", { name: `Game: Show votes — ${choice}` });
    fireEvent.click(trigger);
    const drawer = await screen.findByRole("dialog", { name: "Votes" });
    expect(drawer.closest(".drawer__content--bottom")).not.toBeNull();
    expect(within(drawer).getByRole("tab", { name: choice, selected: true })).toBeVisible();
    expect(
      within(within(drawer).getByRole("tabpanel", { name: choice })).getByText(voter),
    ).toBeVisible();
    fireEvent.click(within(drawer).getByRole("tab", { name: choice === "Yes" ? "No" : "Yes" }));
    fireEvent.keyDown(drawer, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger);
    expect(await screen.findByRole("tab", { name: choice, selected: true })).toBeVisible();
  },
);

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
  expect(within(yes).queryByText("Ella Reed")).toBeNull();
  expect(within(yes).getByText("@ella")).toBeVisible();
  expect(within(yes).getByText("@jon")).toBeVisible();
  expect(
    within(drawer).getByRole("tab", { name: "Yes", selected: true }).querySelector("svg"),
  ).toHaveClass("text-success");
  const ifNeededTab = within(drawer).getByRole("tab", { name: "If needed" });
  expect(ifNeededTab.querySelector("svg")).toHaveClass("text-warning");
  fireEvent.click(ifNeededTab);
  const ifNeeded = within(drawer).getByRole("tabpanel", { name: "If needed" });
  expect(within(drawer).queryByText("@ella")).toBeNull();
  expect(within(ifNeeded).getByText("No votes")).toBeVisible();
  const noTab = within(drawer).getByRole("tab", { name: "No" });
  expect(noTab.querySelector("svg")).toHaveClass("text-danger");
  fireEvent.click(noTab);
  expect(
    within(within(drawer).getByRole("tabpanel", { name: "No" })).getByText("Username unavailable"),
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
