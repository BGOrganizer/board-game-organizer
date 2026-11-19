import type { NotificationChangeRow } from "@board-game-organizer/schemas";
import type { useNotificationChanges } from "@board-game-organizer/shared";
import { act, fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { useThemeColor } from "heroui-native/hooks";
import { DeviceEventEmitter, processColor, StyleSheet, View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RetainedTabPanel } from "@/components/common/ui/RetainedTabPanel";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { scrollNativeListToEnd } from "@/test/nativeListGeometry";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { NotificationChangesPopover } from "../NotificationChangesPopover";

type Model = ReturnType<typeof useNotificationChanges>;
function change(index = 1, requiresResponse = false): NotificationChangeRow {
  const reference = {
    notificationId: String(index).padStart(24, "0"),
    effectiveAt: "2030-06-01T10:00:00.000Z",
  };
  return {
    ...reference,
    messageCode: "event_confirmed",
    title: `Confirmed event ${index}`,
    description: "L’evento è pronto nella città scelta.",
    requiresResponse,
    readReference: reference,
  };
}
function model(patch: Partial<Model> = {}): Model {
  return {
    changes: [change()],
    tabCounts: { details: 0, members: 0, tables: 0, participants: 0 },
    hasNextPage: false,
    fetchNextPage: vi.fn(async () => undefined),
    isFetchNextPageError: false,
    isFetchingNextPage: false,
    isPending: false,
    isError: false,
    refetch: vi.fn<Model["refetch"]>(),
    markDisplayedAsRead: vi.fn(),
    markAllAsRead: vi.fn(async () => undefined),
    resetWindow: vi.fn(),
    isReading: false,
    readError: null,
    ...patch,
  };
}
function SemanticProbe() {
  const [warning, danger] = useThemeColor(["warning-soft-foreground", "danger-soft-foreground"]);
  return (
    <View
      testID="changes-semantic-colors"
      style={{ borderTopColor: warning, borderBottomColor: danger }}
    />
  );
}
function Fixture({ state, active = true }: { state: Model; active?: boolean }) {
  return (
    <NativeTestProviders>
      <SemanticProbe />
      <RetainedTabPanel active={active}>
        <NotificationChangesPopover model={state} />
      </RetainedTabPanel>
    </NativeTestProviders>
  );
}
beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());
const open = async () => pressMeasuredPopover(screen.getByRole("button", { name: "New changes" }));
async function measureContent(height: number) {
  const list = screen.getByTestId("notification-changes-list");
  const content = list.queryAll((node) => typeof node.props.onLayout === "function")[0];
  if (!content) throw new Error("Expected the actual native changes-list content host");
  await fireEvent.layout(content, { x: 0, y: 0, width: 260, height });
  return list;
}

it("shows exact current change text and only marks changes read through the explicit action", async () => {
  const state = model();
  await render(<Fixture state={state} />);
  expect(screen.getByLabelText("Unread updates")).toBeOnTheScreen();
  expect(screen.queryByTestId("notification-changes-list")).toBeNull();
  await open();
  expect(screen.getByText("Confirmed event 1")).toBeVisible();
  expect(screen.getByText("L’evento è pronto nella città scelta.")).toBeVisible();
  expect(state.resetWindow).toHaveBeenCalledOnce();
  expect(state.markAllAsRead).not.toHaveBeenCalled();
  expect(state.markDisplayedAsRead).not.toHaveBeenCalled();
  await userEvent.setup().press(screen.getByRole("button", { name: "Mark all changes as read" }));
  expect(state.markAllAsRead).toHaveBeenCalledOnce();
  expect(state.markDisplayedAsRead).not.toHaveBeenCalled();
});

it("uses content-sized scrolling only when the real measured content exceeds the available viewport", async () => {
  await render(<Fixture state={model()} />);
  await open();
  const list = await measureContent(60);
  expect(list.props.scrollEnabled).toBe(false);
  expect(list.props.showsVerticalScrollIndicator).toBe(false);
  const available = StyleSheet.flatten(list.props.style).maxHeight;
  expect(typeof available).toBe("number");
  await measureContent(Number(available) + 100);
  expect(screen.getByTestId("notification-changes-list").props.scrollEnabled).toBe(true);
  expect(screen.getByTestId("notification-changes-list").props.showsVerticalScrollIndicator).toBe(
    true,
  );
  const heading = screen.getByText("New changes").parent;
  if (!heading || typeof heading.props.onLayout !== "function")
    throw new Error("Expected the actual changes header layout host");
  await fireEvent.layout(heading, { x: 0, y: 0, width: 260, height: 80 });
  expect(
    StyleSheet.flatten(screen.getByTestId("notification-changes-list").props.style).maxHeight,
  ).toBe(Number(available) - 36);
  await measureContent(60);
  expect(screen.getByTestId("notification-changes-list").props.scrollEnabled).toBe(false);
});

it.each([
  { isPending: true },
  { isFetchingNextPage: true },
  { isFetchNextPageError: true },
  { isError: true },
])("does not issue automatic paging while a read is unavailable (%j)", async (guard) => {
  const state = model({ hasNextPage: true, ...guard });
  await render(<Fixture state={state} />);
  await open();
  expect(state.fetchNextPage).not.toHaveBeenCalled();
});

it("loads another page for a short active popover and rejects a stale native scroll after its panel hides", async () => {
  const state = model({ hasNextPage: true });
  const view = await render(<Fixture state={state} />);
  await open();
  expect(state.fetchNextPage).toHaveBeenCalledOnce();
  const list = screen.getByTestId("notification-changes-list");
  await fireEvent.layout(list, { x: 0, y: 0, width: 260, height: 300 });
  await measureContent(2000);
  const lateScroll = list.props.onScroll;
  await view.rerender(<Fixture state={state} active={false} />);
  vi.mocked(state.fetchNextPage).mockClear();
  await act(() =>
    lateScroll({
      timeStamp: 1000,
      nativeEvent: {
        contentOffset: { x: 0, y: 1700 },
        contentSize: { width: 260, height: 2000 },
        layoutMeasurement: { width: 260, height: 300 },
        zoomScale: 1,
      },
    }),
  );
  expect(state.fetchNextPage).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "New changes" })).toBeNull();
});

it.each([
  { patch: { isReading: true }, invitation: false },
  { patch: { isPending: true }, invitation: false },
  { patch: {}, invitation: true },
])(
  "keeps pending or protected changes from enabling read-all (%j)",
  async ({ patch, invitation }) => {
    const state = model({ changes: [change(1, invitation)], ...patch });
    await render(<Fixture state={state} />);
    await open();
    const read = screen.getByRole("button", {
      name: "Mark all changes as read",
    });
    expect(read).toBeDisabled();
    await userEvent.setup().press(read);
    expect(state.markAllAsRead).not.toHaveBeenCalled();
    if (invitation)
      expect(screen.getByText("Invitations remain unread until you respond.")).toBeVisible();
  },
);

it("can enable explicit read-all for information on a later page without treating visible invitations as decisions", async () => {
  const state = model({ changes: [change(1, true)], hasNextPage: true });
  await render(<Fixture state={state} />);
  await open();
  const read = screen.getByRole("button", { name: "Mark all changes as read" });
  expect(read).toBeEnabled();
  await userEvent.setup().press(read);
  expect(state.markAllAsRead).toHaveBeenCalledOnce();
});

it.each([
  {
    patch: { readError: new Error("Fixture read failure") },
    expected: "Could not mark changes as read. Try again.",
    action: "read",
  },
  {
    patch: { isError: true, isFetchNextPageError: true },
    expected: "Could not load changes. Try again.",
    action: "page",
  },
  {
    patch: { isError: true },
    expected: "Could not load changes. Try again.",
    action: "refetch",
  },
] as const)(
  "retries the failed operation through its own action ($action)",
  async ({ patch, expected, action }) => {
    const state = model(patch);
    await render(<Fixture state={state} />);
    await open();
    expect(screen.getByText(expected)).toBeVisible();
    await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
    expect(state.markAllAsRead).toHaveBeenCalledTimes(action === "read" ? 1 : 0);
    expect(state.fetchNextPage).toHaveBeenCalledTimes(action === "page" ? 1 : 0);
    expect(state.refetch).toHaveBeenCalledTimes(action === "refetch" ? 1 : 0);
  },
);

it("distinguishes an empty popup from pending/error data and retains off-page tab attention", async () => {
  const state = model({
    changes: [],
    tabCounts: { details: 2, members: 0, tables: 0, participants: 0 },
  });
  const view = await render(<Fixture state={state} />);
  expect(screen.getByLabelText("Unread updates")).toBeOnTheScreen();
  await open();
  expect(screen.getByText("No new changes")).toBeVisible();
  expect(screen.getByRole("button", { name: "Mark all changes as read" })).toBeDisabled();
  await view.rerender(<Fixture state={model({ changes: [], isPending: true })} />);
  expect(screen.queryByText("No new changes")).toBeNull();
  await view.rerender(<Fixture state={model({ changes: [], isError: true })} />);
  expect(screen.queryByText("No new changes")).toBeNull();
  expect(screen.getByText("Could not load changes. Try again.")).toBeVisible();
});

it("keeps the real warning bell/dot inside its target and the matching danger-soft read action explicit across closing", async () => {
  const state = model();
  await render(<Fixture state={state} />);
  const trigger = screen.getByRole("button", { name: "New changes" });
  expect(trigger).toHaveStyle({ minWidth: 44, minHeight: 44 });
  const dot = screen.getByRole("image", { name: "Unread updates" });
  expect(dot.parent).toHaveStyle({ position: "absolute", top: 0, right: 0 });
  function stroke(root: typeof trigger, size: number) {
    const glyphs = root.queryAll(
      (node) =>
        node.type.startsWith("RNSVG") &&
        Number(node.props.bbWidth) === size &&
        Number(node.props.bbHeight) === size,
    );
    expect(glyphs).toHaveLength(1);
    const group = glyphs[0].queryAll(
      (node) => node.type === "RNSVGGroup" && node.props.stroke != null,
    )[0];
    if (!group) throw new Error("Expected actual Lucide native brush");
    expect(group.props.stroke.type).toBe(0);
    expect(typeof group.props.stroke.payload).toBe("number");
    expect((group.props.stroke.payload >>> 24) & 255).toBe(255);
    return group.props.stroke.payload;
  }
  const tokens = StyleSheet.flatten(screen.getByTestId("changes-semantic-colors").props.style);
  expect(tokens.borderTopColor).toBeDefined();
  expect(tokens.borderBottomColor).toBeDefined();
  expect(stroke(trigger, 16)).toBe(processColor(tokens.borderTopColor));
  expect(screen.queryByTestId("notification-changes-list")).toBeNull();
  await open();
  const read = screen.getByRole("button", { name: "Mark all changes as read" });
  expect(read).toHaveStyle({ minWidth: 44, minHeight: 44 });
  expect(stroke(read, 20)).toBe(processColor(tokens.borderBottomColor));
  expect(state.markAllAsRead).not.toHaveBeenCalled();
  expect(state.markDisplayedAsRead).not.toHaveBeenCalled();
  await userEvent.setup().press(read);
  expect(state.markAllAsRead).toHaveBeenCalledOnce();
  await act(() => DeviceEventEmitter.emit("hardwareBackPress"));
  expect(state.resetWindow).toHaveBeenCalledTimes(2);
  expect(screen.queryByTestId("notification-changes-list")).toBeNull();
  expect(state.markAllAsRead).toHaveBeenCalledOnce();
  expect(state.markDisplayedAsRead).not.toHaveBeenCalled();
});

it("gates actual native end gestures during paging failures or in-flight reads and resumes only the current authorized source", async () => {
  const state = model({ hasNextPage: true, isFetchingNextPage: true });
  const view = await render(<Fixture state={state} />);
  await open();
  const list = await measureContent(2000);
  for (const guard of [
    { isFetchingNextPage: true },
    { isFetchNextPageError: true },
    { isError: true },
    { hasNextPage: false },
  ]) {
    await view.rerender(<Fixture state={{ ...state, isFetchingNextPage: false, ...guard }} />);
    await scrollNativeListToEnd(list, 2000);
    expect(state.fetchNextPage).not.toHaveBeenCalled();
    expect(state.markAllAsRead).not.toHaveBeenCalled();
    expect(state.markDisplayedAsRead).not.toHaveBeenCalled();
  }
  await view.rerender(<Fixture state={{ ...state, isFetchingNextPage: false }} />);
  await scrollNativeListToEnd(list, 2000);
  expect(state.fetchNextPage).toHaveBeenCalled();
  expect(state.markAllAsRead).not.toHaveBeenCalled();
  expect(state.markDisplayedAsRead).not.toHaveBeenCalled();
});
