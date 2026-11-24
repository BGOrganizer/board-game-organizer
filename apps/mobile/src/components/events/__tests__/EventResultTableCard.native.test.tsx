import type { PlannedTableResponse } from "@board-game-organizer/schemas";
import { render, screen, userEvent } from "@testing-library/react-native";
import { expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { plannedTable } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventResultTableCard } from "../EventResultTableCard";

it("keeps edit actions disabled while busy, then exposes the ready frozen game and participant count", async () => {
  const edit = vi.fn();
  const confirmed: PlannedTableResponse = {
    ...plannedTable,
    eventStatus: "CONFIRMED",
    confirmed: { gameId: 1, playerIds: ["owner", "guest"], startsAt: "2030-06-03T18:00:00Z" },
  };
  const view = await render(
    <EventResultTableCard table={plannedTable} ready={false} busy onPress={edit} />,
    {
      wrapper: NativeTestProviders,
    },
  );
  const pending = screen.getByRole("button", { name: "Edit scores: Table #1" });
  expect(pending).toBeDisabled();
  expect(screen.getByText("0")).toBeVisible();
  expect(screen.queryByRole("image", { name: "Scores ready" })).toBeNull();
  await userEvent.setup().press(pending);
  expect(edit).not.toHaveBeenCalled();

  await view.rerender(<EventResultTableCard table={confirmed} ready busy={false} onPress={edit} />);
  expect(screen.getByText("2")).toBeVisible();
  expect(screen.getByRole("image", { name: "Scores ready" })).toBeOnTheScreen();
  const ready = screen.getByRole("button", { name: "Edit scores: Chess" });
  expect(ready).toBeEnabled();
  await userEvent.setup().press(ready);
  expect(edit).toHaveBeenCalledOnce();
});
