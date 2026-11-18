import { fireEvent, screen, within } from "@testing-library/react";
import { CalendarDays, Clock3, UsersRound } from "lucide-react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { DateTimeInfo } from "../DateTimeInfo";
import { EmptyList } from "../EmptyList";
import { GroupedList } from "../GroupedList";
import { GroupedRow } from "../GroupedRow";
import { IconLegend } from "../IconLegend";
import { ListCard } from "../ListCard";
import { ListCardBody } from "../ListCardBody";
import { ListCardCoverContent } from "../ListCardCoverContent";
import { NotificationCountBadge } from "../NotificationCountBadge";
import { PendingArtworkBadge } from "../PendingArtworkBadge";
import { RecordIdentityCard } from "../RecordIdentityCard";

it("announces empty content and hides its decorative icon", () => {
  renderWithI18n(
    <EmptyList icon={<UsersRound aria-label="People decoration" />}>No members</EmptyList>,
  );
  expect(screen.getByRole("status").textContent).toBe("No members");
  expect(screen.queryByRole("img", { name: "People decoration" })).toBeNull();
});

it("omits an empty grouped list and preserves populated row semantics", () => {
  const view = renderWithI18n(<GroupedList>{null}</GroupedList>);
  expect(screen.queryByRole("list")).toBeNull();
  view.rerender(
    <GroupedList className="owned-group" style={{ maxWidth: 300 }}>
      <GroupedRow className="owned-row" style={{ minHeight: 44 }}>
        Member one
      </GroupedRow>
      <GroupedRow>Member two</GroupedRow>
    </GroupedList>,
  );
  const list = screen.getByRole("list");
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  expect(list.style.maxWidth).toBe("300px");
  expect(screen.getByText("Member one").style.minHeight).toBe("44px");
});

it.each([false, true])("keeps a card heading and optional metadata with unread=%s", (unread) => {
  const view = renderWithI18n(
    <ListCardBody
      title="Game night"
      unread={unread}
      titleIcon={<CalendarDays aria-hidden />}
      titleAccessory={<span>Private</span>}
    />,
  );
  expect(screen.getByText("Game night")).toBeTruthy();
  expect(screen.getByText("Private")).toBeTruthy();
  expect(Boolean(screen.queryByRole("img", { name: "Unread updates" }))).toBe(unread);
  view.rerender(
    <ListCardBody title="Updated game night" unread={unread}>
      <p>Six players</p>
    </ListCardBody>,
  );
  expect(screen.queryByText("Game night")).toBeNull();
  expect(screen.getByText("Updated game night")).toBeTruthy();
  expect(screen.getByText("Six players")).toBeTruthy();
});

it.each([false, true])("keeps cover controls independent and blocks busy input=%s", (busy) => {
  const press = vi.fn();
  renderWithI18n(
    <ListCard>
      <ListCardCoverContent
        artwork={<span>Resource image</span>}
        heading={<h2>Resource title</h2>}
        controls={
          <button type="button" onClick={press}>
            Details
          </button>
        }
        controlsDisabled={busy}
      >
        <p>Resource information</p>
      </ListCardCoverContent>
    </ListCard>,
  );
  expect(screen.getByRole("heading", { name: "Resource title" })).toBeTruthy();
  expect(screen.getByText("Resource information")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Details" }));
  expect(press).toHaveBeenCalledTimes(busy ? 0 : 1);
});

it("renders cover content without a heading or controls", () => {
  const view = renderWithI18n(
    <ListCard>
      <ListCardCoverContent artwork={<span>Artwork</span>}>
        <p>Information</p>
      </ListCardCoverContent>
    </ListCard>,
  );
  expect(screen.getByText("Artwork")).toBeTruthy();
  expect(screen.getByText("Information")).toBeTruthy();
  expect(view.container.querySelector('[data-slot="card-controls"]')).toBeNull();
});

it.each(["h1", "h2"] as const)(
  "renders a detail identity with a %s title and independent action",
  (heading) => {
    const press = vi.fn();
    renderWithI18n(
      <RecordIdentityCard
        title="Test group"
        heading={heading}
        icon={UsersRound}
        background={<svg aria-label="Decorative group" />}
        titleAccessory={<span>Private group</span>}
        titleAction={
          <button type="button" onClick={press}>
            Read updates
          </button>
        }
      >
        <span>Six members</span>
      </RecordIdentityCard>,
    );
    expect(
      screen.getByRole("heading", { name: "Test group", level: heading === "h1" ? 1 : 2 }),
    ).toBeTruthy();
    expect(screen.getByText("Private group")).toBeTruthy();
    expect(screen.getByText("Six members")).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Decorative group" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Read updates" }));
    expect(press).toHaveBeenCalledOnce();
  },
);

it("uses the default identity heading without optional title actions", () => {
  renderWithI18n(
    <RecordIdentityCard title="Table one" icon={UsersRound} background={null}>
      <span>Planning</span>
    </RecordIdentityCard>,
  );
  expect(screen.getByRole("heading", { name: "Table one", level: 1 })).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});

it.each(["invitation", "request"] as const)("provides the %s badge accessible name", (kind) => {
  renderWithI18n(<PendingArtworkBadge kind={kind} label={`Pending ${kind}`} />);
  expect(screen.getByRole("img", { name: `Pending ${kind}` })).toBeTruthy();
});

it("renders every legend description with decorative icons", () => {
  const view = renderWithI18n(<IconLegend items={[]} />);
  expect(screen.queryByRole("listitem")).toBeNull();
  view.rerender(
    <IconLegend
      items={[
        { icon: CalendarDays, description: "Dates" },
        { icon: Clock3, description: "Times" },
      ]}
    />,
  );
  expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
    "Dates",
    "Times",
  ]);
  expect(screen.queryByRole("img")).toBeNull();
});

it.each([undefined, 0])("does not announce an empty attention count: %s", (count) => {
  renderWithI18n(<NotificationCountBadge count={count} />);
  expect(screen.queryByRole("img")).toBeNull();
});

it.each([false, true])("renders an uncounted notification dot with corner=%s", (corner) => {
  renderWithI18n(<NotificationCountBadge count={3} corner={corner} />);
  const badge = screen.getByRole("img", { name: "Needs attention" });
  expect(badge.textContent).toBe("");
  expect(badge.style.position).toBe(corner ? "absolute" : "relative");
  expect(badge.style.width).toBe("8px");
});

it.each([3, 150])(
  "keeps the real notification count accessible while displaying %s compactly",
  (count) => {
    renderWithI18n(<NotificationCountBadge count={count} counted corner />);
    const badge = screen.getByRole("img", { name: `Notifications: ${count}` });
    expect(badge.textContent).toBe(count > 99 ? "99+" : String(count));
    expect(badge.style.top).toBe("-8px");
  },
);

it("renders a timezone-specific start and optional end without losing machine-readable dates", () => {
  const startsAt = "2030-06-12T17:00:00.000Z",
    endsAt = "2030-06-12T19:00:00.000Z";
  const view = renderWithI18n(<DateTimeInfo startsAt={startsAt} timeZone="UTC" />);
  expect(view.container.querySelectorAll("time")).toHaveLength(2);
  expect(screen.getByText("Start time:")).toBeTruthy();
  view.rerender(
    <DateTimeInfo
      startsAt={startsAt}
      endsAt={endsAt}
      timeZone="Europe/Rome"
      timeLabel="Arrival"
      dateStyle="full"
    />,
  );
  const times = [...view.container.querySelectorAll("time")];
  expect(times.map((element) => element.dateTime)).toEqual([startsAt, startsAt, endsAt]);
  expect(screen.getByText("Arrival:")).toBeTruthy();
  expect(screen.getByText("End time:")).toBeTruthy();
  expect(times[0].textContent).toContain("2030");
});
