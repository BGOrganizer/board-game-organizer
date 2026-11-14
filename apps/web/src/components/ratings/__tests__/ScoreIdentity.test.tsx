import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { messages as en } from "../../../../../../messages/en.js";
import { messages as italian } from "../../../../../../messages/it.js";
import { ScoreIdentity } from "../ScoreIdentity";

const player = {
  id: "player",
  name: "Player",
  username: "player-handle",
  avatarUrl: "/avatar.png",
  email: null,
};
for (const locale of ["en", "it"] as const)
  it.each([1, 2])(
    "keeps position %s visible and opens a localized avatar explanation (" + locale + ")",
    async (rank) => {
      renderWithI18n(
        <I18nProvider i18n={setupI18n({ locale, messages: { en, it: italian } })}>
          <ScoreIdentity player={player} rank={rank} />
        </I18nProvider>,
      );
      const position = locale === "it" ? "Posizione" : "Position";
      expect(screen.getByText(`${position}: #${rank}`)).toBeTruthy();
      expect(screen.getByText(player.username)).toBeTruthy();
      const badge = screen.getByRole("button", { name: `${position}: #${rank}` });
      expect(
        badge.querySelector(rank === 1 ? ".lucide-trophy" : ".lucide-list-ordered"),
      ).toBeTruthy();
      expect(badge.querySelector("[data-slot=chip]")?.className).toContain(
        rank === 1 ? "chip--success" : "chip--default",
      );
      fireEvent.click(badge);
      const dialog = await screen.findByRole("dialog", { name: position });
      expect(within(dialog).getByText(`#${rank}`)).toBeTruthy();
    },
  );

it.each([null, undefined])("does not invent a rank or reserve a badge gap for %s", (rank) => {
  const { container } = renderWithI18n(
    <ScoreIdentity player={{ ...player, name: "", username: null, avatarUrl: null }} rank={rank} />,
  );
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.queryByText(/Position:/)).toBeNull();
  expect(screen.getByText("Username unavailable")).toBeTruthy();
  expect(screen.getByText("?")).toBeTruthy();
  expect((container.firstElementChild as HTMLElement).style.marginRight).toBe("0px");
});

it("preserves the existing game rating and delta when a rank is displayed", () => {
  const rating = { userId: player.id, score: 501.25, delta: 1.25, provisional: false };
  const { rerender } = renderWithI18n(
    <ScoreIdentity player={player} rank={1} showGameRating gameRating={rating} />,
  );
  expect(screen.getByRole("img", { name: "Game rating" })).toBeTruthy();
  expect(screen.getByText("501.25")).toBeTruthy();
  expect(screen.getByText("+1.25")).toBeTruthy();
  expect(screen.getByText("Position: #1")).toBeTruthy();
  expect(screen.queryByText(player.username)).toBeNull();
  rerender(<ScoreIdentity player={player} showGameRating />);
  expect(screen.getByText("Not rated")).toBeTruthy();
});
