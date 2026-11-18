import { URL } from "node:url";
import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import { groupRecordDetailQuery } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { groupRecord, plannedEvent } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventGroupLink } from "../EventGroupLink";

const sdk = vi.hoisted(() => ({ push: vi.fn() }));
const API = "https://event-group-link-native.test";
const options = {
  apiUrl: API,
  userId: "owner",
  enabled: true,
  getToken: async () => "fixture-owner",
};
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("expo-router", () => ({ useRouter: () => sdk }));
let client: QueryClient;
let group: GroupRecordResponse;
let status: number;
let pending: Promise<Response> | undefined;
const reads: string[] = [];
const writes: string[] = [];
const key = (id = groupRecord.id) => groupRecordDetailQuery(options, id).queryKey;
beforeEach(() => {
  vi.clearAllMocks();
  group = { ...groupRecord };
  status = 200;
  pending = undefined;
  reads.length = writes.length = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      expect(url.origin).toBe(API);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-owner");
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        writes.push(`${method} ${url.pathname}`);
        throw new Error("Group previews grant no mutation consent");
      }
      expect(url.pathname).toBe(`/api/groups/${group.id}`);
      reads.push(url.pathname);
      return (
        pending ??
        Response.json(status === 200 ? group : { error: "Group unavailable" }, { status })
      );
    }),
  );
});
afterEach(() => {
  expect(writes).toEqual([]);
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture({ id = groupRecord.id, name }: { id?: string; name?: string | null } = {}) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <EventGroupLink groupId={id} name={name} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
const open = (name: string) =>
  userEvent.setup().press(screen.getByRole("button", { name: `Open group: ${name}` }));

it("keeps the event-provided group name navigable while the real group read is unresolved", async () => {
  let finish: (value: Response) => void = () => {};
  pending = new Promise((resolve) => {
    finish = resolve;
  });
  await render(<Fixture name="Known from event" />);
  expect(screen.getByText("Known from event")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Private" })).toBeNull();
  await open("Known from event");
  expect(sdk.push).toHaveBeenCalledExactlyOnceWith({
    pathname: "/group/[groupId]",
    params: { groupId: group.id },
  });
  await act(() => finish(Response.json(group)));
  expect(await screen.findByText(group.name)).toBeVisible();
  expect(screen.queryByText("Known from event")).toBeNull();
});

it("uses a generic group link instead of inventing a name or capabilities for an unnamed pending record", async () => {
  let finish: (value: Response) => void = () => {};
  pending = new Promise((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  const header = screen.getByText("Group");
  expect(header).toBeVisible();
  expect(header).toHaveProp("accessibilityRole", "header");
  expect(screen.getByRole("button", { name: "Open group: Group" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Private" })).toBeNull();
  await act(() => finish(Response.json(group)));
  expect(await screen.findByText(group.name)).toBeVisible();
});

it.each(["PRIVATE", "PUBLIC"] as const)(
  "renders the actual full %s GroupCard from current owned canonical data",
  async (type) => {
    group = {
      ...group,
      type,
      ...(type === "PUBLIC"
        ? {
            logo: "https://fixture.invalid/approved-logo.png",
            location: plannedEvent.locations[0],
            approved: { name: group.name, location: plannedEvent.locations[0] },
          }
        : {}),
    };
    client.setQueryData(key(), group);
    await render(<Fixture name="Stale event label" />);
    expect(screen.getByText(group.name)).toBeVisible();
    expect(screen.queryByText("Stale event label")).toBeNull();
    expect(
      screen.getByRole("button", { name: type === "PRIVATE" ? "Private" : "Public" }),
    ).toBeEnabled();
    await open(group.name);
    expect(sdk.push).toHaveBeenCalledExactlyOnceWith({
      pathname: "/group/[groupId]",
      params: { groupId: group.id },
    });
    expect(reads).toEqual([]);
  },
);

it.each(["memberCount", "canViewEvents", "logo", "type", "role"] as const)(
  "treats an older partial cached record without %s as a preview, not a full-capability card",
  async (missing) => {
    // Compatibility/cache guard input, explicitly not a complete server DTO.
    const partial: Partial<GroupRecordResponse> = { ...group, [missing]: undefined };
    client.setQueryData<Partial<GroupRecordResponse>>([...key()], partial);
    await render(<Fixture />);
    expect(screen.getByText(group.name)).toBeVisible();
    expect(screen.getByRole("button", { name: `Open group: ${group.name}` })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Private" })).toBeNull();
    expect(reads).toEqual([]);
  },
);

it("does not trust an unnamed partial cache entry over the event-provided label", async () => {
  const partial: Partial<GroupRecordResponse> = { ...group, name: undefined };
  client.setQueryData<Partial<GroupRecordResponse>>([...key()], partial);
  await render(<Fixture name="Known from event" />);
  expect(screen.getByText("Known from event")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Private" })).toBeNull();
});

it("never displays a mismatched resource's cached identity under the requested group route", async () => {
  client.setQueryData(key(), {
    ...group,
    id: "99999999-9999-4999-8999-999999999999",
    name: "Unrelated private group",
  });
  await render(<Fixture name="Requested event group" />);
  expect(screen.getByText("Requested event group")).toBeVisible();
  expect(screen.queryByText("Unrelated private group")).toBeNull();
  expect(screen.queryByRole("button", { name: "Private" })).toBeNull();
});

it("keeps usable cached data during a refresh error, hides denied identity and retries explicitly", async () => {
  client.setQueryData(key(), group);
  await render(<Fixture name="Event group" />);
  status = 503;
  await act(() => client.invalidateQueries({ queryKey: key(), exact: true }));
  expect(await screen.findByText("Could not load group")).toBeVisible();
  expect(screen.getByText(group.name)).toBeVisible();
  expect(screen.getByRole("button", { name: "Private" })).toBeEnabled();
  status = 403;
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Event group")).toBeVisible();
  expect(screen.queryByText(group.name)).toBeNull();
  expect(screen.queryByRole("button", { name: "Private" })).toBeNull();
  status = 200;
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText(group.name)).toBeVisible();
  expect(screen.queryByText("Could not load group")).toBeNull();
});

it("does not retain a previous group's label while a changed group prop loads its own canonical identity", async () => {
  client.setQueryData(key(), group);
  const view = await render(<Fixture />);
  group = { ...group, id: "88888888-8888-4888-8888-888888888888", name: "Next canonical group" };
  let finish: (value: Response) => void = () => {};
  pending = new Promise((resolve) => {
    finish = resolve;
  });
  await view.rerender(<Fixture id={group.id} name="Next event group" />);
  expect(screen.getByText("Next event group")).toBeVisible();
  expect(screen.queryByText(groupRecord.name)).toBeNull();
  await act(() => finish(Response.json(group)));
  expect(await screen.findByText("Next canonical group")).toBeVisible();
});
