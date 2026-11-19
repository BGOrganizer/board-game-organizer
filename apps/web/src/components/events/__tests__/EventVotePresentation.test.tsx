import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { EventSeatListHeading } from "../EventSeatListHeading";
import { EventTableRatingInfo } from "../EventTableRatingInfo";
import { EventVoteCounts } from "../EventVoteCounts";
import { EventVoteLegend } from "../EventVoteLegend";

it("shows pending vote counts as unavailable and updates to authoritative totals", () => {
  const view = renderWithI18n(<EventVoteCounts label="Friday evening" />);
  expect(view.container.querySelector("dl")).toBeNull();
  view.rerender(
    <EventVoteCounts label="Friday evening" counts={{ YES: 4, IF_NEEDED: 2, NO: 1, UNKNOWN: 0 }} />,
  );
  const counts = screen.getByLabelText("Votes: Friday evening");
  expect(within(counts).getByText("Yes")).toBeTruthy();
  expect(within(counts).getByText("If needed")).toBeTruthy();
  expect(within(counts).getByText("No")).toBeTruthy();
  expect([...counts.querySelectorAll("dd")].map((value) => value.textContent)).toEqual([
    "4",
    "2",
    "1",
  ]);
});

it.each(["event", "table"] as const)(
  "explains %s voting eligibility and a required positive preference",
  async (scope) => {
    renderWithI18n(<EventVoteLegend label="Options" scope={scope} />);
    fireEvent.click(screen.getByRole("button", { name: "Options: Voting legend" }));
    expect(
      await screen.findByText(
        scope === "table"
          ? "You can vote only if you are an accepted participant at this table."
          : "You can vote only if you are an accepted participant in at least one table in the event.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('Choose at least one "Yes" or "If needed" option in this category.'),
    ).toBeTruthy();
    expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getByText("If needed")).toBeTruthy();
    expect(screen.getByText("No")).toBeTruthy();
  },
);

it.each([false, true])(
  "describes accepted and waiting participation without granting consent, waiting=%s",
  async (waiting) => {
    const title = waiting ? "Waiting list" : "Seats list";
    renderWithI18n(<EventSeatListHeading waiting={waiting} />);
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: `${title}: Field help` }));
    if (waiting) {
      expect(
        await screen.findByText(
          "Accepted players on the waiting list can vote. They may play if an administrator or the app selects them according to the table's rules.",
        ),
      ).toBeTruthy();
    } else {
      expect(
        await screen.findByText("Pending invitations do not count toward agreement."),
      ).toBeTruthy();
      expect(screen.getByText("Accepted player")).toBeTruthy();
      expect(screen.getByText("Invitation pending")).toBeTruthy();
    }
  },
);

it.each([false, true])("explains finalized-rating behavior for enabled=%s", async (enabled) => {
  renderWithI18n(<EventTableRatingInfo enabled={enabled} />);
  fireEvent.click(
    screen.getByRole("button", { name: enabled ? "Rating enabled" : "Rating disabled" }),
  );
  expect(
    await screen.findByText(
      enabled
        ? "This table contributes to player ratings when eligible results are finalized."
        : "This table does not update player ratings.",
    ),
  ).toBeTruthy();
});
