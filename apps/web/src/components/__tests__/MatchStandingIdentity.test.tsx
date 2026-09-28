import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MatchStandingIdentity } from "@/components/MatchStandingIdentity";
import { renderWithI18n } from "@/test-utils";

const player = { id: "user_admin", name: "Admin", email: "admin@example.com", avatarUrl: null };

describe("MatchStandingIdentity game rating", () => {
  it("shows the historical score and signed up, down or unchanged delta", () => {
    for (const [delta, label, number, color] of [
      [2.25, "Rating increased: +2.25", "+2.25", "text-success"],
      [-1.5, "Rating decreased: -1.50", "-1.50", "text-danger"],
      [0.001, "Rating unchanged: 0.00", "0.00", "text-warning"],
    ] as const) {
      const view = renderWithI18n(
        <MatchStandingIdentity
          player={player}
          rank={1}
          showGameRating
          gameRating={{ userId: player.id, score: 12.345, delta }}
        />,
      );
      expect(screen.getByText("12.35")).toBeTruthy();
      expect(screen.getByRole("img", { name: "Game rating" })).toBeTruthy();
      expect(screen.getByRole("img", { name: label }).textContent).toContain(number);
      expect(screen.getByRole("img", { name: label }).className).toContain(color);
      expect(screen.queryByText(player.email)).toBeNull();
      view.unmount();
    }
  });

  it("marks unrated matches unchanged without inventing a score, preserving editor email", () => {
    const view = renderWithI18n(<MatchStandingIdentity player={player} showGameRating />);
    expect(screen.getByText("Not rated")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Rating unchanged: 0.00" })).toBeTruthy();
    view.unmount();

    renderWithI18n(<MatchStandingIdentity player={player} />);
    expect(screen.getByText(player.email)).toBeTruthy();
    expect(screen.queryByText("Not rated")).toBeNull();
  });
});
