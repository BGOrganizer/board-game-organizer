import type { PlannedEventResponse, PlannedTableResponse } from "@board-game-organizer/schemas";
import {
  eventRecordKeys,
  type ScorePlayer,
  type TableScoreInput,
} from "@board-game-organizer/shared";
import { configure, measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { type ReactElement, useState } from "react";
import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";
import ScoreEntryPage from "@/app/(tabs)/events/[eventId]/tables/[tableId]/results/page";
import { TableScoreEditor } from "@/components/events/TableScoreEditor";
import { plannedEvent, plannedTable, seat } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => {
  const previousApi = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "https://score-render-fixtures.test";
  return {
    previousApi,
    getToken: vi.fn<() => Promise<string | null>>(),
    back: vi.fn(),
    replace: vi.fn(),
  };
});
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    userId: "owner",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: boundary.back, replace: boundary.replace }),
}));
const options = {
  apiUrl: "https://score-render-fixtures.test",
  userId: "owner",
  enabled: true,
  getToken: boundary.getToken,
};
const players: ScorePlayer[] = [
  { id: "owner", name: "Alice", username: "alice", email: null, avatarUrl: null },
  { id: "bob", name: "Bob", username: "bob", email: null, avatarUrl: null },
  { id: "carol", name: "Carol", username: "carol", email: null, avatarUrl: null },
];
const initial: TableScoreInput = {
  lowerWins: false,
  entries: players.map((player) => ({ userId: player.id, score: "10" })),
  tieBreaks: [],
};
let activeClient: QueryClient | undefined;
let serverEvent: PlannedEventResponse;
let serverTable: PlannedTableResponse;
let resultRoute = false;
const reads: string[] = [];
function currentClient() {
  if (!activeClient) throw new Error("Expected the measured sample's actual Query client");
  return activeClient;
}
function renderMeasured(element: ReactElement) {
  boundary.getToken.mockClear();
  boundary.back.mockClear();
  boundary.replace.mockClear();
  reads.length = 0;
  serverEvent = { ...plannedEvent, status: "CONFIRMED", canFinalize: true, canRegister: false };
  serverTable = {
    ...plannedTable,
    eventVersion: 1,
    eventStatus: "CONFIRMED",
    confirmed: {
      gameId: 1,
      playerIds: players.map((player) => player.id),
      startsAt: "2030-06-03T18:00:00Z",
    },
    resultDraft: initial,
  };
  activeClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const client = activeClient;
  if (resultRoute) {
    client.setQueryData(eventRecordKeys.detail(options, serverEvent.id), serverEvent);
    client.setQueryData(
      eventRecordKeys.table(options, serverEvent.id, serverTable.id),
      serverTable,
    );
    client.setQueryData(
      [...eventRecordKeys.root(options), "seats", serverEvent.id, serverTable.id, false, ""],
      {
        pages: [
          {
            items: players.map((player, index) => ({
              ...seat(player.id),
              id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
              name: player.name,
              username: player.username,
            })),
            nextCursor: null,
          },
        ],
        pageParams: [""],
      },
    );
  }
  return renderWithI18n(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
function cleanupMeasured() {
  cleanup();
  activeClient?.clear();
  activeClient = undefined;
}
configure({
  testingLibrary: { render: renderMeasured, cleanup: cleanupMeasured },
  runs: 10,
  warmupRuns: 1,
});
beforeEach(() => {
  vi.clearAllMocks();
  boundary.getToken.mockResolvedValue("fresh-score-render-token");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      if (!resultRoute) throw new Error("Standalone score rendering must not perform network I/O");
      const url = new URL(input);
      expect(url.origin).toBe(options.apiUrl);
      expect(init?.method ?? "GET").toBe("GET");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer fresh-score-render-token",
      );
      reads.push(url.pathname);
      if (url.pathname === `/api/events/${serverEvent.id}`) return Response.json(serverEvent);
      if (url.pathname === `/api/events/${serverEvent.id}/tables/${serverTable.id}`)
        return Response.json(serverTable);
      throw new Error(`Unexpected measured score request: ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  cleanupMeasured();
  vi.unstubAllGlobals();
});
afterAll(() => {
  if (boundary.previousApi === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = boundary.previousApi;
});

function ScoreScenario({ pending = false }: { pending?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [submissions, setSubmissions] = useState<TableScoreInput[]>([]);
  return (
    <>
      <TableScoreEditor
        players={players}
        initial={initial}
        busy={busy}
        onSubmit={(input) => {
          setSubmissions((previous) => [...previous, input]);
          if (pending) setBusy(true);
        }}
      />
      <output aria-label="Submitted table scores">{JSON.stringify(submissions)}</output>
      {busy ? (
        <button type="button" onClick={() => setBusy(false)}>
          Complete result save
        </button>
      ) : null}
    </>
  );
}
async function changeScore(name: string, value: string) {
  fireEvent.click(screen.getByRole("button", { name: `Score: ${name}` }));
  fireEvent.change(await screen.findByRole("textbox", { name: `Score: ${name}` }), {
    target: { value },
  });
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("textbox", { name: `Score: ${name}` })).toBeNull());
}
async function saveScores() {
  fireEvent.click(screen.getByRole("button", { name: "Save result" }));
  const dialog = await screen.findByRole("dialog", { name: "Save result?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save result" }));
}
const cases: {
  name: string;
  element: ReactElement;
  route?: boolean;
  scenario: () => Promise<void>;
}[] = [
  {
    name: "TableScoreEditor: prune a three-player tie after its score group shrinks to two",
    element: <ScoreScenario />,
    scenario: async () => {
      fireEvent.click(screen.getByRole("button", { name: "Resolve tie" }));
      fireEvent.click(screen.getByRole("button", { name: "Move down: Alice" }));
      fireEvent.click(screen.getByRole("button", { name: "Confirm tie-break" }));
      expect(screen.getByText("Tie-break applied: 10")).toBeVisible();
      expect(screen.getByRole("button", { name: "Edit tie-break" })).toBeVisible();
      await changeScore("Alice", "11");
      expect(screen.getByText("Tied score: 10")).toBeVisible();
      expect(screen.queryByText("Tie-break applied: 10")).toBeNull();
      expect(screen.queryByRole("button", { name: "Edit tie-break" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Remove tie-break" })).toBeNull();
      expect(screen.getByRole("button", { name: "Resolve tie" })).toBeEnabled();
      await saveScores();
      expect(
        JSON.parse(screen.getByLabelText("Submitted table scores").textContent ?? "null"),
      ).toEqual([
        {
          lowerWins: false,
          entries: [
            { userId: "owner", score: "11" },
            { userId: "bob", score: "10" },
            { userId: "carol", score: "10" },
          ],
          tieBreaks: [],
        },
      ]);
      expect(reads).toHaveLength(0);
      expect(boundary.getToken).not.toHaveBeenCalled();
    },
  },
  {
    name: "TableScoreEditor: parent pending state blocks duplicate saves and preserves edited scores",
    element: <ScoreScenario pending />,
    scenario: async () => {
      await changeScore("Alice", "11");
      await saveScores();
      expect(screen.getByRole("button", { name: "Save result" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Score: Alice" })).toBeDisabled();
      expect(screen.getByRole("switch", { name: "Lowest score wins" })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Save result" }));
      expect(
        JSON.parse(screen.getByLabelText("Submitted table scores").textContent ?? "null"),
      ).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: "Complete result save" }));
      expect(screen.getByRole("button", { name: "Save result" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "Score: Alice" }));
      expect(await screen.findByRole("textbox", { name: "Score: Alice" })).toHaveValue("11");
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(reads).toHaveLength(0);
      expect(boundary.getToken).not.toHaveBeenCalled();
    },
  },
  {
    name: "EventResults: authoritative version change preserves local scores and disables stale submission",
    element: await ScoreEntryPage({
      params: Promise.resolve({ eventId: plannedEvent.id, tableId: plannedTable.id }),
    }),
    route: true,
    scenario: async () => {
      // The real form requires fresh matching parent/Table reads even with a
      // populated cache; the roster stays cached. No app hooks are replaced.
      await waitFor(() => expect(currentClient().isFetching()).toBe(0));
      await changeScore("Alice", "11");
      const originalButton = screen.getByRole("button", { name: "Score: Alice" });
      serverEvent = { ...serverEvent, version: 2 };
      serverTable = { ...serverTable, eventVersion: 2 };
      await act(async () => {
        currentClient().setQueryData(eventRecordKeys.detail(options, serverEvent.id), serverEvent);
        currentClient().setQueryData(
          eventRecordKeys.table(options, serverEvent.id, serverTable.id),
          serverTable,
        );
      });
      expect(
        await screen.findByText("This event changed. Go back and reopen the editor before saving."),
      ).toBeVisible();
      expect(screen.getByRole("button", { name: "Score: Alice" })).toBe(originalButton);
      expect(originalButton).toBeDisabled();
      expect(screen.getByRole("button", { name: "Save result" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
      expect(screen.getByText("11", { exact: true })).toBeVisible();
      expect(reads).toHaveLength(2);
      expect(boundary.getToken).toHaveBeenCalledTimes(2);
      expect(boundary.replace).not.toHaveBeenCalled();
      expect(currentClient().getMutationCache().getAll()).toHaveLength(0);
    },
  },
];
for (const { name, element, route = false, scenario } of cases) {
  test(name, async () => {
    resultRoute = route;
    const result = await measureRenders(element, { scenario });
    // Raw ten-sample measurements are retained before the intentional missing
    // budget failure. Register ceilings only after two actual stable runs.
    assertRenderMeasurement(result, name);
  });
}
