import type {
  GroupMembership,
  GroupPersonResponse,
  TableRegistration,
} from "@board-game-organizer/schemas";
import { eventRecordQuery, groupRecordDetailQuery } from "@board-game-organizer/shared";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
import { type ReactNode, useState } from "react";
import { Share } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import EventInviteScreen from "@/app/event/invite";
import GroupInviteScreen from "@/app/group/invite";
import { GroupInvitationCard } from "@/components/groups/GroupInvitationCard";
import { GroupMemberPicker } from "@/components/groups/GroupMemberPicker";
import { InviteCard } from "@/components/invites/InviteCard";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { groupRecord, plannedEvent, plannedTable } from "../../web/src/test-fixtures/eventRecords";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => ({
  apiUrl: "https://native-picker-perf.test",
  token: async () => "picker-fixture-token",
  back: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "fixture-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.token,
  }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: boundary.apiUrl } } },
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ back: boundary.back }),
  useLocalSearchParams: () => ({
    groupId: groupRecord.id,
    eventId: plannedEvent.id,
    tableId: plannedTable.id,
  }),
  Stack: { Screen: () => null },
}));

const options = {
  apiUrl: boundary.apiUrl,
  userId: "owner",
  enabled: true,
  getToken: boundary.token,
};
const candidate = {
  id: "alice",
  name: "Alice Player",
  username: "alice",
  avatarUrl: null,
  email: null,
};
const groupPath = `/api/groups/${groupRecord.id}`;
const eventPath = `/api/events/${plannedEvent.id}`;
const tablePath = `${eventPath}/tables/${plannedTable.id}`;
const invite = {
  token: "fixture_invite_token_01",
  link: `${boundary.apiUrl}/invite/fixture_invite_token_01`,
  email: null,
  expiresAt: "2030-06-08T10:00:00.000Z",
};

function request(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : input);
  expect(url.origin).toBe(boundary.apiUrl);
  expect(new Headers(init?.headers).get("authorization")).toBe("Bearer picker-fixture-token");
  return { pathname: url.pathname, method: init?.method ?? "GET" };
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

function providers(client: QueryClient) {
  return function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <NativeTestProviders>{children}</NativeTestProviders>
      </QueryClientProvider>
    );
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("GroupPeoplePicker: select an authorized invitee and keep acceptance pending", async () => {
  const client = createClient();
  const reads = vi.fn();
  const writes = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname, method } = request(input, init);
      if (method === "GET") {
        reads(pathname);
        if (pathname === groupPath) return Response.json(groupRecord);
        if (pathname === `${groupPath}/invitees`) {
          return Response.json({
            items: writes.mock.calls.length ? [] : [candidate],
            nextCursor: null,
          });
        }
      }
      if (method === "POST" && pathname === `${groupPath}/members`) {
        const body = JSON.parse(String(init?.body)) as { userId: string };
        writes(body);
        const membership: GroupMembership = {
          id: "44444444-4444-4444-8444-444444444444",
          groupId: groupRecord.id,
          userId: body.userId,
          kind: "INVITATION",
          status: "PENDING",
          version: 1,
          createdAt: groupRecord.createdAt,
          updatedAt: groupRecord.updatedAt,
        };
        return Response.json(membership);
      }
      throw new Error(`Unexpected group picker request: ${method} ${pathname}`);
    }),
  );
  try {
    const measured = await measureRenders(<GroupInviteScreen />, {
      wrapper: providers(client),
      beforeEach: () => {
        client.clear();
        client.setQueryData(groupRecordDetailQuery(options, groupRecord.id).queryKey, groupRecord);
        reads.mockClear();
        writes.mockClear();
        boundary.back.mockClear();
      },
      scenario: async () => {
        const [select] = await screen.findAllByRole("button", {
          name: "Select user: Alice Player",
        });
        expect(reads).toHaveBeenCalledWith(`${groupPath}/invitees`);
        expect(writes).not.toHaveBeenCalled();
        await userEvent.setup().press(select);
        await waitFor(() => expect(writes).toHaveBeenCalledExactlyOnceWith({ userId: "alice" }));
        expect(boundary.back).toHaveBeenCalledExactlyOnceWith();
      },
    });
    assertRenderMeasurement(measured);
  } finally {
    await client.cancelQueries();
    client.clear();
  }
});

it("EventInvitationPicker: validate guest input and return only after the guest receipt", async () => {
  const client = createClient();
  const writes = vi.fn();
  let guestResponse: Promise<Response> | undefined;
  let accept: ((response: Response) => void) | undefined;
  let receipt: TableRegistration | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname, method } = request(input, init);
      if (method === "GET") {
        if (pathname === eventPath) {
          return Response.json({
            ...plannedEvent,
            version: plannedEvent.version + (receipt ? 1 : 0),
          });
        }
        if (pathname === tablePath)
          return Response.json({ ...plannedTable, pendingCount: receipt ? 1 : 0 });
        if (pathname === `${tablePath}/invitations`) {
          return Response.json({
            items: [{ ...candidate, invitationBlockReason: null }],
            eventVersion: plannedEvent.version + (receipt ? 1 : 0),
            nextCursor: null,
          });
        }
      }
      if (method === "POST" && pathname === `${tablePath}/guests`) {
        const payload = JSON.parse(String(init?.body)) as { requestId: string; name: string };
        writes(payload);
        receipt = {
          id: payload.requestId,
          eventId: plannedEvent.id,
          tableId: plannedTable.id,
          userId: "guest:88888888-8888-4888-8888-888888888888",
          kind: "GUEST",
          guestName: payload.name,
          status: "ACCEPTED",
          priorityAt: plannedEvent.createdAt,
          sequence: 1,
          gameVotes: {},
          version: 1,
          createdAt: plannedEvent.createdAt,
          updatedAt: plannedEvent.updatedAt,
        };
        return (
          guestResponse ?? Response.json({ ...receipt, eventVersion: plannedEvent.version + 1 })
        );
      }
      throw new Error(`Unexpected event picker request: ${method} ${pathname}`);
    }),
  );
  try {
    const measured = await measureRenders(<EventInviteScreen />, {
      wrapper: providers(client),
      beforeEach: () => {
        client.clear();
        client.setQueryData(eventRecordQuery(options, plannedEvent.id).queryKey, plannedEvent);
        writes.mockClear();
        boundary.back.mockClear();
        receipt = undefined;
        guestResponse = new Promise((resolve) => {
          accept = resolve;
        });
      },
      scenario: async () => {
        const user = userEvent.setup();
        await screen.findByText("@alice");
        const open = await screen.findByRole("button", { name: "Add a guest" });
        expect(screen.queryByLabelText("Username")).toBeNull();
        await user.press(open);
        const input = await screen.findByLabelText("Username");
        const email = screen.getByLabelText("Email");
        const add = screen.getByRole("button", { name: "Add" });
        expect(add).toBeDisabled();
        await fireEvent.changeText(input, " Guest Alice ");
        await fireEvent.changeText(email, "invalid");
        await fireEvent(email, "blur", { nativeEvent: { target: 2 } });
        expect(await screen.findByText("Enter a valid email address.")).toBeOnTheScreen();
        expect(add).toBeDisabled();
        expect(writes).not.toHaveBeenCalled();
        await fireEvent.changeText(email, "");
        await user.press(add);
        await waitFor(() =>
          expect(writes).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ name: "Guest Alice" }),
          ),
        );
        expect(writes.mock.calls[0][0]).not.toHaveProperty("email");
        expect(boundary.back).not.toHaveBeenCalled();
        await act(() => {
          if (!receipt) throw new Error("Expected an accepted guest receipt");
          accept?.(Response.json({ ...receipt, eventVersion: plannedEvent.version + 1 }));
        });
        await waitFor(() => expect(boundary.back).toHaveBeenCalledExactlyOnceWith());
        expect(screen.queryByLabelText("Username")).toBeNull();
      },
    });
    assertRenderMeasurement(measured);
  } finally {
    await client.cancelQueries();
    client.clear();
  }
});

it("InviteCard: generate a personal invite and display the shareable server link", async () => {
  const client = createClient();
  const share = vi.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
  const writes = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname, method } = request(input, init);
      expect(pathname).toBe("/api/invites");
      expect(method).toBe("POST");
      writes(JSON.parse(String(init?.body)));
      return Response.json(invite);
    }),
  );
  try {
    const measured = await measureRenders(<InviteCard apiUrl={boundary.apiUrl} token={null} />, {
      wrapper: providers(client),
      beforeEach: () => {
        client.clear();
        writes.mockClear();
        share.mockClear();
      },
      scenario: async () => {
        expect(screen.getByText("Invite a friend")).toBeVisible();
        expect(writes).not.toHaveBeenCalled();
        expect(share).not.toHaveBeenCalled();
        await userEvent.setup().press(screen.getByRole("button", { name: "Create invite" }));
        expect(await screen.findByText(invite.link)).toBeVisible();
        expect(writes).toHaveBeenCalledExactlyOnceWith({});
        expect(share).toHaveBeenCalledExactlyOnceWith({ message: invite.link });
      },
    });
    assertRenderMeasurement(measured);
  } finally {
    await client.cancelQueries();
    client.clear();
  }
});

it("GroupMemberPicker: select an accepted demonstrator without exposing an already assigned member", async () => {
  const client = createClient();
  const select = vi.fn();
  const admin: GroupPersonResponse = {
    userId: "admin",
    name: "Club Organizer",
    username: "club-organizer",
    avatarUrl: null,
    isAdmin: true,
    membership: null,
    ban: null,
  };
  const assigned: GroupPersonResponse = {
    ...admin,
    userId: "assigned",
    name: "Assigned Player",
    username: "assigned",
    isAdmin: false,
    membership: {
      id: "44444444-4444-4444-8444-444444444444",
      groupId: groupRecord.id,
      userId: "assigned",
      kind: "INVITATION",
      status: "ACCEPTED",
      version: 1,
      createdAt: groupRecord.createdAt,
      updatedAt: groupRecord.updatedAt,
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const { pathname, method } = request(input, init);
      const url = new URL(input instanceof Request ? input.url : input);
      expect(method).toBe("GET");
      expect(pathname).toBe(`${groupPath}/members`);
      expect(url.searchParams.get("mode")).toBe("accepted");
      return Response.json({ items: [admin, assigned], nextCursor: null });
    }),
  );
  try {
    const measured = await measureRenders(
      <GroupMemberPicker groupId={groupRecord.id} excludeIds={["assigned"]} onSelect={select} />,
      {
        wrapper: providers(client),
        beforeEach: () => {
          client.clear();
          select.mockClear();
        },
        scenario: async () => {
          expect(await screen.findByText("Club Organizer")).toBeVisible();
          expect(screen.getByText("Admin")).toBeVisible();
          expect(screen.queryByText("Assigned Player")).toBeNull();
          expect(select).not.toHaveBeenCalled();
          await userEvent
            .setup()
            .press(screen.getByRole("button", { name: "Select user: Club Organizer" }));
          expect(select).toHaveBeenCalledExactlyOnceWith({
            id: "admin",
            name: "Club Organizer",
            avatarUrl: null,
          });
        },
      },
    );
    assertRenderMeasurement(measured);
  } finally {
    await client.cancelQueries();
    client.clear();
  }
});

it("GroupInvitationCard: a pending explicit decision disables both invitation actions", async () => {
  const accept = vi.fn();
  const decline = vi.fn();
  function Invitation() {
    const [busy, setBusy] = useState(false);
    return (
      <GroupInvitationCard
        groupId={groupRecord.id}
        busy={busy}
        onAccept={() => {
          accept();
          setBusy(true);
        }}
        onDecline={decline}
      />
    );
  }
  const measured = await measureRenders(<Invitation />, {
    wrapper: NativeTestProviders,
    beforeEach: () => {
      accept.mockClear();
      decline.mockClear();
    },
    scenario: async () => {
      const heading = screen.getByText("Invitation received");
      expect(heading).toBeVisible();
      expect(heading).toHaveProp("accessibilityRole", "header");
      const yes = screen.getByRole("button", { name: "Accept" });
      const no = screen.getByRole("button", { name: "Decline" });
      expect(yes).toBeEnabled();
      expect(no).toBeEnabled();
      expect(accept).not.toHaveBeenCalled();
      const user = userEvent.setup();
      await user.press(yes);
      expect(yes).toBeDisabled();
      expect(no).toBeDisabled();
      await user.press(no);
      expect(accept).toHaveBeenCalledOnce();
      expect(decline).not.toHaveBeenCalled();
    },
  });
  assertRenderMeasurement(measured);
});
