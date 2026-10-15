import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { MatchListLegend } from "../MatchListLegend";

it("opens the shared question-mark popover with crown/event-table icons and meanings", async () => {
  renderWithI18n(<MatchListLegend />);
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Table list" }));
  const dialog = await screen.findByRole("dialog");
  expect(screen.getByText("The crown identifies the match administrator.")).toBeTruthy();
  expect(screen.getByText("The calendar identifies a table belonging to an event.")).toBeTruthy();
  expect(dialog.querySelector(".lucide-crown")).toBeTruthy();
  expect(dialog.querySelector(".lucide-calendar-days")).toBeTruthy();
  fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
