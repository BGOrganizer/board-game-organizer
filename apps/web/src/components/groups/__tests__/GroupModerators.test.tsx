import type { GroupPersonResponse } from "@board-game-organizer/schemas";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupDetail } from "../GroupDetail";
import { GroupMemberActions } from "../GroupMemberActions";
import { GroupMembers } from "../GroupMembers";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());
const member = (moderator = false): GroupPersonResponse => ({
  userId: "guest",
  name: "Member",
  username: null,
  avatarUrl: null,
  isAdmin: false,
  ban: null,
  membership: {
    id: groupRecord.id,
    groupId: groupRecord.id,
    userId: "guest",
    kind: "INVITATION",
    status: "ACCEPTED",
    role: moderator ? "MODERATOR" : "MEMBER",
    version: 1,
    createdAt: groupRecord.createdAt,
    updatedAt: groupRecord.updatedAt,
  },
});
it.each([
  [false, "Make moderator", "promote"],
  [true, "Demote to member", "demote"],
] as const)(
  "opens one accent action and an icon-bearing bottom menu for moderator=%s",
  async (moderator, label, action) => {
    const select = vi.fn();
    renderWithI18n(
      <GroupMemberActions
        group={groupRecord}
        person={member(moderator)}
        busy={false}
        onAction={select}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Manage member: Member" });
    expect(trigger.className).toContain("button--primary");
    expect(screen.queryByRole("button", { name: "Ban from group" })).toBeNull();
    fireEvent.click(trigger);
    const sheet = await screen.findByRole("dialog");
    const options = within(sheet)
      .getAllByRole("button")
      .filter((b) => b.textContent !== "Cancel");
    expect(options.map((b) => b.textContent)).toEqual(["Ban from group", "Remove member", label]);
    expect(options.every((b) => b.querySelector("svg"))).toBe(true);
    fireEvent.click(within(sheet).getByRole("button", { name: label }));
    expect(select).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledWith(action);
  },
);
it("omits role assignment for moderators and hides protected creator/peer targets", async () => {
  const group = { ...groupRecord, role: "moderator" as const };
  const view = renderWithI18n(
    <GroupMemberActions group={group} person={member()} busy={false} onAction={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Manage member: Member" }));
  const sheet = await screen.findByRole("dialog");
  expect(within(sheet).queryByRole("button", { name: "Make moderator" })).toBeNull();
  fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
  view.rerender(
    <GroupMemberActions group={group} person={member(true)} busy={false} onAction={vi.fn()} />,
  );
  expect(screen.queryByRole("button", { name: "Manage member: Member" })).toBeNull();
  view.rerender(
    <GroupMemberActions
      group={group}
      person={{ ...member(), isAdmin: true }}
      busy={false}
      onAction={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: "Manage member: Member" })).toBeNull();
});
it("optimistically shows the moderator role, then rolls back only a rejected role assignment", async () => {
  const person = member();
  let release!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return pending;
      if (url.endsWith(`/groups/${groupRecord.id}`)) return Response.json(groupRecord);
      return Response.json({
        items:
          new URL(url).searchParams.get("mode") === "accepted"
            ? [
                person,
                {
                  ...person,
                  userId: "safe",
                  name: "Safe member",
                  membership: { ...person.membership, userId: "safe" },
                },
              ]
            : [],
        nextCursor: null,
      });
    }),
  );
  renderWithI18n(<GroupMembers group={groupRecord} />);
  fireEvent.click(await screen.findByRole("button", { name: "Manage member: Member" }));
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name: "Make moderator" }),
  );
  fireEvent.click(
    within(await screen.findByRole("dialog", { name: "Make moderator: Member" })).getByRole(
      "button",
      { name: "Make moderator" },
    ),
  );
  await screen.findByRole("img", { name: "Group moderator" });
  expect(screen.getByText("Safe member")).toBeTruthy();
  release(Response.json({ error: "GROUP_ADMIN_REQUIRED" }, { status: 403 }));
  await waitFor(() => expect(screen.queryByRole("img", { name: "Group moderator" })).toBeNull());
  expect(screen.getByText("Safe member")).toBeTruthy();
});
it("never confuses moderator edit powers with creator-only Group deletion", async () => {
  const group = {
    ...groupRecord,
    role: "moderator",
    adminUserId: "creator",
    myMembership: { ...member(true).membership, userId: "owner" },
    canEdit: true,
    canInvite: true,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith(`/groups/${groupRecord.id}`) ? group : { items: [], nextCursor: null },
      ),
    ),
  );
  renderWithI18n(
    <>
      <div id="page-header-actions" />
      <GroupDetail groupId={groupRecord.id} />
    </>,
  );
  await screen.findByRole("button", { name: "Leave group" });
  expect(screen.queryByRole("button", { name: "Delete group" })).toBeNull();
  expect(screen.getByRole("link", { name: "Edit group" })).toBeTruthy();
});
it.each(["promote", "demote", "remove", "ban"] as const)(
  "requires a separate explicit %s confirmation and preserves the pinned membership version",
  async (action) => {
    let person = member(action === "demote"),
      submitted = false;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH" || init?.method === "POST") {
        submitted = true;
        if (action === "ban")
          return Response.json({ groupId: groupRecord.id, userId: "guest", until: null });
        person = {
          ...person,
          membership: {
            ...person.membership!,
            role: action === "promote" ? "MODERATOR" : "MEMBER",
            status: action === "remove" ? "LEFT" : "ACCEPTED",
            version: 2,
          },
        };
        return Response.json(person.membership);
      }
      if (url.endsWith(`/groups/${groupRecord.id}`)) return Response.json(groupRecord);
      return Response.json({
        items: new URL(url).searchParams.get("mode") === "accepted" && !submitted ? [person] : [],
        nextCursor: null,
      });
    });
    vi.stubGlobal("fetch", fetch);
    renderWithI18n(<GroupMembers group={groupRecord} />);
    fireEvent.click(await screen.findByRole("button", { name: "Manage member: Member" }));
    const sheet = await screen.findByRole("dialog");
    const label = {
      promote: "Make moderator",
      demote: "Demote to member",
      remove: "Remove member",
      ban: "Ban from group",
    }[action];
    fireEvent.click(within(sheet).getByRole("button", { name: label }));
    const confirm = await screen.findByRole("dialog", { name: `${label}: Member` });
    expect(submitted).toBe(false);
    const button = within(confirm).getByRole("button", { name: label });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(submitted).toBe(true));
    const writes = fetch.mock.calls.filter(
      ([, init]) => init?.method === "PATCH" || init?.method === "POST",
    );
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0][1]?.body))).toEqual(
      action === "ban" ? { userId: "guest", until: null } : { action, version: 1 },
    );
  },
);
