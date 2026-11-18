import type { ScorePlayer, TableScoreInput } from "@board-game-organizer/shared";
import { cleanup, fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { Platform } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import { FormInteractionScope } from "@/components/common/ui/FormInteractionScope";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { TableScoreEditor } from "../TableScoreEditor";

const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, "OS");
const players: ScorePlayer[] = [
  { id: "alice", name: "Alice Player", username: "alice", email: null, avatarUrl: null },
  { id: "bob", name: "Bob Player", username: "bob", email: null, avatarUrl: null },
];
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
  if (platformDescriptor) Object.defineProperty(Platform, "OS", platformDescriptor);
});

// Installed HeroUI/Gorhom/Input/useInputFocus execute normally. Native focus
// notifications verify actual input state, not physical IME/worklet movement.
it.each(["android", "ios"] as const)(
  "keeps the real %s signed-decimal input and focus/blur lifecycle without losing a reopened draft",
  async (os) => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: os });
    const submit = vi.fn<(value: TableScoreInput) => void>();
    await render(
      <NativeTestProviders>
        <FormInteractionScope>
          <TableScoreEditor
            players={players}
            initial={{
              lowerWins: false,
              entries: [
                { userId: "alice", score: "-12.50" },
                { userId: "bob", score: "4" },
              ],
              tieBreaks: [],
            }}
            busy={false}
            onSubmit={submit}
          />
        </FormInteractionScope>
      </NativeTestProviders>,
    );
    const user = userEvent.setup();
    await user.press(screen.getByTestId("table-score-open-alice"));
    let input = await screen.findByTestId("table-score-input-alice");
    expect(input).toHaveProp("accessibilityLabel", "Score: Alice Player");
    expect(input).toHaveProp("placeholder", "Enter a score");
    expect(input).toHaveProp(
      "keyboardType",
      os === "android" ? "numeric" : "numbers-and-punctuation",
    );
    expect(input).toHaveProp("editable", true);
    expect(input).toHaveDisplayValue("-12.50");
    await fireEvent(input, "focus", { nativeEvent: { target: 17 } });
    expect(input).toHaveDisplayValue("-12.50");
    await fireEvent(input, "blur", { nativeEvent: { target: 17 } });
    expect(input).toHaveDisplayValue("-12.50");
    expect(submit).not.toHaveBeenCalled();
    await fireEvent.changeText(input, "-0.25");
    await user.press(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Save result" })).toBeEnabled();
    expect(submit).not.toHaveBeenCalled();
    await user.press(screen.getByTestId("table-score-open-alice"));
    input = await screen.findByTestId("table-score-input-alice");
    expect(input).toHaveDisplayValue("-0.25");
    const nd = screen.getByRole("switch", { name: "Did not participate: Alice Player" });
    await user.press(nd);
    expect(nd).toBeChecked();
    expect(input).toHaveProp("editable", false);
    await user.press(nd);
    expect(nd).not.toBeChecked();
    expect(input).toHaveProp("editable", true);
    expect(input).toHaveDisplayValue("-0.25");
    await user.press(screen.getByRole("button", { name: "Done" }));
    expect(submit).not.toHaveBeenCalled();
    await user.press(screen.getByRole("button", { name: "Save result" }));
    expect(submit).toHaveBeenCalledExactlyOnceWith({
      lowerWins: false,
      entries: [
        { userId: "alice", score: "-0.25" },
        { userId: "bob", score: "4" },
      ],
      tieBreaks: [],
    });
  },
);
