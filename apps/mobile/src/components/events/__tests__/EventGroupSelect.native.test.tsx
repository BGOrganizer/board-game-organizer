import { createRequire } from "node:module";
import { URL } from "node:url";
import type { CommunityPageResponse, GroupRecordResponse } from "@board-game-organizer/schemas";
import { groupRecordsPageQuery } from "@board-game-organizer/shared";
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
import type { ComponentProps } from "react";
import { useState } from "react";
import { DeviceEventEmitter, Dimensions, Keyboard, Platform, StyleSheet } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { scrollNativeListToEnd } from "@/test/nativeListGeometry";
import { installNativePopoverMeasurements } from "@/test/nativePopoverGeometry";
import { positionMeasuredSelect } from "@/test/nativeSelectGeometry";
import { groupRecord } from "../../../../../web/src/test-fixtures/eventRecords";
import { EventGroupSelect } from "../EventGroupSelect";

const boundary = vi.hoisted(() => ({
  getToken: vi.fn(async () => "group-selection-token"),
  change: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "group-selection-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: { extra: { apiUrl: "https://group-selection-native.test" } },
  },
}));
vi.mock("expo-router", () => ({
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
}));
const options = {
  apiUrl: "https://group-selection-native.test",
  userId: "owner",
  enabled: true,
  getToken: boundary.getToken,
};
const publicGroup: GroupRecordResponse = {
  ...groupRecord,
  id: "44444444-4444-4444-8444-444444444444",
  type: "PUBLIC",
  name: "Moon public club",
  approved: { name: "Moon public club" },
};
const inaccessible: GroupRecordResponse = {
  ...groupRecord,
  id: "55555555-5555-4555-8555-555555555555",
  name: "Unmanaged group",
  role: "accepted",
  canInvite: false,
  canEdit: false,
};
let client: QueryClient;
let page: CommunityPageResponse<GroupRecordResponse>;
let nextPage: CommunityPageResponse<GroupRecordResponse>;
let code: number, nextCode: number;
let pending: Promise<Response> | undefined;
const reads: { url: URL; authorization: string | null }[] = [];
beforeEach(async () => {
  vi.clearAllMocks();
  page = { items: [groupRecord, publicGroup, inaccessible], nextCursor: null };
  nextPage = { items: [publicGroup], nextCursor: null };
  code = nextCode = 200;
  pending = undefined;
  reads.length = 0;
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  await installNativePopoverMeasurements();
  vi.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (
        url.origin !== options.apiUrl ||
        url.pathname !== "/api/groups" ||
        (init?.method ?? "GET") !== "GET"
      )
        throw new Error(`Unexpected group-select I/O: ${init?.method ?? "GET"} ${url.href}`);
      reads.push({
        url,
        authorization: new Headers(init?.headers).get("authorization"),
      });
      const more = url.searchParams.has("cursor");
      const status = more ? nextCode : code;
      return (
        pending ??
        Response.json(
          status === 200
            ? url.searchParams.has("query")
              ? { items: [publicGroup], nextCursor: null }
              : more
                ? nextPage
                : page
            : { error: "Groups unavailable" },
          { status },
        )
      );
    }),
  );
});
afterEach(() => {
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture({
  group,
  groupId = null,
  ...props
}: Partial<ComponentProps<typeof EventGroupSelect>>) {
  const [selected, setSelected] = useState(groupId);
  const selectedGroup = [group, groupRecord, publicGroup].find((row) => row?.id === selected);
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        <EventGroupSelect
          groupId={selected}
          group={selectedGroup}
          locked={false}
          busy={false}
          {...props}
          onChange={(id, type) => {
            boundary.change(id, type);
            setSelected(id);
          }}
        />
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
function seed(items = page) {
  client.setQueryData(groupRecordsPageQuery(options, "mine", "", ["admin"]).queryKey, {
    pages: [items],
    pageParams: [""],
  });
}
// Real Select state/measurement only: the Node animation preset cannot prove native animated tappability.
async function open() {
  await positionMeasuredSelect(screen.getByRole("combobox", { name: "Group" }));
}
async function select(name: string) {
  // A recorded HTTP read precedes the Query observer's committed option rows.
  const option = await screen.findByRole("option", {
    name: new RegExp(name),
    includeHiddenElements: true,
  });
  await fireEvent.press(option);
}

it("selects only manageable groups and returns their canonical id/type, with an explicit standalone option", async () => {
  seed();
  await render(<Fixture />);
  await open();
  expect(Keyboard.dismiss).toHaveBeenCalled();
  expect(
    screen.queryByRole("option", {
      name: /Unmanaged group/,
      includeHiddenElements: true,
    }),
  ).toBeNull();
  await select("Moon public club");
  expect(boundary.change).toHaveBeenLastCalledWith(publicGroup.id, "PUBLIC");
  expect(screen.getByRole("combobox", { name: "Group" })).toHaveTextContent(publicGroup.name);
  await open();
  await select("No group");
  expect(boundary.change).toHaveBeenLastCalledWith(null, null);
  expect(screen.getByRole("combobox", { name: "Group" })).toHaveTextContent("No group");
  expect(reads).toEqual([]);
});

it("preserves an authorized selected group absent from the visible page", async () => {
  seed({ items: [publicGroup], nextCursor: null });
  await render(<Fixture groupId={groupRecord.id} group={groupRecord} />);
  await open();
  const selected = screen.getByRole("option", {
    name: /Friday group/,
    includeHiddenElements: true,
  });
  // RN Pressable normalizes the Select's aria-checked into native accessibilityState.
  expect(selected).toBeEnabled();
  expect(selected).toHaveProp(
    "accessibilityState",
    expect.objectContaining({ disabled: false, checked: true }),
  );
  await fireEvent.press(selected);
  expect(boundary.change).toHaveBeenCalledExactlyOnceWith(groupRecord.id, "PRIVATE");
  expect(reads).toEqual([]);
});

it.each(["locked", "busy"] as const)(
  "keeps the %s selector closed and does not dispatch changes",
  async (guard) => {
    seed();
    await render(
      <Fixture
        groupId={groupRecord.id}
        group={groupRecord}
        locked={guard === "locked"}
        busy={guard === "busy"}
      />,
    );
    const trigger = screen.getByRole("combobox", { name: "Group" });
    expect(trigger).toBeDisabled();
    await userEvent.setup().press(trigger);
    expect(
      screen.queryByRole("option", {
        name: /No group/,
        includeHiddenElements: true,
      }),
    ).toBeNull();
    expect(boundary.change).not.toHaveBeenCalled();
    expect(reads).toEqual([]);
  },
);

it("debounces an owner-scoped group search, selects its result and resets the next opening", async () => {
  seed();
  await render(<Fixture />);
  await open();
  await fireEvent.changeText(
    screen.getByLabelText("Search groups", { includeHiddenElements: true }),
    "Moon",
  );
  await waitFor(() => expect(reads).toHaveLength(1));
  expect(reads[0].url.searchParams.get("scope")).toBe("mine");
  expect(reads[0].url.searchParams.get("roles")).toBe("admin");
  expect(reads[0].url.searchParams.get("query")).toBe("Moon");
  expect(reads[0].authorization).toBe("Bearer group-selection-token");
  await select("Moon public club");
  await open();
  expect(
    screen.getByLabelText("Search groups", { includeHiddenElements: true }),
  ).toHaveDisplayValue("");
  expect(boundary.change).toHaveBeenCalledExactlyOnceWith(publicGroup.id, "PUBLIC");
});

it("shows a genuine empty list without manufacturing a selected group", async () => {
  seed({ items: [], nextCursor: null });
  await render(<Fixture />);
  await open();
  expect(screen.getByText("No groups found", { includeHiddenElements: true })).toBeOnTheScreen();
  expect(
    screen.getByRole("option", {
      name: /No group/,
      includeHiddenElements: true,
    }),
  ).toBeEnabled();
  expect(boundary.change).not.toHaveBeenCalled();
  expect(reads).toEqual([]);
});

it.each([403, 503])(
  "keeps a failed groups read observable and retries without granting cached authority (%s)",
  async (failure) => {
    code = failure;
    await render(<Fixture groupId={groupRecord.id} group={groupRecord} />);
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await open();
    expect(
      await screen.findByText("Could not load groups", {
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
    if (failure === 403) {
      expect(
        screen.queryByRole("option", {
          name: /Friday group/,
          includeHiddenElements: true,
        }),
      ).toBeNull();
      expect(screen.getByRole("combobox", { name: "Group" })).not.toHaveTextContent(
        groupRecord.name,
      );
    }
    code = 200;
    await fireEvent.press(
      screen.getByRole("button", {
        name: "Try again",
        includeHiddenElements: true,
      }),
    );
    expect(
      await screen.findByRole("option", {
        name: /Moon public club/,
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
    expect(
      screen.queryByText("Could not load groups", {
        includeHiddenElements: true,
      }),
    ).toBeNull();
    expect(boundary.change).not.toHaveBeenCalled();
  },
);

it("retains the first page after a failed next page and retries only its explicit cursor", async () => {
  page = { items: [groupRecord], nextCursor: "second-page" };
  seed();
  nextCode = 503;
  await render(<Fixture />);
  await open();
  await fireEvent.press(
    screen.getByRole("button", {
      name: "Load more groups",
      includeHiddenElements: true,
    }),
  );
  expect(
    await screen.findByText("Could not load groups", {
      includeHiddenElements: true,
    }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole("option", {
      name: /Friday group/,
      includeHiddenElements: true,
    }),
  ).toBeOnTheScreen();
  nextCode = 200;
  await fireEvent.press(
    screen.getByRole("button", {
      name: "Try again",
      includeHiddenElements: true,
    }),
  );
  expect(
    await screen.findByRole("option", {
      name: /Moon public club/,
      includeHiddenElements: true,
    }),
  ).toBeOnTheScreen();
  expect(reads.map((row) => row.url.searchParams.get("cursor"))).toEqual([
    "second-page",
    "second-page",
  ]);
  expect(
    screen.queryByRole("button", {
      name: "Load more groups",
      includeHiddenElements: true,
    }),
  ).toBeNull();
  await select("Moon public club");
  expect(boundary.change).toHaveBeenCalledExactlyOnceWith(publicGroup.id, "PUBLIC");
});

it("coalesces repeated next-page presses while the real query is pending", async () => {
  page = { items: [groupRecord], nextCursor: "second-page" };
  seed();
  let finish: (response: Response) => void = () => {};
  pending = new Promise((resolve) => {
    finish = resolve;
  });
  await render(<Fixture />);
  await open();
  const more = screen.getByRole("button", {
    name: "Load more groups",
    includeHiddenElements: true,
  });
  await fireEvent.press(more);
  await waitFor(() => expect(more).toBeDisabled());
  await fireEvent.press(more);
  expect(reads).toHaveLength(1);
  await act(async () => finish(Response.json(nextPage)));
  expect(
    await screen.findByRole("option", {
      name: /Moon public club/,
      includeHiddenElements: true,
    }),
  ).toBeOnTheScreen();
  expect(
    screen.queryByRole("button", {
      name: "Load more groups",
      includeHiddenElements: true,
    }),
  ).toBeNull();
});

it("reveals the next authorized page through the real native list's end gesture", async () => {
  page = { items: [groupRecord], nextCursor: "second-page" };
  seed();
  await render(<Fixture />);
  await open();
  const first = screen.getByRole("option", {
    name: /Friday group/,
    includeHiddenElements: true,
  });
  let list: typeof first | null = first;
  while (list && typeof list.props.onScroll !== "function") list = list.parent;
  if (!list) throw new Error("Expected the real group selector's native list host");
  await scrollNativeListToEnd(list, 900);
  expect(
    await screen.findByRole("option", {
      name: /Moon public club/,
      includeHiddenElements: true,
    }),
  ).toBeOnTheScreen();
  expect(reads.map((read) => read.url.searchParams.get("cursor"))).toEqual(["second-page"]);
  expect(boundary.change).not.toHaveBeenCalled();
});

// The installed contexts/keyboard store consume only native dimensions/events.
// This proves bounds and header composition, not physical Select opacity/touch.
it.each([0, 300, 500])(
  "keeps group options in their own keyboard-aware native list for keyboard height %s",
  async (keyboardHeight) => {
    const previousWindow = Dimensions.get("window");
    const previousScreen = Dimensions.get("screen");
    const { SafeAreaInsetsContext } = createRequire(import.meta.url)(
      "react-native-safe-area-context",
    ) as typeof import("react-native-safe-area-context");
    vi.spyOn(Keyboard, "metrics").mockReturnValue(undefined);
    await act(() =>
      Dimensions.set({
        window: { width: 390, height: 800, scale: 1, fontScale: 1 },
        screen: { width: 390, height: 800, scale: 1, fontScale: 1 },
      }),
    );
    seed();
    try {
      await render(
        <QueryClientProvider client={client}>
          <NativeTestProviders>
            <SafeAreaInsetsContext value={{ top: 24, bottom: 20, left: 0, right: 0 }}>
              <EventGroupSelect
                groupId={null}
                locked={false}
                busy={false}
                onChange={boundary.change}
              />
            </SafeAreaInsetsContext>
          </NativeTestProviders>
        </QueryClientProvider>,
      );
      if (keyboardHeight)
        await act(() =>
          DeviceEventEmitter.emit(
            Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow",
            {
              duration: 0,
              easing: "keyboard",
              startCoordinates: {
                width: 390,
                height: 0,
                screenX: 0,
                screenY: 800,
              },
              endCoordinates: {
                width: 390,
                height: keyboardHeight,
                screenX: 0,
                screenY: 800 - keyboardHeight,
              },
            },
          ),
        );
      await open();
      const search = screen.getByLabelText("Search groups", {
        includeHiddenElements: true,
      });
      let list: typeof search | null = search;
      while (list && typeof list.props.onScroll !== "function") list = list.parent;
      if (!list)
        throw new Error("Expected the actual group-option FlatList with its search header");
      // The wrapper owns the fixed list height; FlatList itself correctly keeps
      // a flex viewport. Inspect only native ancestors that received this style.
      let bounded: typeof list | null = list;
      while (bounded && typeof StyleSheet.flatten(bounded.props.style)?.height !== "number")
        bounded = bounded.parent;
      if (!bounded) throw new Error("Expected real bounded keyboard-aware list ancestor");
      expect(bounded).toHaveStyle({
        height: Math.min(320, Math.max(80, 800 - keyboardHeight - 24 - 20 - 24)),
        flexShrink: 1,
      });
      expect(list).toHaveProp("keyboardShouldPersistTaps", "handled");
      expect(Keyboard.dismiss).toHaveBeenCalled();
      expect(boundary.change).not.toHaveBeenCalled();
    } finally {
      await cleanup();
      await act(() => Dimensions.set({ window: previousWindow, screen: previousScreen }));
    }
  },
);
