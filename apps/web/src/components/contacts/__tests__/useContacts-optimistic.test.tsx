import { type ContactUser, useContacts } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const apiUrl = "https://api.example.test";
const token = "viewer";
const feedback = {
  onOptimisticUpdate: vi.fn(),
  onSuccess: vi.fn(),
  onError: vi.fn(),
};

const target: ContactUser = {
  id: "target",
  name: "Target",
  email: "target@example.com",
  avatarUrl: null,
  presence: { online: false, lastActiveAt: "2026-01-01T00:00:00.000Z" },
};

function Harness() {
  const contacts = useContacts(apiUrl, token, undefined, undefined, "viewer", feedback);
  return (
    <>
      <output data-testid="sent">
        {(contacts.sent.data ?? []).map((row) => row.profile?.id).join(",")}
      </output>
      <output data-testid="has-contacts">
        {String(contacts.suggestions.data?.hasContacts ?? false)}
      </output>
      <button
        type="button"
        onClick={() =>
          contacts.friendRequest.mutate({ targetUserId: target.id, targetUser: target })
        }
      >
        Send
      </button>
      <button
        type="button"
        onClick={() => contacts.syncContacts.mutate({ emails: [], phoneNumbers: [] })}
      >
        Sync
      </button>
      {contacts.friendRequest.isError ? <p role="alert">Failed</p> : null}
      {contacts.syncContacts.isError ? <p role="alert">Sync failed</p> : null}
    </>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("reconciles an acknowledged empty snapshot even when background suggestions cannot be refreshed", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = ["contacts", "suggestions", apiUrl, token];
  client.setQueryData(key, {
    pages: [{ users: [], hasContacts: true, nextCursor: null }],
    pageParams: [""],
  });
  let saved = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        saved = true;
        return Response.json({
          stored: 0,
          users: [],
          registeredIdentifiers: { emails: [], phoneNumbers: [] },
        });
      }
      if (String(input).includes("suggestions")) {
        if (saved) throw new Error("background unavailable");
        return Response.json({ users: [], hasContacts: true });
      }
      return Response.json([]);
    }),
  );
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Sync" }));
  await waitFor(() => expect(feedback.onSuccess).toHaveBeenCalledWith("sync_contacts"));
  await waitFor(() => expect(client.getQueryState(key)?.status).toBe("error"));
  expect(screen.getByTestId("has-contacts").textContent).toBe("false");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("optimistically marks contact sync and rolls it back on failure", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["contacts", "suggestions", apiUrl, token], {
    pages: [{ users: [], hasContacts: false, nextCursor: null }],
    pageParams: [""],
  });

  let failRequest = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Promise<Response>((_resolve, reject) => {
          failRequest = () => reject(new Error("network failed"));
        });
      }
      const body = String(input).includes("suggestions") ? { users: [], hasContacts: false } : [];
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }),
  );

  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Sync" }));

  await waitFor(() => expect(screen.getByTestId("has-contacts").textContent).toBe("true"));
  expect(feedback.onOptimisticUpdate).not.toHaveBeenCalledWith("sync_contacts");
  expect(feedback.onSuccess).not.toHaveBeenCalled();
  failRequest();
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Sync failed"));
  expect(screen.getByTestId("has-contacts").textContent).toBe("false");
  expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "verify_saved_changes");
});

it("rolls all contact caches back when an optimistic mutation fails", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  for (const view of ["following", "followers", "friends", "pending", "sent", "blocked"]) {
    client.setQueryData(["contacts", view, apiUrl, token], {
      pages: [{ rows: [], nextCursor: null }],
      pageParams: [""],
    });
  }
  client.setQueryData(["contacts", "suggestions", apiUrl, token], {
    pages: [{ users: [target], hasContacts: true, nextCursor: null }],
    pageParams: [""],
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
  expect(feedback.onOptimisticUpdate).toHaveBeenCalledWith("friend_request");
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true),
  );
  failRequest();
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Failed"));
  expect(screen.getByTestId("sent").textContent).toBe("");
  expect(feedback.onError).toHaveBeenCalledWith(expect.any(Error), "verify_saved_changes");
  expect(
    client.getQueryData<{ pages: { users: ContactUser[] }[] }>([
      "contacts",
      "suggestions",
      apiUrl,
      token,
    ])?.pages[0].users,
  ).toEqual([target]);
});
