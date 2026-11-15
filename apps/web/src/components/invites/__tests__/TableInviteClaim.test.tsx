import type { TableInviteReviewResponse } from "@board-game-organizer/schemas";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  eventId,
  optionId,
  plannedEvent,
  plannedTable,
  tableId,
} from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { TableInviteClaim } from "../../../../../api/src/app/invite/[token]/TableInviteClaim";

function review(): TableInviteReviewResponse {
  return {
    kind: "TABLE",
    expiresAt: "2030-06-07T12:00:00.000Z",
    inviter: { id: "owner", name: "Owner", username: "owner", avatarUrl: null },
    group: { id: optionId, name: "Private group" },
    event: {
      id: eventId,
      name: plannedEvent.name,
      version: 7,
      timeZone: plannedEvent.timeZone,
      startTime: plannedEvent.startTime,
      dates: plannedEvent.dates,
      locations: plannedEvent.locations,
      planningMode: "ASSISTED",
      playerPreference: "MORE_PLAYERS",
    },
    table: {
      id: tableId,
      name: plannedTable.name,
      games: plannedTable.games,
      gamesDetail: plannedTable.gamesDetail,
      minPlayers: 2,
      maxPlayers: 4,
      rankingEnabled: true,
    },
    requiresAvailability: true,
    ownAvailability: null,
    ownRegistration: null,
  };
}
function multiple(): TableInviteReviewResponse {
  const value = review();
  value.event.dates = [...value.event.dates, { id: tableId, day: "2030-06-04" }];
  value.event.locations = [
    ...value.event.locations,
    { ...value.event.locations[0], id: tableId, name: "Second venue" },
  ];
  value.table.games = [...value.table.games, { ...value.table.games[0], gameId: 2 }];
  value.table.gamesDetail = [
    ...value.table.gamesDetail,
    { id: 2, name: "Dixit", imageUrl: null, year: null },
  ];
  return value;
}
function mount(value = review(), props = {}) {
  const onClaim = vi.fn().mockResolvedValue({ success: true, inviter: null });
  const onRefresh = vi.fn();
  const defaults = {
    review: value,
    busy: false,
    disabled: false,
    failed: false,
    onClaim,
    onRefresh,
  };
  const view = renderWithI18n(<TableInviteClaim {...defaults} {...props} />);
  return {
    ...view,
    onClaim,
    onRefresh,
    rerenderState: (next = {}) => view.rerender(<TableInviteClaim {...defaults} {...next} />),
  };
}
it("requires a final explicit acceptance and discloses friendship, private membership and possible queue", async () => {
  const { onClaim } = mount();
  expect(
    screen.getByText(
      /Accepting makes you friends with @owner, joins the private group Private group/,
    ),
  ).toBeTruthy();
  expect(screen.getByText("If the table is full, you will join its waiting list.")).toBeTruthy();
  expect(screen.getByText(/Single-use invitation/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /: Yes$/ })).toBeNull();
  expect(onClaim).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  await waitFor(() => expect(onClaim).toHaveBeenCalledOnce());
  expect(onClaim).toHaveBeenCalledWith({
    consent: true,
    participation: {
      version: 7,
      gameVotes: {},
      availability: { version: 7, dateVotes: {}, locationVotes: {} },
    },
  });
});
it("never invents votes: every multiple-choice option needs an explicit answer and each category needs a positive choice", async () => {
  const { onClaim } = mount(multiple());
  const accept = screen.getByRole("button", { name: "Accept invitation" });
  fireEvent.click(accept);
  expect(screen.getByRole("alert").textContent).toContain("Answer every option");
  for (const title of ["Dates", "Locations", "Games"]) {
    const section = screen.getByRole("heading", { name: title }).closest("section");
    if (!section) throw new Error("Missing review section");
    for (const option of within(section).getAllByRole("group")) {
      for (const choice of within(option).getAllByRole("button"))
        expect(choice.getAttribute("aria-pressed")).toBe("false");
      fireEvent.click(within(option).getByRole("button", { name: /: No$/ }));
    }
  }
  fireEvent.click(accept);
  expect(onClaim).not.toHaveBeenCalled();
  for (const title of ["Dates", "Locations", "Games"]) {
    const section = screen.getByRole("heading", { name: title }).closest("section");
    if (!section) throw new Error("Missing review section");
    fireEvent.click(
      within(within(section).getAllByRole("group")[0]).getByRole("button", { name: /: Yes$/ }),
    );
  }
  fireEvent.click(accept);
  await waitFor(() => expect(onClaim).toHaveBeenCalledOnce());
  expect(onClaim).toHaveBeenCalledWith({
    consent: true,
    participation: {
      version: 7,
      gameVotes: { "1": "YES", "2": "NO" },
      availability: {
        version: 7,
        dateVotes: { [optionId]: "YES", [tableId]: "NO" },
        locationVotes: { [optionId]: "YES", [tableId]: "NO" },
      },
    },
  });
});
it("preserves an existing accepted registration without submitting replacement ballots", async () => {
  const value = multiple();
  value.ownRegistration = {
    id: optionId,
    status: "ACCEPTED",
    version: 3,
    kind: "SELF",
    gameVotes: { "1": "YES", "2": "NO" },
  };
  value.requiresAvailability = false;
  value.event.planningMode = "MANUAL";
  value.event.playerPreference = "BEST";
  value.table.rankingEnabled = false;
  const { onClaim } = mount(value);
  expect(screen.getByText("Your place and choices will be kept.", { exact: false })).toBeTruthy();
  expect(screen.getByText("Manual planning")).toBeTruthy();
  expect(screen.getByText("Best BGG player count")).toBeTruthy();
  expect(screen.getByText("Unrated table")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /: Yes$/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  await waitFor(() => expect(onClaim).toHaveBeenCalledWith({ consent: true }));
});
it("keeps existing event availability when joining another table and collects only explicit game choices", async () => {
  const value = multiple();
  value.requiresAvailability = false;
  value.ownAvailability = {
    dateVotes: { [optionId]: "YES", [tableId]: "NO" },
    locationVotes: { [optionId]: "YES", [tableId]: "IF_NEEDED" },
  };
  value.ownRegistration = {
    id: optionId,
    status: "PENDING",
    version: 2,
    kind: "INVITATION",
    gameVotes: { "1": "UNKNOWN", "2": "NO" },
  };
  const { onClaim } = mount(value);
  expect(screen.getByText("Your existing event availability will be kept.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Chess: Yes" }).getAttribute("aria-pressed")).toBe(
    "false",
  );
  fireEvent.click(screen.getByRole("button", { name: "Chess: If needed" }));
  fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  await waitFor(() =>
    expect(onClaim).toHaveBeenCalledWith({
      consent: true,
      participation: { version: 7, gameVotes: { "1": "IF_NEEDED", "2": "NO" } },
    }),
  );
});
it.each(["dates", "locations", "games"])(
  "leaves incomplete %s observable and disables acceptance",
  (part) => {
    const value = review();
    if (part === "games") value.table.games = [];
    else value.event[part as "dates" | "locations"] = [];
    const { onClaim } = mount(value);
    expect(screen.getByRole("alert").textContent).toContain("settings are incomplete");
    const button = screen.getByRole("button", { name: "Accept invitation" });
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
    expect(onClaim).not.toHaveBeenCalled();
  },
);
it("keeps failed choices for retry, exposes refresh, and coalesces rapid acceptance clicks", async () => {
  let reject!: (value: Error) => void;
  const pending = vi.fn(
    () =>
      new Promise<{ success: boolean; inviter: null }>((_resolve, fail) => {
        reject = fail;
      }),
  );
  const { rerenderState, onRefresh } = mount(review(), { onClaim: pending });
  const button = screen.getByRole("button", { name: "Accept invitation" });
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(pending).toHaveBeenCalledOnce();
  await act(async () => reject(new Error("HTTP 409")));
  rerenderState({ onClaim: pending, failed: true });
  expect(screen.getByRole("alert").textContent).toContain("Could not accept this invitation");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(onRefresh).toHaveBeenCalledOnce();
  pending.mockResolvedValueOnce({ success: true, inviter: null });
  fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
  await waitFor(() => expect(pending).toHaveBeenCalledTimes(2));
});
it.each(["busy", "disabled"])("disables review changes and acceptance when %s", (part) => {
  const { onClaim } = mount(multiple(), { [part]: true });
  for (const button of screen.getAllByRole("button")) {
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
  }
  expect(onClaim).not.toHaveBeenCalled();
});
it("keeps unknown game metadata and unnamed locations readable without fabricating their names", () => {
  const value = review();
  value.table.gamesDetail = [];
  value.event.locations = [{ ...value.event.locations[0], address: "" }];
  mount(value);
  expect(screen.getByText("Unknown")).toBeTruthy();
  expect(screen.getByText(value.event.locations[0].name)).toBeTruthy();
});
