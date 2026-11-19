import { developmentInviteAppLink, eventRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { Share, StyleSheet } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventInvitationPicker } from "@/components/events/EventInvitationPicker";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { plannedEvent } from "../../../../../web/src/test-fixtures/eventRecords";
import { TableInviteLinkRow } from "../TableInviteLinkRow";
import { inviteGroupId, inviteToken, tableInviteReview } from "./inviteFixtures";

const API = "https://table-link-fixtures.test";
const TABLE = tableInviteReview().table.id;
const boundary = vi.hoisted(() => ({
  apiUrl: "https://table-link-fixtures.test",
  userId: "owner" as string | null,
  enabled: true,
  getToken: vi.fn(),
  back: vi.fn(),
  feedback: { onError: vi.fn(), onSuccess: vi.fn(), onOptimisticUpdate: vi.fn() },
}));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: boundary.apiUrl,
    userId: boundary.userId,
    enabled: boundary.enabled,
    getToken: boundary.getToken,
    feedback: boundary.feedback,
  }),
}));
vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useRouter: () => ({ back: boundary.back }),
}));
let client: QueryClient;
let code: number;
let pending: Promise<Response> | undefined;
let created: { token: string; link: string; appLink?: string; email: null; expiresAt: string };
const writes: { input: unknown; authorization: string | null }[] = [];
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
beforeEach(() => {
  vi.clearAllMocks();
  boundary.apiUrl = API;
  boundary.userId = "owner";
  boundary.enabled = true;
  boundary.getToken.mockResolvedValue("fixture-current-token");
  code = 200;
  pending = undefined;
  writes.length = 0;
  created = {
    token: inviteToken,
    link: `https://api.board-game-organizer.com/invite/${inviteToken}`,
    email: null,
    expiresAt: "2030-06-08T12:00:00Z",
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  vi.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== API || url.pathname !== "/api/invites" || init?.method !== "POST")
        throw new Error(`Unexpected table invite request: ${url}`);
      writes.push({
        input: JSON.parse(String(init.body)),
        authorization: new Headers(init.headers).get("authorization"),
      });
      return (
        pending ?? json(code === 200 ? created : { error: "Fixture invite unavailable" }, code)
      );
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture(props: Partial<ComponentProps<typeof TableInviteLinkRow>>) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <TableInviteLinkRow tableId={TABLE} {...props} />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
const generate = () =>
  userEvent.setup().press(screen.getByRole("button", { name: "Generate invite" }));

it("shows the always-present generate item without requesting or sharing until its real action is pressed", async () => {
  await render(<Fixture />);
  expect(screen.getByText("Generate invite")).toBeVisible();
  expect(screen.getByRole("button", { name: "Generate invite" })).toHaveStyle({
    minWidth: 44,
    minHeight: 44,
  });
  expect(screen.queryByRole("button", { name: "Share invite link" })).toBeNull();
  expect(writes).toHaveLength(0);
  expect(Share.share).not.toHaveBeenCalled();
});

it("creates only a contextual table link with fresh auth and shares its complete canonical server URL", async () => {
  await render(<Fixture />);
  await generate();
  await waitFor(() => expect(Share.share).toHaveBeenCalledWith({ message: created.link }));
  expect(writes).toEqual([
    { input: { tableId: TABLE }, authorization: "Bearer fixture-current-token" },
  ]);
  expect(boundary.getToken).toHaveBeenCalledOnce();
  const link = screen.getByTestId("table-invite-link-value");
  expect(link).toHaveTextContent(created.link);
  expect(link).toHaveProp("selectable", true);
  expect(link).toHaveProp("numberOfLines", 2);
  expect(screen.getByRole("button", { name: "Share invite link" })).toHaveStyle({
    minWidth: 44,
    minHeight: 44,
  });
});

it("reopens native sharing for the existing link without creating a replacement invitation", async () => {
  await render(<Fixture />);
  await generate();
  await screen.findByTestId("share-table-invite-link");
  await userEvent.setup().press(screen.getByRole("button", { name: "Share invite link" }));
  expect(Share.share).toHaveBeenCalledTimes(2);
  expect(writes).toHaveLength(1);
});

it("shares only the server-approved stable Development route for its matching canonical preview token", async () => {
  created.link = `https://api-development-pr-27-board-game-organizers-projects.vercel.app/invite/${inviteToken}`;
  created.appLink = developmentInviteAppLink(created.link) ?? undefined;
  await render(<Fixture />);
  await generate();
  await waitFor(() => expect(Share.share).toHaveBeenCalledWith({ message: created.appLink }));
  expect(screen.getByTestId("table-invite-link-value")).toHaveTextContent(
    created.appLink ?? "missing approved app link",
  );
});

it("ignores an unrelated appLink rather than using it as an API/target override", async () => {
  created.appLink = "https://external.example.test/invite/invalid";
  await render(<Fixture />);
  await generate();
  await waitFor(() => expect(Share.share).toHaveBeenCalledWith({ message: created.link }));
  expect(screen.getByTestId("table-invite-link-value")).not.toHaveTextContent(created.appLink);
});

it.each(["disabled", "not-enabled", "no-user"] as const)(
  "blocks generation for a %s owner/capability boundary",
  async (kind) => {
    if (kind === "not-enabled") boundary.enabled = false;
    if (kind === "no-user") boundary.userId = null;
    await render(<Fixture disabled={kind === "disabled"} />);
    expect(screen.getByRole("button", { name: "Generate invite" })).toBeDisabled();
    await generate();
    expect(writes).toHaveLength(0);
    expect(Share.share).not.toHaveBeenCalled();
  },
);

it("keeps the first generation pending and coalesces duplicate presses until its real HTTP receipt", async () => {
  let finish: (value: Response) => void = () => {};
  pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  await generate();
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(screen.getByRole("button", { name: "Generate invite" })).toBeDisabled();
  expect(screen.queryByTestId("table-invite-link-value")).toBeNull();
  const placeholder = screen.container.queryAll((node) => {
    const style = StyleSheet.flatten(node.props.style);
    return style?.width === "80%" && style?.height === 14;
  })[0];
  if (!placeholder) throw new Error("Expected the actual bounded invite-link Skeleton host");
  expect(placeholder).toHaveStyle({ width: "80%", height: 14 });
  await generate();
  expect(writes).toHaveLength(1);
  pending = undefined;
  await act(() => finish(json(created)));
  expect(await screen.findByTestId("table-invite-link-value")).toHaveTextContent(created.link);
});

it("preserves a failed creation as an observable retry path and does not open sharing until creation succeeds", async () => {
  code = 400;
  await render(<Fixture />);
  await generate();
  expect(await screen.findByText("Could not create the invite. Try again.")).toBeVisible();
  expect(Share.share).not.toHaveBeenCalled();
  code = 200;
  await generate();
  await waitFor(() => expect(Share.share).toHaveBeenCalledOnce());
  expect(writes).toHaveLength(2);
  expect(screen.queryByText("Could not create the invite. Try again.")).toBeNull();
});

it("reports an actual native share failure separately and retries the same link", async () => {
  vi.mocked(Share.share).mockRejectedValueOnce(new Error("Native share unavailable"));
  await render(<Fixture />);
  await generate();
  expect(await screen.findByText("Could not share the invite. Try again.")).toBeVisible();
  await userEvent.setup().press(screen.getByRole("button", { name: "Share invite link" }));
  await waitFor(() =>
    expect(screen.queryByText("Could not share the invite. Try again.")).toBeNull(),
  );
  expect(writes).toHaveLength(1);
});

it("does not treat dismissal of the real native share sheet as an invite-creation failure", async () => {
  vi.mocked(Share.share).mockResolvedValueOnce({ action: Share.dismissedAction });
  await render(<Fixture />);
  await generate();
  expect(await screen.findByTestId("table-invite-link-value")).toHaveTextContent(created.link);
  expect(screen.queryByText("Could not share the invite. Try again.")).toBeNull();
});

it("ignores a creation receipt delivered after its original account/table scope has changed", async () => {
  let finish: (value: Response) => void = () => {};
  pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const view = await render(<Fixture />);
  await generate();
  await waitFor(() => expect(writes).toHaveLength(1));
  boundary.userId = "other-owner";
  await view.rerender(<Fixture tableId="88888888-8888-4888-8888-888888888888" />);
  pending = undefined;
  await act(() => finish(json(created)));
  expect(Share.share).not.toHaveBeenCalled();
  expect(screen.queryByTestId("table-invite-link-value")).toBeNull();
});

it("never shares a late receipt after the native invite item was unmounted", async () => {
  let finish: (value: Response) => void = () => {};
  pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const view = await render(<Fixture />);
  await generate();
  await waitFor(() => expect(writes).toHaveLength(1));
  await view.unmount();
  await act(() => finish(json(created)));
  expect(Share.share).not.toHaveBeenCalled();
});

it.each(["actor", "api", "table"] as const)(
  "rejects a late generation receipt when only its original %s scope changes",
  async (changed) => {
    let finish: (value: Response) => void = () => {};
    pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const view = await render(<Fixture />);
    await generate();
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      input: { tableId: TABLE },
      authorization: "Bearer fixture-current-token",
    });
    if (changed === "actor") boundary.userId = "another-owner";
    if (changed === "api") boundary.apiUrl = "https://another-table-link-fixtures.test";
    await view.rerender(
      <Fixture tableId={changed === "table" ? "88888888-8888-4888-8888-888888888888" : TABLE} />,
    );
    pending = undefined;
    await act(() => finish(json(created)));
    expect(Share.share).not.toHaveBeenCalled();
    expect(screen.queryByTestId("table-invite-link-value")).toBeNull();
    expect(screen.getByRole("button", { name: "Generate invite" })).toBeEnabled();
    expect(writes).toHaveLength(1);
  },
);

it("withholds generation from an inviting-capable Event-list placeholder until the authoritative private event arrives", async () => {
  const event = { ...plannedEvent, groupId: inviteGroupId, groupType: "PRIVATE" as const };
  const owner = { apiUrl: API, userId: "owner", getToken: boundary.getToken };
  const listKey = eventRecordKeys.list(owner);
  const cached = { pages: [{ items: [event], nextCursor: null }], pageParams: [""] };
  client.setQueryData(listKey, cached);
  expect(client.getQueryData(eventRecordKeys.detail(owner, event.id))).toBeUndefined();
  let finish: (response: Response) => void = () => {};
  const detail = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const reads: URL[] = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    expect(url.origin).toBe(API);
    expect(init?.method ?? "GET").toBe("GET");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-current-token");
    reads.push(url);
    if (url.pathname === `/api/events/${event.id}`) return detail;
    if (url.pathname === `/api/events/${event.id}/tables/${TABLE}/invitations`)
      return json({ items: [], nextCursor: null, eventVersion: event.version });
    throw new Error(`Unexpected contextual invitation read ${url.pathname}`);
  });
  await render(
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <EventInvitationPicker eventId={event.id} tableId={TABLE} />
      </NativeTestProviders>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(reads.some((url) => url.pathname === `/api/events/${event.id}`)).toBe(true),
  );
  expect(screen.getByTestId("people-picker-scroll")).toBeVisible();
  expect(screen.queryByTestId("table-invite-link-row")).toBeNull();
  expect(screen.queryByRole("button", { name: "Generate invite" })).toBeNull();
  expect(writes).toEqual([]);
  expect(Share.share).not.toHaveBeenCalled();
  await act(() => finish(json(event)));
  expect(await screen.findByTestId("table-invite-link-row")).toBeVisible();
  expect(screen.getByRole("button", { name: "Generate invite" })).toBeEnabled();
  expect(client.getQueryData(listKey)).toMatchObject(cached);
  expect(client.getQueryData(eventRecordKeys.detail(owner, event.id))).toMatchObject(event);
  expect(writes).toEqual([]);
  expect(Share.share).not.toHaveBeenCalled();
  expect(boundary.back).not.toHaveBeenCalled();
});

it("guards existing-link sharing during disabled and suspended sessions and removes it for an anonymous owner", async () => {
  const view = await render(<Fixture />);
  await generate();
  await waitFor(() =>
    expect(Share.share).toHaveBeenCalledExactlyOnceWith({ message: created.link }),
  );
  expect(screen.getByTestId("table-invite-link-value")).toHaveTextContent(created.link);
  await view.rerender(<Fixture disabled />);
  for (const name of ["Generate invite", "Share invite link"]) {
    const action = screen.getByRole("button", { name });
    expect(action).toBeDisabled();
    await userEvent.setup().press(action);
  }
  expect(screen.getByTestId("table-invite-link-value")).toHaveTextContent(created.link);
  expect(Share.share).toHaveBeenCalledTimes(1);
  expect(writes).toHaveLength(1);
  await view.rerender(<Fixture />);
  boundary.enabled = false;
  await view.rerender(<Fixture />);
  for (const name of ["Generate invite", "Share invite link"]) {
    const action = screen.getByRole("button", { name });
    expect(action).toBeDisabled();
    await userEvent.setup().press(action);
  }
  expect(screen.getByTestId("table-invite-link-value")).toHaveTextContent(created.link);
  expect(Share.share).toHaveBeenCalledTimes(1);
  expect(writes).toHaveLength(1);
  boundary.enabled = true;
  boundary.userId = null;
  await view.rerender(<Fixture />);
  expect(screen.queryByTestId("table-invite-link-value")).toBeNull();
  expect(screen.queryByRole("button", { name: "Share invite link" })).toBeNull();
  expect(screen.getByRole("button", { name: "Generate invite" })).toBeDisabled();
  await generate();
  expect(Share.share).toHaveBeenCalledTimes(1);
  expect(writes).toHaveLength(1);
  boundary.userId = "owner";
  await view.rerender(<Fixture />);
  expect(screen.getByRole("button", { name: "Generate invite" })).toBeEnabled();
  expect(screen.queryByTestId("table-invite-link-value")).toBeNull();
  expect(Share.share).toHaveBeenCalledTimes(1);
  expect(writes).toHaveLength(1);
});
