import type { MatchDetailResponse } from "@board-game-organizer/schemas";
import { act, fireEvent, screen, within } from "@testing-library/react";
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
  name: id === "user_one" ? "Anna Rossi" : "Luca Bianchi",
  email: `${id}@example.com`,
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
  administrator: {
    id: "user_admin",
    name: "Marco Verdi",
    email: "admin@example.com",
    avatarUrl: null,
  },
  invitedPlayers: players,
  games: [],
} as MatchDetailResponse;

function openScore(name: string) {
  fireEvent.click(screen.getByRole("button", { name: `Score: ${name}` }));
}

it("shows everyone at zero, opens score popovers, and confirms a staged three-way tie-break", () => {
  const submit = vi.fn();
  renderWithI18n(
    <MatchResultsEditor data={data} busy={false} onBack={vi.fn()} onSubmit={submit} />,
  );
  const standings = screen.getByRole("region", { name: "Live standings" });
  const scores = screen.getByRole("region", { name: "Player scores" });
  expect(standings.compareDocumentPosition(scores) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(standings).getAllByText("0")).toHaveLength(3);
  expect(screen.getAllByRole("button", { name: /Score:/ })).toHaveLength(3);
  expect(within(scores).getByText("admin@example.com")).toBeTruthy();
  expect(within(scores).getByText("Anna Rossi")).toBeTruthy();
  expect(within(scores).getAllByText(/@example.com/)).toHaveLength(3);
  expect(screen.queryByRole("textbox", { name: /Score:/ })).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Register match" }) as HTMLButtonElement).disabled,
  ).toBe(false);

  for (const name of ["Marco Verdi", "Anna Rossi", "Luca Bianchi"]) {
    openScore(name);
    fireEvent.change(screen.getByRole("textbox", { name: `Score: ${name}` }), {
      target: { value: "-1,5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
  }
  const resolveTie = screen.getByRole("button", { name: "Resolve tie" });
  const actionSlot = resolveTie.parentElement;
  expect(actionSlot?.className).toContain("w-20");
  fireEvent.click(resolveTie);
  fireEvent.click(screen.getByRole("button", { name: "Move up: Luca Bianchi" }));
  fireEvent.click(screen.getByRole("button", { name: "Move up: Luca Bianchi" }));
  const cancelTie = screen.getByRole("button", { name: "Cancel" });
  expect(cancelTie.parentElement).toBe(actionSlot);
  expect(cancelTie.className).toContain("button--sm");
  expect(resolveTie.className).toContain("button--sm");
  expect(screen.getByRole("button", { name: "Confirm tie-break" }).className).toContain(
    "button--sm",
  );
  expect(cancelTie.className).toContain("button--icon-only");
  expect(cancelTie.className).toContain("button--outline");
  expect(cancelTie.textContent).toBe("");
  expect(screen.getByRole("button", { name: "Confirm tie-break" }).className).toContain(
    "button--primary",
  );
  fireEvent.click(cancelTie);
  const rank = within(standings).getAllByText("1", { exact: true });
  expect(rank).toHaveLength(3);
  expect(rank[0]?.className).toContain("font-bold");
  expect(rank[0]?.className).toContain("h-4");
  expect(rank[0]?.className).toContain("px-0.5");
  expect(rank[0]?.parentElement?.querySelector(".avatar")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Resolve tie" }));
  fireEvent.click(screen.getByRole("button", { name: "Move up: Luca Bianchi" }));
  fireEvent.click(screen.getByRole("button", { name: "Move up: Luca Bianchi" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm tie-break" }));
  expect(screen.getByRole("button", { name: "Edit tie-break" })).toBeTruthy();
  fireEvent.click(screen.getByRole("switch", { name: "Lowest score wins" }));
  fireEvent.click(screen.getByRole("button", { name: "Register match" }));
  const dialog = screen.getByRole("dialog", { name: "Register match?" });
  expect(within(dialog).queryByText("Marco Verdi")).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "Register match" }));
  expect(submit).toHaveBeenCalledWith({
    lowerWins: true,
    entries: ["user_admin", "user_one", "user_two"].map((userId) => ({
      userId,
      score: "-1.5",
    })),
    tieBreaks: [{ score: "-1.5", orderedUserIds: ["user_two", "user_admin", "user_one"] }],
  });
});

it("can edit or remove an applied tie-break without changing scores", () => {
  renderWithI18n(
    <MatchResultsEditor data={data} busy={false} onBack={vi.fn()} onSubmit={vi.fn()} />,
  );
  const standings = screen.getByRole("region", { name: "Live standings" });
  fireEvent.click(screen.getByRole("button", { name: "Resolve tie" }));
  fireEvent.click(screen.getByRole("button", { name: "Move up: Luca Bianchi" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm tie-break" }));
  expect(within(standings).getAllByText("1", { exact: true })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Edit tie-break" }));
  fireEvent.click(screen.getByRole("button", { name: "Move down: Luca Bianchi" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm tie-break" }));
  const removeTie = screen.getByRole("button", { name: "Remove tie-break" });
  expect(removeTie.className).toContain("button--danger-soft");
  fireEvent.click(removeTie);
  expect(within(standings).getAllByText("1", { exact: true })).toHaveLength(3);
  expect(screen.getByRole("button", { name: "Resolve tie" })).toBeTruthy();
});

it("keeps at least one participant and validates scores inside the popover", () => {
  const missingEmailData = {
    ...data,
    administrator: { ...data.administrator, email: null },
  } as MatchDetailResponse;
  renderWithI18n(
    <MatchResultsEditor data={missingEmailData} busy={false} onBack={vi.fn()} onSubmit={vi.fn()} />,
  );
  expect(
    within(screen.getByRole("region", { name: "Player scores" })).getByText("Email unavailable"),
  ).toBeTruthy();
  for (const name of ["Marco Verdi", "Anna Rossi", "Luca Bianchi"]) {
    openScore(name);
    fireEvent.click(screen.getByRole("switch", { name: `Did not participate: ${name}` }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
  }
  expect(
    (screen.getByRole("button", { name: "Register match" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  openScore("Marco Verdi");
  fireEvent.click(screen.getByRole("switch", { name: "Did not participate: Marco Verdi" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Score: Marco Verdi" }), {
    target: { value: "abc" },
  });
  expect(screen.getByRole("alert").textContent).toBe("Enter a valid score");
  fireEvent.change(screen.getByRole("textbox", { name: "Score: Marco Verdi" }), {
    target: { value: "0" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(
    (screen.getByRole("button", { name: "Register match" }) as HTMLButtonElement).disabled,
  ).toBe(false);
  expect(screen.queryByRole("button", { name: "Resolve tie" })).toBeNull();
});

it("keeps the selected win condition through an asynchronous view transition", () => {
  const pending: Array<() => void> = [];
  const original = Object.getOwnPropertyDescriptor(document, "startViewTransition");
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: (update: () => void) => {
      pending.push(update);
      return {};
    },
  });
  try {
    const submit = vi.fn();
    renderWithI18n(
      <MatchResultsEditor data={data} busy={false} onBack={vi.fn()} onSubmit={submit} />,
    );
    const toggle = screen.getByRole("switch", { name: "Lowest score wins" });
    fireEvent.click(toggle);
    expect(pending).toHaveLength(1);
    act(() => pending.shift()?.());
    expect((toggle as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Register match" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Register match?" })).getByRole("button", {
        name: "Register match",
      }),
    );
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ lowerWins: true }));
  } finally {
    if (original) Object.defineProperty(document, "startViewTransition", original);
    else Reflect.deleteProperty(document, "startViewTransition");
  }
});
