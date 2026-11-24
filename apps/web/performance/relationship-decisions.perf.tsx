import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { UsersRound } from "lucide-react";
import { useState } from "react";
import { afterEach, expect, vi } from "vitest";
import { ContactLegend } from "@/components/contacts/ContactLegend";
import { UserMenu } from "@/components/contacts/UserMenu";
import { GroupInvitationCard } from "@/components/groups/GroupInvitationCard";
import { GroupJoinRequest } from "@/components/groups/GroupJoinRequest";
import { InviteCard } from "@/components/invites/InviteCard";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { measureWebFeature } from "./featureScenario";

const token = async () => "fixture-invite-token";
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "invite-owner", getToken: token }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());

const user = {
  id: "candidate",
  name: "Ada",
  username: "ada",
  email: null,
  avatarUrl: null,
  presence: { online: true, lastActiveAt: "2030-06-01T00:00:00.000Z" },
};
const onAction = vi.fn();

measureWebFeature(
  "UserMenu: dismiss then explicitly confirm a friend request",
  <UserMenu user={user} canSendFriendRequest onAction={onAction} />,
  async () => {
    const trigger = screen.getByRole("button", { name: "Actions" });
    async function chooseRequest() {
      fireEvent.click(trigger);
      const menu = within(await screen.findByRole("menu"));
      fireEvent.click(menu.getByRole("menuitem", { name: "Send friend request" }));
      return within(await screen.findByRole("dialog", { name: "Send friend request?" }));
    }
    const first = await chooseRequest();
    fireEvent.click(first.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onAction).not.toHaveBeenCalled();
    const accepted = await chooseRequest();
    fireEvent.click(accepted.getByRole("button", { name: "Send request" }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith("friend_request");
  },
  () => onAction.mockClear(),
);

measureWebFeature(
  "ContactLegend: disclose relationship and online status explanations",
  <ContactLegend
    title="Connections"
    icon={UsersRound}
    entries={[
      {
        icon: UsersRound,
        label: "Friends",
        color: "text-primary",
        description: "Friendship accepted.",
      },
    ]}
  />,
  async () => {
    fireEvent.click(screen.getByRole("button", { name: "Connections: Icon legend" }));
    expect(await screen.findByText("Friendship accepted.")).toBeVisible();
    expect(screen.getByText("Online")).toBeVisible();
    expect(screen.getByText("Offline")).toBeVisible();
  },
);

const host = "https://contact-invite-render.test";
const response = (index: number) => ({
  token: `synthetic-invite-${index}`,
  link: `${host}/invite/synthetic-invite-${index}`,
  email: null,
  expiresAt: "2030-06-10T10:00:00.000Z",
});
measureWebFeature(
  "InviteCard: generate and replace a shareable link through an explicit action",
  <InviteCard apiUrl={host} />,
  async () => {
    fireEvent.click(screen.getByRole("button", { name: "Create invite" }));
    expect(await screen.findByText(response(1).link)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "New invite" }));
    expect(await screen.findByText(response(2).link)).toBeVisible();
    expect(screen.queryByText(response(1).link)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  },
  () => {
    let count = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe(`${host}/api/invites`);
        expect(init?.method).toBe("POST");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-invite-token");
        expect(JSON.parse(String(init?.body))).toEqual({});
        return Response.json(response(++count));
      }),
    );
  },
);

function PendingMembership() {
  const [requested, request] = useState(false);
  return (
    <GroupJoinRequest
      pending={requested}
      busy={false}
      onRequest={() => request(true)}
      onCancel={() => request(false)}
    />
  );
}
measureWebFeature(
  "GroupJoinRequest: keep membership pending until a manager's response",
  <PendingMembership />,
  () => {
    fireEvent.click(screen.getByRole("button", { name: "Request membership" }));
    expect(screen.getByText(/Membership pending/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    expect(screen.queryByText(/Membership pending/)).toBeNull();
    expect(screen.getByRole("button", { name: "Request membership" })).toBeVisible();
  },
);

function ReceivedInvitation() {
  const [decision, setDecision] = useState("");
  return decision ? (
    <p>{decision}</p>
  ) : (
    <GroupInvitationCard
      groupId={groupRecord.id}
      busy={false}
      onAccept={() => setDecision("Invitation accepted")}
      onDecline={() => setDecision("Invitation declined")}
    />
  );
}
measureWebFeature(
  "GroupInvitationCard: preserve pending consent until the invitation is accepted",
  <ReceivedInvitation />,
  () => {
    expect(screen.getByRole("heading", { name: "Invitation received" })).toBeVisible();
    expect(screen.getByText(/Membership pending/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(screen.getByText("Invitation accepted")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Invitation received" })).toBeNull();
  },
);
