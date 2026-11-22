import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { EventTableParticipantsHelp } from "../EventTableParticipantsHelp";
import { EventTableRatingInfo } from "../EventTableRatingInfo";
import { EventVoteLegend } from "../EventVoteLegend";

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

it.each([true, false])(
  "describes participation in the shared help (planning=%s)",
  async (planning) => {
    renderWithI18n(<EventTableParticipantsHelp planning={planning} />);
    expect(screen.getByRole("heading", { name: "Participants" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Table participants help" }));
    const help = within(await screen.findByRole("dialog"));
    for (const label of [
      "Accepted player",
      "Invitation pending",
      "Player on the waiting list",
      "Demonstrator",
      "Guest",
    ]) {
      expect(help.getByText(label).closest("li")?.querySelector("svg")).not.toBeNull();
    }
    if (planning) {
      expect(help.getByText("Pending invitations do not count toward agreement.")).toBeVisible();
      expect(help.getByText(/can assign them a seat under the table's rules/)).toBeVisible();
    } else {
      expect(
        help.getByText("Only players with a confirmed seat take part at this table."),
      ).toBeVisible();
      expect(help.queryByText(/can assign them a seat/)).toBeNull();
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
