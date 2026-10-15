import type { EventDraftTable } from "@board-game-organizer/shared";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { EventDraftTableCard } from "../EventDraftTableCard";

const table: EventDraftTable = {
  key: "new",
  gameName: "Azul",
  input: {
    name: "Azul table",
    gameId: 1,
    startsAt: "2030-01-02T18:01:00.000Z",
    endsAt: "2030-01-02T21:59:00.000Z",
    minPlayers: 2,
    maxPlayers: 4,
    openSkill: false,
  },
};
it.each([
  { userId: "demo", username: "demo_nick", name: "Demo Name", avatarUrl: null },
  { userId: "demo", username: null, name: "Demo Name", avatarUrl: null },
  { userId: "demo", username: null, name: null, avatarUrl: null },
  undefined,
])(
  "shows times only, game, limits, optional demonstrator and working row actions: %j",
  (demonstrator) => {
    const onEdit = vi.fn(),
      onRemove = vi.fn();
    renderWithI18n(
      <EventDraftTableCard
        table={{
          ...table,
          demonstrator,
          imageUrl: demonstrator?.username ? "https://example.test/cover.png" : null,
        }}
        timeZone="UTC"
        busy={false}
        onEdit={onEdit}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByRole("heading", { name: "Azul table" })).toBeTruthy();
    expect(screen.getByText("Azul")).toBeTruthy();
    expect(screen.getByText("2–4")).toBeTruthy();
    const time = new Intl.DateTimeFormat("en", { timeStyle: "short", timeZone: "UTC" });
    expect(screen.getByText(time.format(new Date(table.input.startsAt)))).toBeTruthy();
    expect(screen.getByText(time.format(new Date(table.input.endsAt)))).toBeTruthy();
    expect(screen.queryByText(/Jan 2, 2030/)).toBeNull();
    expect(screen.queryByRole("img", { name: "Global ratings enabled" })).toBeNull();
    if (demonstrator)
      expect(
        screen.getByText(demonstrator.username ?? demonstrator.name ?? "Username unavailable"),
      ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit table: Azul table" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove table: Azul table" }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledOnce();
  },
);
it("anchors the rating badge to the bottom-right of the fixed-size cover when enabled", () => {
  renderWithI18n(
    <EventDraftTableCard
      table={{ ...table, input: { ...table.input, openSkill: true } }}
      timeZone="UTC"
      busy={false}
      onEdit={vi.fn()}
      onRemove={vi.fn()}
    />,
  );
  const badge = screen.getByRole("img", { name: "Global ratings enabled" });
  expect(badge.className).toContain("-bottom-1 -right-1");
  expect(badge.parentElement?.style.width).toBe("80px");
  expect(badge.parentElement?.style.height).toBe("80px");
});
it("disables repeat editing/removal during save", () => {
  const onEdit = vi.fn(),
    onRemove = vi.fn();
  renderWithI18n(
    <EventDraftTableCard table={table} timeZone="UTC" busy onEdit={onEdit} onRemove={onRemove} />,
  );
  for (const name of ["Edit table: Azul table", "Remove table: Azul table"]) {
    const button = screen.getByRole("button", { name });
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
  }
  expect(onEdit).not.toHaveBeenCalled();
  expect(onRemove).not.toHaveBeenCalled();
});
