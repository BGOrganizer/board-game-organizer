import type { GroupMembership, GroupPersonResponse } from "@board-game-organizer/schemas";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupMembers } from "../GroupMembers";

const m = vi.hoisted(() => ({ people: [] as GroupPersonResponse[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useGroupMemberManagement: () => ({
    list: { items: m.people, isPending: false, isError: false, hasNextPage: false },
    isBusy: () => false,
    open: vi.fn(),
    blocking: false,
  }),
}));
vi.mock("../GroupMemberAttention", () => ({ GroupMemberAttention: () => null }));
it.each([
  ["admin", "Admin"],
  ["moderator", "Moderator"],
  ["member", "Member"],
  ["invited", "Awaiting acceptance"],
  ["requested", "Awaiting acceptance"],
] as const)("shows @username above the authoritative %s membership label", (kind, label) => {
  const membership: GroupMembership = {
    id: groupRecord.id,
    groupId: groupRecord.id,
    userId: "target",
    kind: kind === "requested" ? "REQUEST" : "INVITATION",
    status: kind === "invited" || kind === "requested" ? "PENDING" : "ACCEPTED",
    role: kind === "moderator" ? "MODERATOR" : "MEMBER",
    version: 1,
    createdAt: groupRecord.createdAt,
    updatedAt: groupRecord.updatedAt,
  };
  m.people = [
    {
      userId: "target",
      name: "Display person",
      username: "@handle",
      avatarUrl: null,
      isAdmin: kind === "admin",
      membership: kind === "admin" ? null : membership,
      ban: null,
    },
  ];
  const client = new QueryClient();
  renderWithI18n(
    <QueryClientProvider client={client}>
      <GroupMembers group={groupRecord} />
    </QueryClientProvider>,
  );
  expect(screen.getByText("@handle")).toBeTruthy();
  expect(screen.queryByText("Display person")).toBeNull();
  expect(screen.getByText(label)).toBeTruthy();
  expect(screen.queryByText("@@handle")).toBeNull();
  client.clear();
});
