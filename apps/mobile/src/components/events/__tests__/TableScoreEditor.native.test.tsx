import type { ScorePlayer, TableScoreInput } from "@board-game-organizer/shared";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { StyleSheet } from "react-native";
import { expect, it, vi } from "vitest";
import { FormInteractionScope } from "@/components/common/ui/FormInteractionScope";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { TableScoreEditor } from "../TableScoreEditor";

const players: ScorePlayer[] = [
  { id: "alice", name: "Alice Player", username: "alice", email: null, avatarUrl: null },
  { id: "bob", name: "Bob Player", username: "bob", email: null, avatarUrl: null },
  { id: "carol", name: "Carol Player", username: "carol", email: null, avatarUrl: null },
];
const initial = (
  scores: (string | null)[] = ["10", "20", "5"],
  tieBreaks: TableScoreInput["tieBreaks"] = [],
): TableScoreInput => ({
  lowerWins: false,
  entries: players.map((player, index) => ({ userId: player.id, score: scores[index] })),
  tieBreaks,
});
function Fixture({
  onSubmit = () => {},
  ...props
}: Partial<ComponentProps<typeof TableScoreEditor>>) {
  return (
    <NativeTestProviders>
      <FormInteractionScope>
        <TableScoreEditor players={players} busy={false} {...props} onSubmit={onSubmit} />
      </FormInteractionScope>
    </NativeTestProviders>
  );
}
const press = async (name: string) => userEvent.setup().press(screen.getByRole("button", { name }));
const order = () =>
  screen.getAllByRole("button", { name: /^Score: / }).map((node) => node.props.accessibilityLabel);
async function openScore(id: string) {
  await userEvent.setup().press(screen.getByTestId(`table-score-open-${id}`));
  return screen.findByTestId(`table-score-input-${id}`);
}

it("ranks exact signed decimal scores, normalizes submissions and reverses standings only when requested", async () => {
  const submit = vi.fn();
  await render(<Fixture initial={initial([" 10,50 ", "20", "-5.00"])} onSubmit={submit} />);
  expect(order()).toEqual(["Score: Bob Player", "Score: Alice Player", "Score: Carol Player"]);
  await userEvent.setup().press(screen.getByRole("switch", { name: "Lowest score wins" }));
  expect(screen.getByRole("switch", { name: "Lowest score wins" })).toBeChecked();
  expect(order()).toEqual(["Score: Carol Player", "Score: Alice Player", "Score: Bob Player"]);
  await press("Save result");
  expect(submit).toHaveBeenCalledExactlyOnceWith({
    lowerWins: true,
    entries: [
      { userId: "alice", score: "10.5" },
      { userId: "bob", score: "20" },
      { userId: "carol", score: "-5" },
    ],
    tieBreaks: [],
  });
});

it("accepts an all-ND table explicitly without fabricating scores or ranks", async () => {
  const submit = vi.fn();
  await render(<Fixture initial={initial([null, null, null])} onSubmit={submit} />);
  expect(screen.getAllByText("ND")).toHaveLength(3);
  expect(screen.queryByRole("button", { name: /Position:/ })).toBeNull();
  await press("Save result");
  expect(submit).toHaveBeenCalledWith(initial([null, null, null]));
});

it("does not submit an empty roster and respects a parent's busy state for all entry controls", async () => {
  const submit = vi.fn();
  const view = await render(<Fixture players={[]} onSubmit={submit} />);
  expect(screen.getByRole("button", { name: "Save result" })).toBeDisabled();
  await press("Save result");
  await view.rerender(<Fixture busy initial={initial()} onSubmit={submit} />);
  expect(screen.getByRole("switch", { name: "Lowest score wins" })).toBeDisabled();
  for (const name of [
    "Score: Alice Player",
    "Score: Bob Player",
    "Score: Carol Player",
    "Save result",
  ]) {
    expect(screen.getByRole("button", { name })).toBeDisabled();
    await press(name);
  }
  expect(submit).not.toHaveBeenCalled();
});

it("opens the first invalid score on attempted submission and keeps the result blocked while the real editor is open", async () => {
  const submit = vi.fn();
  await render(<Fixture onSubmit={submit} />);
  expect(
    screen.getByText(
      "Enter a score for every frozen player or mark them as not participating. An all-ND table changes no ratings or statistics.",
    ),
  ).toBeVisible();
  await press("Save result");
  const input = await screen.findByTestId("table-score-input-alice");
  expect(input).toHaveDisplayValue("");
  // Gorhom opening is a native-runtime boundary; this verifies rendered validation state.
  expect(screen.getByText("Enter a valid score")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Save result" })).toBeDisabled();
  expect(submit).not.toHaveBeenCalled();
  await fireEvent.changeText(input, "invalid score");
  // Gorhom opening is a native-runtime boundary; this verifies rendered validation state.
  expect(screen.getByText("Enter a valid score")).toBeOnTheScreen();
  await fireEvent.changeText(input, "12,50");
  expect(screen.queryByText("Enter a valid score")).toBeNull();
  await press("Done");
  expect(screen.getByRole("button", { name: "Save result" })).toBeEnabled();
  expect(screen.getByText("12.5")).toBeVisible();
});

it("edits scores through actual bottom-sheet input controls and updates the real standings", async () => {
  const submit = vi.fn();
  await render(<Fixture initial={initial()} onSubmit={submit} />);
  const input = await openScore("alice");
  await fireEvent(input, "focus", { nativeEvent: { target: 1 } });
  await fireEvent.changeText(input, "30");
  await press("Done");
  expect(order()).toEqual(["Score: Alice Player", "Score: Bob Player", "Score: Carol Player"]);
  await press("Save result");
  expect(submit).toHaveBeenCalledWith({ ...initial(["30", "20", "5"]), tieBreaks: [] });
});

it("supports switching one player to ND and back without losing their entered score", async () => {
  const submit = vi.fn();
  await render(<Fixture initial={initial()} onSubmit={submit} />);
  const input = await openScore("alice");
  const nd = screen.getByRole("switch", { name: "Did not participate: Alice Player" });
  await userEvent.setup().press(nd);
  expect(nd).toBeChecked();
  expect(input).toHaveProp("editable", false);
  await userEvent.setup().press(nd);
  expect(nd).not.toBeChecked();
  expect(input).toHaveDisplayValue("10");
  await userEvent.setup().press(nd);
  await press("Done");
  expect(order()).toEqual(["Score: Bob Player", "Score: Carol Player", "Score: Alice Player"]);
  expect(screen.getByText("ND")).toBeVisible();
  await press("Save result");
  expect(submit).toHaveBeenCalledWith(initial([null, "20", "5"]));
});

it("previews tie-break movement, enforces each end boundary and requires explicit confirmation", async () => {
  const submit = vi.fn();
  await render(<Fixture initial={initial(["10", "10", "5"])} onSubmit={submit} />);
  expect(screen.getByText("Tied score: 10")).toBeVisible();
  await press("Resolve tie");
  expect(screen.getByRole("button", { name: "Save result" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Move up: Alice Player" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Move down: Bob Player" })).toBeDisabled();
  await press("Move down: Alice Player");
  expect(order()).toEqual(["Score: Bob Player", "Score: Alice Player", "Score: Carol Player"]);
  await press("Move down: Alice Player");
  expect(order()).toEqual(["Score: Bob Player", "Score: Alice Player", "Score: Carol Player"]);
  await press("Confirm tie-break");
  expect(screen.getByRole("button", { name: "Remove tie-break" })).toBeEnabled();
  await press("Save result");
  expect(submit).toHaveBeenCalledWith(
    initial(["10", "10", "5"], [{ score: "10", orderedUserIds: ["bob", "alice"] }]),
  );
});

it("cancels an unsaved tie-break and removes a previously confirmed tie-break explicitly", async () => {
  const submit = vi.fn();
  await render(
    <Fixture
      initial={initial(["10", "10", "5"], [{ score: "10", orderedUserIds: ["bob", "alice"] }])}
      onSubmit={submit}
    />,
  );
  expect(order()[0]).toBe("Score: Bob Player");
  await press("Resolve tie");
  await press("Move up: Alice Player");
  expect(order()[0]).toBe("Score: Alice Player");
  await press("Cancel tie-break");
  expect(order()[0]).toBe("Score: Bob Player");
  await press("Remove tie-break");
  expect(order()[0]).toBe("Score: Alice Player");
  expect(screen.queryByRole("button", { name: "Remove tie-break" })).toBeNull();
  await press("Save result");
  expect(submit).toHaveBeenCalledWith(initial(["10", "10", "5"]));
});

it("discards obsolete tie-breaks when an edited score no longer belongs to the tied group", async () => {
  const submit = vi.fn();
  await render(
    <Fixture
      initial={initial(["10", "10", "5"], [{ score: "10", orderedUserIds: ["bob", "alice"] }])}
      onSubmit={submit}
    />,
  );
  await press("Resolve tie");
  const input = await openScore("alice");
  await fireEvent.changeText(input, "30");
  await press("Done");
  expect(screen.queryByRole("button", { name: "Confirm tie-break" })).toBeNull();
  expect(screen.queryByText("Tied score: 10")).toBeNull();
  await press("Save result");
  expect(submit).toHaveBeenCalledWith(initial(["30", "10", "5"]));
});

it("keeps edited scores while rendering fresh names/usernames for the same immutable roster identities", async () => {
  const submit = vi.fn();
  const view = await render(<Fixture initial={initial()} onSubmit={submit} />);
  const input = await openScore("alice");
  await fireEvent.changeText(input, "31");
  await press("Done");
  await view.rerender(
    <Fixture
      players={players.map((player) =>
        player.id === "alice"
          ? { ...player, name: "Updated Alice", username: "updated-alice" }
          : player,
      )}
      initial={initial()}
      onSubmit={submit}
    />,
  );
  expect(screen.getByText("Updated Alice")).toBeVisible();
  expect(screen.getByText("updated-alice")).toBeVisible();
  expect(screen.queryByText("Alice Player")).toBeNull();
  await press("Save result");
  expect(submit).toHaveBeenCalledWith(initial(["31", "20", "5"]));
});

it("replaces an existing tie-break when confirming a new order for the same score", async () => {
  const submit = vi.fn();
  await render(
    <Fixture
      initial={initial(["10", "10", "5"], [{ score: "10", orderedUserIds: ["bob", "alice"] }])}
      onSubmit={submit}
    />,
  );
  await press("Resolve tie");
  await press("Move up: Alice Player");
  expect(order()[0]).toBe("Score: Alice Player");
  await press("Confirm tie-break");
  expect(order()[0]).toBe("Score: Alice Player");
  await press("Save result");
  expect(submit).toHaveBeenCalledExactlyOnceWith(
    initial(["10", "10", "5"], [{ score: "10", orderedUserIds: ["alice", "bob"] }]),
  );
});

it("closes the actual score sheet by its overlay without submitting and preserves its described draft", async () => {
  const submit = vi.fn();
  await render(<Fixture initial={initial()} onSubmit={submit} />);
  await fireEvent.changeText(await openScore("alice"), "14");
  expect(screen.getByRole("button", { name: "Save result" })).toBeDisabled();

  const overlays = screen.container.queryAll(
    (node) =>
      typeof node.props.onStartShouldSetResponder === "function" &&
      StyleSheet.flatten(node.props.style)?.position === "absolute",
  );
  expect(overlays).toHaveLength(1);
  await userEvent.setup().press(overlays[0]);
  expect(screen.queryByTestId("table-score-input-alice")).toBeNull();
  expect(screen.getByRole("button", { name: "Save result" })).toBeEnabled();
  expect(submit).not.toHaveBeenCalled();
  expect(await openScore("alice")).toHaveDisplayValue("14");
  await press("Done");
  await press("Save result");
  expect(submit).toHaveBeenCalledExactlyOnceWith(initial(["14", "20", "5"]));
});
