import { GROUP_LOGO_MAX_BYTES } from "@board-game-organizer/schemas";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { ComponentProps } from "react";
import { useState } from "react";
import { AppState, type AppStateStatus, Linking } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { GroupLogoPicker } from "../GroupLogoPicker";

const API = "https://group-logo-fixtures.test";
const assetId = "11111111-1111-4111-8111-111111111111";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ6cAAAAASUVORK5CYII=";
type PickerResult = { canceled: boolean; assets: { base64?: string | null }[] };
const boundary = vi.hoisted(() => ({
  getToken: vi.fn(),
  permissions: vi.fn(),
  requestPermission: vi.fn(),
  camera: vi.fn(),
  library: vi.fn(),
  permission: { granted: false, canAskAgain: true },
  grantOnRequest: false,
  feedback: { onSuccess: vi.fn(), onError: vi.fn() },
}));
const options = {
  apiUrl: API,
  userId: "owner",
  getToken: boundary.getToken,
  enabled: true,
  feedback: boundary.feedback,
};
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => options }));
vi.mock("expo-image-picker", () => ({
  getCameraPermissionsAsync: boundary.permissions,
  requestCameraPermissionsAsync: boundary.requestPermission,
  launchCameraAsync: boundary.camera,
  launchImageLibraryAsync: boundary.library,
}));
let result: PickerResult;
let failurePath: "start" | "chunk" | "complete" | null;
let pendingImage: Promise<PickerResult> | undefined;
let pendingUpload: Promise<Response> | undefined;
let signal: AbortSignal | null | undefined;
const writes: {
  path: string;
  method: string;
  authorization: string | null;
  mimeType?: string;
  byteLength?: number;
  offset?: number;
}[] = [];
const listeners = new Set<(state: AppStateStatus) => void>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const noop = () => {};
beforeEach(() => {
  vi.clearAllMocks();
  boundary.permission = { granted: false, canAskAgain: true };
  boundary.grantOnRequest = false;
  boundary.getToken.mockResolvedValue("fixture-logo-token");
  boundary.permissions.mockImplementation(async () => boundary.permission);
  boundary.requestPermission.mockImplementation(async () => {
    boundary.permission = { granted: boundary.grantOnRequest, canAskAgain: true };
    return boundary.permission;
  });
  boundary.camera.mockImplementation(async () => pendingImage ?? result);
  boundary.library.mockImplementation(async () => pendingImage ?? result);
  result = { canceled: false, assets: [{ base64: png }] };
  pendingImage = undefined;
  pendingUpload = undefined;
  signal = undefined;
  failurePath = null;
  writes.length = 0;
  listeners.clear();
  vi.spyOn(AppState, "addEventListener").mockImplementation((type, listener) => {
    const callback = listener as (state: AppStateStatus) => void;
    if (type === "change") listeners.add(callback);
    return {
      remove: () => {
        listeners.delete(callback);
      },
    };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.origin !== API || !url.pathname.startsWith("/api/group-assets"))
        throw new Error(`Unexpected fixture request: ${url.origin}${url.pathname}`);
      const body = JSON.parse(String(init?.body ?? "{}"));
      const stage = url.pathname.endsWith("/complete")
        ? "complete"
        : init?.method === "PATCH"
          ? "chunk"
          : "start";
      writes.push({
        path: url.pathname,
        method: init?.method ?? "GET",
        authorization: new Headers(init?.headers).get("authorization"),
        mimeType: body.mimeType,
        byteLength: body.byteLength,
        offset: body.offset,
      });
      signal = init?.signal;
      if (pendingUpload) return pendingUpload;
      if (failurePath === stage) return json({ error: "Fixture asset unavailable" }, 503);
      return json(
        stage === "complete"
          ? { id: assetId, preview: `data:image/png;base64,${png}` }
          : { id: assetId },
      );
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Fixture({
  value: initial = null,
  onChange = noop,
  onBusyChange = noop,
  ...props
}: Partial<ComponentProps<typeof GroupLogoPicker>>) {
  const [value, setValue] = useState(initial);
  return (
    <NativeTestProviders>
      <GroupLogoPicker
        value={value}
        required={false}
        disabled={false}
        {...props}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
        onBusyChange={onBusyChange}
      />
    </NativeTestProviders>
  );
}
async function press(name: string) {
  await userEvent.setup().press(await screen.findByRole("button", { name }));
}
async function choose(source = "Photo library") {
  await press(
    screen.queryByRole("button", { name: "Change logo" }) ? "Change logo" : "Upload group logo",
  );
  await press(source);
}
async function foreground() {
  await act(async () => {
    for (const listener of listeners) listener("active");
  });
}

it("keeps the real logo placeholder, required marker and permanent file constraints visible without requesting permissions", async () => {
  await render(<Fixture required />);
  expect(screen.getByRole("image", { name: "No logo selected" })).toBeVisible();
  expect(screen.getByText("Group logo *")).toBeVisible();
  expect(screen.getByText("JPEG, PNG or WebP, up to 5 MB.")).toBeVisible();
  expect(boundary.permissions).not.toHaveBeenCalled();
  expect(boundary.requestPermission).not.toHaveBeenCalled();
  expect(writes).toHaveLength(0);
});

it("cancels the real source chooser without opening native media pickers or starting an upload", async () => {
  const busy = vi.fn();
  await render(<Fixture onBusyChange={busy} />);
  await press("Upload group logo");
  await press("Cancel");
  expect(boundary.library).not.toHaveBeenCalled();
  expect(boundary.camera).not.toHaveBeenCalled();
  expect(busy).not.toHaveBeenCalledWith(true);
  expect(writes).toHaveLength(0);
});

it("uploads a selected PNG through the actual shared chunk protocol with fresh credentials and canonical preview", async () => {
  const change = vi.fn(),
    busy = vi.fn();
  boundary.getToken
    .mockResolvedValueOnce("start-token")
    .mockResolvedValueOnce("chunk-token")
    .mockResolvedValueOnce("complete-token");
  await render(<Fixture onChange={change} onBusyChange={busy} />);
  await choose();
  await waitFor(() =>
    expect(change).toHaveBeenCalledExactlyOnceWith({
      id: assetId,
      preview: `data:image/png;base64,${png}`,
    }),
  );
  expect(writes.map((write) => [write.method, write.path, write.authorization])).toEqual([
    ["POST", "/api/group-assets", "Bearer start-token"],
    ["PATCH", `/api/group-assets/${assetId}`, "Bearer chunk-token"],
    ["POST", `/api/group-assets/${assetId}/complete`, "Bearer complete-token"],
  ]);
  expect(writes[0]).toMatchObject({ mimeType: "image/png", byteLength: atob(png).length });
  expect(writes[1].offset).toBe(0);
  expect(boundary.library).toHaveBeenCalledWith(
    expect.objectContaining({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      allowsEditing: false,
      base64: true,
      exif: false,
    }),
  );
  expect(boundary.requestPermission).not.toHaveBeenCalled();
  expect(boundary.feedback.onSuccess).toHaveBeenCalledWith("upload_group_logo");
  expect(busy).toHaveBeenCalledWith(true);
  expect(busy).toHaveBeenLastCalledWith(false);
  expect(screen.getByRole("button", { name: "Change logo" })).toBeEnabled();
});

it("requests camera permission explicitly and rereads the resulting OS state before capture", async () => {
  boundary.grantOnRequest = true;
  const change = vi.fn();
  await render(<Fixture onChange={change} />);
  await choose("Camera");
  await waitFor(() => expect(change).toHaveBeenCalledOnce());
  expect(boundary.requestPermission).toHaveBeenCalledOnce();
  expect(boundary.permissions.mock.calls.length).toBeGreaterThanOrEqual(3);
  expect(boundary.camera).toHaveBeenCalledWith(
    expect.objectContaining({ allowsEditing: true, aspect: [1, 1], base64: true }),
  );
  expect(boundary.library).not.toHaveBeenCalled();
});

it("keeps denied capture observable, offers settings only after permanent denial, and refreshes on return", async () => {
  boundary.permission = { granted: false, canAskAgain: false };
  const settings = vi
    .spyOn(Linking, "openSettings")
    .mockRejectedValue(new Error("Fixture settings unavailable"));
  await render(<Fixture />);
  await choose("Camera");
  expect(await screen.findByText("Camera permission is required")).toBeVisible();
  expect(boundary.requestPermission).not.toHaveBeenCalled();
  expect(boundary.camera).not.toHaveBeenCalled();
  expect(writes).toHaveLength(0);
  await press("Open settings");
  expect(await screen.findByText("Could not open settings")).toBeVisible();
  expect(settings).toHaveBeenCalledOnce();
  boundary.permission = { granted: true, canAskAgain: true };
  await foreground();
  await waitFor(() => expect(screen.queryByRole("button", { name: "Open settings" })).toBeNull());
});

it("reports failed foreground permission reads without opening a picker or uploading", async () => {
  await render(<Fixture />);
  boundary.permissions.mockRejectedValueOnce(new Error("Fixture permission read unavailable"));
  await foreground();
  expect(await screen.findByText("Could not read photo permissions")).toBeVisible();
  expect(boundary.camera).not.toHaveBeenCalled();
  expect(writes).toHaveLength(0);
});

it.each(["Camera", "Photo library"])(
  "treats a cancelled native %s picker as cancellation rather than a failed upload",
  async (source) => {
    boundary.permission = { granted: true, canAskAgain: true };
    result = { canceled: true, assets: [] };
    const change = vi.fn(),
      busy = vi.fn();
    await render(<Fixture onChange={change} onBusyChange={busy} />);
    await choose(source);
    await waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
    expect(change).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
    expect(screen.queryByText("Could not upload logo")).toBeNull();
  },
);

it.each(["missing-data", "invalid-mime", "oversize"] as const)(
  "rejects %s media before starting any asset request",
  async (kind) => {
    result = {
      canceled: false,
      assets: [
        {
          base64:
            kind === "missing-data"
              ? null
              : kind === "invalid-mime"
                ? btoa("This is not an allowed image")
                : `iVBOR${"A".repeat(Math.ceil(GROUP_LOGO_MAX_BYTES / 3) * 4)}`,
        },
      ],
    };
    const change = vi.fn();
    await render(<Fixture onChange={change} />);
    await choose();
    expect(await screen.findByText("Could not upload logo")).toBeVisible();
    expect(change).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
    expect(boundary.feedback.onError).toHaveBeenCalledWith(expect.any(Error), "upload_group_logo");
  },
);

it.each(["start", "chunk", "complete"] as const)(
  "preserves an upload failure at %s and retries through the actual shared protocol",
  async (stage) => {
    failurePath = stage;
    const change = vi.fn();
    await render(<Fixture onChange={change} />);
    await choose();
    expect(await screen.findByText("Could not upload logo")).toBeVisible();
    expect(change).not.toHaveBeenCalled();
    failurePath = null;
    await choose();
    await waitFor(() => expect(change).toHaveBeenCalledOnce());
    expect(screen.queryByText("Could not upload logo")).toBeNull();
  },
);

it.each([
  { base64: "/9j/", mimeType: "image/jpeg" },
  { base64: "UklGRg==", mimeType: "image/webp" },
])(
  "recognizes a $mimeType candidate signature before delegating its bytes to asset validation",
  async ({ base64, mimeType }) => {
    // Candidate headers exercise client MIME detection only. The external API
    // rejects allocation here; these are not claimed to be decodable images.
    result = { canceled: false, assets: [{ base64 }] };
    failurePath = "start";
    await render(<Fixture />);
    await choose();
    expect(await screen.findByText("Could not upload logo")).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0].mimeType).toBe(mimeType);
  },
);

it("allows removal of an existing logo even for required drafts and leaves validation to the owning form", async () => {
  const change = vi.fn();
  await render(
    <Fixture
      required
      value={{ id: assetId, preview: `data:image/png;base64,${png}` }}
      onChange={change}
    />,
  );
  expect(screen.getByRole("button", { name: "Change logo" })).toBeVisible();
  await press("Remove logo");
  expect(change).toHaveBeenCalledExactlyOnceWith(null);
  expect(screen.getByRole("image", { name: "No logo selected" })).toBeVisible();
  expect(writes).toHaveLength(0);
});

it("blocks disabled uploads/removal and keeps duplicate upload actions disabled while a real request is pending", async () => {
  const change = vi.fn(),
    busy = vi.fn();
  const view = await render(
    <Fixture
      disabled
      value={{ id: assetId, preview: `data:image/png;base64,${png}` }}
      onChange={change}
      onBusyChange={busy}
    />,
  );
  expect(screen.getByRole("button", { name: "Change logo" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove logo" })).toBeDisabled();
  await press("Remove logo");
  expect(change).not.toHaveBeenCalled();
  let finish: (response: Response) => void = () => {};
  pendingUpload = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  await view.rerender(
    <Fixture
      value={{ id: assetId, preview: `data:image/png;base64,${png}` }}
      onChange={change}
      onBusyChange={busy}
    />,
  );
  await choose();
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(screen.getByRole("button", { name: "Change logo" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove logo" })).toBeDisabled();
  pendingUpload = undefined;
  await act(() => finish(json({ id: assetId })));
  await waitFor(() => expect(change).toHaveBeenCalledOnce());
});

it("aborts an in-flight upload on unmount and ignores the late native/API result", async () => {
  const change = vi.fn(),
    busy = vi.fn();
  let finish: (response: Response) => void = () => {};
  pendingUpload = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const view = await render(<Fixture onChange={change} onBusyChange={busy} />);
  await choose();
  await waitFor(() => expect(writes).toHaveLength(1));
  await view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(() => finish(json({ id: assetId })));
  expect(change).not.toHaveBeenCalled();
  expect(boundary.feedback.onSuccess).not.toHaveBeenCalled();
  expect(busy).toHaveBeenLastCalledWith(false);
  expect(listeners.size).toBe(0);
});

it("ignores a native media-picker result delivered after its owning component has unmounted", async () => {
  const change = vi.fn(),
    busy = vi.fn();
  let finish: (value: PickerResult) => void = () => {};
  pendingImage = new Promise<PickerResult>((resolve) => {
    finish = resolve;
  });
  const view = await render(<Fixture onChange={change} onBusyChange={busy} />);
  await choose();
  expect(boundary.library).toHaveBeenCalledOnce();
  await view.unmount();
  await act(() => finish(result));
  expect(writes).toHaveLength(0);
  expect(change).not.toHaveBeenCalled();
  expect(boundary.feedback.onError).not.toHaveBeenCalled();
  expect(busy).toHaveBeenLastCalledWith(false);
});
