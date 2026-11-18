import { eventRecordKeys } from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { beginOptimisticOperation } from "../../../../../../packages/shared/src/common/optimisticOperation";
import { EventTableInvitationActions } from "../EventTableInvitationActions";

const boundary = vi.hoisted(() => {
  const previousApi = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "https://invitation-callback-contract.test";
  return { previousApi, getToken: vi.fn(async () => "unused-callback-contract-token") };
});
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "owner-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));

// Isolated parent/child callback-contract UNIT. The probe deliberately delivers
// the current public callback even when pending is signalled to the child.
// This is not InvitationActions UI acceptance or a rendering benchmark.
vi.mock("@/components/common/ui/InvitationActions", () => ({
  InvitationActions: ({ pending, onAccept }: { pending: boolean; onAccept: () => void }) => (
    <>
      <output aria-label="Child pending contract">{String(pending)}</output>
      <button type="button" onClick={onAccept}>
        Deliver child accept callback
      </button>
    </>
  ),
}));
const options = {
  apiUrl: "https://invitation-callback-contract.test",
  userId: "owner",
  enabled: true,
  getToken: boundary.getToken,
};
let client: QueryClient | undefined;
afterEach(() => {
  cleanup();
  client?.clear();
  client = undefined;
  vi.unstubAllGlobals();
});
afterAll(() => {
  if (boundary.previousApi === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = boundary.previousApi;
});

it("rejects a child accept delivery while the current scoped action is pending and accepts it after rollback", async () => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const ownedClient = client;
  const registration = { ...seat("owner"), status: "PENDING" as const };
  ownedClient.setQueryData(eventRecordKeys.detail(options, plannedEvent.id), plannedEvent);
  ownedClient.setQueryData(eventRecordKeys.table(options, plannedEvent.id, plannedTable.id), {
    ...plannedTable,
    canRespond: true,
    myRegistration: registration,
  });
  const network = vi.fn(async () => {
    throw new Error("The callback contract must not perform HTTP I/O");
  });
  vi.stubGlobal("fetch", network);
  renderWithI18n(
    <QueryClientProvider client={ownedClient}>
      <EventTableInvitationActions eventId={plannedEvent.id} registration={registration} />
    </QueryClientProvider>,
  );
  expect(screen.getByLabelText("Child pending contract")).toHaveTextContent("false");
  let operation: Awaited<ReturnType<typeof beginOptimisticOperation>> | undefined;
  await act(async () => {
    operation = await beginOptimisticOperation(
      ownedClient,
      [...eventRecordKeys.root(options), plannedEvent.id, "write"],
      {
        queryKey: eventRecordKeys.root(options),
      },
    );
  });
  await waitFor(() =>
    expect(screen.getByLabelText("Child pending contract")).toHaveTextContent("true"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Deliver child accept callback" }));
  expect(screen.queryByRole("dialog", { name: "Review table settings" })).toBeNull();
  expect(network).not.toHaveBeenCalled();
  const pendingOperation = operation;
  if (!pendingOperation) throw new Error("Expected the actual scoped pending operation");
  await act(() => pendingOperation.rollback());
  await waitFor(() =>
    expect(screen.getByLabelText("Child pending contract")).toHaveTextContent("false"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Deliver child accept callback" }));
  expect(await screen.findByRole("dialog", { name: "Review table settings" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Accept invitation" })).toBeEnabled();
  expect(network).not.toHaveBeenCalled();
  expect(boundary.getToken).not.toHaveBeenCalled();
  expect(ownedClient.getQueryData(eventRecordKeys.detail(options, plannedEvent.id))).toEqual(
    plannedEvent,
  );
});
