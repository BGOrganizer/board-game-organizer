import {
  type NotificationAttentionSnapshot,
  notificationItemId,
} from "@board-game-organizer/schemas";
import {
  emptyAttentionSummary,
  NotificationAttentionProvider,
  notificationAttentionQuery,
} from "@board-game-organizer/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
} from "@testing-library/react-native";
import { createRef, type ReactNode } from "react";
import { type NativeMethods, ScrollView, StyleSheet, Text } from "react-native";
import { afterEach, beforeEach, expect, it, type MockInstance, vi } from "vitest";
import { ScrollTargetContext } from "@/components/common/ui/ScrollTargetContext";
import { ListActivityContext } from "@/lib/listActivity";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { NotificationAttentionScope } from "../NotificationAttentionScope";
import { NotificationItem } from "../NotificationItem";

const ITEM = notificationItemId("11111111-1111-4111-8111-111111111111", "overview");
const io = vi.hoisted(() => ({ requested: undefined as string | undefined }));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ attention: io.requested }),
}));
type Success = Parameters<NativeMethods["measureLayout"]>[1];
let measurements: Success[];
let measure: MockInstance<NativeMethods["measureLayout"]>;
let client: QueryClient | undefined;
beforeEach(async () => {
  io.requested = ITEM;
  measurements = [];
  const native = await vi.importActual<{
    default: { prototype: Pick<NativeMethods, "measureLayout"> };
  }>("react-native/Libraries/Components/View/ViewNativeComponent");
  measure = vi
    .spyOn(native.default.prototype, "measureLayout")
    .mockImplementation((_relative, callback) => {
      measurements.push(callback);
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Layout must not issue reads or acknowledge notices");
    }),
  );
});
afterEach(async () => {
  await cleanup();
  await client?.cancelQueries();
  client?.clear();
  client = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const target = { kind: "item" as const, id: ITEM };
const options = {
  apiUrl: "https://notification-item-native.test",
  userId: "owner",
  getToken: async () => "fixture-token",
};
function attention(count: number): NotificationAttentionSnapshot {
  return {
    asOf: "2030-06-01T10:00:00.000Z",
    unreadCount: count,
    summary: emptyAttentionSummary(),
    targets: [
      {
        target,
        count,
        direct: count,
        events: 0,
        sections: { connections: 0, requests: 0, search: 0 },
      },
    ],
  };
}
async function fixture({
  active = { current: true },
  itemId = ITEM,
  withScroll = true,
  children = <Text>Target row</Text>,
  counted = false,
}: {
  active?: { current: boolean };
  itemId?: string;
  withScroll?: boolean;
  children?: ReactNode;
  counted?: boolean;
} = {}) {
  const scroll = createRef<ScrollView>();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  if (counted)
    client.setQueryData(notificationAttentionQuery(options, [target]).queryKey, attention(2));
  const body = (
    <ListActivityContext value={active}>
      <ScrollTargetContext value={withScroll ? scroll : null}>
        <ScrollView ref={scroll} testID="notification-source-scroll">
          <NotificationItem itemId={itemId}>{children}</NotificationItem>
        </ScrollView>
      </ScrollTargetContext>
    </ListActivityContext>
  );
  await render(
    <QueryClientProvider client={client}>
      {counted ? (
        <NotificationAttentionProvider options={options} targets={[target]}>
          {body}
        </NotificationAttentionProvider>
      ) : (
        body
      )}
    </QueryClientProvider>,
    { wrapper: NativeTestProviders },
  );
  if (!scroll.current) throw new Error("Expected actual RN ScrollView public handle");
  const scrollTo = vi.spyOn(scroll.current, "scrollTo").mockImplementation(() => {});
  return { active, scrollTo, scroll };
}
function layoutHost() {
  const node = screen.container.queryAll(
    (candidate) =>
      typeof candidate.props.onLayout === "function" &&
      StyleSheet.flatten(candidate.props.style)?.flexDirection === "row",
  )[0];
  if (!node) throw new Error("Expected actual NotificationItem native layout host");
  return node;
}
const layout = async () => fireEvent.layout(layoutHost(), { x: 0, y: 0, width: 320, height: 48 });
// Public native View.measureLayout and ScrollView.scrollTo boundaries supply Yoga
// geometry only. Actual React refs/context/Query remain real; no device-FPS proof.
it.each([
  [120, 104],
  [8, 0],
])(
  "reveals a requested native row at %s once, clamped to %s, without reading it",
  async (y, expected) => {
    const f = await fixture();
    await layout();
    expect(measurements).toHaveLength(1);
    expect(measure.mock.calls[0][0]).toBe(f.scroll.current?.getInnerViewNode());
    await act(() => measurements[0](0, y, 320, 48));
    expect(f.scrollTo).toHaveBeenCalledExactlyOnceWith({
      y: expected,
      animated: false,
    });
    await layout();
    expect(measurements).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("rejects a delayed native measurement after its retained panel becomes inactive", async () => {
  const f = await fixture();
  await layout();
  f.active.current = false;
  await act(() => measurements[0](0, 120, 320, 48));
  expect(f.scrollTo).not.toHaveBeenCalled();
  f.active.current = true;
  await layout();
  expect(measurements).toHaveLength(2);
  await act(() => measurements[1](0, 120, 320, 48));
  expect(f.scrollTo).toHaveBeenCalledExactlyOnceWith({
    y: 104,
    animated: false,
  });
});
it("does not measure hidden retained content, then reveals it after genuine reactivation", async () => {
  const active = { current: false };
  const f = await fixture({ active });
  await layout();
  expect(measure).not.toHaveBeenCalled();
  active.current = true;
  await layout();
  await act(() => measurements[0](0, 120, 320, 48));
  expect(f.scrollTo).toHaveBeenCalledOnce();
});
it.each(["different", undefined])(
  "does not scroll when route attention is %s instead of this row",
  async (requested) => {
    io.requested = requested;
    const f = await fixture();
    await layout();
    expect(measure).not.toHaveBeenCalled();
    expect(f.scrollTo).not.toHaveBeenCalled();
  },
);
it("keeps a row usable outside a scroll-target owner without attempting native measurement", async () => {
  await fixture({ withScroll: false });
  expect(screen.getByText("Target row")).toBeVisible();
  await layout();
  expect(measure).not.toHaveBeenCalled();
});
it("keeps marker-only requested destinations mounted without inventing an unread count", async () => {
  const f = await fixture({ children: null });
  expect(screen.queryByLabelText("Unread updates")).toBeNull();
  await layout();
  await act(() => measurements[0](0, 60, 320, 8));
  expect(f.scrollTo).toHaveBeenCalledExactlyOnceWith({
    y: 44,
    animated: false,
  });
});
it("renders no marker-only placeholder for an unrequested row without notices", async () => {
  io.requested = undefined;
  await fixture({ children: null });
  expect(
    screen.container.queryAll(
      (node) =>
        typeof node.props.onLayout === "function" &&
        StyleSheet.flatten(node.props.style)?.flexDirection === "row",
    ),
  ).toEqual([]);
  expect(measure).not.toHaveBeenCalled();
});
it("keeps actual authoritative attention reactive while native positioning never acknowledges it", async () => {
  await fixture({ counted: true });
  expect(screen.getByRole("image", { name: "Unread updates" })).toBeVisible();
  await layout();
  await act(() => measurements[0](0, 120, 320, 48));
  expect(
    client?.getQueryData(notificationAttentionQuery(options, [target]).queryKey),
  ).toMatchObject({ unreadCount: 2 });
  await act(() =>
    client?.setQueryData(notificationAttentionQuery(options, [target]).queryKey, attention(0)),
  );
  await waitFor(() => expect(screen.queryByRole("image", { name: "Unread updates" })).toBeNull());
  expect(screen.getByText("Target row")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
});
it("preserves children directly when no item identity is supplied", async () => {
  await render(
    <NotificationItem>
      <Text>Unscoped child</Text>
    </NotificationItem>,
  );
  expect(screen.getByText("Unscoped child")).toBeVisible();
  expect(screen.container.queryAll((node) => typeof node.props.onLayout === "function")).toEqual(
    [],
  );
  expect(measure).not.toHaveBeenCalled();
});

it("retries a visible attention read failure without acknowledging any notices", async () => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  let status = 503;
  const load = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    expect(url.origin).toBe(options.apiUrl);
    expect(url.pathname).toBe("/api/notifications/attention");
    expect(init?.method ?? "GET").toBe("GET");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-token");
    return Response.json(status === 200 ? attention(2) : { error: "Attention unavailable" }, {
      status,
    });
  });
  vi.stubGlobal("fetch", load);
  await render(
    <QueryClientProvider client={client}>
      <NotificationAttentionScope options={options} targets={[target]}>
        <Text>Source remains usable</Text>
      </NotificationAttentionScope>
    </QueryClientProvider>,
    { wrapper: NativeTestProviders },
  );
  expect(await screen.findByText("Could not load notifications")).toBeVisible();
  expect(screen.getByText("Source remains usable")).toBeVisible();
  expect(load).toHaveBeenCalledTimes(1);
  status = 200;
  await userEvent.setup().press(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.queryByText("Could not load notifications")).toBeNull());
  expect(screen.getByText("Source remains usable")).toBeVisible();
  expect(load).toHaveBeenCalledTimes(2);
});
