import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GameRating, MatchStandingIdentity } from "@/components/MatchStandingIdentity";
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
          gameRating={{ userId: player.id, score: 512.345, delta, provisional: false }}
        />,
      );
      expect(screen.getByText("512.35")).toBeTruthy();
      expect(screen.getByRole("img", { name: "Game rating" })).toBeTruthy();
      expect(screen.getByRole("img", { name: label }).textContent).toContain(number);
      expect(screen.getByRole("img", { name: label }).className).toContain(color);
      expect(screen.queryByText(player.email)).toBeNull();
      view.unmount();
    }
  });

  it("marks provisional ratings and switches to the regular icon after five rated matches", () => {
    const view = renderWithI18n(<GameRating rating={{ score: 500, provisional: true }} />);
    expect(screen.getByRole("img", { name: "Provisional game rating" })).toBeTruthy();
    expect(screen.getByText("500.00")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /Rating unchanged/ })).toBeNull();
    view.unmount();

    renderWithI18n(<GameRating rating={{ score: 498.17, provisional: false }} />);
    expect(screen.getByRole("img", { name: "Game rating" })).toBeTruthy();
    expect(screen.getByText("498.17")).toBeTruthy();
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
