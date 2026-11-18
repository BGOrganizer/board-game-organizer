import { URL } from "node:url";
import {
  type ContactUser,
  groupInviteesPageQuery,
  tableInviteesPageQuery,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
} from "@testing-library/react-native";
import { type ComponentProps, createContext, useContext } from "react";
import { Share, Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TableInviteLinkRow } from "@/components/invites/TableInviteLinkRow";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { PeoplePicker } from "../PeoplePicker";

const API = "https://people-picker-native.test";
const boundary = vi.hoisted(() => ({
  token: vi.fn(async () => "fixture-owner"),
}));
const Owner = createContext("owner");
vi.mock("@clerk/expo", () => ({
  useAuth: () => {
    const owner = useContext(Owner);
    return {
      userId: owner,
      sessionId: `session-${owner}`,
      isLoaded: true,
      isSignedIn: true,
      getToken: boundary.token,
    };
  },
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: { extra: { apiUrl: "https://people-picker-native.test" } },
  },
}));
type Props = ComponentProps<typeof PeoplePicker>;
type Person = ContactUser & {
  invitationBlockReason?: "TABLE_TIME_CONFLICT" | null;
  optimisticInvited?: boolean;
};
const person = (id = "alice", patch: Partial<Person> = {}): Person => ({
  id,
  name: `Player ${id}`,
  username: id,
  email: `${id}@fixture.test`,
  avatarUrl: null,
  presence: { online: false, lastActiveAt: "2030-06-01T10:00:00.000Z" },
  ...patch,
});
let client: QueryClient;
let rows: Person[];
let nextRows: Person[];
let nextCursor: string | null;
let status: number;
let gate: Promise<void> | undefined;
let release: (() => void) | undefined;
let reads: URL[];
let unexpected: string[];
const select = vi.fn<Props["onSelect"]>();
function Fixture({ props, owner = "owner" }: { props: Props; owner?: string }) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <Owner value={owner}>
          <PeoplePicker {...props} />
        </Owner>
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
async function fixture(patch: Partial<Props> = {}) {
  let props: Props = { friendsOnly: true, onSelect: select, ...patch };
  const view = await render(<Fixture props={props} />);
  return {
    ...view,
    update: async (next: Partial<Props>, owner = "owner") => {
      props = { ...props, ...next };
      await view.rerender(<Fixture props={props} owner={owner} />);
    },
  };
}
beforeEach(async () => {
  await installNativePopoverMeasurements();
  select.mockClear();
  boundary.token.mockClear();
  rows = [person()];
  nextRows = [person("next")];
  nextCursor = null;
  status = 200;
  reads = [];
  unexpected = [];
  gate = undefined;
  release = undefined;
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (
        url.origin !== API ||
        (init?.method ?? "GET") !== "GET" ||
        new Headers(init?.headers).get("Authorization") !== "Bearer fixture-owner"
      ) {
        unexpected.push(String(url));
        throw new Error("Unexpected picker HTTP owner or mutation");
      }
      reads.push(url);
      const selected = url.searchParams.has("cursor") ? nextRows : rows;
      const response = selected.filter((item) =>
        `${item.name} ${item.username ?? ""}`
          .toLowerCase()
          .includes((url.searchParams.get("query") ?? "").toLowerCase()),
      );
      await gate;
      if (init?.signal?.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
      if (status !== 200) return Response.json({ error: "Picker unavailable" }, { status });
      const cursor = url.searchParams.has("cursor") ? null : nextCursor;
      if (url.pathname === "/api/relationships")
        return Response.json({
          rows: response.map((profile) => ({
            fromUserId: "owner",
            toUserId: profile.id,
            profile,
          })),
          nextCursor: cursor,
        });
      if (url.pathname === "/api/users/search")
        return Response.json({ users: response, nextCursor: cursor });
      if (/^\/api\/groups\/[^/]+\/invitees$/.test(url.pathname))
        return Response.json({ items: response, nextCursor: cursor });
      if (/^\/api\/events\/[^/]+\/tables\/[^/]+\/invitations$/.test(url.pathname))
        return Response.json({
          items: response,
          eventVersion: 4,
          nextCursor: cursor,
        });
      unexpected.push(String(url));
      throw new Error("Unexpected picker endpoint");
    }),
  );
});
afterEach(async () => {
  await cleanup();
  release?.();
  await client.cancelQueries();
  client.clear();
  expect(unexpected).toEqual([]);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const table = { eventId: "event-one", tableId: "table-one" };
const conflictText =
  "This user is already registered, invited, or assigned as a demonstrator at another table with overlapping times.";

// Actual PeoplePicker/UserList/HeroUI and real shared Query/window/session
// hooks. Only HTTP/Clerk/native popover measurement ports are controlled.
it.each([
  [undefined, true, false, false],
  [null, true, false, false],
  ["TABLE_TIME_CONFLICT", true, false, true],
  ["TABLE_TIME_CONFLICT", false, false, false],
  [null, true, true, false],
  ["TABLE_TIME_CONFLICT", true, true, true],
] as const)(
  "preserves both actual identity/action guards and independent conflict help (%s/%s/%s)",
  async (reason, invitation, disabled, unavailable) => {
    rows = [
      person("alice", {
        username: null,
        ...(reason === undefined ? {} : { invitationBlockReason: reason }),
      }),
    ];
    await fixture({
      disabled,
      ...(invitation ? { invitationTable: table } : {}),
    });
    const buttons = await screen.findAllByRole("button", {
      name: "Select user: Player alice",
    });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      if (disabled || unavailable) expect(button).toBeDisabled();
      else expect(button).toBeEnabled();
      await userEvent.setup().press(button);
    }
    expect(select).toHaveBeenCalledTimes(disabled || unavailable ? 0 : 2);
    const label = "Why invitation is unavailable: Player alice";
    if (unavailable) {
      const help = screen.getByRole("button", { name: label });
      expect(help).toBeEnabled();
      await pressMeasuredPopover(help);
      expect(screen.getByText(conflictText)).toBeVisible();
    } else expect(screen.queryByRole("button", { name: label })).toBeNull();
  },
);

it("keeps @username under ordinary names, excludes the viewer and selected IDs, and returns canonical identity", async () => {
  rows = [person("owner"), person("excluded"), person("alice", { isFriend: true })];
  await fixture({ excludeIds: ["excluded"] });
  expect(await screen.findByText("Player alice")).toBeVisible();
  expect(screen.getByText("@alice")).toBeVisible();
  expect(screen.queryByText("Player owner")).toBeNull();
  expect(screen.queryByText("Player excluded")).toBeNull();
  await userEvent
    .setup()
    .press(screen.getAllByRole("button", { name: "Select user: Player alice" })[0]);
  expect(select).toHaveBeenCalledExactlyOnceWith(rows[2]);
});

it("uses @username as the table identity and keeps a supplied header before discovery", async () => {
  await fixture({
    friendsOnly: false,
    invitationTable: table,
    children: <Text>Generate invite header</Text>,
  });
  expect(await screen.findByText("@alice")).toBeVisible();
  expect(screen.queryByText("Player alice")).toBeNull();
  expect(screen.getByText("Generate invite header")).toBeVisible();
  expect(screen.getByRole("search", { name: "Search members" })).toBeVisible();
  await userEvent.setup().press(screen.getAllByRole("button", { name: "Select user: @alice" })[1]);
  expect(select).toHaveBeenCalledExactlyOnceWith(rows[0]);
});

it("waits for four discovery characters, debounces the real search and clears it without submitting", async () => {
  await fixture({ friendsOnly: false });
  expect(screen.getByText("Enter at least 4 characters to search")).toBeVisible();
  expect(reads).toEqual([]);
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "ali");
  expect(reads).toEqual([]);
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "  alice  ");
  await waitFor(() => expect(reads.at(-1)?.searchParams.get("query")).toBe("alice"));
  expect(await screen.findByText("Player alice")).toBeVisible();
  expect(reads.at(-1)?.pathname).toBe("/api/users/search");
  expect(reads.at(-1)?.searchParams.get("friendsOnly")).toBe("false");
  await userEvent.setup().press(screen.getByRole("button", { name: "Clear search" }));
  await waitFor(() => expect(screen.queryByText("Player alice")).toBeNull());
  expect(screen.getByText("Enter at least 4 characters to search")).toBeVisible();
});

it("starts from confirmed friends and switches to friend-scoped remote search", async () => {
  await fixture();
  await screen.findByText("Player alice");
  expect(reads[0].pathname).toBe("/api/relationships");
  expect(reads[0].searchParams.get("type")).toBe("friends");
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "alice");
  await waitFor(() => expect(reads.at(-1)?.pathname).toBe("/api/users/search"));
  expect(reads.at(-1)?.searchParams.get("friendsOnly")).toBe("true");
});

it.each([
  ["group", { invitationGroupId: "group-one" }, "/api/groups/group-one/invitees"],
  ["table", { invitationTable: table }, "/api/events/event-one/tables/table-one/invitations"],
] as const)(
  "uses the authorized %s invitation source without unscoped friend/search reads",
  async (_kind, props, path) => {
    await fixture(props);
    await screen.findByText(_kind === "table" ? "@alice" : "Player alice");
    expect(reads.map((url) => url.pathname)).toEqual([path]);
  },
);

it.each([
  [true, undefined, "No friends found"],
  [false, table, "No members found"],
] as const)(
  "keeps an authoritative empty source distinct from loading (%s/%s)",
  async (friendsOnly, invitationTable, text) => {
    rows = [];
    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await fixture({ friendsOnly, invitationTable });
    await waitFor(() => expect(reads).toHaveLength(1));
    expect(screen.queryByText(text)).toBeNull();
    await act(() => release?.());
    expect(await screen.findByText(text)).toBeVisible();
  },
);

it("reports an empty completed user search instead of leaving the minimum-length prompt", async () => {
  rows = [];
  await fixture({ friendsOnly: false });
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "nobody");
  expect(await screen.findByText("No users found")).toBeVisible();
});

it("keeps failures observable and retries the actual current source", async () => {
  status = 503;
  await fixture();
  expect(await screen.findByText("Could not load users")).toBeVisible();
  expect(screen.queryByText("No friends found")).toBeNull();
  status = 200;
  await userEvent.setup().press(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("Player alice")).toBeVisible();
  expect(reads).toHaveLength(2);
});

it("does not render cached private candidates after an authoritative source denial", async () => {
  await fixture({ invitationGroupId: "group-one" });
  await screen.findByText("Player alice");
  status = 403;
  await act(() =>
    client.invalidateQueries({
      queryKey: groupInviteesPageQuery(
        { apiUrl: API, userId: "owner", getToken: boundary.token },
        "group-one",
      ).queryKey,
      exact: true,
    }),
  );
  expect(await screen.findByText("Could not load users")).toBeVisible();
  expect(screen.queryByText("Player alice", { includeHiddenElements: true })).toBeNull();
  expect(select).not.toHaveBeenCalled();
});

it("uses explicit native list paging and preserves the earlier identities", async () => {
  nextCursor = "next-person";
  await fixture({ invitationGroupId: "group-one" });
  await screen.findByText("Player alice");
  await userEvent.setup().press(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("Player next")).toBeVisible();
  expect(screen.getByText("Player alice")).toBeVisible();
  expect(reads.at(-1)?.searchParams.get("cursor")).toBe("next-person");
});

it("retains the real table-invite item before discovery through loading, empty, failure and searching candidate states", async () => {
  rows = [];
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const share = vi.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
  await fixture({
    friendsOnly: false,
    invitationTable: table,
    children: <TableInviteLinkRow tableId={table.tableId} />,
  });
  const generation = screen.getByTestId("table-invite-link-row");
  const search = screen.getByRole("search", { name: "Search members" });
  const expectHeader = () => {
    expect(screen.getByTestId("table-invite-link-row")).toBe(generation);
    expect(generation).toBeVisible();
    expect(screen.getByRole("button", { name: "Generate invite" })).toBeEnabled();
    expect(search).toBeVisible();
    expect(screen.container.queryAll((node) => node === generation || node === search)).toEqual([
      generation,
      search,
    ]);
    expect(share).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  };
  await waitFor(() => expect(reads).toHaveLength(1));
  expectHeader();
  expect(screen.queryByText("No members found")).toBeNull();
  gate = undefined;
  await act(() => release?.());
  expect(await screen.findByText("No members found")).toBeVisible();
  expectHeader();
  status = 503;
  await act(() =>
    client.refetchQueries({
      queryKey: tableInviteesPageQuery(
        { apiUrl: API, userId: "owner", getToken: boundary.token },
        table.eventId,
        table.tableId,
        "",
      ).queryKey,
      exact: true,
    }),
  );
  expect(await screen.findByText("Could not load users")).toBeVisible();
  expectHeader();
  status = 200;
  rows = [person()];
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "alice");
  await waitFor(() => expect(reads.at(-1)?.searchParams.get("query")).toBe("alice"));
  expectHeader();
  expect(screen.queryByText("@alice")).toBeNull();
  gate = undefined;
  await act(() => release?.());
  expect(await screen.findByText("@alice")).toBeVisible();
  expectHeader();
  expect(reads.every((url) => url.pathname.endsWith("/invitations"))).toBe(true);
});
