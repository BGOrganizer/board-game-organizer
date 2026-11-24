import { newTableDraft } from "@board-game-organizer/shared";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { enterDateTime } from "@/test-fixtures/dateTime";
import { renderWithI18n } from "@/test-utils";
import { EventDraftTableEditor } from "../EventDraftTableEditor";

it("fixes the public table date, exposes only bounded time and uses a grouped demonstrator item", () => {
  const onChange = vi.fn(),
    onDemonstrator = vi.fn();
  const { container } = renderWithI18n(
    <EventDraftTableEditor
      row={{
        ...newTableDraft("draft"),
        startsWall: "2030-06-03T20:01",
        games: [{ id: 1, name: "Test game", maxPlayMinutes: 60, year: null, imageUrl: null }],
      }}
      publicGroup
      eventStartWall="2030-06-03T20:00"
      eventEndWall="2030-06-03T23:00"
      busy={false}
      onChange={onChange}
      onRemove={vi.fn()}
      onGame={vi.fn()}
      onDemonstrator={onDemonstrator}
    />,
  );
  const time = screen.getByRole("group", { name: /^Table start$/ });
  expect(within(time).getAllByRole("spinbutton")).toHaveLength(2);
  expect(container.querySelector('input[type="date"], input[type="datetime-local"]')).toBeNull();
  enterDateTime(time, "19:59");
  expect(onChange).not.toHaveBeenCalled();
  enterDateTime(time, "22:01");
  expect(onChange).not.toHaveBeenCalled();
  enterDateTime(time, "20:00");
  expect(onChange).toHaveBeenLastCalledWith({ startsWall: "2030-06-03T20:00" });
  enterDateTime(time, "22:00");
  expect(onChange).toHaveBeenLastCalledWith({ startsWall: "2030-06-03T22:00" });
  const choose = screen.getByRole("button", { name: "Choose demonstrator" });
  expect(choose.closest("li")).not.toBeNull();
  fireEvent.click(choose);
  expect(onDemonstrator).toHaveBeenCalledOnce();
});
it("uses one player-count label and help while retaining both accessible bounded counters", async () => {
  const onChange = vi.fn();
  renderWithI18n(
    <EventDraftTableEditor
      row={{ ...newTableDraft("draft"), minPlayers: 2, maxPlayers: 4 }}
      publicGroup={false}
      busy={false}
      onChange={onChange}
      onRemove={vi.fn()}
      onGame={vi.fn()}
      onDemonstrator={vi.fn()}
    />,
  );
  expect(screen.getAllByText("Number of players")).toHaveLength(1);
  expect(screen.queryByText("Minimum players")).toBeNull();
  expect(screen.queryByText("Maximum players")).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Table name" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Table name: Field help" })).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Decrease Minimum players" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Increase Minimum players" }));
  expect(onChange).toHaveBeenLastCalledWith({ minPlayers: 3 });
  fireEvent.click(screen.getByRole("button", { name: "Decrease Maximum players" }));
  expect(onChange).toHaveBeenLastCalledWith({ maxPlayers: 3 });
  fireEvent.click(screen.getByRole("button", { name: "Increase Maximum players" }));
  expect(onChange).toHaveBeenLastCalledWith({ maxPlayers: 5 });
  fireEvent.click(screen.getByRole("button", { name: "Number of players: Field help" }));
  expect(
    await screen.findByText(/Choose the minimum and maximum number of players/),
  ).not.toBeNull();
});
it("shows the selected demonstrator identity and clears its draft metadata explicitly", () => {
  const onChange = vi.fn();
  renderWithI18n(
    <EventDraftTableEditor
      row={{
        ...newTableDraft("draft"),
        demonstratorUserId: "demo",
        demonstratorName: "Demo Player",
        demonstratorAvatarUrl: "https://image.test/demo.png",
      }}
      publicGroup
      busy={false}
      onChange={onChange}
      onRemove={vi.fn()}
      onGame={vi.fn()}
      onDemonstrator={vi.fn()}
    />,
  );
  const item = screen.getByText("Demo Player").closest("li");
  if (!item) throw new Error("Missing demonstrator item");
  expect(within(item).getByRole("button", { name: "Choose demonstrator" })).not.toBeNull();
  fireEvent.click(within(item).getByRole("button", { name: "Remove demonstrator" }));
  expect(onChange).toHaveBeenCalledWith({
    demonstratorUserId: undefined,
    demonstratorGuestName: undefined,
    demonstratorName: undefined,
    demonstratorAvatarUrl: undefined,
  });
});

it.each([
  {
    field: "demonstratorGuestName",
    label: "Enter a guest name between 1 and 80 characters.",
    games: [],
    gameMessage: "Choose at least one game.",
  },
  {
    field: "demonstratorUserId",
    label: "Choose an available group demonstrator.",
    games: [{ id: 1, name: "Chess", year: null, imageUrl: null }],
    gameMessage: "Choose compatible games.",
  },
])(
  "reports $field, invalid counts and games independently and changes the rating flag",
  ({ field, label, games, gameMessage }) => {
    const onChange = vi.fn();
    renderWithI18n(
      <EventDraftTableEditor
        row={{
          ...newTableDraft("draft"),
          demonstratorUserId: "missing-profile",
          startsWall: "2030-06-03T20:00",
          rankingEnabled: false,
          games,
        }}
        publicGroup
        eventStartWall="2030-06-03T20:00"
        eventEndWall="2030-06-03T23:00"
        busy={false}
        fieldError={(name) => ["games", "minPlayers", "startsAt", field].includes(name)}
        onChange={onChange}
        onRemove={vi.fn()}
        onGame={vi.fn()}
        onDemonstrator={vi.fn()}
      />,
    );
    expect(screen.getByText("Unknown")).toBeVisible();
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText(gameMessage)).toBeVisible();
    expect(screen.getByText(/Choose valid player counts/)).toBeVisible();
    fireEvent.click(screen.getByRole("switch", { name: "Enable ratings" }));
    expect(onChange).toHaveBeenLastCalledWith({ rankingEnabled: true });
  },
);
