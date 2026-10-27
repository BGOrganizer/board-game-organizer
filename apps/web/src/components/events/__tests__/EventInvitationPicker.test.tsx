import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { eventId, optionId, plannedEvent, seat, tableId } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventInvitationPicker } from "../EventInvitationPicker";

const m = vi.hoisted(() => ({ back: vi.fn(), token: vi.fn(async () => "fresh") }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: m.back }) }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({ apiUrl: "https://api.test", userId: "owner", getToken: m.token }),
}));
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());
function mount() {
  renderWithI18n(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <EventInvitationPicker eventId={eventId} tableId={tableId} />
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
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Select user: Eligible player" }));
    await waitFor(() => expect(m.back).toHaveBeenCalledOnce());
    expect(fetch.mock.calls.filter(([url]) => url.includes("/invitations")).length).toBeGreaterThan(
      0,
    );
    expect(
      fetch.mock.calls.some(([url]) => /users\/search|relationships|\/groups\//.test(url)),
    ).toBe(false);
  },
);
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
  mount();
  await screen.findByText("Could not load users");
  broken = false;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  fireEvent.click(await screen.findByRole("button", { name: "Select user: Eligible player" }));
  await screen.findByText("Could not invite player. Refresh and try again.");
  expect(m.back).not.toHaveBeenCalled();
});
it("does not query candidates when Event permissions or cutoff deny invitations", async () => {
  const fetch = vi.fn(
    async () => new Response(JSON.stringify({ ...plannedEvent, canInvite: false })),
  );
  vi.stubGlobal("fetch", fetch);
  mount();
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
  mount();
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
