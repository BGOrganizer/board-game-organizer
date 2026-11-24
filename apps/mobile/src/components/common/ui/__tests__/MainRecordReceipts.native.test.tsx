import "./mainListFixture";

import {
  CommunityApiError,
  type CreateEventVariables,
  type CreateGroupVariables,
  eventDraftInput,
  eventRecordKeys,
  groupRecordKeys,
} from "@board-game-organizer/shared";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { expect, it, vi } from "vitest";
import EventsScreen from "@/app/(tabs)/events";
import GroupsScreen from "@/app/(tabs)/groups";
import { eventDraftFixture } from "../../../events/__tests__/eventWizardFixtures";
import {
  listEvent,
  listFixture,
  listGroup,
  listId,
  listJson,
  listOptions,
  MainListFixture,
} from "./mainListFixture";

it.each([
  { kind: "events", Route: EventsScreen },
  { kind: "groups", Route: GroupsScreen },
] as const)(
  "checks and reconciles an ambiguous $kind create without repeating the write",
  async ({ kind, Route }) => {
    const client = listFixture.client;
    if (!client) throw new Error("Expected the maintained native list client");

    const name = "Ambiguous local draft";
    const clientRequestId = listId(870);
    const mutationKey = (kind === "events" ? eventRecordKeys : groupRecordKeys).mutation(
      listOptions(),
      "",
      "create",
    );
    let variables: CreateEventVariables | CreateGroupVariables;
    if (kind === "events") {
      const eventDraft = eventDraftFixture({
        name,
        groupId: null,
        dates: [{ id: listId(872), day: "2030-05-02" }],
      });
      const eventInput = eventDraftInput(eventDraft, false);
      if (!eventInput.success || "version" in eventInput.data)
        throw new Error("Expected real valid event creation data");
      variables = { ...eventInput.data, clientRequestId };
    } else {
      variables = { name, clientRequestId, type: "PRIVATE", invitedUserIds: [] };
    }
    const error = new CommunityApiError(503, "Server write outcome is unresolved");
    client.getMutationCache().build(
      client,
      { mutationKey },
      {
        context: undefined,
        data: undefined,
        error,
        failureCount: 1,
        failureReason: error,
        isPaused: false,
        status: "error",
        submittedAt: Date.now(),
        variables,
      },
    );

    await render(
      <MainListFixture>
        <Route />
      </MainListFixture>,
    );
    expect(await screen.findByText(name)).toBeVisible();
    const check = await screen.findByRole("button", {
      name: "Check saved changes",
      disabled: false,
    });
    const path = `/api/${kind}`;
    const reads = () => listFixture.reads.filter((request) => request.pathname === path);
    const initialReads = reads().length;
    let finish!: (response: Response) => void;
    listFixture.pending.set(
      path,
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await userEvent.setup().press(check);
    await waitFor(() => expect(check).toBeDisabled());
    expect(reads()).toHaveLength(initialReads + 1);
    await userEvent.setup().press(check);
    expect(reads()).toHaveLength(initialReads + 1);

    const savedName = "Canonical saved resource";
    const receipt =
      kind === "events"
        ? listEvent(savedName, { id: listId(871), clientRequestId })
        : listGroup(savedName, { id: listId(871), clientRequestId });
    await act(() => {
      listFixture.pending.delete(path);
      finish(listJson({ items: [receipt], nextCursor: null }));
    });
    expect(await screen.findByText(savedName)).toBeVisible();
    expect(screen.queryByText(name)).toBeNull();
    expect(screen.queryByRole("button", { name: "Check saved changes" })).toBeNull();
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(
      true,
    );
  },
);
