import type { TableGuestVotes, OptionVoteVoters as Voters } from "@board-game-organizer/schemas";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, userEvent, waitFor, within } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { EventGuestVoteEditor } from "@/components/events/EventGuestVoteEditor";
import { EventVoteButtons } from "@/components/events/EventVoteButtons";
import { OptionVoteVoters } from "@/components/events/OptionVoteVoters";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { plannedEvent, plannedTable } from "../../web/src/test-fixtures/eventRecords";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => ({
  apiUrl: "https://native-proxy-votes-perf.test",
  getToken: async () => "proxy-votes-fixture-token",
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "proxy-vote-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: boundary.apiUrl } } },
}));

const voters: Voters = {
  YES: [{ userId: "alba", name: "Alba Rossi", username: "albar", avatarUrl: null }],
  IF_NEEDED: [{ userId: "bosco", name: null, username: "bosco", avatarUrl: null }],
  NO: [],
};
const hidden = { includeHiddenElements: true };

it("EventVoteButtons and OptionVoteVoters: switch protected voter sections without casting a vote", async () => {
  const choose = vi.fn();
  const measured = await measureRenders(
    <>
      <OptionVoteVoters label="Azul" voters={voters} />
      <EventVoteButtons label="Azul" value="YES" busy={false} voters={voters} onChange={choose} />
    </>,
    {
      wrapper: NativeTestProviders,
      beforeEach: () => {
        choose.mockClear();
      },
      scenario: async () => {
        const summary = within(screen.getByLabelText("Votes: Azul"));
        expect(summary.getAllByRole("button")).toHaveLength(2);
        const user = userEvent.setup();
        await user.press(screen.getByRole("button", { name: "Azul: Yes" }));
        const dialog = within(await screen.findByTestId("confirmation-dialog"));
        expect(dialog.getByRole("button", { name: "Yes" })).toBeSelected();
        await user.press(dialog.getByRole("button", { name: "Show votes" }));
        expect(await screen.findByText("@albar", hidden)).toBeOnTheScreen();
        expect(screen.queryByText("Alba Rossi", hidden)).toBeNull();
        await fireEvent.press(screen.getByRole("tab", { name: "If needed", ...hidden }));
        expect(screen.getByText("@bosco", hidden)).toBeOnTheScreen();
        await fireEvent.press(screen.getByRole("tab", { name: "No", ...hidden }));
        expect(screen.getByText("No votes", hidden)).toBeOnTheScreen();
        await fireEvent.press(screen.getByRole("button", { name: "Close", ...hidden }));
        await waitFor(() => expect(screen.queryByText("Votes", hidden)).toBeNull());
        expect(choose).not.toHaveBeenCalled();
        await fireEvent.press(
          summary.getByRole("button", { name: "Azul: Show votes — If needed" }),
        );
        expect(await screen.findByRole("tab", { name: "If needed", ...hidden })).toBeSelected();
        expect(screen.getByText("@bosco", hidden)).toBeOnTheScreen();
        expect(choose).not.toHaveBeenCalled();
      },
    },
  );
  assertRenderMeasurement(measured);
});

it("EventGuestVoteEditor: stage a proxy ballot and publish it only on explicit submission", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const registrationId = "58246a08-f6cf-4ea8-a7cb-a571ae83dfba";
  const event = { ...plannedEvent, canManage: true };
  const table = {
    ...plannedTable,
    canManage: true,
    games: [...plannedTable.games, { gameId: 2 }],
    gamesDetail: [...plannedTable.gamesDetail, { id: 2, name: "Azul", imageUrl: null, year: null }],
  };
  const eventPath = `/api/events/${event.id}`;
  const guestPath = `${eventPath}/tables/${table.id}/guests/${registrationId}`;
  const initial: TableGuestVotes = {
    guestName: "Guest Alice",
    dateVotes: {},
    locationVotes: {},
    gameVotes: {},
  };
  let current = initial;
  const writes = vi.fn();
  const close = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      expect(url.origin).toBe(boundary.apiUrl);
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer proxy-votes-fixture-token",
      );
      if ((init?.method ?? "GET") === "GET") {
        if (url.pathname === eventPath) return Response.json(event);
        if (url.pathname === guestPath) return Response.json(current);
      }
      if (url.pathname === `${guestPath}/votes` && init?.method === "POST") {
        writes(JSON.parse(String(init.body)));
        current = { ...initial, gameVotes: { "1": "YES" } };
        return Response.json(current);
      }
      throw new Error(`Unexpected guest request: ${url.pathname}`);
    }),
  );
  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <NativeTestProviders>{children}</NativeTestProviders>
      </QueryClientProvider>
    );
  }
  try {
    const measured = await measureRenders(
      <EventGuestVoteEditor
        table={table}
        registrationId={registrationId}
        name="Guest Alice"
        onClose={close}
      />,
      {
        wrapper: Providers,
        beforeEach: () => {
          client.clear();
          current = initial;
          close.mockClear();
          writes.mockClear();
        },
        scenario: async () => {
          expect(await screen.findByText("Guest Alice", hidden)).toBeOnTheScreen();
          const vote = await screen.findByRole("button", { name: "Chess: Yes", ...hidden });
          const submit = screen.getByRole("button", { name: "Vote", ...hidden });
          expect(submit).toBeDisabled();
          await fireEvent.press(vote);
          expect(vote).toBeSelected();
          expect(writes).not.toHaveBeenCalled();
          expect(close).not.toHaveBeenCalled();
          await fireEvent.press(submit);
          await waitFor(() => expect(close).toHaveBeenCalledOnce());
          expect(writes).toHaveBeenCalledExactlyOnceWith({
            votes: [{ kind: "game", tableId: table.id, gameId: 1, vote: "YES" }],
          });
        },
      },
    );
    assertRenderMeasurement(measured);
  } finally {
    await client.cancelQueries();
    client.clear();
    vi.unstubAllGlobals();
  }
});
