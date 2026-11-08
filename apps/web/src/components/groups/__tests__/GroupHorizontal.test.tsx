import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord, plannedEvent } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { messages as en } from "../../../../../../messages/en.js";
import { messages as itMessages } from "../../../../../../messages/it.js";
import { GroupArtwork } from "../GroupArtwork";
import { GroupCard } from "../GroupCard";

afterEach(() => vi.unstubAllGlobals());
async function close() {
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}
it.each([0, 1, 2])(
  "localizes %s members/events without adding admin or moderators twice",
  (count) => {
    const i18n = setupI18n({ locale: "it", messages: { it: itMessages, en } });
    renderWithI18n(
      <I18nProvider i18n={i18n}>
        <GroupCard group={{ ...groupRecord, memberCount: count, eventCount: count }} />
      </I18nProvider>,
    );
    expect(screen.getByText(`${count} ${count === 1 ? "Membro" : "Membri"}`)).not.toBeNull();
    expect(screen.getByText(`${count} ${count === 1 ? "Evento" : "Eventi"}`)).not.toBeNull();
    expect(screen.getByText("·")).not.toBeNull();
  },
);
it.each([
  ["admin", "Group admin", "crown", "warning"],
  ["moderator", "Group moderator", "shield-check", "accent"],
  ["accepted", "Group member", "user-round-check", "success"],
  ["invited", "Invitation received", "mail", "warning"],
  ["requested", "Membership requested", "clock-3", "warning"],
] as const)(
  "uses the current %s role with a compact semantic icon, not another membership",
  (role, label, icon, color) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    renderWithI18n(<GroupCard group={{ ...groupRecord, role }} />);
    const button = screen.getByRole("button", { name: label });
    expect(button.className).toContain(`text-${color}-soft-foreground`);
    expect(button.querySelector(`svg.lucide-${icon}.size-4`)).not.toBeNull();
    expect(button.querySelector(".size-7.bg-default")).not.toBeNull();
    expect(button.className).toContain("min-h-11 min-w-11");
    expect(button.closest("a")).toBeNull();
    expect(button.parentElement?.className).toContain("flex-nowrap");
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it("uses whole left artwork, title/people and separate count icons with unchanged navigation", () => {
  renderWithI18n(
    <GroupCard
      group={{ ...groupRecord, memberCount: 4, eventCount: 2 }}
      href="/moderation/group"
    />,
  );
  const link = screen.getByRole("link");
  expect(link.getAttribute("href")).toBe("/moderation/group");
  expect(link.closest(".card")?.querySelector("img")?.className).toContain("object-contain");
  expect(
    screen.getByText("4 Members").parentElement?.querySelector("svg.lucide-users-round"),
  ).not.toBeNull();
  expect(
    screen.getByText("2 Events").parentElement?.querySelector("svg.lucide-calendar-days"),
  ).not.toBeNull();
});
it.each([
  { canViewEvents: false, eventCount: 9 },
  { canViewEvents: true, eventCount: null },
])("keeps unavailable Event counts undisclosed (%j)", (counts) => {
  renderWithI18n(<GroupCard group={{ ...groupRecord, ...counts, role: "none" }} />);
  expect(screen.getByText("1 Member")).not.toBeNull();
  expect(screen.queryByText(/\d+ Events?/)).toBeNull();
  expect(screen.queryByText("·")).toBeNull();
  expect(screen.queryByRole("button", { name: "Group member" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Viewer" })).toBeNull();
});
it.each(["PRIVATE", "PUBLIC"] as const)(
  "explains %s in its own icon without navigating, exposing a venue only in help",
  async (type) => {
    const nav = vi.fn();
    renderWithI18n(
      <GroupCard group={{ ...groupRecord, type, location: plannedEvent.locations[0] }} />,
    );
    screen.getByRole("link").addEventListener("click", nav);
    expect(screen.queryByText("Via Roma 1")).toBeNull();
    const label = type === "PUBLIC" ? "Public" : "Private",
      button = screen.getByRole("button", { name: label });
    expect(
      button.querySelector(type === "PUBLIC" ? "svg.lucide-globe" : "svg.lucide-lock-keyhole"),
    ).not.toBeNull();
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Via Roma 1")).not.toBeNull();
    expect(nav).not.toHaveBeenCalled();
    await close();
    expect(screen.queryByRole("button", { name: "Awaiting review" })).toBeNull();
    expect(Boolean(screen.queryByRole("button", { name: "Approved" }))).toBe(type === "PUBLIC");
  },
);
it.each([
  {
    approved: groupRecord.approved,
    reviewStatus: undefined,
    label: "Approved",
    color: "success",
    icon: "circle-check",
    body: "This public group is approved.",
  },
  {
    approved: undefined,
    reviewStatus: "PENDING" as const,
    label: "Awaiting review",
    color: "warning",
    icon: "clock-3",
    body: "This public group is awaiting review.",
  },
  {
    approved: groupRecord.approved,
    reviewStatus: "PENDING" as const,
    label: "Awaiting review",
    color: "warning",
    icon: "clock-3",
    body: "This public group is awaiting review.",
  },
  {
    approved: groupRecord.approved,
    reviewStatus: "REJECTED" as const,
    label: "Changes rejected",
    color: "danger",
    icon: "circle-x",
    body: "These changes were rejected.",
  },
  {
    approved: undefined,
    reviewStatus: "REJECTED" as const,
    label: "Changes rejected",
    color: "danger",
    icon: "circle-x",
    body: "These changes were rejected.",
  },
])(
  "retains public $label status, approved revision and rejection truth",
  async ({ label, color, icon, body, ...state }) => {
    renderWithI18n(
      <GroupCard
        group={{
          ...groupRecord,
          type: "PUBLIC",
          ...state,
          rejectionReason: state.approved ? "Verify venue" : undefined,
        }}
      />,
    );
    const button = screen.getByRole("button", { name: label });
    expect(button.className).toContain(`text-${color}-soft-foreground`);
    expect(button.querySelector(`svg.lucide-${icon}`)).not.toBeNull();
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(body)).not.toBeNull();
    expect(
      Boolean(
        within(dialog).queryByText(
          "Approved information remains visible while changes are reviewed.",
        ),
      ),
    ).toBe(Boolean(state.approved && state.reviewStatus === "PENDING"));
    expect(Boolean(within(dialog).queryByText("Verify venue"))).toBe(
      Boolean(state.approved && state.reviewStatus === "REJECTED"),
    );
  },
);
it("keeps source-complete admin request attention and explicit invitation reply help", () => {
  renderWithI18n(<GroupCard group={{ ...groupRecord, pendingRequestCount: 2 }} />);
  expect(screen.getByRole("button", { name: "Group admin · Requests to review" })).not.toBeNull();
});
it("keeps uploaded cover logos whole and leaves non-list background/thumbnail usage intact", () => {
  const group = { ...groupRecord, logo: "data:image/png;base64,test" };
  const q = renderWithI18n(<GroupArtwork group={group} presentation="cover" status="none" />);
  expect(q.container.querySelector("img")?.className).toContain("object-contain p-1");
  expect(q.container.firstElementChild?.className).toContain("absolute inset-0");
  q.rerender(<GroupArtwork group={group} presentation="background" />);
  expect(q.container.querySelector("img")?.style.width).toBe("100%");
  q.rerender(<GroupArtwork group={group} size={40} />);
  expect(q.container.querySelector("img")?.style.width).toBe("40px");
});
