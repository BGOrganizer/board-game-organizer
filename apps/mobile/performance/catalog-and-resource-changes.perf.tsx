import type {
  BggSearchItem,
  BggThingResponse,
  NotificationChangeRow,
} from "@board-game-organizer/schemas";
import { bggGameMetadataQuery, type useNotificationChanges } from "@board-game-organizer/shared";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen, userEvent } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { DeviceEventEmitter } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GameCatalogMetadata } from "@/components/games/GameCatalogMetadata";
import { NotificationChangesPopover } from "@/components/notifications/NotificationChangesPopover";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const boundary = vi.hoisted(() => ({
  apiUrl: "https://native-catalog-render.test",
  userId: "catalog-owner",
  getToken: async () => "catalog-fixture-token",
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: boundary.userId,
    sessionId: "catalog-fixture-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.getToken,
  }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: boundary.apiUrl } } },
}));

beforeEach(installNativePopoverMeasurements);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("GameCatalogMetadata: read scoped cached metadata and update the open game badge", async () => {
  const summary: BggSearchItem = { id: 47, name: "Strategy game", year: 2030, imageUrl: null };
  const details: BggThingResponse = {
    ...summary,
    average: 8.5,
    averageWeight: 2.5,
    rank: 7,
    minPlayMinutes: 20,
    maxPlayMinutes: 40,
    categories: ["Abstract Strategy"],
  };
  const foreignDetails: BggThingResponse = {
    ...details,
    average: 6,
    categories: ["Different account cache"],
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const { queryKey } = bggGameMetadataQuery(client, boundary, summary, true);
  const { queryKey: foreignKey } = bggGameMetadataQuery(
    client,
    { ...boundary, userId: "different-owner" },
    summary,
    true,
  );
  const fetch = vi.fn(async () => {
    throw new Error("Unexpected request while catalog metadata is cached");
  });
  vi.stubGlobal("fetch", fetch);
  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <NativeTestProviders>{children}</NativeTestProviders>
      </QueryClientProvider>
    );
  }

  try {
    const result = await measureRenders(
      <GameCatalogMetadata game={summary} name={summary.name} visible />,
      {
        wrapper: Providers,
        beforeEach: () => {
          client.clear();
          client.setQueryData(queryKey, details);
          client.setQueryData(foreignKey, foreignDetails);
          fetch.mockClear();
        },
        scenario: async () => {
          expect(screen.queryByText("8.50")).toBeNull();
          await pressMeasuredPopover(
            screen.getByRole("button", { name: "Game information: Strategy game" }),
          );
          expect(screen.getByText("8.50")).toBeVisible();
          expect(screen.getByText("Abstract Strategy")).toBeVisible();
          expect(screen.queryByText("Different account cache")).toBeNull();
          await act(() => {
            client.setQueryData(queryKey, { ...details, average: 8.75 });
          });
          expect(await screen.findByText("8.75")).toBeVisible();
          expect(screen.queryByText("8.50")).toBeNull();
          expect(fetch).not.toHaveBeenCalled();
          expect(client.getQueryData(foreignKey)).toBe(foreignDetails);
        },
      },
    );
    assertRenderMeasurement(result);
  } finally {
    client.clear();
  }
});

function change(
  id: string,
  title: string,
  description: string,
  requiresResponse: boolean,
): NotificationChangeRow {
  const reference = { notificationId: id, effectiveAt: "2030-06-12T10:00:00.000Z" };
  return {
    ...reference,
    messageCode: requiresResponse ? "invitation" : "event_confirmed",
    title,
    description,
    requiresResponse,
    readReference: reference,
  };
}

it("NotificationChangesPopover: render unread changes and acknowledge only on explicit action", async () => {
  const model: ReturnType<typeof useNotificationChanges> = {
    changes: [
      change(
        "000000000000000000000001",
        "Confirmed game night",
        "L’evento è pronto nella città scelta.",
        false,
      ),
      change(
        "000000000000000000000002",
        "Pending invitation",
        "Please choose whether to join.",
        true,
      ),
    ],
    tabCounts: { details: 0, members: 0, tables: 0, participants: 0 },
    hasNextPage: false,
    fetchNextPage: vi.fn(async () => undefined),
    isFetchNextPageError: false,
    isFetchingNextPage: false,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    markDisplayedAsRead: vi.fn(),
    markAllAsRead: vi.fn(async () => undefined),
    resetWindow: vi.fn(),
    isReading: false,
    readError: null,
  };
  const result = await measureRenders(<NotificationChangesPopover model={model} />, {
    wrapper: NativeTestProviders,
    beforeEach: () => {
      vi.mocked(model.markAllAsRead).mockClear();
      vi.mocked(model.markDisplayedAsRead).mockClear();
      vi.mocked(model.resetWindow).mockClear();
    },
    scenario: async () => {
      expect(screen.getByLabelText("Unread updates")).toBeOnTheScreen();
      expect(screen.queryByText("Confirmed game night")).toBeNull();
      await pressMeasuredPopover(screen.getByRole("button", { name: "New changes" }));
      expect(screen.getByText("Confirmed game night")).toBeVisible();
      expect(screen.getByText("L’evento è pronto nella città scelta.")).toBeVisible();
      expect(screen.getByText("Pending invitation")).toBeVisible();
      expect(screen.getByText("Invitations remain unread until you respond.")).toBeVisible();
      expect(model.markAllAsRead).not.toHaveBeenCalled();
      expect(model.markDisplayedAsRead).not.toHaveBeenCalled();

      await userEvent
        .setup()
        .press(screen.getByRole("button", { name: "Mark all changes as read" }));
      expect(model.markAllAsRead).toHaveBeenCalledOnce();
      expect(model.markDisplayedAsRead).not.toHaveBeenCalled();
      await act(() => DeviceEventEmitter.emit("hardwareBackPress"));
      expect(screen.queryByTestId("notification-changes-list")).toBeNull();
      expect(model.resetWindow).toHaveBeenCalledTimes(2);
    },
  });
  assertRenderMeasurement(result);
});
