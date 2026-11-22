import type { OptionVoteVoters as Voters } from "@board-game-organizer/schemas";
import {
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { EventVoteButtons } from "../EventVoteButtons";
import { OptionVoteVoters } from "../OptionVoteVoters";

const voters: Voters = {
  YES: [
    {
      userId: "player-alba",
      name: "Alba Rossi",
      username: "albar",
      avatarUrl: "https://example.test/alba.png",
    },
  ],
  IF_NEEDED: [{ userId: "player-bosco", name: null, username: "bosco", avatarUrl: null }],
  NO: [],
};

const hidden = { includeHiddenElements: true };

afterEach(() => vi.restoreAllMocks());

it("opens the named votes sheet from the preference dialog without casting a vote", async () => {
  const choose = vi.fn();
  const user = userEvent.setup();
  await render(
    <NativeTestProviders>
      <EventVoteButtons label="Azul" busy={false} value="YES" voters={voters} onChange={choose} />
    </NativeTestProviders>,
  );
  await user.press(screen.getByRole("button", { name: "Azul: Yes" }));
  const dialog = within(await screen.findByTestId("confirmation-dialog"));
  expect(dialog.getByRole("button", { name: "Yes" })).toBeSelected();
  expect(dialog.getByRole("button", { name: "If needed" })).toBeEnabled();
  expect(dialog.getByRole("button", { name: "No" })).toBeEnabled();
  await user.press(dialog.getByRole("button", { name: "Show votes" }));
  await waitFor(() => expect(screen.queryByTestId("confirmation-dialog", hidden)).toBeNull());

  // Gorhom still owns this sheet. The native layout boundary in Node leaves
  // the snap point offscreen, so check content and callbacks including hidden nodes.
  expect(await screen.findByText("Votes", hidden)).toBeOnTheScreen();
  for (const heading of ["Yes", "If needed", "No"])
    expect(screen.getByRole("tab", { name: heading, ...hidden })).toBeOnTheScreen();
  expect(screen.queryByText("Alba Rossi", hidden)).toBeNull();
  expect(screen.getByText("@albar", hidden)).toBeOnTheScreen();
  expect(screen.queryByText("@bosco", hidden)).toBeNull();
  await fireEvent.press(screen.getByRole("tab", { name: "If needed", ...hidden }));
  expect(screen.getByText("@bosco", hidden)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("tab", { name: "No", ...hidden }));
  expect(screen.getByText("No votes", hidden)).toBeOnTheScreen();
  expect(choose).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole("button", { name: "Close", ...hidden }));
  await waitFor(() => expect(screen.queryByText("Votes", hidden)).toBeNull());
  expect(screen.getByRole("button", { name: "Azul: Yes" })).toBeEnabled();
  expect(choose).not.toHaveBeenCalled();
});

it("lets a read-only manager see named votes directly without offering ballot actions", async () => {
  const choose = vi.fn();
  await render(
    <NativeTestProviders>
      <EventVoteButtons label="Azul" busy={false} voters={voters} readOnly onChange={choose} />
    </NativeTestProviders>,
  );
  await userEvent.setup().press(screen.getByRole("button", { name: "Azul: Show votes" }));
  expect(await screen.findByText("@albar", hidden)).toBeOnTheScreen();
  expect(screen.queryByTestId("confirmation-dialog", hidden)).toBeNull();
  expect(screen.queryByRole("button", { name: "No", ...hidden })).toBeNull();
  expect(choose).not.toHaveBeenCalled();
});

it("keeps the join choices inline even if totals exist and respects protected votes", async () => {
  const choose = vi.fn();
  await render(
    <NativeTestProviders>
      <EventVoteButtons
        label="Azul"
        busy={false}
        value="YES"
        voters={voters}
        inline
        disabledVotes={["NO"]}
        onChange={choose}
      />
    </NativeTestProviders>,
  );
  expect(screen.getByRole("button", { name: "Azul: Yes" })).toBeSelected();
  expect(screen.getByRole("button", { name: "Azul: No" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: /Show votes/ })).toBeNull();
  await userEvent.setup().press(screen.getByRole("button", { name: "Azul: If needed" }));
  expect(choose).toHaveBeenCalledExactlyOnceWith("IF_NEEDED");
  expect(screen.queryByTestId("confirmation-dialog", hidden)).toBeNull();
});

it("keeps the standalone choice editable without exposing missing named vote data", async () => {
  const choose = vi.fn();
  const user = userEvent.setup();
  await render(
    <NativeTestProviders>
      <EventVoteButtons label="Azul" busy={false} onChange={choose} />
    </NativeTestProviders>,
  );
  await user.press(screen.getByRole("button", { name: "Azul: Choose your vote" }));
  const dialog = within(await screen.findByTestId("confirmation-dialog"));
  expect(dialog.queryByRole("button", { name: "Show votes", ...hidden })).toBeNull();
  await user.press(dialog.getByRole("button", { name: "No" }));
  expect(choose).toHaveBeenCalledExactlyOnceWith("NO");
});

it("shows overlapping decorative avatars and opens the corresponding read-only vote tab", async () => {
  const renderSummary = (data: Voters) => (
    <NativeTestProviders>
      <OptionVoteVoters label="Azul" voters={data} />
    </NativeTestProviders>
  );
  const view = await render(
    renderSummary({
      ...voters,
      YES: [
        ...voters.YES,
        { userId: "verdi", name: "Bruno Verdi", username: null, avatarUrl: null },
      ],
    }),
  );
  const compact = screen.getByLabelText("Votes: Azul");
  const summary = within(compact);
  expect(summary.getAllByRole("button")).toHaveLength(2);
  const separators = compact.queryAll(
    (node) =>
      node.type === "RCTView" &&
      node.props.accessibilityElementsHidden &&
      StyleSheet.flatten(node.props.style)?.width === 3,
  );
  expect(separators).toHaveLength(1);
  expect(separators[0]).toHaveProp("pointerEvents", "none");
  expect(summary.queryByRole("button", { name: /Show votes — No/ })).toBeNull();
  expect(summary.queryByRole("button", { name: /Alba Rossi/ })).toBeNull();
  const compactAvatars = compact.queryAll(
    (node) => node.type === "RCTView" && StyleSheet.flatten(node.props.style)?.marginStart === -5,
  );
  expect(compactAvatars).toHaveLength(3);
  for (const avatar of compactAvatars) {
    expect(StyleSheet.flatten(avatar.props.style)).toMatchObject({ width: 20, height: 20 });
    expect(avatar.parent?.props.pointerEvents).toBe("none");
  }
  const trigger = summary.getByRole("button", { name: "Azul: Show votes — If needed" });
  expect(StyleSheet.flatten(trigger.props.style)).toMatchObject({
    width: 28,
    height: 28,
    paddingHorizontal: 0,
    justifyContent: "center",
  });
  await fireEvent.press(trigger);
  expect(await screen.findByRole("tab", { name: "If needed", ...hidden })).toBeSelected();
  expect(screen.getByText("@bosco", hidden)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("tab", { name: "No", ...hidden }));
  expect(screen.getByText("No votes", hidden)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Close", ...hidden }));
  await waitFor(() => expect(screen.queryByText("No votes", hidden)).toBeNull());
  await fireEvent.press(summary.getByRole("button", { name: "Azul: Show votes — Yes" }));
  expect(await screen.findByRole("tab", { name: "Yes", ...hidden })).toBeSelected();
  expect(screen.getByText("@albar", hidden)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Close", ...hidden }));
  await waitFor(() => expect(screen.queryByText("@albar", hidden)).toBeNull());
  await view.rerender(renderSummary({ YES: [], IF_NEEDED: [], NO: [] }));
  expect(screen.queryByLabelText("Votes: Azul")).toBeNull();
  expect(screen.queryByText("@albar", hidden)).toBeNull();
});
