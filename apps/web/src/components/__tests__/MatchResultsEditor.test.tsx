import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { MatchResultsEditor } from "../MatchResultsEditor";

const match = {
  id: "11111111-1111-4111-8111-111111111111",
  adminUserId: "user_admin",
  name: "Game night",
  dates: ["2026-10-01T20:00:00.000Z"],
  gameIds: [1],
  minPlayers: 2,
  maxPlayers: 4,
  invitedUserIds: ["user_one", "user_two"],
  status: "CREATED" as const,
  createdAt: "2026-10-01T20:00:00.000Z",
  updatedAt: "2026-10-01T20:00:00.000Z",
  invitations: [],
};
const players = ["user_one", "user_two"].map((id) => ({
  id,
  name: id === "user_one" ? "Anna" : "Luca",
  email: null,
  avatarUrl: null,
  invitation: {
    id: "22222222-2222-4222-8222-222222222222",
    matchId: match.id,
    inviterUserId: "user_admin",
    inviteeUserId: id,
    status: "ACCEPTED" as const,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
  },
}));
const data = {
  match,
  administrator: { id: "user_admin", name: "Marco", email: null, avatarUrl: null },
  invitedPlayers: players,
  games: [],
} as MatchDetailResponse;

it("keeps inputs fixed, resolves a three-way tie only in the preview and confirms with a short dialog", () => {
  const submit = vi.fn();
  renderWithI18n(
    <MatchResultsEditor data={data} busy={false} onBack={vi.fn()} onSubmit={submit} />,
  );
  const inputs = screen.getAllByRole("textbox", { name: /Score:/ });
  expect(
    (screen.getByRole("button", { name: "Register match" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  for (const input of inputs) fireEvent.change(input, { target: { value: "-1,5" } });
  expect(screen.getByRole("button", { name: "Resolve tie" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Resolve tie" }));
  fireEvent.click(screen.getByRole("button", { name: "Move up: Luca" }));
  fireEvent.click(screen.getByRole("button", { name: "Move up: Luca" }));
  expect(screen.getAllByRole("textbox", { name: /Score:/ })).toEqual(inputs);
  fireEvent.click(screen.getByRole("switch", { name: /Lowest score wins/ }));
  fireEvent.click(screen.getByRole("button", { name: "Register match" }));
  const dialog = screen.getByRole("dialog", { name: "Register match?" });
  expect(within(dialog).queryByText("Marco")).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "Register match" }));
  expect(submit).toHaveBeenCalledWith({
    lowerWins: true,
    entries: ["user_admin", "user_one", "user_two"].map((userId) => ({ userId, score: "-1.5" })),
    tieBreaks: [{ score: "-1.5", orderedUserIds: ["user_two", "user_admin", "user_one"] }],
  });
});

it("puts nonparticipants last with ND and requires at least one played score", () => {
  renderWithI18n(
    <MatchResultsEditor data={data} busy={false} onBack={vi.fn()} onSubmit={vi.fn()} />,
  );
  const switches = screen.getAllByRole("switch", { name: /Did not participate:/ });
  for (const toggle of switches) fireEvent.click(toggle);
  expect(
    (screen.getByRole("button", { name: "Register match" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(switches[0]);
  fireEvent.change(screen.getByRole("textbox", { name: "Score: Marco" }), {
    target: { value: "-" },
  });
  expect(screen.getByRole("alert").textContent).toBe("Enter a valid score");
  fireEvent.change(screen.getByRole("textbox", { name: "Score: Marco" }), {
    target: { value: "0" },
  });
  expect(
    (screen.getByRole("button", { name: "Register match" }) as HTMLButtonElement).disabled,
  ).toBe(false);
  expect(screen.queryByRole("button", { name: "Resolve tie" })).toBeNull();
});
