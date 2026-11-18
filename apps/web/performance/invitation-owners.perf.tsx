import type { TableInviteReviewResponse } from "@board-game-organizer/schemas";
import type { InviteRow } from "@board-game-organizer/shared";
import { configure, measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import { TableInviteLinkRow } from "@/components/events/TableInviteLinkRow";
import { plannedEvent, plannedTable, tableId } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { InviteLanding } from "../../api/src/app/invite/[token]/InviteLanding";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const sdk = vi.hoisted(() => {
  const apiUrl = "https://invitation-render-fixtures.test";
  const previousApi = process.env.NEXT_PUBLIC_API_URL;
  vi.stubEnv("NEXT_PUBLIC_API_URL", apiUrl);
  return {
    apiUrl,
    previousApi,
    sessionToken: "fixture-owner-token",
    getToken: vi.fn<() => Promise<string>>(),
    copy: vi.fn<(text: string) => Promise<void>>(),
  };
});
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "owner-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: sdk.getToken,
  }),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

const token = "abcdefghijklmnopqrstuv";
const secondOption = "44444444-4444-4444-8444-444444444444";
const groupId = "55555555-5555-4555-8555-555555555555";
const review = (): TableInviteReviewResponse => ({
  kind: "TABLE",
  expiresAt: "2030-06-07T12:00:00.000Z",
  inviter: { id: "inviter", name: "Inviter", username: "inviter", avatarUrl: null },
  group: { id: groupId, name: "Invited private group" },
  event: {
    id: plannedEvent.id,
    name: "Invited planning event",
    version: 7,
    timeZone: plannedEvent.timeZone,
    startTime: plannedEvent.startTime,
    dates: [...plannedEvent.dates, { id: secondOption, day: "2030-06-04" }],
    locations: [
      ...plannedEvent.locations,
      { ...plannedEvent.locations[0], id: secondOption, name: "Second venue" },
    ],
    planningMode: "ASSISTED",
    playerPreference: "MORE_PLAYERS",
  },
  table: {
    id: plannedTable.id,
    name: "Invited planning table",
    games: [...plannedTable.games, { ...plannedTable.games[0], gameId: 2 }],
    gamesDetail: [
      ...plannedTable.gamesDetail,
      { id: 2, name: "Dixit", imageUrl: null, year: null },
    ],
    minPlayers: 2,
    maxPlayers: 4,
    rankingEnabled: true,
  },
  requiresAvailability: true,
  ownAvailability: null,
  ownRegistration: null,
});
function deferred<T>() {
  let finish: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    finish = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!finish) throw new Error("Expected the controlled HTTP response");
      finish(value);
    },
  };
}
type Mode = "claim" | "denied" | "generate";
let mode: Mode;
let client: QueryClient | undefined;
let currentReview: TableInviteReviewResponse;
let pendingReview: ReturnType<typeof deferred<Response>> | undefined;
let pendingWrite: ReturnType<typeof deferred<Response>>;
const reads: string[] = [];
const writes: { origin: string; path: string; input: unknown; authorization: string | null }[] = [];
const foreignReview = { ...review(), group: { id: groupId, name: "Other account private group" } };
const reviewKey = (owner = "owner") => ["invites", window.location.origin, owner, "review", token];
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const link: InviteRow = {
  token,
  link: `${sdk.apiUrl}/invite/${token}`,
  email: null,
  expiresAt: "2030-06-07T12:00:00.000Z",
};
function activeClient() {
  if (!client) throw new Error("Expected the current measured invitation owner");
  return client;
}
function renderOwner(element: ReactElement) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  reads.length = writes.length = 0;
  sdk.sessionToken = "fixture-owner-token";
  sdk.getToken.mockClear();
  sdk.copy.mockClear();
  currentReview = review();
  pendingWrite = deferred<Response>();
  pendingReview = mode === "denied" ? deferred<Response>() : undefined;
  client.setQueryData(reviewKey("other"), foreignReview);
  if (mode === "denied") client.setQueryData(reviewKey(), currentReview);
  return renderWithI18n(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
function cleanupOwner() {
  cleanup();
  client?.clear();
  client = undefined;
}
beforeEach(() => {
  sdk.getToken.mockImplementation(async () => sdk.sessionToken);
  sdk.copy.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: sdk.copy },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      const method = init?.method ?? "GET";
      const authorization = new Headers(init?.headers).get("authorization");
      expect(authorization).toBe(`Bearer ${sdk.sessionToken}`);
      if (
        method === "GET" &&
        url.origin === window.location.origin &&
        url.pathname === `/api/invites/${token}`
      ) {
        reads.push(url.pathname);
        return pendingReview ? pendingReview.promise : Response.json(currentReview);
      }
      const path = mode === "generate" ? "/api/invites" : "/api/invites/claim";
      const origin = mode === "generate" ? sdk.apiUrl : window.location.origin;
      if (method !== "POST" || url.pathname !== path || url.origin !== origin)
        throw new Error(`Unexpected invitation request: ${method} ${url.origin}${url.pathname}`);
      writes.push({
        origin: url.origin,
        path,
        input: JSON.parse(String(init?.body)),
        authorization,
      });
      return pendingWrite.promise;
    }),
  );
});
afterEach(() => {
  cleanupOwner();
  vi.unstubAllGlobals();
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});
afterAll(() => {
  if (sdk.previousApi === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = sdk.previousApi;
});
configure({
  testingLibrary: { render: renderOwner, cleanup: cleanupOwner },
  runs: 10,
  warmupRuns: 1,
});

function ballot(title: string) {
  const section = screen.getByRole("heading", { name: title }).closest("section");
  if (!(section instanceof HTMLElement)) throw new Error(`Expected the real ${title} vote section`);
  return within(section);
}
function answerRequiredVotes() {
  for (const title of ["Dates", "Locations", "Games"]) {
    const rows = ballot(title).getAllByRole("group");
    expect(rows).toHaveLength(2);
    for (const row of rows) fireEvent.click(within(row).getByRole("button", { name: /: No$/ }));
  }
  expect(screen.getByRole("button", { name: "Accept invitation" })).toBeDisabled();
  for (const title of ["Dates", "Locations", "Games"])
    fireEvent.click(
      within(ballot(title).getAllByRole("group")[0]).getByRole("button", { name: /: Yes$/ }),
    );
}
function foreignScopeUnchanged() {
  expect(activeClient().getQueryData(reviewKey("other"))).toBe(foreignReview);
  expect(screen.queryByText(foreignReview.group.name)).toBeNull();
}

const claimScenario =
  "InviteLanding: explicit complete table ballot and pending claim preserve single consent before authoritative queue receipt";
test(claimScenario, async () => {
  mode = "claim";
  const result = await measureRenders(<InviteLanding token={token} />, {
    scenario: async () => {
      expect(await screen.findByText("Invited planning table")).toBeVisible();
      expect(screen.getByText(/Accepting makes you friends with @inviter/)).toBeVisible();
      expect(writes).toEqual([]);
      expect(screen.getByRole("button", { name: "Accept invitation" })).toBeDisabled();
      answerRequiredVotes();
      expect(screen.getByRole("button", { name: "Accept invitation" })).toBeEnabled();
      sdk.sessionToken = "fresh-claim-token";
      fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
      await waitFor(() => expect(writes).toHaveLength(1));
      const accept = screen.getByRole("button", { name: "Accepting invitation…" });
      expect(accept).toBeDisabled();
      fireEvent.click(accept);
      expect(writes).toHaveLength(1);
      expect(writes[0]).toEqual({
        origin: window.location.origin,
        path: "/api/invites/claim",
        authorization: "Bearer fresh-claim-token",
        input: {
          token,
          consent: true,
          participation: {
            version: 7,
            gameVotes: { "1": "YES", "2": "NO" },
            availability: {
              version: 7,
              dateVotes: { [plannedEvent.dates[0].id]: "YES", [secondOption]: "NO" },
              locationVotes: { [plannedEvent.locations[0].id]: "YES", [secondOption]: "NO" },
            },
          },
        },
      });
      await act(() =>
        pendingWrite.resolve(
          Response.json({
            success: true,
            inviter: null,
            table: { groupId, eventId: plannedEvent.id, tableId, position: "WAITING" },
          }),
        ),
      );
      expect(await screen.findByText("You joined the waiting list.")).toBeVisible();
      expect(screen.getByRole("heading", { name: "Invitation accepted" })).toBeVisible();
      expect(
        screen.queryByRole("button", { name: /Accept invitation|Accepting invitation/ }),
      ).toBeNull();
      expect(reads).toEqual([`/api/invites/${token}`]);
      expect(writes).toHaveLength(1);
      foreignScopeUnchanged();
    },
  });
  assertRenderMeasurement(result, claimScenario);
});

const denialScenario =
  "InviteLanding: denied cached private review is hidden until explicit refresh supplies a new authoritative ballot";
test(denialScenario, async () => {
  mode = "denied";
  const result = await measureRenders(<InviteLanding token={token} />, {
    scenario: async () => {
      expect(screen.getByText("Invited private group")).toBeVisible();
      expect(screen.getByRole("button", { name: "Accept invitation" })).toBeDisabled();
      await waitFor(() => expect(reads).toHaveLength(1));
      if (!pendingReview) throw new Error("Expected a pending authoritative review");
      await act(() =>
        pendingReview?.resolve(Response.json({ error: "Invite unavailable" }, { status: 403 })),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent("Invitation unavailable");
      expect(screen.queryByText("Invited private group")).toBeNull();
      expect(screen.queryByText("Invited planning table")).toBeNull();
      expect(writes).toEqual([]);
      pendingReview = undefined;
      currentReview = {
        ...review(),
        event: { ...review().event, version: 8, name: "Updated authorized event" },
      };
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("Updated authorized event")).toBeVisible();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("button", { name: "Accept invitation" })).toBeDisabled();
      for (const title of ["Dates", "Locations", "Games"])
        for (const choice of ballot(title).getAllByRole("button"))
          expect(choice).toHaveAttribute("aria-pressed", "false");
      answerRequiredVotes();
      expect(screen.getByRole("button", { name: "Accept invitation" })).toBeEnabled();
      expect(activeClient().getQueryData(reviewKey())).toEqual(currentReview);
      expect(reads).toEqual([`/api/invites/${token}`, `/api/invites/${token}`]);
      expect(writes).toEqual([]);
      foreignScopeUnchanged();
    },
  });
  assertRenderMeasurement(result, denialScenario);
});

const generationScenario =
  "TableInviteLinkRow: fresh-token generation blocks duplicate pending requests and copies only the authoritative contextual link";
test(generationScenario, async () => {
  mode = "generate";
  const result = await measureRenders(
    <ul>
      <TableInviteLinkRow tableId={tableId} disabled={false} />
    </ul>,
    {
      scenario: async () => {
        const generate = screen.getByRole("button", { name: "Generate invite" });
        expect(generate).toBeEnabled();
        expect(writes).toEqual([]);
        sdk.sessionToken = "fresh-generation-token";
        fireEvent.click(generate);
        await waitFor(() => expect(writes).toHaveLength(1));
        expect(screen.getByRole("status", { name: "Creating invite" })).toBeVisible();
        expect(generate).toBeDisabled();
        fireEvent.click(generate);
        expect(writes).toHaveLength(1);
        expect(writes[0]).toEqual({
          origin: sdk.apiUrl,
          path: "/api/invites",
          input: { tableId },
          authorization: "Bearer fresh-generation-token",
        });
        expect(sdk.copy).not.toHaveBeenCalled();
        await act(() => pendingWrite.resolve(Response.json(link)));
        expect(await screen.findByText(link.link)).toBeVisible();
        expect(generate).toBeEnabled();
        expect(screen.queryByRole("status", { name: "Creating invite" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Copy" }));
        expect(await screen.findByRole("button", { name: "Copied!" })).toBeVisible();
        expect(sdk.copy).toHaveBeenCalledExactlyOnceWith(link.link);
        expect(writes).toHaveLength(1);
        expect(reads).toEqual([]);
        foreignScopeUnchanged();
      },
    },
  );
  assertRenderMeasurement(result, generationScenario);
});
