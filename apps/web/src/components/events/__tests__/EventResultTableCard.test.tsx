import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { plannedTable } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventResultTableCard } from "../EventResultTableCard";

it.each([false, true])(
  "keeps result-entry artwork, selected game/frozen count and a real completion badge, ready=%s",
  (ready) => {
    const press = vi.fn();
    renderWithI18n(
      <EventResultTableCard
        table={{
          ...plannedTable,
          confirmed: { gameId: 1, playerIds: ["one", "two"], startsAt: plannedTable.createdAt },
        }}
        ready={ready}
        busy={false}
        onPress={press}
      />,
    );
    const button = screen.getByRole("button", { name: "Edit scores: First table" });
    expect(button.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(screen.getByText("Chess")).not.toBeNull();
    expect(screen.getByText("Players:").parentElement?.textContent).toBe("Players: 2");
    expect(Boolean(screen.queryByRole("img", { name: "Scores ready" }))).toBe(ready);
    const description = button.getAttribute("aria-describedby");
    expect(description ? document.getElementById(description)?.textContent : null).toBe(
      ready ? "Scores ready" : null,
    );
    if (ready) {
      const badge = screen.getByRole("img", { name: "Scores ready" });
      expect(badge.className).toContain("text-success");
      expect(badge.className).toContain("bottom-0");
      expect(badge.className).toContain("right-0");
      expect(badge.querySelector("svg.lucide-circle-check")).not.toBeNull();
    }
    fireEvent.click(button);
    expect(press).toHaveBeenCalledOnce();
  },
);
it("keeps unknown legacy game data safe and disables repeat entry while finalizing", () => {
  const press = vi.fn();
  renderWithI18n(
    <EventResultTableCard
      table={{ ...plannedTable, gamesDetail: [] }}
      ready={false}
      busy
      onPress={press}
    />,
  );
  expect(screen.getByText("Unknown")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit scores: First table" }));
  expect(press).not.toHaveBeenCalled();
});
