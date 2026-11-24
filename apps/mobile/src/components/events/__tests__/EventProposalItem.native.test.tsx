import type { EventProposalResponse } from "@board-game-organizer/schemas";
import { render, screen, userEvent } from "@testing-library/react-native";
import { Button } from "heroui-native/button";
import { Typography } from "heroui-native/text";
import { expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  optionId,
  plannedEvent,
  plannedTable,
} from "../../../../../web/src/test-fixtures/eventRecords";
import { EventProposalItem } from "../EventProposalItem";

it("uses the saved game proposal label before catalog metadata arrives and retains its actual review action", async () => {
  const review = vi.fn();
  const proposal: EventProposalResponse = {
    id: optionId,
    eventId: plannedEvent.id,
    groupId: null,
    userId: "recommender",
    authorName: "Proposing Player",
    clientRequestId: optionId,
    label: "Saved title",
    payload: { kind: "game", gameId: 167791, tableId: plannedTable.id },
    status: "PENDING",
    version: 1,
    submittedEventVersion: 1,
    createdAt: plannedEvent.createdAt,
    updatedAt: plannedEvent.updatedAt,
  };
  const row = (value: EventProposalResponse) => (
    <NativeTestProviders>
      <EventProposalItem
        row={value}
        actions={
          <Button onPress={review}>
            <Button.Label>Review this proposal</Button.Label>
          </Button>
        }
      >
        <Typography>Proposed by @recommender</Typography>
      </EventProposalItem>
    </NativeTestProviders>
  );
  const view = await render(row(proposal));
  expect(screen.getByText("Saved title")).toBeVisible();
  expect(screen.getByText("Proposed by @recommender")).toBeVisible();
  await view.rerender(
    row({ ...proposal, game: { id: 167791, name: "Terraforming Mars", imageUrl: null } }),
  );
  expect(screen.getByText("Terraforming Mars")).toBeVisible();
  expect(screen.queryByText("Saved title")).toBeNull();
  await userEvent.setup().press(screen.getByRole("button", { name: "Review this proposal" }));
  expect(review).toHaveBeenCalledOnce();
});
