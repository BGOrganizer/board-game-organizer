import type { GameVoteVoters as Voters } from "@board-game-organizer/schemas";
import {
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { EventVoteButtons } from "../EventVoteButtons";
import { GameVoteVoters } from "../GameVoteVoters";

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
    expect(screen.getByRole("header", { name: heading, ...hidden })).toBeOnTheScreen();
  expect(screen.getByText("Alba Rossi", hidden)).toBeOnTheScreen();
  expect(screen.getByText("@albar", hidden)).toBeOnTheScreen();
  expect(screen.getByText("@bosco", hidden)).toBeOnTheScreen();
  expect(screen.getAllByText("No votes", hidden)).toHaveLength(1);
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

it("uses compact avatars and leaves out zero-vote groups and empty summaries", async () => {
  const renderSummary = (data: Voters) => (
    <NativeTestProviders>
      <GameVoteVoters label="Azul" voters={data} compact />
    </NativeTestProviders>
  );
  const view = await render(renderSummary(voters));
  const summary = screen.getByLabelText("Votes: Azul");
  const yes = within(summary).getByLabelText("Yes: Alba Rossi");
  expect(within(summary).getByLabelText("If needed: @bosco")).toBeVisible();
  expect(within(summary).queryByLabelText(/^No:/)).toBeNull();
  const icons = yes.queryAll(
    (node) => node.type.startsWith("RNSVG") && Number(node.props.bbWidth) === 12,
  );
  expect(icons.length).toBeGreaterThan(0);
  expect(within(yes).getByLabelText("Alba Rossi", hidden)).toBeOnTheScreen();
  const compactAvatars = yes.queryAll((node) => {
    const { width, height } = StyleSheet.flatten(node.props.style) ?? {};
    return node.type === "RCTView" && width === 12 && height === 12;
  });
  expect(compactAvatars).toHaveLength(1);
  expect(within(summary).queryByText(/^\d+$/)).toBeNull();
  await view.rerender(renderSummary({ YES: [], IF_NEEDED: [], NO: [] }));
  expect(screen.queryByLabelText("Votes: Azul")).toBeNull();
});
