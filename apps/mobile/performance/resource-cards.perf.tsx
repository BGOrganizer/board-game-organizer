import { NotificationAttentionProvider } from "@board-game-organizer/shared";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
import { NavigationContext } from "expo-router/react-navigation";
import type { ContextType, ReactElement, ReactNode } from "react";
import { AccessibilityInfo, Animated, AppState } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventCard } from "@/components/events/EventCard";
import { EventDetailsCard } from "@/components/events/EventDetailsCard";
import { EventTableCard } from "@/components/events/EventTableCard";
import { EventTableInfo } from "@/components/events/EventTableInfo";
import { GroupCard } from "@/components/groups/GroupCard";
import { GroupIdentityCard } from "@/components/groups/GroupIdentityCard";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { groupRecord, plannedEvent, plannedTable } from "../../web/src/test-fixtures/eventRecords";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("expo-router", () => ({
  useRouter: () => boundary,
  useLocalSearchParams: () => ({}),
}));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));

type Scenario = {
  name: string;
  ui: ReactElement;
  assert: () => Promise<void>;
};

const focusedNavigation = {
  isFocused: () => true,
  addListener: () => () => {},
} as unknown as NonNullable<ContextType<typeof NavigationContext>>;

function artworkHost() {
  return screen.getByTestId(/^dicebear-(groups|events|tables)-image$/, {
    includeHiddenElements: true,
  });
}

function svgPlanes() {
  return artworkHost().queryAll((node) => node.type === "RNSVGSvgViewAndroid");
}

async function firstArtworkLayout() {
  const hosts = artworkHost().queryAll((node) => typeof node.props.onLayout === "function");
  expect(hosts).toHaveLength(1);
  await fireEvent.layout(hosts[0], { x: 0, y: 0, width: 96, height: 96 });
  await waitFor(() => {
    expect(svgPlanes().length).toBeGreaterThan(1);
  });
}

// Each scenario exercises the real artwork, indicator popover and card layout.
// Row cases also verify either information isolation or the navigation callback.
const scenarios: Scenario[] = [
  {
    name: "GroupCard: private group information and navigation",
    ui: <GroupCard group={groupRecord} />,
    assert: async () => {
      expect(screen.getByText(groupRecord.name)).toBeTruthy();
      await pressMeasuredPopover(screen.getByRole("button", { name: "Private" }));
      expect(await screen.findByRole("heading", { name: "Private" })).toBeVisible();
      expect(boundary.push).not.toHaveBeenCalled();
    },
  },
  {
    name: "EventCard: planning event information and navigation",
    ui: <EventCard event={plannedEvent} />,
    assert: async () => {
      expect(screen.getByText(plannedEvent.name)).toBeTruthy();
      await userEvent
        .setup()
        .press(screen.getByRole("button", { name: `Open event: ${plannedEvent.name}` }));
      expect(boundary.push).toHaveBeenCalledWith({
        pathname: "/event/[eventId]",
        params: { eventId: plannedEvent.id },
      });
    },
  },
  {
    name: "EventTableCard: rated table information and navigation",
    ui: <EventTableCard table={plannedTable} />,
    assert: async () => {
      expect(screen.getByText("Table #1")).toBeTruthy();
      await userEvent.setup().press(screen.getByRole("button", { name: "Open table: Table #1" }));
      expect(boundary.push).toHaveBeenCalledWith({
        pathname: "/event/table",
        params: { eventId: plannedTable.eventId, tableId: plannedTable.id },
      });
    },
  },
  {
    name: "GroupIdentityCard: detail artwork and role information",
    ui: <GroupIdentityCard group={groupRecord} />,
    assert: async () => {
      expect(screen.getByText(groupRecord.name)).toBeTruthy();
      await pressMeasuredPopover(screen.getByRole("button", { name: "Private" }));
      expect(await screen.findByRole("heading", { name: "Private" })).toBeVisible();
    },
  },
  {
    name: "EventDetailsCard: detail artwork and privacy information",
    ui: <EventDetailsCard event={plannedEvent} />,
    assert: async () => {
      expect(screen.getByText(plannedEvent.name)).toBeTruthy();
      await pressMeasuredPopover(screen.getByRole("button", { name: "Private event" }));
      expect(await screen.findByRole("heading", { name: "Private event" })).toBeVisible();
    },
  },
  {
    name: "EventTableInfo: detail artwork and rating information",
    ui: <EventTableInfo table={plannedTable} />,
    assert: async () => {
      expect(screen.getByText("Table #1")).toBeTruthy();
      await pressMeasuredPopover(screen.getByRole("button", { name: "Rating enabled" }));
      expect(await screen.findByRole("heading", { name: "Rating" })).toBeVisible();
    },
  },
];

const measurements = scenarios.flatMap((fixture) =>
  (["initial static frame", "first layout and native artwork preparation"] as const).map(
    (phase) => ({
      ...fixture,
      phase,
    }),
  ),
);

beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

// These React/JS samples prepare real SVG layers and request a native clock
// under the native test adapter. They do not measure device or GPU frames.
for (const fixture of measurements) {
  it(`actual resource rendering — ${fixture.name} — ${fixture.phase}`, async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const getToken = vi.fn(async () => "fixture-token");
    const previousAppState = Object.getOwnPropertyDescriptor(AppState, "currentState");
    Object.defineProperty(AppState, "currentState", {
      configurable: true,
      writable: true,
      value: "active",
    });
    const preference = vi
      .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
      .mockResolvedValue(false);
    // Call-through spies preserve React Native's real animation implementation.
    const loop = vi.spyOn(Animated, "loop");
    const timing = vi.spyOn(Animated, "timing");
    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={client}>
          <NativeTestProviders>
            <NavigationContext value={focusedNavigation}>
              <NotificationAttentionProvider
                options={{
                  apiUrl: "https://performance-fixtures.test",
                  userId: "owner",
                  enabled: false,
                  getToken,
                }}
                targets={[]}
              >
                {children}
              </NotificationAttentionProvider>
            </NavigationContext>
          </NativeTestProviders>
        </QueryClientProvider>
      );
    }
    try {
      const result = await measureRenders(fixture.ui, {
        wrapper: Wrapper,
        beforeEach: () => {
          boundary.push.mockClear();
          loop.mockClear();
          timing.mockClear();
          preference.mockClear();
        },
        scenario: async () => {
          expect(svgPlanes()).toHaveLength(1);
          expect(loop).not.toHaveBeenCalled();
          if (fixture.phase === "first layout and native artwork preparation") {
            await firstArtworkLayout();
            await waitFor(() => expect(loop).toHaveBeenCalled());
            expect(timing).toHaveBeenCalledWith(
              expect.any(Animated.Value),
              expect.objectContaining({ useNativeDriver: true, isInteraction: false }),
            );
          }
          await fixture.assert();
          if (fixture.phase === "initial static frame") {
            expect(svgPlanes()).toHaveLength(1);
            expect(loop).not.toHaveBeenCalled();
          }
          expect(preference).toHaveBeenCalled();
        },
      });
      expect(getToken).not.toHaveBeenCalled();
      assertRenderMeasurement(result);
    } finally {
      client.clear();
      preference.mockRestore();
      loop.mockRestore();
      timing.mockRestore();
      if (previousAppState) Object.defineProperty(AppState, "currentState", previousAppState);
      else Reflect.deleteProperty(AppState, "currentState");
    }
  });
}
