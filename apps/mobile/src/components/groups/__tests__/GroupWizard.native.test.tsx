import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import {
  CommunityApiError,
  type CreateGroupVariables,
  type EditGroupVariables,
  groupRecordKeys,
} from "@board-game-organizer/shared";
import { useAppStore } from "@board-game-organizer/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { createContext, useContext } from "react";
import { Linking, View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GroupWizardScreen from "@/app/group/wizard";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  NativeStackHeader,
  nativeStackOptionsSnapshot,
  resetNativeStackOptionsPort,
} from "@/test/nativeStackOptionsPort";
import { groupRecord } from "../../../../../web/src/test-fixtures/eventRecords";
import { wizardVenue } from "../../events/__tests__/eventWizardFixtures";
import { GroupWizard } from "../GroupWizard";

const headerPaths = () =>
  screen
    .getByTestId("native-stack-header")
    .queryAll((node) => node.type === "RNSVGPath")
    .map((node) => node.props.d);

type Params = { groupId?: string | string[]; draftId?: string | string[] };
const RouteParams = createContext<Params>({});
const API = "https://group-wizard-fixtures.test";
const boundary = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  dismissTo: vi.fn(),
  feedback: { onSuccess: vi.fn(), onError: vi.fn(), onOptimisticUpdate: vi.fn() },
  preventRemove: undefined as (() => void) | undefined,
  library: vi.fn<() => Promise<{ canceled: true; assets: null }>>(),
}));
const options = {
  apiUrl: API,
  userId: "owner",
  getToken: async () => "fixture-owner-token",
  enabled: true,
  feedback: boundary.feedback,
};
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    userId: "owner",
    sessionId: "owner-session",
    isLoaded: true,
    isSignedIn: true,
    getToken: options.getToken,
  }),
}));
vi.mock("expo-router", async () => ({
  useRouter: () => ({ push: boundary.push, back: boundary.back, dismissTo: boundary.dismissTo }),
  useNavigation: () => ({ getState: () => ({ type: "stack" }) }),
  useLocalSearchParams: () => ({ slotId: "location-slot", ...useContext(RouteParams) }),
  Stack: { Screen: (await import("@/test/nativeStackOptionsPort")).NativeStackScreen },
}));
vi.mock("expo-router/react-navigation", async (original) => ({
  ...(await original<typeof import("expo-router/react-navigation")>()),
  usePreventRemove: (enabled: boolean, callback: () => void) => {
    boundary.preventRemove = enabled ? callback : undefined;
  },
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { apiUrl: "https://group-wizard-fixtures.test" } } },
}));
vi.mock("expo-image-picker", () => ({
  getCameraPermissionsAsync: vi.fn(async () => ({ granted: false, canAskAgain: true })),
  launchImageLibraryAsync: boundary.library,
}));
vi.mock("expo-location", () => ({
  getForegroundPermissionsAsync: vi.fn(async () => ({ granted: false, canAskAgain: true })),
}));
// The inline LocationPicker remains real. MapLibre cannot attach a native GPU
// surface in Node; this unconfigured-map fixture never mounts those SDK exports.
vi.mock("@maplibre/maplibre-react-native", () => ({
  Map: View,
  Camera: View,
  GeoJSONSource: View,
  Layer: View,
}));

let client: QueryClient;
let canonical: GroupRecordResponse;
let detailStatus: number;
let favoriteStatus: number;
let pendingDetail: Promise<Response> | undefined;
let writeStatus: number;
const writes: { method: string; path: string; input: Record<string, unknown> }[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  resetNativeStackOptionsPort();
  useAppStore.getState().clearPending();
  boundary.preventRemove = undefined;
  boundary.library.mockResolvedValue({ canceled: true, assets: null });
  canonical = { ...groupRecord };
  detailStatus = favoriteStatus = 200;
  pendingDetail = undefined;
  writeStatus = 200;
  writes.length = 0;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== API) throw new Error(`Unexpected fixture origin: ${url.origin}`);
      if (url.pathname === "/api/locations/favorites")
        return json(
          favoriteStatus !== 200
            ? { error: "Favorites unavailable" }
            : url.searchParams.has("keys")
              ? { keys: [] }
              : { items: [], nextCursor: null },
          favoriteStatus,
        );
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        const body = JSON.parse(String(init?.body));
        writes.push({ method, path: url.pathname, input: body });
        return json(
          writeStatus === 200
            ? {
                ...canonical,
                name: body.name ?? canonical.name,
                version: body.version ? Number(body.version) + 1 : 1,
              }
            : { error: "Fixture validation failed" },
          writeStatus,
        );
      }
      if (url.pathname === "/api/groups") return json({ items: [canonical], nextCursor: null });
      if (url.pathname === `/api/groups/${canonical.id}`)
        return (
          pendingDetail ??
          json(
            detailStatus === 200 ? canonical : { error: "Fixture detail unavailable" },
            detailStatus,
          )
        );
      throw new Error(`Unexpected fixture endpoint: ${url.pathname}`);
    }),
  );
});
afterEach(() => {
  client.clear();
  useAppStore.getState().clearPending();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Fixture({
  showHeader,
  params,
  ...props
}: Parameters<typeof GroupWizard>[0] & { showHeader?: boolean; params?: Params } = {}) {
  return (
    <QueryClientProvider client={client}>
      <NativeTestProviders>
        {params ? (
          <RouteParams value={params}>
            <GroupWizardScreen />
          </RouteParams>
        ) : (
          <GroupWizard {...props} />
        )}
        {showHeader ? <NativeStackHeader /> : null}
      </NativeTestProviders>
    </QueryClientProvider>
  );
}
const press = async (name: string) => userEvent.setup().press(screen.getByRole("button", { name }));
async function returnedFriend(name = "Friend One", id = "friend-one", slotId?: string) {
  const params = boundary.push.mock.calls.at(-1)?.[0].params;
  const slot = slotId ?? params.slotId;
  await act(() =>
    useAppStore
      .getState()
      .setPendingUser(slot, { id, name, username: id, email: null, avatarUrl: null }),
  );
  return slot as string;
}
function failedCreation(variables: CreateGroupVariables, status: "error" | "pending" = "error") {
  const error = new CommunityApiError(400, "Fixture rejected creation");
  return client.getMutationCache().build(
    client,
    { mutationKey: groupRecordKeys.mutation(options, "", "create") },
    {
      context: undefined,
      data: undefined,
      error: status === "error" ? error : null,
      failureCount: status === "error" ? 1 : 0,
      failureReason: status === "error" ? error : null,
      isPaused: false,
      status,
      variables,
      submittedAt: Date.now(),
    },
  );
}

it("creates a private local draft with real form/visibility/logo/venue controls and validates before any write", async () => {
  await render(<Fixture />);
  expect(screen.getByRole("radio", { name: "Private" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Public" })).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Add friend" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Upload group logo" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Choose a location" })).toBeEnabled();
  expect(screen.getByText("JPEG, PNG or WebP, up to 5 MB.")).toBeVisible();
  await press("Create group");
  expect(screen.getByText("Choose a name, from 5 to 30 characters.")).toBeVisible();
  expect(writes).toHaveLength(0);
  expect(boundary.dismissTo).not.toHaveBeenCalled();
});

it("submits a valid private draft once through the actual mutation and returns to its list", async () => {
  await render(<Fixture />);
  await fireEvent.changeText(screen.getByTestId("group-name-input"), "  Local games group  ");
  await press("Create group");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    method: "POST",
    path: "/api/groups",
    input: { type: "PRIVATE", name: "Local games group", invitedUserIds: [] },
  });
  expect(writes[0].input).not.toHaveProperty("clientDraft");
  expect(boundary.dismissTo).toHaveBeenCalledExactlyOnceWith("/(tabs)/groups");
  expect(screen.getByRole("button", { name: "Create group" })).toBeDisabled();
  await press("Create group");
  expect(writes).toHaveLength(1);
});

it("routes friend selection with the current slot, deduplicates returns and supports removal", async () => {
  await render(<Fixture />);
  await press("Add friend");
  expect(boundary.push).toHaveBeenCalledWith({
    pathname: "/group/search-user",
    params: expect.objectContaining({ source: "group", exclude: "" }),
  });
  const slot = await returnedFriend();
  expect(screen.getByText("Friend One")).toBeVisible();
  expect(screen.getByText("@friend-one")).toBeVisible();
  expect(useAppStore.getState().pendingUser).toBeNull();
  await returnedFriend("Friend One", "friend-one", slot);
  expect(screen.getAllByText("Friend One")).toHaveLength(1);
  await press("Add friend");
  expect(boundary.push.mock.calls.at(-1)?.[0].params.exclude).toBe("friend-one");
  await press("Remove invite: Friend One");
  expect(screen.queryByText("Friend One")).toBeNull();
});

it("clears selected friends on a real visibility change and rejects stale picker returns", async () => {
  await render(<Fixture />);
  await press("Add friend");
  const oldSlot = await returnedFriend();
  await userEvent.setup().press(screen.getByRole("radio", { name: "Public" }));
  expect(screen.queryByText("Friend One")).toBeNull();
  expect(screen.getByRole("button", { name: "Add friend" })).toBeDisabled();
  expect(screen.getByText("Invitations are only available for private groups.")).toBeVisible();
  await returnedFriend("Stale Friend", "stale-friend", oldSlot);
  expect(useAppStore.getState().pendingUser).toMatchObject({
    slotId: oldSlot,
    user: { id: "stale-friend" },
  });
  await userEvent.setup().press(screen.getByRole("radio", { name: "Private" }));
  expect(screen.queryByText("Stale Friend")).toBeNull();
  await press("Add friend");
  expect(boundary.push.mock.calls.at(-1)?.[0].params.slotId).not.toBe(oldSlot);
});

it("requires both owned logo and verified venue for public submission", async () => {
  await render(<Fixture />);
  await fireEvent.changeText(screen.getByTestId("group-name-input"), "Public games group");
  await userEvent.setup().press(screen.getByRole("radio", { name: "Public" }));
  await press("Submit for review");
  expect(screen.getByText("Choose a group logo.")).toBeVisible();
  expect(screen.getByText("Choose a verified location.")).toBeVisible();
  expect(writes).toHaveLength(0);
  expect(boundary.dismissTo).not.toHaveBeenCalled();
});

it("retains the local group form when the real inline venue picker is closed by native Back", async () => {
  await render(<Fixture />);
  await fireEvent.changeText(screen.getByTestId("group-name-input"), "Keep this draft");
  await press("Choose a location");
  expect(screen.getByLabelText("Location name")).toBeVisible();
  expect(screen.getByText("Map unavailable")).toBeVisible();
  expect(screen.queryByTestId("group-name-input")).toBeNull();
  if (!boundary.preventRemove) throw new Error("Expected native inline picker removal guard");
  await act(() => boundary.preventRemove?.());
  expect(screen.getByTestId("group-name-input")).toHaveDisplayValue("Keep this draft");
  expect(boundary.back).not.toHaveBeenCalled();
});

it("loads a real editable private group with immutable visibility and removable optional venue/logo", async () => {
  canonical = {
    ...canonical,
    location: wizardVenue,
    logoAssetId: "22222222-2222-4222-8222-222222222222",
    logo: "https://fixture.invalid/owned-logo.png",
  };
  await render(<Fixture groupId={canonical.id} />);
  expect(await screen.findByTestId("group-name-input")).toHaveDisplayValue(canonical.name);
  expect(
    screen.getByText(
      "Private groups are invitation-only. Logo and verified venue are optional. Group type cannot be changed.",
    ),
  ).toBeVisible();
  for (const label of ["Private", "Public"])
    expect(screen.getByRole("radio", { name: label })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Add friend" })).toBeNull();
  await press("Remove location");
  expect(screen.queryByText(wizardVenue.name)).toBeNull();
  expect(screen.getByRole("button", { name: "Choose a location" })).toBeEnabled();
  await press("Remove logo");
  expect(screen.getByRole("image", { name: "No logo selected" })).toBeVisible();
  await fireEvent.changeText(screen.getByTestId("group-name-input"), "Changed group");
  await press("Save changes");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0]).toMatchObject({
    method: "PATCH",
    path: `/api/groups/${canonical.id}`,
    input: { name: "Changed group", version: 1 },
  });
  expect(writes[0].input).not.toHaveProperty("type");
  expect(writes[0].input).not.toHaveProperty("invitedUserIds");
  expect(boundary.dismissTo).toHaveBeenCalledWith(`/group/${canonical.id}`);
});

it("prevents stale group edits after a newer authoritative version arrives", async () => {
  await render(<Fixture groupId={canonical.id} />);
  await screen.findByTestId("group-name-input");
  await fireEvent.changeText(screen.getByTestId("group-name-input"), "Unsaved private name");
  await act(() =>
    client.setQueryData(groupRecordKeys.detail(options, canonical.id), {
      ...canonical,
      version: 2,
      name: "Authoritative remote name",
    }),
  );
  expect(
    await screen.findByText("This group changed. Go back and reopen the editor before saving."),
  ).toBeVisible();
  expect(screen.getByTestId("group-name-input")).toHaveDisplayValue("Unsaved private name");
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await press("Save changes");
  expect(writes).toHaveLength(0);
});

it("keeps public editing immutable and preserves its mandatory venue while allowing logo replacement", async () => {
  canonical = {
    ...canonical,
    type: "PUBLIC",
    location: wizardVenue,
    logoAssetId: "22222222-2222-4222-8222-222222222222",
    logo: "https://fixture.invalid/public-logo.png",
  };
  await render(<Fixture groupId={canonical.id} />);
  await screen.findByTestId("group-name-input");
  expect(
    screen.getByText(
      "Public groups require a logo, verified venue and approval. Group type cannot be changed.",
    ),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: "Remove location" })).toBeNull();
  await press("Remove logo");
  await press("Submit for review");
  expect(screen.getByText("Choose a group logo.")).toBeVisible();
  expect(writes).toHaveLength(0);
});

it.each([403, 503])(
  "keeps denied/unavailable group details explicit and permits a deliberate retry (%s)",
  async (status) => {
    detailStatus = status;
    await render(<Fixture groupId={canonical.id} />);
    expect(await screen.findByText("Could not load group details")).toBeVisible();
    expect(screen.queryByTestId("group-name-input")).toBeNull();
    detailStatus = favoriteStatus = 200;
    await press("Try again");
    expect(await screen.findByTestId("group-name-input")).toHaveDisplayValue(canonical.name);
  },
);

it("does not expose the editor to a canonical non-manager despite successful detail loading", async () => {
  canonical = { ...canonical, canEdit: false, role: "accepted" };
  await render(<Fixture groupId={canonical.id} />);
  expect(await screen.findByText("Could not load group details")).toBeVisible();
  expect(screen.queryByTestId("group-name-input")).toBeNull();
  expect(writes).toHaveLength(0);
});

it("shows missing details as loading until the HTTP read resolves, without mounting an empty editable draft", async () => {
  let finish: (response: Response) => void = () => {};
  pendingDetail = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await render(<Fixture groupId={canonical.id} />);
  expect(screen.queryByText("Could not load group details")).toBeNull();
  expect(screen.queryByTestId("group-name-input")).toBeNull();
  await act(() => finish(json(canonical)));
  expect(await screen.findByTestId("group-name-input")).toHaveDisplayValue(canonical.name);
});

it("recovers a rejected creation from actual Query mutation state, preserving friends, venue, logo and correlation", async () => {
  const draft: CreateGroupVariables = {
    type: "PRIVATE",
    name: "Failed server name",
    invitedUserIds: ["friend-one"],
    location: wizardVenue,
    logoAssetId: "22222222-2222-4222-8222-222222222222",
    clientRequestId: "33333333-3333-4333-8333-333333333333",
    clientDraft: {
      name: "Recovered local name",
      logoPreview: "https://fixture.invalid/recovered-logo.png",
      friends: [
        {
          id: "friend-one",
          name: "Recovered Friend",
          username: "friend-one",
          email: null,
          avatarUrl: null,
        },
      ],
    },
  };
  const mutation = failedCreation(draft);
  await render(<Fixture draftId={String(mutation.mutationId)} />);
  expect(screen.getByTestId("group-name-input")).toHaveDisplayValue("Recovered local name");
  expect(screen.getByText("Recovered Friend")).toBeVisible();
  expect(screen.getByText(wizardVenue.name)).toBeVisible();
  await press("Create group");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].input).toMatchObject({
    name: "Recovered local name",
    location: wizardVenue,
    invitedUserIds: ["friend-one"],
    clientRequestId: draft.clientRequestId,
    logoAssetId: draft.logoAssetId,
  });
});

it.each(["missing", "pending"] as const)(
  "does not manufacture recoverable draft state for a %s mutation",
  async (kind) => {
    const mutation =
      kind === "pending"
        ? failedCreation(
            { type: "PRIVATE", name: "Pending local group", invitedUserIds: [] },
            "pending",
          )
        : undefined;
    await render(<Fixture draftId={mutation ? String(mutation.mutationId) : "missing-draft"} />);
    expect(screen.getByText("Could not recover draft")).toBeVisible();
    expect(screen.queryByTestId("group-name-input")).toBeNull();
    expect(writes).toHaveLength(0);
  },
);

it("leaves a rejected write observable through the actual feedback and mutation failure state", async () => {
  writeStatus = 400;
  await render(<Fixture />);
  await fireEvent.changeText(screen.getByTestId("group-name-input"), "Rejected local group");
  await press("Create group");
  await waitFor(() => expect(boundary.feedback.onError).toHaveBeenCalled());
  expect(
    client.getMutationCache().find({ mutationKey: groupRecordKeys.mutation(options, "", "create") })
      ?.state.status,
  ).toBe("error");
  expect(boundary.dismissTo).toHaveBeenCalledOnce();
});

it("retains invitations on an unchanged visibility choice and rejects matching late picker results after submission", async () => {
  await render(<Fixture />);
  await press("Add friend");
  const slot = await returnedFriend();
  await userEvent.setup().press(screen.getByRole("radio", { name: "Private" }));
  expect(screen.getByText("Friend One")).toBeVisible();
  await press("Add friend");
  expect(boundary.push.mock.calls.at(-1)?.[0].params).toMatchObject({
    slotId: slot,
    exclude: "friend-one",
  });
  await fireEvent.changeText(screen.getByTestId("group-name-input"), "Friends stay invited");
  await press("Create group");
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].input).toMatchObject({ type: "PRIVATE", invitedUserIds: ["friend-one"] });
  await returnedFriend("Late Friend", "late-friend", slot);
  expect(screen.queryByText("Late Friend")).toBeNull();
  expect(screen.getByText("Friend One")).toBeVisible();
  expect(useAppStore.getState().pendingUser).toBeNull();
  expect(screen.getByRole("radio", { name: "Public" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Add friend" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove invite: Friend One" })).toBeDisabled();
  const pushes = boundary.push.mock.calls.length;
  await press("Add friend");
  expect(boundary.push).toHaveBeenCalledTimes(pushes);
  expect(writes).toHaveLength(1);
});

it("blocks friend routing while the real system image picker is busy and restores it after cancellation", async () => {
  let cancel: ((result: { canceled: true; assets: null }) => void) | undefined;
  boundary.library.mockImplementation(
    () =>
      new Promise((resolve) => {
        cancel = resolve;
      }),
  );
  await render(<Fixture />);
  await press("Upload group logo");
  await press("Photo library");
  await waitFor(() => expect(boundary.library).toHaveBeenCalledOnce());
  expect(screen.getByRole("button", { name: "Add friend" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Create group" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Choose a location" })).toBeNull();
  expect(screen.getByText("Choose a location")).toBeVisible();
  await press("Add friend");
  expect(boundary.push).not.toHaveBeenCalled();
  expect(writes).toHaveLength(0);
  if (!cancel) throw new Error("Expected pending native image picker");
  await act(() => cancel?.({ canceled: true, assets: null }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Add friend" })).toBeEnabled());
  await press("Add friend");
  expect(boundary.push).toHaveBeenCalledOnce();
  expect(writes).toHaveLength(0);
});

it("restores the actual create/edit group header and native Back action after an inline picker merges its options", async () => {
  for (const edit of [false, true]) {
    resetNativeStackOptionsPort();
    const view = await render(<Fixture showHeader groupId={edit ? canonical.id : undefined} />);
    await screen.findByTestId("group-name-input");
    const title = edit ? "Edit group" : "New group";
    expect(screen.getByRole("header", { name: title })).toBeVisible();
    expect(headerPaths()).toContain("M18 21a8 8 0 0 0-16 0");
    await press("Choose a location");
    expect(screen.getByRole("header", { name: "Select location" })).toBeVisible();
    expect(headerPaths()).toContain(
      "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
    );
    const pickerBack = nativeStackOptionsSnapshot().headerLeft;
    if (!boundary.preventRemove) throw new Error("Expected inline native removal guard");
    await act(() => boundary.preventRemove?.());
    expect(screen.getByRole("header", { name: title })).toBeVisible();
    expect(headerPaths()).toContain("M18 21a8 8 0 0 0-16 0");
    expect(nativeStackOptionsSnapshot().headerBackVisible).toBe(false);
    expect(nativeStackOptionsSnapshot().headerLeft).not.toBe(pickerBack);
    await press("Back");
    expect(boundary.back).toHaveBeenCalledTimes(edit ? 2 : 1);
    expect(writes).toHaveLength(0);
    await view.unmount();
  }
});

it("opens the actual route as a new draft without querying an unowned group", async () => {
  await render(<Fixture params={{}} />);
  expect(screen.getByTestId("group-name-input")).toHaveDisplayValue("");
  expect(screen.getByRole("button", { name: "Create group" })).toBeEnabled();
});

it("normalizes repeated group IDs from the Expo query before loading the editable group", async () => {
  await render(<Fixture params={{ groupId: [canonical.id, "not-the-group"] }} />);
  expect(await screen.findByTestId("group-name-input")).toHaveDisplayValue(canonical.name);
  const paths = vi
    .mocked(fetch)
    .mock.calls.map(
      ([input]) =>
        new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
          .pathname,
    );
  expect(paths).toContain(`/api/groups/${canonical.id}`);
  expect(paths).not.toContain("/api/groups/not-the-group");
});

it("normalizes a repeated draft ID before restoring the matching rejected group creation", async () => {
  const mutation = failedCreation({
    type: "PRIVATE",
    name: "Recovered from route",
    invitedUserIds: [],
  });
  await render(<Fixture params={{ draftId: [String(mutation.mutationId), "missing-draft"] }} />);
  expect(screen.getByTestId("group-name-input")).toHaveDisplayValue("Recovered from route");
  expect(writes).toEqual([]);
});

it.each([
  { source: "preview", preview: "https://fixture.invalid/recovered-edit.png" },
  { source: "legacy receipt", preview: undefined },
])(
  "recovers the latest rejected group edit from $source without copying stale canonical logo state",
  async ({ preview }) => {
    const id = "22222222-2222-4222-8222-222222222222";
    const variables: EditGroupVariables = {
      id: canonical.id,
      input: { version: canonical.version, name: "Pending group revision", logoAssetId: id },
      ...(preview ? { clientDraft: { name: "Recovered pending name", logoPreview: preview } } : {}),
    };
    const rejected = new CommunityApiError(422, "Fixture original edit rejected");
    client.getMutationCache().build(
      client,
      { mutationKey: groupRecordKeys.mutation(options, canonical.id, "update") },
      {
        context: undefined,
        data: undefined,
        error: rejected,
        failureCount: 1,
        failureReason: rejected,
        isPaused: false,
        status: "error",
        submittedAt: Date.now(),
        variables,
      },
    );
    await render(<Fixture params={{ groupId: canonical.id }} />);
    expect(await screen.findByTestId("group-name-input")).toHaveDisplayValue(
      preview ? "Recovered pending name" : "Pending group revision",
    );
    expect(screen.getByRole("button", { name: "Change logo" })).toBeEnabled();
    expect(screen.queryByRole("image", { name: "No logo selected" })).toBeNull();
    expect(writes).toHaveLength(0);
    await press("Save changes");
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      method: "PATCH",
      path: `/api/groups/${canonical.id}`,
      input: { version: canonical.version, logoAssetId: id },
    });
  },
);

it("opens only the explicitly tapped map credit while an unconfigured map cannot add the draft venue", async () => {
  const external = vi.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  await render(<Fixture params={{}} />);
  await press("Choose a location");
  expect(screen.getByText("Map unavailable")).toBeVisible();
  expect(screen.getByRole("button", { name: "Confirm Location" })).toBeDisabled();
  expect(external).not.toHaveBeenCalled();
  const user = userEvent.setup();
  await user.press(screen.getByRole("link", { name: "Map by MapTiler" }));
  await user.press(screen.getByRole("link", { name: "© OpenStreetMap contributors" }));
  expect(external.mock.calls).toEqual([
    ["https://www.maptiler.com/"],
    ["https://www.openstreetmap.org/copyright"],
  ]);
  expect(writes).toHaveLength(0);
});

it("keeps an existing group venue editable when favorite status fails independently", async () => {
  favoriteStatus = 503;
  canonical = { ...canonical, location: wizardVenue };
  await render(<Fixture groupId={canonical.id} />);
  expect(await screen.findByText("Could not load favorite locations")).toHaveProp(
    "accessibilityRole",
    "alert",
  );
  expect(screen.getByText(wizardVenue.name)).toBeVisible();
  expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  expect(writes).toEqual([]);
  await press("Remove location");
  expect(screen.queryByText(wizardVenue.name)).toBeNull();
  expect(screen.getByRole("button", { name: "Choose a location" })).toBeEnabled();
});

it.each(["canonical", "recovered"] as const)(
  "retains the %s owned upload without fabricating a missing image preview",
  async (source) => {
    const logoAssetId = "22222222-2222-4222-8222-222222222222";
    if (source === "canonical") {
      canonical = { ...canonical, logoAssetId, logo: null };
      await render(<Fixture groupId={canonical.id} />);
    } else {
      const draft = failedCreation({
        type: "PRIVATE",
        name: "Legacy upload draft",
        invitedUserIds: [],
        logoAssetId,
      });
      await render(<Fixture draftId={String(draft.mutationId)} />);
    }
    const action = source === "canonical" ? "Save changes" : "Create group";
    expect(await screen.findByRole("button", { name: "Change logo" })).toBeEnabled();
    expect(screen.queryByRole("image", { name: "No logo selected" })).toBeNull();
    expect(writes).toEqual([]);
    await press(action);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].input.logoAssetId).toBe(logoAssetId);
  },
);

it("displays the accepted contact picked without a public username and keeps it removable", async () => {
  await render(<Fixture />);
  await press("Add friend");
  const slot = boundary.push.mock.lastCall?.[0].params.slotId;
  await act(() =>
    useAppStore.getState().setPendingUser(slot, {
      id: "no-public-handle",
      name: "Private friend",
      username: null,
      avatarUrl: null,
      email: null,
    }),
  );
  expect(screen.getByText("Private friend")).toBeVisible();
  expect(screen.queryByText("@no-public-handle")).toBeNull();
  await press("Remove invite: Private friend");
  expect(screen.queryByText("Private friend")).toBeNull();
  expect(writes).toEqual([]);
});
