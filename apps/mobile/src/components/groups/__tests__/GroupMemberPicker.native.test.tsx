import type { CommunityPageResponse, GroupPersonResponse } from "@board-game-organizer/schemas";
import { groupRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GuestNameRow } from "@/components/common/ui/GuestNameRow";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { GroupMemberPicker } from "../GroupMemberPicker";

const API = "https://group-member-picker-fixtures.test";
const boundary = vi.hoisted(() => ({
  userId: "owner",
  getToken: vi.fn(async () => "fixture-owner-token"),
}));
const options = () => ({
  apiUrl: API,
  userId: boundary.userId,
  getToken: boundary.getToken,
  enabled: true,
});
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options() }));

function person(id: string, change: Partial<GroupPersonResponse> = {}): GroupPersonResponse {
  return {
    userId: id,
    name: `Player ${id}`,
    username: id,
    avatarUrl: null,
    isAdmin: false,
    ban: null,
    membership: {
      id: "11111111-1111-4111-8111-111111111111",
      groupId: "group-one",
      userId: id,
      kind: "INVITATION",
      status: "ACCEPTED",
      version: 1,
      createdAt: "2030-01-01T00:00:00.000Z",
      updatedAt: "2030-01-01T00:00:00.000Z",
    },
    ...change,
  };
}
type Page = CommunityPageResponse<GroupPersonResponse>;
let client: QueryClient;
let page: Page;
let nextPage: Page;
let status: number;
let pending: Promise<Response> | undefined;
const requests: URL[] = [];
const json = (body: unknown, code = 200) =>
  new Response(JSON.stringify(body), {
    status: code,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  boundary.userId = "owner";
  page = {
    items: [
      person("one"),
      person("admin", { isAdmin: true, membership: null }),
      person("unnamed", { name: null }),
    ],
    nextCursor: null,
  };
  nextPage = { items: [person("next")], nextCursor: null };
  status = 200;
  pending = undefined;
  requests.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== API || !/^\/api\/groups\/[^/]+\/members$/.test(url.pathname))
        throw new Error(`Unexpected fixture request: ${url.origin}${url.pathname}`);
      requests.push(url);
      const body = url.searchParams.has("cursor")
        ? nextPage
        : url.searchParams.get("query")
          ? { items: [person("matched")], nextCursor: null }
          : page;
      return (
        pending ?? json(status === 200 ? body : { error: "Fixture members unavailable" }, status)
      );
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture({
  onSelect = () => {},
  ...props
}: Partial<ComponentProps<typeof GroupMemberPicker>>) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <GroupMemberPicker groupId="group-one" {...props} onSelect={onSelect} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
const select = async (name: string) =>
  userEvent.setup().press(await screen.findByRole("button", { name: `Select user: ${name}` }));

it("loads only the accepted group source, excludes already selected members and returns canonical identity", async () => {
  const onSelect = vi.fn();
  await render(<Fixture onSelect={onSelect} excludeIds={["one"]} />);
  expect(await screen.findByText("Player admin")).toBeVisible();
  expect(screen.getByText("Admin")).toBeVisible();
  expect(screen.getByText("unnamed")).toBeVisible();
  expect(screen.queryByText("Player one")).toBeNull();
  expect(requests[0].pathname).toBe("/api/groups/group-one/members");
  expect(requests[0].searchParams.get("mode")).toBe("accepted");
  await select("Player admin");
  expect(onSelect).toHaveBeenCalledExactlyOnceWith({
    id: "admin",
    name: "Player admin",
    avatarUrl: null,
  });
});

it("uses the user ID as a missing-name fallback and honors the disabled action contract", async () => {
  const onSelect = vi.fn();
  const view = await render(<Fixture disabled onSelect={onSelect} />);
  const button = await screen.findByRole("button", { name: "Select user: unnamed" });
  expect(button).toBeDisabled();
  await userEvent.setup().press(button);
  expect(onSelect).not.toHaveBeenCalled();
  await view.rerender(<Fixture onSelect={onSelect} />);
  await select("unnamed");
  expect(onSelect).toHaveBeenCalledExactlyOnceWith({
    id: "unnamed",
    name: "unnamed",
    avatarUrl: null,
  });
});

it("filters out pending/left non-admin records even if a malformed accepted-source page contains them", async () => {
  const member = person("one").membership;
  if (!member) throw new Error("Expected an authored accepted membership fixture");
  page.items.push(
    person("pending", { membership: { ...member, userId: "pending", status: "PENDING" } }),
    person("left", { membership: { ...member, userId: "left", status: "LEFT" } }),
  );
  await render(<Fixture />);
  await screen.findByText("Player one");
  expect(screen.queryByText("Player pending")).toBeNull();
  expect(screen.queryByText("Player left")).toBeNull();
});

it("debounces a four-character member search and clears back to its authorized accepted list", async () => {
  await render(<Fixture />);
  await screen.findByText("Player one");
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "Pla");
  expect(screen.getByText("Enter at least 4 characters to search")).toBeVisible();
  expect(requests).toHaveLength(1);
  await fireEvent.changeText(screen.getByTestId("list-search-input"), "  Matched  ");
  expect(await screen.findByText("Player matched")).toBeVisible();
  expect(requests.at(-1)?.searchParams.get("query")).toBe("Matched");
  expect(screen.queryByText("Player one")).toBeNull();
  await userEvent.setup().press(screen.getByRole("button", { name: "Clear search" }));
  expect(await screen.findByText("Player one")).toBeVisible();
  expect(screen.queryByText("Player matched")).toBeNull();
});

it("distinguishes a real empty accepted list from an observable read failure and deliberate retry", async () => {
  status = 503;
  await render(<Fixture />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load group members");
  expect(screen.queryByText("No members found")).toBeNull();
  status = 200;
  page = { items: [], nextCursor: null };
  await userEvent.setup().press(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("No members found")).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("keeps initial member loading distinct from an exhausted empty list", async () => {
  let finish: (response: Response) => void = () => {};
  pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  expect(screen.queryByText("No members found")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button", { name: "Select user: Player one" })).toBeNull();
  await act(() => finish(json(page)));
  expect(await screen.findByText("Player one")).toBeVisible();
});

it("preserves usable cached rows during an ordinary failed refresh but revokes them on an authorization denial", async () => {
  await render(<Fixture />);
  await screen.findByText("Player one");
  status = 503;
  await act(async () => {
    await client.invalidateQueries({
      queryKey: groupRecordKeys.people(options(), "group-one", "accepted", ""),
    });
  });
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByText("Player one")).toBeVisible();
  status = 403;
  await userEvent.setup().press(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Select user: Player one" })).toBeNull(),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Could not load group members");
});

it("requests more members from the explicit paged-list control and retains the first page", async () => {
  page = { ...page, nextCursor: "next-members" };
  await render(<Fixture />);
  await screen.findByText("Player one");
  expect(requests).toHaveLength(1);
  await userEvent.setup().press(screen.getByRole("button", { name: "Load more" }));
  expect(await screen.findByText("Player next")).toBeVisible();
  expect(screen.getByText("Player one")).toBeVisible();
  expect(requests.at(-1)?.searchParams.get("cursor")).toBe("next-members");
  expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
});

it("recomputes exclusions and fresh authoritative identities without retaining a stale row", async () => {
  const onSelect = vi.fn();
  const view = await render(<Fixture onSelect={onSelect} />);
  await screen.findByText("Player one");
  await act(() =>
    client.setQueryData(groupRecordKeys.people(options(), "group-one", "accepted", ""), {
      pages: [
        { items: [person("one", { name: "Updated player" }), person("new")], nextCursor: null },
      ],
      pageParams: [""],
    }),
  );
  expect(await screen.findByText("Updated player")).toBeVisible();
  expect(screen.queryByText("Player one")).toBeNull();
  await view.rerender(<Fixture onSelect={onSelect} excludeIds={["one"]} />);
  expect(screen.queryByText("Updated player")).toBeNull();
  await select("Player new");
  expect(onSelect).toHaveBeenCalledWith({ id: "new", name: "Player new", avatarUrl: null });
});

it("does not show a previous group's cached members after changing the picker target", async () => {
  const view = await render(<Fixture />);
  await screen.findByText("Player one");
  page = { items: [person("other")], nextCursor: null };
  await view.rerender(<Fixture groupId="other-group" />);
  expect(screen.queryByText("Player one")).toBeNull();
  expect(await screen.findByText("Player other")).toBeVisible();
  expect(requests.at(-1)?.pathname).toBe("/api/groups/other-group/members");
});

it("offers the guest input with the member source and only adds a trimmed valid name", async () => {
  const onAdd = vi.fn();
  await render(
    <Fixture>
      <GuestNameRow maxLength={80} onAdd={onAdd} />
    </Fixture>,
  );
  expect(await screen.findByText("Player one")).toBeVisible();
  const guest = screen.getByLabelText("Guest name");
  const add = screen.getByRole("button", { name: "Add a guest" });
  expect(guest).toHaveProp("maxLength", 80);
  expect(add).toBeDisabled();
  await fireEvent.changeText(guest, "   ");
  expect(add).toBeDisabled();
  await fireEvent.changeText(guest, "  Guest Guide  ");
  await userEvent.setup().press(add);
  expect(onAdd).toHaveBeenCalledExactlyOnceWith("Guest Guide");
});
