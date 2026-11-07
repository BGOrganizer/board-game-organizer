import type {
  GroupMembership,
  GroupPersonResponse,
  GroupRecordResponse,
} from "@board-game-organizer/schemas";
import {
  type CommunityApiOptions,
  clearSessionQueryCache,
  groupRecordKeys,
  useGroupRecordActions,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupMembers } from "../GroupMembers";
import { GroupPeoplePicker } from "../GroupPeoplePicker";

const mocks = vi.hoisted(() => ({
  options: {} as CommunityApiOptions,
  back: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => mocks.options }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: mocks.back, push: mocks.push }) }));
vi.mock("@/components/contacts/PeoplePicker", () => ({
  PeoplePicker: ({
    disabled,
    onSelect,
  }: {
    disabled: boolean;
    onSelect: (person: object) => void;
  }) => (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect({ id: "guest", name: "Guest", username: "guest", avatarUrl: null })}
      >
        Select Guest
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onSelect({ id: "second", name: "Second", username: "second", avatarUrl: null })
        }
      >
        Select Second
      </button>
    </>
  ),
}));
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  const options = {
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: vi.fn(async () => "fresh"),
    feedback: { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
  };
  mocks.options = options;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, options, wrapper };
}
function membership(
  groupId: string,
  userId: string,
  kind: "INVITATION" | "REQUEST" = "INVITATION",
): GroupMembership {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    groupId,
    userId,
    kind,
    status: "PENDING",
    version: 1,
    createdAt: groupRecord.createdAt,
    updatedAt: groupRecord.updatedAt,
  };
}
function person(row: GroupMembership, name: string): GroupPersonResponse {
  return {
    userId: row.userId,
    name,
    username: row.userId,
    avatarUrl: null,
    isAdmin: false,
    membership: row,
    ban: null,
  };
}
const owner: GroupPersonResponse = {
  userId: "owner",
  name: "Owner",
  username: "owner",
  avatarUrl: null,
  isAdmin: true,
  membership: null,
  ban: null,
};
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) clearSessionQueryCache(client);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("returns from the Group picker before POST, preserves a held metadata read and independently rolls back the second known person", async () => {
  const { client, options, wrapper } = setup();
  client.setQueryData(groupRecordKeys.detail(options, groupRecord.id), groupRecord);
  let saved = false;
  let metadata: { resolve: (response: Response) => void; signal?: AbortSignal | null } | undefined;
  const invite = membership(groupRecord.id, "guest");
  const writes: Array<{ input: object; resolve: (response: Response) => void }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return new Promise<Response>((resolve) =>
          writes.push({ input: JSON.parse(String(init.body)), resolve }),
        );
      if (url.includes("/members?")) {
        const mode = new URL(url).searchParams.get("mode");
        return Response.json({
          items:
            mode === "accepted"
              ? [owner]
              : mode === "pending" && saved
                ? [person(invite, "Guest")]
                : [],
          nextCursor: null,
        });
      }
      if (saved)
        return new Promise<Response>((resolve) => {
          metadata = { resolve, signal: init?.signal };
        });
      return Response.json(groupRecord);
    }),
  );
  renderWithI18n(
    wrapper({
      children: (
        <>
          <GroupPeoplePicker groupId={groupRecord.id} />
          <GroupMembers group={groupRecord} />
        </>
      ),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Select Guest" }));
  expect(mocks.back).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.getByText("Guest")).toBeTruthy());
  expect(screen.getByText("Sending invitation")).toBeTruthy();
  expect(writes).toHaveLength(1);
  expect(writes[0].input).toEqual({ userId: "guest" });
  saved = true;
  await act(async () => writes[0].resolve(Response.json(invite)));
  await waitFor(() => expect(metadata).toBeDefined());
  const firstMetadata = metadata;
  if (!firstMetadata) throw new Error("Missing metadata read");
  fireEvent.click(screen.getByRole("button", { name: "Select Second" }));
  expect(mocks.back).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(screen.getByText("Second")).toBeTruthy());
  expect(writes).toHaveLength(1);
  expect(firstMetadata.signal?.aborted).toBe(false);
  expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledTimes(2);
  await act(async () => firstMetadata.resolve(Response.json({ ...groupRecord, version: 2 })));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1].input).toEqual({ userId: "second" });
  await act(async () =>
    writes[1].resolve(Response.json({ error: "MEMBERSHIP_CHANGED" }, { status: 409 })),
  );
  await waitFor(() => expect(screen.queryByText("Second")).toBeNull());
  expect(screen.getByText("Guest")).toBeTruthy();
  expect(screen.getByRole("img", { name: "Invited" })).toBeTruthy();
  expect(options.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "invite_group_member");
  expect(options.feedback.onSuccess).not.toHaveBeenCalled();
});

it("serializes only the same Group, never unrelated GroupList targets sharing one hook", async () => {
  const { client, options, wrapper } = setup();
  const secondId = "55555555-5555-4555-8555-555555555555";
  const groups = new Map<string, GroupRecordResponse>([
    [groupRecord.id, groupRecord],
    [secondId, { ...groupRecord, id: secondId, name: "Other group" }],
  ]);
  for (const [id, row] of groups) client.setQueryData(groupRecordKeys.detail(options, id), row);
  const writes: Array<{ id: string; userId: string; resolve: (response: Response) => void }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const id = new URL(url).pathname.split("/groups/")[1].split("/")[0];
      if (init?.method === "POST")
        return new Promise<Response>((resolve) =>
          writes.push({ id, userId: JSON.parse(String(init.body)).userId, resolve }),
        );
      return Response.json(groups.get(id));
    }),
  );
  const hook = renderHook(() => useGroupRecordActions(options), { wrapper });
  act(() => {
    hook.result.current.invite.mutate({ id: groupRecord.id, userId: "first" });
    hook.result.current.invite.mutate({ id: groupRecord.id, userId: "second" });
    hook.result.current.invite.mutate({ id: secondId, userId: "third" });
  });
  await waitFor(() => expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes.map((write) => write.userId).sort()).toEqual(["first", "third"]);
  const independent = writes.find((write) => write.id === secondId);
  const first = writes.find((write) => write.id === groupRecord.id);
  if (!independent || !first) throw new Error("Missing concurrent Group requests");
  await act(async () => independent.resolve(Response.json(membership(secondId, "third"))));
  await waitFor(() => expect(hook.result.current.isBusy(secondId)).toBe(false));
  expect(writes).toHaveLength(2);
  expect(hook.result.current.isBusy(groupRecord.id)).toBe(true);
  await act(async () => first.resolve(Response.json(membership(groupRecord.id, "first"))));
  await waitFor(() => expect(writes).toHaveLength(3));
  expect(writes[2].userId).toBe("second");
  await act(async () =>
    writes[2].resolve(Response.json({ error: "INVITATION_ALREADY_EXISTS" }, { status: 409 })),
  );
  await waitFor(() => expect(hook.result.current.isBusy(groupRecord.id)).toBe(false));
});

it("closes per-person membership dialogs before PATCH and keeps another request actionable while preserving the first commit", async () => {
  const { client, options, wrapper } = setup();
  client.setQueryData(groupRecordKeys.detail(options, groupRecord.id), groupRecord);
  const first = membership(groupRecord.id, "first", "REQUEST"),
    second = membership(groupRecord.id, "second", "REQUEST");
  let accepted = false;
  const writes: Array<{ input: object; resolve: (response: Response) => void }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH")
        return new Promise<Response>((resolve) =>
          writes.push({ input: JSON.parse(String(init.body)), resolve }),
        );
      if (url.includes("/members?")) {
        const mode = new URL(url).searchParams.get("mode");
        return Response.json({
          items:
            mode === "accepted"
              ? [
                  owner,
                  ...(accepted
                    ? [person({ ...first, status: "ACCEPTED", version: 2 }, "First")]
                    : []),
                ]
              : mode === "pending"
                ? [...(accepted ? [] : [person(first, "First")]), person(second, "Second")]
                : [],
          nextCursor: null,
        });
      }
      return Response.json({ ...groupRecord, memberCount: accepted ? 2 : 1 });
    }),
  );
  renderWithI18n(wrapper({ children: <GroupMembers group={groupRecord} /> }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Respond to membership request: First" }),
  );
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(writes).toHaveLength(1));
  const other = screen.getByRole("button", {
    name: "Respond to membership request: Second",
  }) as HTMLButtonElement;
  expect(other.disabled).toBe(false);
  expect(
    (
      screen.getByRole("button", {
        name: "Respond to membership request: First",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(other);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reject" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(options.feedback.onOptimisticUpdate).toHaveBeenCalledTimes(2));
  expect(screen.queryByText("Second")).toBeNull();
  expect(writes).toHaveLength(1);
  accepted = true;
  await act(async () =>
    writes[0].resolve(Response.json({ ...first, status: "ACCEPTED", version: 2 })),
  );
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1].input).toEqual({ action: "reject", version: 1 });
  await act(async () =>
    writes[1].resolve(Response.json({ error: "MEMBERSHIP_CHANGED" }, { status: 409 })),
  );
  await waitFor(() => expect(screen.getByText("Second")).toBeTruthy());
  expect(screen.getByText("First")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Respond to membership request: First" })).toBeNull();
  expect(options.feedback.onSuccess).not.toHaveBeenCalled();
});
