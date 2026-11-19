import type { TableInviteReviewResponse } from "@board-game-organizer/schemas";
import type { ClaimResult } from "@board-game-organizer/shared";
import { act, render, screen, userEvent, waitFor, within } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { measureNativeListCells, scrollNativeListToEnd } from "@/test/nativeListGeometry";
import { TableInviteReview } from "../TableInviteReview";
import { multipleInviteOptions, tableClaimReceipt, tableInviteReview } from "./inviteFixtures";

const claim = vi.fn(),
  refresh = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  claim.mockResolvedValue(tableClaimReceipt());
});
function Fixture({
  review = tableInviteReview(),
  locale = "en",
  ...props
}: Partial<ComponentProps<typeof TableInviteReview>> & { locale?: "en" | "it" }) {
  return (
    <NativeTestProviders locale={locale}>
      <TableInviteReview
        review={review}
        disabled={false}
        pending={false}
        failed={false}
        readFailed={false}
        onClaim={claim}
        onRefresh={refresh}
        {...props}
      />
    </NativeTestProviders>
  );
}
async function press(name: string) {
  await userEvent.setup().press(await screen.findByRole("button", { name }));
}
async function vote(label: string, choice = "Yes") {
  await press(`${label}: Choose your vote`);
  await userEvent
    .setup()
    .press(within(screen.getByTestId("confirmation-dialog")).getByRole("button", { name: choice }));
}
async function revealChoices() {
  let list = screen.getByText("First table");
  while (list.parent && typeof list.props.onScroll !== "function") list = list.parent;
  // Node supplies no Yoga. Keep the real cell/window calculation and scroll
  // handling; provide host measurements before entering the later Games section.
  await measureNativeListCells(list, { headerHeight: 300, cellHeight: 100 });
  await scrollNativeListToEnd(list, 2000);
  await screen.findByText("Second game");
}

it.each(["en", "it"] as const)(
  "discloses explicit friendship, private group and table consent with category labels in %s",
  async (locale) => {
    await render(<Fixture locale={locale} />);
    for (const text of ["First table", "Friday games", "Private games group", "Chess"])
      expect(screen.getByText(text)).toBeVisible();
    expect(screen.getByText(/@inviter/)).toBeVisible();
    for (const title of locale === "it"
      ? ["Date", "Luoghi", "Giochi"]
      : ["Dates", "Locations", "Games"])
      expect(screen.getByText(title)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Choose your vote/ })).toBeNull();
    expect(screen.getByTestId("table-link-consent-submit")).toBeEnabled();
    expect(claim).not.toHaveBeenCalled();
  },
);

it("submits only one consent for singleton settings, without fabricating ballot values or reserving a seat", async () => {
  await render(<Fixture />);
  await press("Accept invitation");
  await waitFor(() => expect(claim).toHaveBeenCalledOnce());
  expect(claim).toHaveBeenCalledWith({
    consent: true,
    participation: {
      version: 1,
      gameVotes: {},
      availability: { version: 1, dateVotes: {}, locationVotes: {} },
    },
  });
});

it("requires every multi-option category to have all answers and at least one positive preference", async () => {
  const review = multipleInviteOptions();
  await render(<Fixture review={review} />);
  expect(screen.getByTestId("table-link-consent-submit")).toBeDisabled();
  await vote("2030-06-03 20:00");
  await vote("2030-06-04 20:00", "No");
  await vote("Club venue", "If needed");
  await vote("Second club", "No");
  await revealChoices();
  await vote("Chess");
  await vote("Second game", "No");
  expect(screen.getByTestId("table-link-consent-submit")).toBeEnabled();
  await press("Accept invitation");
  expect(claim).toHaveBeenCalledWith({
    consent: true,
    participation: {
      version: 1,
      gameVotes: { "1": "YES", "2": "NO" },
      availability: {
        version: 1,
        dateVotes: { [review.event.dates[0].id]: "YES", [review.event.dates[1].id]: "NO" },
        locationVotes: {
          [review.event.locations[0].id]: "IF_NEEDED",
          [review.event.locations[1].id]: "NO",
        },
      },
    },
  });
});

it("keeps a fully answered all-negative game category ineligible until a positive vote replaces it", async () => {
  const base = tableInviteReview();
  const options = multipleInviteOptions();
  const review = { ...base, table: options.table };
  await render(<Fixture review={review} />);
  await revealChoices();
  await vote("Chess", "No");
  await vote("Second game", "No");
  expect(screen.getByTestId("table-link-consent-submit")).toBeDisabled();
  await userEvent.setup().press(screen.getByTestId("table-link-consent-submit"));
  expect(claim).not.toHaveBeenCalled();
  await press("Chess: No");
  await userEvent
    .setup()
    .press(
      within(screen.getByTestId("confirmation-dialog")).getByRole("button", { name: "If needed" }),
    );
  expect(screen.getByTestId("table-link-consent-submit")).toBeEnabled();
});

it("preserves an already accepted registration and existing votes instead of rewriting its place", async () => {
  const review = multipleInviteOptions();
  review.ownRegistration = {
    id: "66666666-6666-4666-8666-666666666666",
    status: "ACCEPTED",
    version: 5,
    kind: "SELF",
    gameVotes: { "1": "YES" },
  };
  await render(<Fixture review={review} />);
  expect(
    screen.getByText("You already participate at this table. Your place and choices will be kept."),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: /Choose your vote/ })).toBeNull();
  await press("Accept invitation");
  expect(claim).toHaveBeenCalledWith({ consent: true });
});

it("keeps existing event availability when only new game preferences are required", async () => {
  const review = { ...multipleInviteOptions(), requiresAvailability: false };
  await render(<Fixture review={review} />);
  expect(screen.getByText("Your existing event availability will be kept.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Club venue: Choose your vote" })).toBeNull();
  await revealChoices();
  await vote("Chess");
  await vote("Second game", "No");
  await press("Accept invitation");
  expect(claim).toHaveBeenCalledWith({
    consent: true,
    participation: { version: 1, gameVotes: { "1": "YES", "2": "NO" } },
  });
});

it("restores explicit pending-registration preferences while excluding unknown old vote values", async () => {
  const review = multipleInviteOptions();
  review.ownAvailability = {
    dateVotes: { [review.event.dates[0].id]: "YES", [review.event.dates[1].id]: "NO" },
    locationVotes: { [review.event.locations[0].id]: "YES", [review.event.locations[1].id]: "NO" },
  };
  review.ownRegistration = {
    id: "66666666-6666-4666-8666-666666666666",
    status: "PENDING",
    version: 1,
    kind: "INVITATION",
    gameVotes: { "1": "UNKNOWN", "2": "YES" },
  };
  await render(<Fixture review={review} />);
  await revealChoices();
  expect(screen.getByRole("button", { name: "Second game: Yes" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Chess: Choose your vote" })).toBeVisible();
  expect(screen.getByTestId("table-link-consent-submit")).toBeDisabled();
});

it.each(["dates", "locations", "games"] as const)(
  "refuses incomplete %s settings rather than accepting a malformed review",
  async (kind) => {
    const base = tableInviteReview();
    const review: TableInviteReviewResponse =
      kind === "games"
        ? { ...base, table: { ...base.table, games: [], gamesDetail: [] } }
        : { ...base, event: { ...base.event, [kind]: [] } };
    await render(<Fixture review={review} />);
    expect(
      screen.getByText("The table settings are incomplete. Ask the inviter to update them."),
    ).toBeVisible();
    expect(screen.getByTestId("table-link-consent-submit")).toBeDisabled();
    await userEvent.setup().press(screen.getByTestId("table-link-consent-submit"));
    expect(claim).not.toHaveBeenCalled();
  },
);

it.each([
  {
    failed: true,
    readFailed: false,
    error: "Could not accept this invitation. Refresh the details and try again.",
  },
  { failed: false, readFailed: true, error: "Could not load this invitation." },
])(
  "keeps failed acceptance/read observable and refreshes explicitly ($error)",
  async ({ failed, readFailed, error }) => {
    await render(<Fixture failed={failed} readFailed={readFailed} />);
    expect(screen.getByText(error)).toBeVisible();
    await press("Try again");
    expect(refresh).toHaveBeenCalledOnce();
    expect(claim).not.toHaveBeenCalled();
  },
);

it("coalesces two consent taps during a real pending callback and enables an explicit retry after rejection", async () => {
  let finish: (value: ClaimResult) => void = () => {};
  claim.mockImplementationOnce(
    () =>
      new Promise<ClaimResult>((resolve) => {
        finish = resolve;
      }),
  );
  await render(<Fixture />);
  await press("Accept invitation");
  await press("Accept invitation");
  expect(claim).toHaveBeenCalledOnce();
  await act(() => finish(tableClaimReceipt("WAITING")));
  claim.mockRejectedValueOnce(new Error("Claim rejected"));
  await press("Accept invitation");
  expect(claim).toHaveBeenCalledTimes(2);
  await press("Accept invitation");
  expect(claim).toHaveBeenCalledTimes(3);
});

it("disables both ballot/consent controls while the authoritative parent mutation is pending", async () => {
  const review = multipleInviteOptions();
  await render(<Fixture review={review} disabled pending />);
  expect(screen.getByRole("button", { name: "Accepting invitation…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "2030-06-03 20:00: Choose your vote" })).toBeDisabled();
  await userEvent.setup().press(screen.getByTestId("table-link-consent-submit"));
  expect(claim).not.toHaveBeenCalled();
});
