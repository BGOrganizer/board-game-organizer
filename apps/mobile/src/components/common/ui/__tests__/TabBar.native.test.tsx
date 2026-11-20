import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { Tabs } from "heroui-native/tabs";
import { CalendarDays, UsersRound } from "lucide-react-native";
import { useState } from "react";
import { processColor, StyleSheet } from "react-native";
import { ScopedTheme } from "uniwind";
import { afterEach, expect, it, vi } from "vitest";
import { ListActivityContext } from "@/lib/listActivity";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { TabBar } from "../TabBar";
import { TabTrigger } from "../TabTrigger";

function TabFixture({ active = { current: true } }: { active?: { current: boolean } }) {
  const [selected, setSelected] = useState("members");
  return (
    <ListActivityContext value={active}>
      <Tabs value={selected} onValueChange={setSelected}>
        <TabBar>
          <TabTrigger value="members" icon={UsersRound}>
            <Tabs.Label>Members</Tabs.Label>
          </TabTrigger>
          <TabTrigger value="events" icon={CalendarDays} style={() => ({ opacity: 1 })}>
            <Tabs.Label>Events</Tabs.Label>
          </TabTrigger>
        </TabBar>
      </Tabs>
    </ListActivityContext>
  );
}

function expectGlyphMatchesLabel(name: string) {
  const tab = screen.getByRole("tab", { name });
  const color = processColor(StyleSheet.flatten(screen.getByText(name).props.style).color);
  expect(typeof color).toBe("number");
  const glyph = tab.queryAll(
    (node) =>
      node.type.startsWith("RNSVG") &&
      Number(node.props.bbWidth) === 16 &&
      Number(node.props.bbHeight) === 16,
  )[0];
  if (!glyph) throw new Error("Expected the actual decorative Lucide tab glyph");
  const stroke = glyph.queryAll(
    (node) => node.type === "RNSVGGroup" && node.props.stroke != null,
  )[0]?.props.stroke;
  expect(stroke).toMatchObject({ type: 0, payload: color });
}

it.each(["light", "dark"] as const)(
  "matches selected and unselected tab glyphs to the actual HeroUI labels in %s mode",
  async (theme) => {
    await render(
      <NativeTestProviders>
        <ScopedTheme theme={theme}>
          <TabFixture />
        </ScopedTheme>
      </NativeTestProviders>,
    );
    expectGlyphMatchesLabel("Members");
    expectGlyphMatchesLabel("Events");
    await userEvent.setup().press(screen.getByRole("tab", { name: "Events" }));
    expect(screen.getByRole("tab", { name: "Events" })).toBeSelected();
    expectGlyphMatchesLabel("Members");
    expectGlyphMatchesLabel("Events");
  },
);

function measuredBar() {
  const node = screen.container.queryAll((candidate) => {
    const style = StyleSheet.flatten(candidate.props.style);
    return style?.alignSelf === "center" && style?.maxWidth === "100%";
  })[0];
  if (!node) throw new Error("Expected the actual measured HeroUI tab list");
  return node;
}

async function measure(available: number, contentWidth: number) {
  const outer = screen.container.queryAll((node) => {
    const style = StyleSheet.flatten(node.props.style);
    return style?.alignSelf === "stretch" && style?.maxWidth === "100%";
  })[0];
  if (!outer) throw new Error("Expected the app-owned available-width layout host");
  await fireEvent.layout(outer, { x: 0, y: 0, width: available, height: 48 });
  const scroll = screen.getByTestId("top-tab-scroll");
  const content = scroll.queryAll((node) => typeof node.props.onLayout === "function")[0];
  if (!content) throw new Error("Expected the actual ScrollView content measurement host");
  await fireEvent.layout(content, {
    x: 0,
    y: 0,
    width: contentWidth,
    height: 44,
  });
}

it.each([
  [320, 160, 166],
  [320, 400, 320],
  [1024, 400, 406],
  [390, 1100, 390],
])(
  "clamps the actual tab bar for available/content %s/%s to %s",
  async (available, content, width) => {
    await render(<TabFixture />, { wrapper: NativeTestProviders });
    await measure(available, content);
    expect(measuredBar()).toHaveStyle({
      width,
      alignSelf: "center",
      maxWidth: "100%",
    });
    expect(screen.getByTestId("top-tab-scroll")).toHaveProp("keyboardShouldPersistTaps", "handled");
    expect(screen.getByRole("tab", { name: "Members" })).toHaveStyle({
      minHeight: 44,
      flexShrink: 0,
    });
  },
);

it("keeps selection accessible through the real HeroUI trigger and ignores hidden-panel measurements", async () => {
  const active = { current: true };
  await render(<TabFixture active={active} />, {
    wrapper: NativeTestProviders,
  });
  await measure(390, 200);
  expect(measuredBar()).toHaveStyle({ width: 206 });
  const select = userEvent.setup();
  await select.press(screen.getByRole("tab", { name: "Events" }));
  expect(screen.getByRole("tab", { name: "Events" })).toBeSelected();
  expect(screen.getByRole("tab", { name: "Members" })).not.toBeSelected();
  active.current = false;
  await measure(320, 800);
  expect(measuredBar()).toHaveStyle({ width: 206 });
  active.current = true;
  await measure(320, 800);
  expect(measuredBar()).toHaveStyle({ width: 320 });
});

// Supply only public native Yoga events and observe the RN scroll command port;
// selection/measurements come from the installed HeroUI Tabs implementation.
afterEach(() => vi.restoreAllMocks());
async function nativeScrollCommands() {
  const sdk = await vi.importActual<{
    default: {
      scrollTo: (host: unknown, x: number, y: number, animated: boolean) => void;
    };
  }>("react-native/Libraries/Components/ScrollView/ScrollViewCommands");
  return vi.spyOn(sdk.default, "scrollTo").mockImplementation(() => {});
}
async function measureViewport() {
  await measure(320, 500);
  await fireEvent.layout(screen.getByTestId("top-tab-scroll"), {
    x: 0,
    y: 0,
    width: 200,
    height: 44,
  });
  await fireEvent.layout(screen.getByRole("tab", { name: "Members" }), {
    x: 0,
    y: 0,
    width: 100,
    height: 44,
  });
  await fireEvent.layout(screen.getByRole("tab", { name: "Events" }), {
    x: 220,
    y: 0,
    width: 120,
    height: 44,
  });
}
it("reveals each clipped selected tab through a nonanimated native command without re-centering a visible tab", async () => {
  const command = await nativeScrollCommands();
  await render(<TabFixture />, { wrapper: NativeTestProviders });
  await measureViewport();
  command.mockClear();
  await userEvent.setup().press(screen.getByRole("tab", { name: "Events" }));
  expect(command.mock.calls.map(([, x, y, animated]) => ({ x, y, animated }))).toEqual([
    { x: 140, y: 0, animated: false },
  ]);
  await fireEvent.layout(screen.getByRole("tab", { name: "Events" }), {
    x: 220,
    y: 0,
    width: 120,
    height: 44,
  });
  expect(command).toHaveBeenCalledOnce();
  await userEvent.setup().press(screen.getByRole("tab", { name: "Members" }));
  expect(command.mock.calls.map(([, x]) => x)).toEqual([140, 0]);
});
it("uses the user's native horizontal offset while rejecting a stale hidden-panel scroll and viewport", async () => {
  const command = await nativeScrollCommands();
  const active = { current: true };
  await render(<TabFixture active={active} />, {
    wrapper: NativeTestProviders,
  });
  await measureViewport();
  const scroll = screen.getByTestId("top-tab-scroll");
  const nativeScroll = (x: number) =>
    fireEvent.scroll(scroll, {
      nativeEvent: {
        contentOffset: { x, y: 0 },
        contentSize: { width: 500, height: 44 },
        layoutMeasurement: { width: 200, height: 44 },
        zoomScale: 1,
      },
    });
  await nativeScroll(180);
  command.mockClear();
  await userEvent.setup().press(screen.getByRole("tab", { name: "Events" }));
  expect(command).not.toHaveBeenCalled();
  active.current = false;
  await nativeScroll(0);
  await fireEvent.layout(scroll, { x: 0, y: 0, width: 500, height: 44 });
  active.current = true;
  await userEvent.setup().press(screen.getByRole("tab", { name: "Members" }));
  expect(command.mock.calls.map(([, x, y, animated]) => ({ x, y, animated }))).toEqual([
    { x: 0, y: 0, animated: false },
  ]);
});
