import { eventRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import EventInvitePage from "@/app/(tabs)/events/[eventId]/tables/[tableId]/invite/page";
import { eventId, optionId, plannedEvent, seat, tableId } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";

const m = vi.hoisted(() => ({
  back: vi.fn(),
  token: vi.fn(async () => "fresh"),
  feedback: { onOptimisticUpdate: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: m.back }) }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: m.token,
    feedback: m.feedback,
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());
async function mount(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  return renderWithI18n(
    <QueryClientProvider client={client}>
      {await EventInvitePage({ params: Promise.resolve({ eventId, tableId }) })}
    </QueryClientProvider>,
  );
}
it.each([false, true])(
  "uses the Table-scoped source for standalone/Group invitations and retains explicit consent (grouped=%s)",
  async (grouped) => {
    let invited = false;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toEqual({ userId: "eligible" });
        invited = true;
        return new Response(JSON.stringify({ ...seat("eligible"), status: "PENDING" }));
      }
      return new Response(
        JSON.stringify(
          url.includes("/invitations")
            ? {
                items: invited
                  ? []
                  : [
                      {
                        id: "eligible",
                        name: "Eligible player",
                        username: "eligible",
                        email: null,
                        avatarUrl: null,
                      },
                    ],
                nextCursor: null,
              }
            : { ...plannedEvent, groupId: grouped ? optionId : null },
        ),
      );
    });
    vi.stubGlobal("fetch", fetch);
    await mount();
    fireEvent.click(await screen.findByRole("button", { name: "Select user: @eligible" }));
    await waitFor(() => expect(m.back).toHaveBeenCalledOnce());
    expect(fetch.mock.calls.filter(([url]) => url.includes("/invitations")).length).toBeGreaterThan(
      0,
    );
    expect(
      fetch.mock.calls.some(([url]) => /users\/search|relationships|\/groups\//.test(url)),
    ).toBe(false);
  },
);
it("keeps unavailable candidates visible, disables invitation and opens accessible conflict help without a POST", async () => {
  const fetch = vi.fn(
    async (url: string, init?: RequestInit) =>
      new Response(
        JSON.stringify(
          init?.method === "POST"
            ? { ...seat("eligible"), status: "PENDING" }
            : url.includes("/invitations")
              ? {
                  items: [
                    {
                      id: "busy",
                      name: "Busy demonstrator",
                      username: "busy",
                      email: null,
                      avatarUrl: null,
                      invitationBlockReason: "TABLE_TIME_CONFLICT",
                    },
                    {
                      id: "eligible",
                      name: "Eligible player",
                      username: null,
                      email: null,
                      avatarUrl: null,
                      invitationBlockReason: null,
                    },
                  ],
                  nextCursor: null,
                }
              : { ...plannedEvent, groupId: optionId, groupType: "PUBLIC" },
        ),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  await mount();
  const unavailable = await screen.findByRole("button", { name: "Select user: @busy" });
  expect((unavailable as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("@busy")).not.toBeNull();
  expect(screen.queryByText("Busy demonstrator")).toBeNull();
  fireEvent.click(unavailable);
  const help = screen.getByRole("button", {
    name: "Why invitation is unavailable: @busy",
  });
  expect(help.getAttribute("aria-disabled")).not.toBe("true");
  fireEvent.click(help);
  expect(await screen.findByRole("heading", { name: "Invitation unavailable" })).not.toBeNull();
  expect(
    screen.getByText(
      "This user is already registered, invited, or assigned as a demonstrator at another table with overlapping times.",
    ),
  ).not.toBeNull();
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "Invitation unavailable" })).toBeNull(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Select user: Eligible player" }));
  await waitFor(() => expect(m.back).toHaveBeenCalledOnce());
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});
it("reconciles a concurrent server conflict into disabled invitation/help rather than bypassing the POST guard", async () => {
  let conflicting = false;
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      conflicting = true;
      return new Response('{"error":"TABLE_TIME_CONFLICT"}', { status: 409 });
    }
    return new Response(
      JSON.stringify(
        url.includes("/invitations")
          ? {
              items: [
                {
                  id: "busy",
                  name: "Busy player",
                  username: null,
                  email: null,
                  avatarUrl: null,
                  invitationBlockReason: conflicting ? "TABLE_TIME_CONFLICT" : null,
                },
              ],
              nextCursor: null,
            }
          : { ...plannedEvent, groupId: optionId, groupType: "PUBLIC" },
      ),
    );
  });
  vi.stubGlobal("fetch", fetch);
  await mount();
  fireEvent.click(await screen.findByRole("button", { name: "Select user: Busy player" }));
  expect(m.back).toHaveBeenCalledOnce();
  await waitFor(() =>
    expect(m.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "invite_event_player"),
  );
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Select user: Busy player" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true),
  );
  expect(
    screen.getByRole("button", { name: "Why invitation is unavailable: Busy player" }),
  ).not.toBeNull();
  expect(m.back).toHaveBeenCalledOnce();
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});
it("keeps candidate failures observable, retries, and retains failed invite feedback without pretending success", async () => {
  let broken = true;
  const fetch = vi.fn(async (url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? new Response('{"code":"REGISTRATION_ALREADY_ACTIVE"}', { status: 409 })
      : url.includes("/invitations")
        ? broken
          ? new Response("{}", { status: 503 })
          : new Response(
              JSON.stringify({
                items: [{ id: "eligible", name: "Eligible player", email: null, avatarUrl: null }],
                nextCursor: null,
              }),
            )
        : new Response(JSON.stringify(plannedEvent)),
  );
  vi.stubGlobal("fetch", fetch);
  await mount();
  await screen.findByText("Could not load users");
  broken = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  fireEvent.click(await screen.findByRole("button", { name: "Select user: Eligible player" }));
  expect(m.back).toHaveBeenCalledOnce();
  await waitFor(() =>
    expect(m.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "invite_event_player"),
  );
});
it("does not query candidates when Event permissions or cutoff deny invitations", async () => {
  const fetch = vi.fn(
    async () => new Response(JSON.stringify({ ...plannedEvent, canInvite: false })),
  );
  vi.stubGlobal("fetch", fetch);
  await mount();
  await screen.findByRole("alert");
  expect(fetch.mock.calls).toHaveLength(1);
  expect(m.back).not.toHaveBeenCalled();
});
it("guards repeated invitation actions while pending and supports header Back", async () => {
  let finish: ((r: Response) => void) | undefined;
  const fetch = vi.fn((url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? new Promise<Response>((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(
          new Response(
            JSON.stringify(
              url.includes("/invitations")
                ? {
                    items: [
                      { id: "eligible", name: "Eligible player", email: null, avatarUrl: null },
                    ],
                    nextCursor: null,
                  }
                : plannedEvent,
            ),
          ),
        ),
  );
  vi.stubGlobal("fetch", fetch);
  await mount();
  const button = await screen.findByRole("button", { name: "Select user: Eligible player" });
  fireEvent.click(button);
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Select user: Eligible player" })).toBeNull(),
  );
  fireEvent.click(button);
  expect(fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  await waitFor(() => expect(finish).toBeDefined());
  if (!finish) throw Error("Missing request");
  const complete = finish;
  await act(async () => {
    complete(new Response(JSON.stringify({ ...seat("eligible"), status: "PENDING" })));
  });
  await waitFor(() => expect(m.back).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(m.back).toHaveBeenCalledTimes(2);
});

it.each([
  { groupId: optionId, groupType: "PRIVATE", status: "PLANNING", allowed: true },
  { groupId: optionId, groupType: "PUBLIC", status: "PLANNING", allowed: false },
  { groupId: null, groupType: null, status: "PLANNING", allowed: false },
  { groupId: optionId, groupType: "PRIVATE", status: "CONFIRMED", allowed: false },
  { groupId: optionId, groupType: "PRIVATE", status: "TERMINATED", allowed: false },
])(
  "keeps contextual generation first for an eligible empty picker: %j",
  async ({ allowed, ...context }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        Response.json(
          url.includes("/invitations")
            ? { items: [], nextCursor: null }
            : { ...plannedEvent, ...context },
        ),
      ),
    );
    await mount();
    await screen.findByRole("searchbox", {
      name: context.groupId ? "Search members" : "Search friends",
    });
    if (allowed) {
      expect(screen.getByRole("button", { name: "Generate invite" })).toBeTruthy();
      expect(screen.getAllByRole("listitem")[0].textContent).toContain("Generate invite");
      await screen.findByText("No members found");
    } else {
      expect(screen.queryByRole("button", { name: "Generate invite" })).toBeNull();
    }
  },
);

it("adds a guest directly and retries an uncertain response with the same request ID", async () => {
  const requests: Array<{ name: string; email?: string; requestId: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        expect(new URL(url).pathname).toBe(`/api/events/${eventId}/tables/${tableId}/guests`);
        const input = JSON.parse(String(init.body));
        expect(input).toEqual({
          name: "Guest Alice",
          email: "alice@example.test",
          requestId: expect.stringMatching(/^[a-f\d-]{36}$/),
        });
        requests.push(input);
        if (requests.length === 1) return Response.json({}, { status: 503 });
        return Response.json({
          ...seat("guest:4a6bd36e-a27b-4b44-84df-8a4e36ee5f4e"),
          kind: "GUEST",
          guestName: input.name,
          status: "ACCEPTED",
          eventVersion: 2,
        });
      }
      return Response.json(
        url.includes("/invitations") ? { items: [], nextCursor: null } : plannedEvent,
      );
    }),
  );
  await mount();
  const open = await screen.findByRole("button", { name: "Add a guest" });
  expect(screen.queryByRole("textbox", { name: "Username" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "About guests" }));
  const help = screen.getByRole("dialog", { name: "Guest" });
  expect(help).toHaveTextContent("Add someone who does not have a Board Game Organizer account.");
  fireEvent.keyDown(help, { key: "Escape" });
  fireEvent.click(open);
  const username = await screen.findByRole("textbox", { name: "Username" });
  const email = screen.getByRole("textbox", { name: "Email" });
  const add = screen.getByRole("button", { name: "Add" });
  expect(username).toBeRequired();
  expect(email).not.toBeRequired();
  expect(add).toBeDisabled();
  fireEvent.change(username, { target: { value: "  Guest Alice  " } });
  expect(add).toBeEnabled();
  fireEvent.change(email, { target: { value: "invalid" } });
  fireEvent.blur(email);
  expect(await screen.findByText("Enter a valid email address.")).toBeVisible();
  expect(add).toBeDisabled();
  fireEvent.change(email, { target: { value: "alice@example.test" } });
  fireEvent.click(add);
  await screen.findByText("Could not add guest. Try again.");
  expect(m.back).not.toHaveBeenCalled();
  fireEvent.click(add);
  await waitFor(() => expect(m.back).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Select user: Guest Alice" })).toBeNull();
  fireEvent.click(open);
  expect(await screen.findByRole("textbox", { name: "Username" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("");
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual(requests[1]);
});

it.each([
  { status: "PLANNING", groupType: "PUBLIC" },
  { status: "CONFIRMED", groupType: "PRIVATE" },
] as const)("disallows adding guests outside private planning (%j)", async (context) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.includes("/invitations")
          ? { items: [], nextCursor: null }
          : { ...plannedEvent, ...context },
      ),
    ),
  );
  await mount();
  await screen.findByRole("searchbox", { name: "Search friends" });
  expect(screen.queryByRole("textbox", { name: "Username" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add a guest" })).toBeNull();
});

it("dismisses a guest draft without adding anyone and submits a later guest without optional email", async () => {
  let respond: (value: Response) => void = () => {
    throw new Error("Expected pending guest request");
  };
  const submissions: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        expect(new URL(url).pathname).toBe(`/api/events/${eventId}/tables/${tableId}/guests`);
        submissions.push(JSON.parse(String(init.body)));
        return new Promise<Response>((resolve) => {
          respond = resolve;
        });
      }
      return Response.json(
        url.includes("/invitations") ? { items: [], nextCursor: null } : plannedEvent,
      );
    }),
  );
  await mount();
  const open = await screen.findByRole("button", { name: "Add a guest" });
  fireEvent.click(open);
  fireEvent.change(await screen.findByRole("textbox", { name: "Username" }), {
    target: { value: "Unsent guest" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(submissions).toEqual([]);
  expect(m.back).not.toHaveBeenCalled();
  fireEvent.click(open);
  const name = await screen.findByRole("textbox", { name: "Username" });
  expect(name).toHaveValue("");
  fireEvent.change(name, { target: { value: "Guest Ada" } });
  const email = screen.getByRole("textbox", { name: "Email" });
  fireEvent.change(email, { target: { value: "   " } });
  fireEvent.blur(email);
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() =>
    expect(submissions).toEqual([{ name: "Guest Ada", requestId: expect.any(String) }]),
  );
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  expect(m.back).not.toHaveBeenCalled();
  await act(() =>
    respond(
      Response.json({
        ...seat("guest:4a6bd36e-a27b-4b44-84df-8a4e36ee5f4e"),
        kind: "GUEST",
        guestName: "Guest Ada",
        status: "ACCEPTED",
        eventVersion: 2,
      }),
    ),
  );
  await waitFor(() => expect(m.back).toHaveBeenCalledOnce());
  expect(screen.queryByRole("button", { name: "Select user: Guest Ada" })).toBeNull();
});

it("removes cached invitations and guest controls when the event is no longer readable", async () => {
  const reads: string[] = [];
  const writes: string[] = [];
  let allowed = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      if (init?.method && init.method !== "GET") writes.push(init.method);
      reads.push(url.pathname);
      if (url.pathname === `/api/events/${eventId}`)
        return allowed
          ? Response.json({ ...plannedEvent, groupId: optionId, groupType: "PRIVATE" })
          : Response.json({ error: "Event not available" }, { status: 403 });
      if (url.pathname.endsWith("/invitations"))
        return Response.json({
          items: [
            { id: "chosen", name: "Previously visible", username: "chosen", avatarUrl: null },
          ],
          nextCursor: null,
        });
      throw new Error(`Unexpected invite request ${url.pathname}`);
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await mount(client);
    expect(await screen.findByRole("button", { name: "Select user: @chosen" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add a guest" })).toBeVisible();
    const candidateReads = reads.filter((path) => path.endsWith("/invitations")).length;
    allowed = false;
    await act(() =>
      client.invalidateQueries({
        queryKey: eventRecordKeys.detail({ apiUrl: "https://api.test", userId: "owner" }, eventId),
        exact: true,
      }),
    );
    expect(
      await screen.findByText("Invitations are unavailable. Refresh the event."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Select user: @chosen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add a guest" })).toBeNull();
    expect(reads.filter((path) => path.endsWith("/invitations"))).toHaveLength(candidateReads);
    expect(writes).toEqual([]);
  } finally {
    client.clear();
  }
});
