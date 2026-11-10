import type { ProfileActivity } from "@board-game-organizer/schemas";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { ProfileActivityRow } from "../ProfileActivityRow";
import { ProfileRatingChart } from "../ProfileRatingChart";
import { ProfileStats } from "../ProfileStats";

const base: ProfileActivity = {
  id: "activity",
  kind: "played",
  occurredAt: "2030-06-03T12:00:00.000Z",
  context: "Authorized source",
  href: "/groups/source",
  outcome: "won",
};
it("renders one complete sentence per result with all activity kinds and truthful fallbacks", () => {
  const view = renderWithI18n(
    <ul>
      <ProfileActivityRow item={base} />
    </ul>,
  );
  expect(screen.getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getByRole("listitem").textContent).toContain(
    "Someone played and won at table Authorized source.",
  );
  expect(screen.getByRole("link").getAttribute("href")).toBe("/groups/source");
  view.rerender(
    <ul>
      <ProfileActivityRow item={{ ...base, outcome: "played", href: null, context: null }} />
    </ul>,
  );
  expect(screen.getByRole("listitem").textContent).toContain(
    "Someone played at table Unavailable source.",
  );
  expect(screen.queryByRole("link")).toBeNull();
  for (const [kind, phrase] of [
    ["friendship", "became friends with"],
    ["event_join", "joined event"],
    ["table_join", "joined table"],
    ["group_join", "is now part of group"],
    ["follower", "started following"],
  ] as const) {
    view.rerender(
      <ul>
        <ProfileActivityRow item={{ ...base, kind, href: "/profiles/user", context: null }} />
      </ul>,
    );
    expect(screen.getByRole("listitem").textContent).toContain(phrase);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/profiles/user");
  }
  view.rerender(
    <ul>
      <ProfileActivityRow item={{ ...base, kind: "milestone", milestone: 100 }} />
    </ul>,
  );
  expect(screen.getByRole("listitem").textContent).toContain(
    "reached 100 victories at table Authorized source.",
  );
});
it("does not fabricate a curve with zero/one points and labels actual ordinal bounds", () => {
  const view = renderWithI18n(<ProfileRatingChart points={[]} />);
  expect(screen.getByText("Not enough ranked games for a chart")).not.toBeNull();
  expect(screen.queryByRole("img")).toBeNull();
  view.rerender(<ProfileRatingChart points={[{ ordinal: 1, rating: 500, delta: 0 }]} />);
  expect(screen.queryByRole("img")).toBeNull();
  view.rerender(
    <ProfileRatingChart
      points={[
        { ordinal: 5, rating: 500, delta: 1 },
        { ordinal: 6, rating: 510, delta: 10 },
      ]}
    />,
  );
  expect(
    screen
      .getByRole("img", { name: "OpenSkill rating history" })
      .querySelector("polyline")
      ?.getAttribute("points"),
  ).toBe("8,152 292,8");
  expect(screen.getByText("5")).not.toBeNull();
  expect(screen.getByText("6")).not.toBeNull();
});
it("reuses three compact semantic-token stat cards without losing long labels", () => {
  const { container } = renderWithI18n(
    <ProfileStats
      items={[
        { label: "Games played", value: "2" },
        { label: "Games won", value: "1" },
        { label: "Win rate", value: "50%" },
      ]}
    />,
  );
  expect(screen.getByText("50%").className).toContain("tabular-nums");
  expect(screen.getAllByText(/Games played|Games won|Win rate/)).toHaveLength(3);
  expect(container.firstElementChild?.className).toContain("grid-rows-[auto_auto]");
  expect(container.querySelectorAll(".grid-rows-subgrid")).toHaveLength(6);
  expect(container.querySelectorAll(".h-full")).toHaveLength(3);
});
