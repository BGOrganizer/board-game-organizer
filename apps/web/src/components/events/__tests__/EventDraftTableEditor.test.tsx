import { newTableDraft } from "@board-game-organizer/shared";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
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
  const time = screen.getByLabelText("Table start") as HTMLInputElement;
  expect(time.type).toBe("time");
  expect(time.min).toBe("20:01");
  expect(time.max).toBe("22:00");
  expect(container.querySelector('input[type="date"], input[type="datetime-local"]')).toBeNull();
  fireEvent.change(time, { target: { value: "20:00" } });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(time, { target: { value: "22:01" } });
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(time, { target: { value: "22:00" } });
  expect(onChange).toHaveBeenLastCalledWith({ startsWall: "2030-06-03T22:00" });
  const choose = screen.getByRole("button", { name: "Choose demonstrator" });
  expect(choose.closest("li")).not.toBeNull();
  fireEvent.click(choose);
  expect(onDemonstrator).toHaveBeenCalledOnce();
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
    demonstratorName: undefined,
    demonstratorAvatarUrl: undefined,
  });
});
