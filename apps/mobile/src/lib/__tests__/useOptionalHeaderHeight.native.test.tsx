import { render, screen } from "@testing-library/react-native";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { Text, View } from "react-native";
import { expect, it } from "vitest";
import { useOptionalHeaderHeight } from "../useOptionalHeaderHeight";

function Probe({ label = "Height" }: { label?: string }) {
  return <Text>{`${label}: ${useOptionalHeaderHeight()}`}</Text>;
}

// Actual React and the installed navigation context; this is a header-context
// unit, not proof of native navigator measurement or portal placement.
it.each([undefined, 0, 64, 103.5])(
  "preserves the optional actual header context height %s",
  async (height) => {
    await render(
      <HeaderHeightContext.Provider value={height}>
        <Probe />
      </HeaderHeightContext.Provider>,
    );
    expect(screen.getByText(`Height: ${height ?? 0}`)).toBeOnTheScreen();
  },
);

it("remains safe without a navigator header provider", async () => {
  await render(<Probe />);
  expect(screen.getByText("Height: 0")).toBeOnTheScreen();
});

it("reacts to current header dimensions and removal without retaining the previous screen's offset", async () => {
  const view = await render(
    <HeaderHeightContext.Provider value={64}>
      <Probe />
    </HeaderHeightContext.Provider>,
  );
  expect(screen.getByText("Height: 64")).toBeOnTheScreen();
  await view.rerender(
    <HeaderHeightContext.Provider value={103.5}>
      <Probe />
    </HeaderHeightContext.Provider>,
  );
  expect(screen.getByText("Height: 103.5")).toBeOnTheScreen();
  await view.rerender(
    <HeaderHeightContext.Provider value={undefined}>
      <Probe />
    </HeaderHeightContext.Provider>,
  );
  expect(screen.getByText("Height: 0")).toBeOnTheScreen();
});

it("keeps sibling screen and nested headerless owners isolated in the same actual React tree", async () => {
  await render(
    <HeaderHeightContext.Provider value={64}>
      <View>
        <Probe label="Screen" />
        <HeaderHeightContext.Provider value={undefined}>
          <Probe label="Headerless" />
        </HeaderHeightContext.Provider>
        <HeaderHeightContext.Provider value={80}>
          <Probe label="Nested" />
        </HeaderHeightContext.Provider>
      </View>
    </HeaderHeightContext.Provider>,
  );
  expect(screen.getByText("Screen: 64")).toBeOnTheScreen();
  expect(screen.getByText("Headerless: 0")).toBeOnTheScreen();
  expect(screen.getByText("Nested: 80")).toBeOnTheScreen();
});
