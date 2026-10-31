import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupReview } from "../GroupReview";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "moderator",
    getToken: async () => "fresh",
  }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function mount(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  const view = renderWithI18n(
    <QueryClientProvider client={client}>
      <GroupReview groupId={groupRecord.id} />
    </QueryClientProvider>,
  );
  return { ...view, client };
}
it("reviews proposed public information with a pinned version and mandatory rejection reason", async () => {
  let group = {
    ...groupRecord,
    type: "PUBLIC",
    proposal: { name: "Proposed club" },
    name: "Proposed club",
    reviewStatus: "PENDING",
  };
  let release: ((response: Response) => void) | undefined;
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PATCH")
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    return new Response(JSON.stringify(group));
  });
  vi.stubGlobal("fetch", fetch);
  mount();
  expect(await screen.findByText("Proposed club")).not.toBeNull();
  expect((screen.getByRole("button", { name: "Reject" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: "Rejection reason" }), {
    target: { value: "Please verify the venue" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Reject" }));
  expect(navigation.push).toHaveBeenCalledWith("/moderation");
  await waitFor(() =>
    expect(fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true),
  );
  const patch = fetch.mock.calls.find(([, init]) => init?.method === "PATCH");
  expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
    decision: "reject",
    version: 1,
    reason: "Please verify the venue",
  });
  expect(screen.queryByText("Review completed")).toBeNull();
  const respond = release;
  if (!respond) throw new Error("Missing review response");
  group = { ...group, reviewStatus: "REJECTED" };
  await act(async () => respond(Response.json(group)));
  expect(await screen.findByText("Review completed")).not.toBeNull();
});
it("does not expose proposals when moderator authorization fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response('{"error":"FORBIDDEN"}', { status: 403 })),
  );
  mount();
  expect(await screen.findByText("Could not load group review")).not.toBeNull();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
});
