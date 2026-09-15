import { type ContactUser, useContacts } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const apiUrl = "https://api.example.test";
const token = "token";
const target: ContactUser = {
  id: "target",
  name: "Target",
  email: "target@example.com",
  avatarUrl: null,
  presence: { online: false, lastActiveAt: "2026-01-01T00:00:00.000Z" },
};

function Harness() {
  const contacts = useContacts(apiUrl, token, undefined, undefined, "viewer");
  return (
    <>
      <output data-testid="sent">
        {(contacts.sent.data ?? []).map((row) => row.profile?.id).join(",")}
      </output>
      <button
        type="button"
        onClick={() =>
          contacts.friendRequest.mutate({ targetUserId: target.id, targetUser: target })
        }
      >
        Send
      </button>
      {contacts.friendRequest.isError ? <p role="alert">Failed</p> : null}
    </>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it("rolls all contact caches back when an optimistic mutation fails", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const view of ["following", "followers", "friends", "pending", "sent", "blocked"]) {
    client.setQueryData(["contacts", view, apiUrl, token], []);
  }
  client.setQueryData(["contacts", "suggestions", apiUrl, token], {
    users: [target],
    hasContacts: true,
  });

  let failRequest = () => {};
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "POST") {
      return new Promise<Response>((_resolve, reject) => {
        failRequest = () => reject(new Error("network failed"));
      });
    }
    const body = String(input).includes("suggestions")
      ? { users: [target], hasContacts: true }
      : [];
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);

  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Send" }));

  await waitFor(() => expect(screen.getByTestId("sent").textContent).toBe("target"));
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true),
  );
  failRequest();
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Failed"));
  expect(screen.getByTestId("sent").textContent).toBe("");
  expect(
    client.getQueryData<{ users: ContactUser[] }>(["contacts", "suggestions", apiUrl, token])
      ?.users,
  ).toEqual([target]);
});
