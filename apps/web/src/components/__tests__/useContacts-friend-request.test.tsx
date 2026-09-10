import { QueryProvider } from "@board-game-organizer/query";
import { useContacts } from "@board-game-organizer/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const targetUser = {
  id: "user_2",
  name: "Target User",
  email: "target@example.com",
  avatarUrl: null,
  presence: { online: false, lastActiveAt: "2026-01-01T00:00:00.000Z" },
};
const variables = { targetUserId: targetUser.id, targetUser };

function Harness() {
  const contacts = useContacts(
    "https://api.example.test",
    "stale-token",
    async () => "fresh-token",
    "preview-token",
    "user_1",
  );

  return (
    <>
      <button type="button" onClick={() => contacts.friendRequest.mutate(variables)}>
        Send
      </button>
      <button type="button" onClick={() => contacts.unfriend.mutate(variables)}>
        Unfriend
      </button>
      <button type="button" onClick={() => contacts.runSearch("target")}>
        Search
      </button>
      <button type="button" onClick={() => contacts.acceptFriendRequest.mutate(variables)}>
        Accept
      </button>
      <button type="button" onClick={() => contacts.rejectFriendRequest.mutate(variables)}>
        Reject
      </button>
      {contacts.rejectFriendRequest.isError ? <span>Request failed</span> : null}
    </>
  );
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useContacts friend request", () => {
  it("sends, accepts, rejects and removes friendship with a fresh Clerk token", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!init?.method) {
        return new Response(
          JSON.stringify(
            url.includes("/api/users/suggestions")
              ? { users: [], nextCursor: null, hasContacts: false }
              : [],
          ),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Harness />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input) ===
              "https://api.example.test/api/relationships?type=friend_request&x-vercel-protection-bypass=preview-token" &&
            init?.method === "POST",
        ),
      ).toBe(true);
    });

    const [, request] = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("type=friend_request"),
    ) ?? [undefined, undefined];
    expect(request?.headers).toEqual({
      Authorization: "Bearer fresh-token",
      "Content-Type": "application/json",
    });
    expect(request?.body).toBe(JSON.stringify({ targetUserId: "user_2" }));

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.click(screen.getByRole("button", { name: "Unfriend" }));

    await waitFor(() => {
      const responses = fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input) ===
            "https://api.example.test/api/friend-requests/user_2?x-vercel-protection-bypass=preview-token" &&
          init?.method === "PATCH",
      );
      expect(responses).toHaveLength(2);
      expect(responses.map(([, init]) => init?.body)).toEqual([
        JSON.stringify({ decision: "accept" }),
        JSON.stringify({ decision: "reject" }),
      ]);
      expect(
        responses.every(
          ([, init]) =>
            (init?.headers as Record<string, string> | undefined)?.Authorization ===
            "Bearer fresh-token",
        ),
      ).toBe(true);
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input) ===
              "https://api.example.test/api/relationships?type=friend&x-vercel-protection-bypass=preview-token" &&
            init?.method === "DELETE" &&
            init.body === JSON.stringify({ targetUserId: "user_2" }),
        ),
      ).toBe(true);
    });
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(10));
  });

  it("refreshes every contact list and active search after unfriend", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify(
            String(input).includes("/api/users/suggestions")
              ? { users: [], nextCursor: null, hasContacts: false }
              : String(input).includes("/api/users/search")
                ? { users: [], nextCursor: null }
                : [],
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />, { wrapper });

    const listUrls = [
      "type=following",
      "type=followers",
      "type=friends",
      "type=pending",
      "type=sent",
      "type=blocked",
      "/api/users/suggestions",
    ];
    const getCount = (part: string) =>
      fetchMock.mock.calls.filter(([input, init]) => String(input).includes(part) && !init?.method)
        .length;
    await waitFor(() => expect(listUrls.every((url) => getCount(url) === 1)).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(getCount("/api/users/search") === 1).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Unfriend" }));

    await waitFor(() => {
      expect(listUrls.every((url) => getCount(url) > 1)).toBe(true);
      expect(getCount("/api/users/search")).toBe(2);
    });
  });

  it("surfaces a failed friend-request response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
        init?.method
          ? new Response(null, { status: 500 })
          : new Response(JSON.stringify([]), { status: 200 }),
      ),
    );

    render(<Harness />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(await screen.findByText("Request failed")).toBeTruthy();
  });
});
