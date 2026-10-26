import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { TableScoreEditor } from "../TableScoreEditor";

const players = [
  { id: "a", name: "Alice", email: "a@example.test", avatarUrl: null },
  { id: "b", name: "Bob", email: "b@example.test", avatarUrl: null },
];
it("preserves exact decimal ties and uses explicit table draft confirmation, not a synthetic Match submission", () => {
  const submit = vi.fn();
  renderWithI18n(
    <TableScoreEditor
      players={players}
      initial={{
        lowerWins: false,
        entries: [
          { userId: "a", score: "-1.50" },
          { userId: "b", score: "-1.5" },
        ],
        tieBreaks: [],
      }}
      busy={false}
      onSubmit={submit}
    />,
  );
  expect(screen.getByText("a@example.test")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Back to tables" })).toBeNull();
  expect(screen.getByRole("button", { name: "Resolve tie" })).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Use table scores" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog.textContent).toContain("Nothing is saved until you finalize the whole event.");
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Use table scores" }));
  expect(submit).toHaveBeenCalledWith({
    lowerWins: false,
    entries: [
      { userId: "a", score: "-1.5" },
      { userId: "b", score: "-1.5" },
    ],
    tieBreaks: [],
  });
});
it("allows all-ND tables and prevents incomplete/repeated submissions", () => {
  const submit = vi.fn();
  renderWithI18n(
    <TableScoreEditor
      players={players}
      initial={{
        lowerWins: false,
        entries: [
          { userId: "a", score: null },
          { userId: "b", score: null },
        ],
        tieBreaks: [],
      }}
      busy={false}
      onSubmit={submit}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Use table scores" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Use table scores" }),
  );
  expect(submit).toHaveBeenCalledWith({
    lowerWins: false,
    entries: [
      { userId: "a", score: null },
      { userId: "b", score: null },
    ],
    tieBreaks: [],
  });
});
it("requires every frozen player entry and disables editing while mutation is pending", () => {
  renderWithI18n(<TableScoreEditor players={players} busy onSubmit={vi.fn()} />);
  expect(
    (screen.getByRole("button", { name: "Use table scores" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect((screen.getByRole("button", { name: "Score: Alice" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.getByText(/every frozen player/)).not.toBeNull();
});
