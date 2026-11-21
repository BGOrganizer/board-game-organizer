import { URL } from "node:url";
import { measureRenders } from "@callstack/reassure-measure";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, screen, userEvent, waitFor } from "@testing-library/react-native";
import { createRef, type ReactNode, type Ref, useImperativeHandle, useState } from "react";
import { AppState, Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GroupLogoPicker } from "@/components/groups/GroupLogoPicker";
import { Leaderboard } from "@/components/ratings/Leaderboard";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { scrollNativeListToEnd } from "@/test/nativeListGeometry";
import { installNativePopoverMeasurements } from "@/test/nativePopoverGeometry";
import { positionMeasuredSelect } from "@/test/nativeSelectGeometry";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

const API = "https://group-interactions-perf.test";
const assetId = "11111111-1111-4111-8111-111111111111";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ6cAAAAASUVORK5CYII=";
const boundary = vi.hoisted(() => ({
  token: vi.fn(async () => "fixture-group-perf-token"),
  library: vi.fn(),
  camera: vi.fn(),
  feedback: { onSuccess: vi.fn(), onError: vi.fn(), onOptimisticUpdate: vi.fn() },
}));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://group-interactions-perf.test",
    userId: "owner",
    getToken: boundary.token,
    enabled: true,
    feedback: boundary.feedback,
  }),
}));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "fixture-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: boundary.token,
  }),
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://group-interactions-perf.test" } } },
}));
vi.mock("expo-router", () => ({
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
}));
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: boundary.library,
  launchCameraAsync: boundary.camera,
  getCameraPermissionsAsync: vi.fn(async () => ({ granted: true, canAskAgain: true })),
  requestCameraPermissionsAsync: vi.fn(async () => ({ granted: true, canAskAgain: true })),
}));
const changed = vi.fn(),
  busy = vi.fn();
let client: QueryClient;
let pendingAllocation: Promise<Response> | undefined;
let pendingPage: Promise<Response> | undefined;
let allocationDone: (value: Response) => void;
let pageDone: (value: Response) => void;
let failedCompletion: boolean;
let nextPageStatus: number;
const requests: { url: URL; method: string; authorization: string | null }[] = [];
const json = (body: unknown, status = 200) => Response.json(body, { status });

function resetRun() {
  vi.clearAllMocks();
  requests.length = 0;
  pendingAllocation = pendingPage = undefined;
  allocationDone = pageDone = () => {};
  failedCompletion = false;
  nextPageStatus = 200;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  boundary.library.mockResolvedValue({ canceled: false, assets: [{ base64: png }] });
}
beforeEach(async () => {
  await installNativePopoverMeasurements();
  vi.spyOn(AppState, "addEventListener").mockReturnValue({ remove: () => {} });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      const method = init?.method ?? "GET";
      if (url.origin !== API)
        throw new Error(`Unexpected performance fixture origin ${url.origin}`);
      requests.push({
        url,
        method,
        authorization: new Headers(init?.headers).get("authorization"),
      });
      if (url.pathname.startsWith("/api/group-assets")) {
        if (method === "POST" && url.pathname === "/api/group-assets")
          return pendingAllocation ?? json({ id: assetId });
        if (method === "PATCH" && url.pathname === `/api/group-assets/${assetId}`)
          return json({ id: assetId });
        if (method === "POST" && url.pathname === `/api/group-assets/${assetId}/complete`)
          return failedCompletion
            ? json({ error: "Fixture upload rejected" }, 503)
            : json({ id: assetId, preview: `data:image/png;base64,${png}` });
      }
      if (method === "GET" && url.pathname === "/api/groups/perf-group/leaderboard") {
        if (!url.searchParams.has("gameId"))
          return json({
            games: [{ id: 1, name: "Chess ranking", imageUrl: null }],
            players: [],
            nextCursor: null,
          });
        const more = url.searchParams.get("cursor") === "25";
        if (more && pendingPage) return pendingPage;
        if (more && nextPageStatus !== 200)
          return json({ error: "Fixture page rejected" }, nextPageStatus);
        const userId = more ? "next-player" : "first-player";
        return json({
          games: [],
          players: [
            {
              userId,
              name: userId,
              username: userId,
              avatarUrl: null,
              gamesPlayed: 4,
              gamesWon: 1,
              nd: 0,
              rating: 30,
              provisional: false,
              left: false,
              groupRole: "MEMBER",
            },
          ],
          nextCursor: more ? null : 25,
        });
      }
      throw new Error(`Unexpected performance fixture request ${method} ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  client?.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function ControlledLogo({
  ref,
  initialDisabled = false,
}: {
  ref: Ref<(value: boolean) => void>;
  initialDisabled?: boolean;
}) {
  const [disabled, setDisabled] = useState(initialDisabled);
  const [value, setValue] = useState<{ id: string; preview: string } | null>({
    id: assetId,
    preview: `data:image/png;base64,${png}`,
  });
  useImperativeHandle(ref, () => setDisabled, []);
  return (
    <GroupLogoPicker
      value={value}
      required
      disabled={disabled}
      onBusyChange={busy}
      onChange={(next) => {
        changed(next);
        setValue(next);
      }}
    />
  );
}
function QueryProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>{children}</NativeTestProviders>
    </QueryClientProvider>
  );
}
async function press(name: string) {
  await userEvent.setup().press(await screen.findByRole("button", { name }));
}
async function chooseLogo() {
  await press("Change logo");
  // Actual Gorhom content/callbacks remain mounted. Node does not prove the
  // native worklet's sheet visibility or physical tappability; Maestro owns it.
  await press("Photo library");
}
function leaderboardList() {
  let node = screen.getByText("Benchmark group header");
  while (node.parent && typeof node.props.onScroll !== "function") node = node.parent;
  if (typeof node.props.onScroll !== "function")
    throw new Error("Expected real leaderboard ScrollView");
  return node;
}

it("GroupLogoPicker: disabled owner and pending allocation reject duplicate actions before authoritative upload completion", async () => {
  const update = createRef<(disabled: boolean) => void>();
  const result = await measureRenders(<ControlledLogo ref={update} initialDisabled />, {
    wrapper: NativeTestProviders,
    beforeEach: () => {
      resetRun();
      pendingAllocation = new Promise((resolve) => {
        allocationDone = resolve;
      });
    },
    afterEach: () => client.clear(),
    scenario: async () => {
      for (const name of ["Change logo", "Remove logo"]) {
        const button = screen.getByRole("button", { name });
        expect(button).toBeDisabled();
        await userEvent.setup().press(button);
      }
      expect(boundary.library).not.toHaveBeenCalled();
      expect(requests).toHaveLength(0);
      await act(() => update.current?.(false));
      expect(screen.getByRole("button", { name: "Change logo" })).toBeEnabled();
      await chooseLogo();
      await waitFor(() => expect(requests).toHaveLength(1));
      for (const name of ["Change logo", "Remove logo"]) {
        const button = screen.getByRole("button", { name });
        expect(button).toBeDisabled();
        await userEvent.setup().press(button);
      }
      expect(requests).toHaveLength(1);
      expect(boundary.library).toHaveBeenCalledOnce();
      expect(changed).not.toHaveBeenCalled();
      expect(busy).toHaveBeenCalledWith(true);
      pendingAllocation = undefined;
      await act(() => allocationDone(json({ id: assetId })));
      await waitFor(() =>
        expect(changed).toHaveBeenCalledExactlyOnceWith({
          id: assetId,
          preview: `data:image/png;base64,${png}`,
        }),
      );
      expect(requests.map(({ method }) => method)).toEqual(["POST", "PATCH", "POST"]);
      expect(
        requests.every(({ authorization }) => authorization === "Bearer fixture-group-perf-token"),
      ).toBe(true);
      expect(busy).toHaveBeenLastCalledWith(false);
      expect(screen.getByRole("button", { name: "Change logo" })).toBeEnabled();
      expect(boundary.feedback.onSuccess).toHaveBeenCalledExactlyOnceWith("upload_group_logo");
    },
  });
  assertRenderMeasurement(result);
});

it("GroupLogoPicker: failed completion preserves the current logo until an explicit successful retry", async () => {
  const update = createRef<(disabled: boolean) => void>();
  const result = await measureRenders(<ControlledLogo ref={update} />, {
    wrapper: NativeTestProviders,
    beforeEach: () => {
      resetRun();
      failedCompletion = true;
    },
    afterEach: () => client.clear(),
    scenario: async () => {
      await chooseLogo();
      expect(await screen.findByText("Could not upload logo")).toBeVisible();
      expect(changed).not.toHaveBeenCalled();
      expect(screen.getByLabelText("Group logo")).toHaveProp(
        "source",
        expect.arrayContaining([expect.objectContaining({ uri: `data:image/png;base64,${png}` })]),
      );
      expect(boundary.feedback.onError).toHaveBeenCalledWith(
        expect.any(Error),
        "upload_group_logo",
      );
      failedCompletion = false;
      await chooseLogo();
      await waitFor(() => expect(changed).toHaveBeenCalledOnce());
      expect(screen.queryByText("Could not upload logo")).toBeNull();
      expect(requests.map(({ method }) => method)).toEqual([
        "POST",
        "PATCH",
        "POST",
        "POST",
        "PATCH",
        "POST",
      ]);
      expect(screen.getByRole("button", { name: "Remove logo" })).toBeEnabled();
    },
  });
  assertRenderMeasurement(result);
});

it("GroupLeaderboard: failed next page retains current players and requires one explicit retry after duplicate pending gestures", async () => {
  const result = await measureRenders(
    <Leaderboard groupId="perf-group" header={<Text>Benchmark group header</Text>} />,
    {
      wrapper: QueryProviders,
      beforeEach: () => resetRun(),
      afterEach: () => client.clear(),
      scenario: async () => {
        await positionMeasuredSelect(await screen.findByTestId("rating-game-select-trigger"));
        // Real Select callback proof only; physical overlay taps require Maestro.
        await fireEvent.press(
          screen.getByRole("option", { name: "Chess ranking", includeHiddenElements: true }),
        );
        expect(await screen.findByText("@first-player")).toBeVisible();
        pendingPage = new Promise((resolve) => {
          pageDone = resolve;
        });
        await scrollNativeListToEnd(leaderboardList());
        await waitFor(() =>
          expect(
            requests.filter(({ url }) => url.searchParams.get("cursor") === "25"),
          ).toHaveLength(1),
        );
        await scrollNativeListToEnd(leaderboardList(), 1264);
        expect(requests.filter(({ url }) => url.searchParams.get("cursor") === "25")).toHaveLength(
          1,
        );
        await act(() => pageDone(json({ error: "Fixture page rejected" }, 503)));
        expect(
          await screen.findByRole("button", { name: "Could not load leaderboards. Retry" }),
        ).toBeVisible();
        expect(screen.getByText("@first-player")).toBeVisible();
        pendingPage = undefined;
        await press("Could not load leaderboards. Retry");
        expect(await screen.findByText("@next-player")).toBeVisible();
        expect(requests.filter(({ url }) => url.searchParams.get("cursor") === "25")).toHaveLength(
          2,
        );
        expect(
          screen.queryByRole("button", { name: "Could not load leaderboards. Retry" }),
        ).toBeNull();
      },
    },
  );
  assertRenderMeasurement(result);
});
