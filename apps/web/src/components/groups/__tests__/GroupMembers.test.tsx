import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupMembers } from "../GroupMembers";

vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
afterEach(() => vi.unstubAllGlobals());
it.each(["approve", "reject"] as const)(
  "gives membership response buttons icons and submits explicit %s with pinned version",
  async (action) => {
    const membership = {
      id: groupRecord.id,
      groupId: groupRecord.id,
      userId: "guest",
      kind: "REQUEST",
      status: "PENDING",
      version: 1,
      createdAt: groupRecord.createdAt,
      updatedAt: groupRecord.updatedAt,
    };
    const person = {
      userId: "guest",
      name: "Requester",
      username: null,
      avatarUrl: null,
      isAdmin: false,
      membership,
      ban: null,
    };
    let answered = false;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        answered = true;
        return new Response(
          JSON.stringify({
            ...membership,
            status: action === "approve" ? "ACCEPTED" : "DECLINED",
            version: 2,
          }),
        );
      }
      return new Response(
        JSON.stringify({
          items: new URL(url).searchParams.get("mode") === "pending" && !answered ? [person] : [],
          nextCursor: null,
        }),
      );
    });
    vi.stubGlobal("fetch", fetch);
    renderWithI18n(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          })
        }
      >
        <GroupMembers group={groupRecord} />
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Respond to membership request: Requester" }),
    );
    const dialog = screen.getByRole("dialog"),
      approve = within(dialog).getByRole("button", { name: "Approve" }),
      reject = within(dialog).getByRole("button", { name: "Reject" });
    expect(approve.querySelector("svg.lucide-check")).not.toBeNull();
    expect(reject.querySelector("svg.lucide-x")).not.toBeNull();
    expect(fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    fireEvent.click(action === "approve" ? approve : reject);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      JSON.parse(String(fetch.mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]?.body)),
    ).toEqual({ action, version: 1 });
  },
);
