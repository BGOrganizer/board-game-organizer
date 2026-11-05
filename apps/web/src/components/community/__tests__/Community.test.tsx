import type { CommunityActivity } from "@board-game-organizer/schemas";
import { CommunityApiError } from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ActivityRow } from "@/components/activities/ActivityRow";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { ProfileActivityRow } from "@/components/profile/ProfileActivityRow";
import { renderWithI18n } from "@/test-utils";
import { messages as en } from "../../../../../../messages/en.js";
import { messages as itMessages } from "../../../../../../messages/it.js";
import { Community } from "../Community";
import { CommunityActivities } from "../CommunityActivities";

const m = vi.hoisted(() => ({
  q: {} as Record<string, unknown>,
  options: { apiUrl: "https://api.test", userId: "viewer", getToken: async () => "token" },
  calls: vi.fn(),
  more: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useCommunityActivities: (...args: unknown[]) => {
    m.calls(...args);
    return m.q;
  },
}));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => m.options }));
vi.mock("@/lib/useInfiniteScroll", () => ({ useInfiniteScroll: () => () => undefined }));
const row = (
  id = "activity",
  author = { id: "friend", name: "Name", username: "friend", avatarUrl: null },
): CommunityActivity => ({
  id,
  kind: "table_join",
  occurredAt: "2030-06-03T12:00:00.000Z",
  context: "Public table",
  eventContext: "Public event",
  href: "/events/event/tables/table",
  author,
});
beforeEach(() => {
  useAppStore.setState({ communityViews: {} });
  vi.clearAllMocks();
  m.q = {
    data: undefined,
    isPending: true,
    isError: false,
    error: null,
    refetch: m.refetch,
    fetchNextPage: m.more,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
  };
});
it("keeps Activities/Marketplace and the activity-type filter scoped while navigating", async () => {
  renderWithI18n(<Community />);
  expect(screen.getByRole("heading", { name: "Community" })).toBeTruthy();
  for (const tab of screen.getAllByRole("tab")) {
    expect(tab.className).toContain("flex-row");
    expect(tab.className).toContain("whitespace-nowrap");
    expect(tab.querySelector("svg")).not.toBeNull();
  }
  fireEvent.click(screen.getByRole("tab", { name: "Marketplace" }));
  expect(screen.getByText("Coming soon")).toBeTruthy();
  expect(screen.getByText(/A place to buy, sell/)).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "Activities" }));
  fireEvent.click(screen.getByRole("button", { name: /Activity type/ }));
  fireEvent.click(await screen.findByRole("option", { name: "Game played" }));
  expect(
    useAppStore.getState().communityViews[JSON.stringify([m.options.apiUrl, "viewer"])]
      ?.activityKind,
  ).toBe("played");
  fireEvent.click(screen.getByRole("tab", { name: "Marketplace" }));
  fireEvent.click(screen.getByRole("tab", { name: "Activities" }));
  expect(screen.getByRole("button", { name: /Activity type/ }).textContent).toContain(
    "Game played",
  );
  expect(m.calls).toHaveBeenLastCalledWith(m.options, "all", "played");
  fireEvent.click(screen.getByRole("button", { name: /Activity type/ }));
  fireEvent.click(await screen.findByRole("option", { name: "All activity types" }));
  expect(
    useAppStore.getState().communityViews[JSON.stringify([m.options.apiUrl, "viewer"])]
      ?.activityKind,
  ).toBe("");
  expect(m.calls).toHaveBeenLastCalledWith(m.options, "all", undefined);
});
it("shows only server rows, public author/profile links, resource context, day groups and incremental paging", () => {
  m.q = {
    ...m.q,
    isPending: false,
    data: { pages: [{ items: [row()], nextCursor: "next" }] },
    hasNextPage: true,
  };
  const view = renderWithI18n(<CommunityActivities />);
  expect(screen.getByRole("link", { name: "friend" }).getAttribute("href")).toBe(
    "/profiles/friend",
  );
  expect(screen.getByRole("link", { name: "Public table" }).getAttribute("href")).toBe(
    "/events/event/tables/table",
  );
  expect(screen.getByText("Public event")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Load more" }));
  expect(m.more).toHaveBeenCalledOnce();
  m.q = { ...m.q, isFetchingNextPage: true };
  view.rerender(<CommunityActivities />);
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  m.q = { ...m.q, isFetchingNextPage: false, isFetchNextPageError: true };
  view.rerender(<CommunityActivities />);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(m.more).toHaveBeenCalledTimes(2);
});
it("distinguishes failed reads, denied cached rows and genuine empty responses", () => {
  m.q = {
    ...m.q,
    isPending: false,
    isError: true,
    error: new Error("offline"),
    data: { pages: [{ items: [row()] }] },
  };
  const view = renderWithI18n(<CommunityActivities />);
  expect(screen.getByText("Public table")).toBeTruthy();
  expect(screen.queryByText("No activities yet")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(m.refetch).toHaveBeenCalledOnce();
  m.q = { ...m.q, error: new CommunityApiError(403, "denied") };
  view.rerender(<CommunityActivities />);
  expect(screen.queryByText("Public table")).toBeNull();
  m.q = { ...m.q, isError: false, error: null, data: { pages: [{ items: [] }] } };
  view.rerender(<CommunityActivities />);
  expect(screen.getByText("No activities yet")).toBeTruthy();
});
it.each(["friendship", "follower"] as const)(
  "renders the same complete %s sentence and spacing as Profile, without avatars or nested links",
  (kind) => {
    expect(ActivityRow).toBe(ProfileActivityRow);
    const item = {
      ...row(),
      kind,
      context: "New contact",
      eventContext: undefined,
      href: "/profiles/contact",
    };
    const { container } = renderWithI18n(
      <GroupedList>
        <ActivityRow
          item={item}
          author={{ ...item.author, avatarUrl: "https://avatar.test/friend.png" }}
        />
      </GroupedList>,
    );
    const author = screen.getByRole("link", { name: "friend" });
    const contact = screen.getByRole("link", { name: "New contact" });
    expect(author.parentElement?.textContent).toBe(
      kind === "friendship"
        ? "friend became friends with New contact."
        : "New contact started following friend.",
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(container.querySelector("img")).toBeNull();
    expect(author.parentElement).toBe(contact.parentElement);
    expect(author.parentElement?.tagName).toBe("P");
    expect(author.querySelector("a")).toBeNull();
    expect(contact.querySelector("a")).toBeNull();
  },
);
it.each([
  { context: null, href: null },
  { context: null, href: "/profiles/contact" },
  { context: "Contact", href: null },
])("keeps author/resource fallbacks truthful: %j", (fields) => {
  const item = { ...row(), ...fields, eventContext: undefined };
  renderWithI18n(
    <GroupedList>
      <ActivityRow item={item} author={item.author} />
    </GroupedList>,
  );
  expect(screen.getByRole("link", { name: "friend" })).toBeTruthy();
  expect(screen.getAllByRole("link")).toHaveLength(fields.href ? 2 : 1);
});
it.each(["en", "it"] as const)(
  "renders rich %s narratives with safely linked names in one shared group",
  (locale) => {
    const i18n = setupI18n({ locale, messages: { [locale]: locale === "it" ? itMessages : en } });
    const items = [row("friendship"), row("follower")].map((item) => ({
      ...item,
      kind: item.id as "friendship" | "follower",
      context: "Other",
      href: "/profiles/other",
      eventContext: undefined,
    }));
    const { container } = renderWithI18n(
      <I18nProvider i18n={i18n}>
        <GroupedList>
          {items.map((item) => (
            <ActivityRow key={item.id} item={item} author={item.author} />
          ))}
        </GroupedList>
      </I18nProvider>,
    );
    expect(container.querySelectorAll("ul")).toHaveLength(1);
    const rows = screen.getAllByRole("listitem");
    expect(rows[0].textContent).toContain(
      locale === "it"
        ? "friend ha stretto amicizia con Other."
        : "friend became friends with Other.",
    );
    expect(rows[1].textContent).toContain(
      locale === "it" ? "Other ha iniziato a seguire friend." : "Other started following friend.",
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a a")).toBeNull();
  },
);
it("does not interpret user names as rich-message markup", () => {
  const item = { ...row(), context: "<script>bad</script>" };
  const { container } = renderWithI18n(
    <GroupedList>
      <ActivityRow item={item} author={{ ...item.author, username: "<img src=x>" }} />
    </GroupedList>,
  );
  expect(container.querySelector("img,script")).toBeNull();
  expect(screen.getByRole("listitem").textContent).toContain("<img src=x>");
  expect(screen.getByRole("listitem").textContent).toContain("<script>bad</script>");
});
it("does not nest actor/resource links and uses safe identity fallbacks", () => {
  const view = renderWithI18n(
    <ul>
      <ActivityRow
        item={row()}
        author={{ id: "safe", name: "Display", username: null, avatarUrl: null }}
      />
    </ul>,
  );
  expect(screen.getByRole("link", { name: "Display" }).querySelector("a")).toBeNull();
  view.rerender(
    <ul>
      <ActivityRow
        item={row()}
        author={{ id: "safe", name: "", username: null, avatarUrl: null }}
      />
    </ul>,
  );
  expect(screen.getByRole("link", { name: "Someone" })).toBeTruthy();
});
