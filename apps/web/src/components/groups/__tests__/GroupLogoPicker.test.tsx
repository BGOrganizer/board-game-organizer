import type { CommunityApiOptions } from "@board-game-organizer/shared";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { GroupLogoPicker } from "../GroupLogoPicker";

const m = vi.hoisted(() => ({
  upload: vi.fn(),
  change: vi.fn(),
  busy: vi.fn(),
  options: {} as CommunityApiOptions,
}));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => m.options }));
vi.mock("@board-game-organizer/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@board-game-organizer/shared")>()),
  uploadGroupLogo: m.upload,
}));
const ready = { id: "11111111-1111-4111-8111-111111111111", preview: "data:image/png;base64,AAAA" };
function Harness({
  required = false,
  disabled = false,
  initial = null,
}: {
  required?: boolean;
  disabled?: boolean;
  initial?: typeof ready | null;
}) {
  const [value, setValue] = useState(initial);
  return (
    <GroupLogoPicker
      value={value}
      required={required}
      disabled={disabled}
      onChange={(next) => {
        m.change(next);
        setValue(next);
      }}
      onBusyChange={m.busy}
    />
  );
}
function file(type = "image/png", size = 3) {
  const f = new File([new Uint8Array(size)], "logo.png", { type });
  Object.defineProperty(f, "arrayBuffer", { value: async () => new Uint8Array(size).buffer });
  return f;
}
function select(container: HTMLElement, files: File[]) {
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files } });
}
beforeEach(() => {
  vi.resetAllMocks();
  m.options = {
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
    feedback: { onSuccess: vi.fn(), onError: vi.fn() },
  };
  m.upload.mockResolvedValue(ready);
});
it.each([false, true])(
  "shows placeholder/hint, uploads, changes and removes a logo even when required=%s",
  async (required) => {
    const q = renderWithI18n(<Harness required={required} />);
    expect(screen.getByRole("img", { name: "No logo selected" })).not.toBeNull();
    expect(screen.getByText("JPEG, PNG or WebP, up to 5 MB.")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Group logo: Field help/ })).toBeNull();
    const input = q.container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Upload group logo" }));
    expect(click).toHaveBeenCalledOnce();
    select(q.container, []);
    expect(m.upload).not.toHaveBeenCalled();
    select(q.container, [file()]);
    expect(await screen.findByRole("img", { name: "Group logo" })).not.toBeNull();
    expect(m.upload).toHaveBeenCalledOnce();
    expect(m.options.feedback?.onSuccess).toHaveBeenCalledWith("upload_group_logo");
    expect(input.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Change logo" }));
    expect(click).toHaveBeenCalledTimes(2);
    select(q.container, [file()]);
    await waitFor(() => expect(m.upload).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(m.busy).toHaveBeenLastCalledWith(false));
    fireEvent.click(screen.getByRole("button", { name: "Remove logo" }));
    expect(m.change).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("img", { name: "No logo selected" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Upload group logo" })).not.toBeNull();
  },
);
it.each([file("image/gif"), file("image/png", 5 * 1024 * 1024 + 1)])(
  "rejects unsupported MIME/oversize before upload, preserving an existing logo",
  async (invalid) => {
    const q = renderWithI18n(<Harness initial={ready} />);
    select(q.container, [invalid]);
    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(m.upload).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: "Group logo" }).getAttribute("src")).toBe(ready.preview);
    fireEvent.click(screen.getByRole("button", { name: "Remove logo" }));
    expect(screen.queryByRole("alert")).toBeNull();
  },
);
it.each([new Error("offline"), "offline"])(
  "retains error feedback and allows retry on upload failure %s",
  async (failure) => {
    m.upload.mockRejectedValueOnce(failure);
    const q = renderWithI18n(<Harness />);
    select(q.container, [file()]);
    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(m.options.feedback?.onError).toHaveBeenCalledWith(
      expect.any(Error),
      "upload_group_logo",
    );
    select(q.container, [file()]);
    expect(await screen.findByRole("img", { name: "Group logo" })).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  },
);
it("does not accept a manually dispatched file while disabled", () => {
  const q = renderWithI18n(<Harness disabled />);
  select(q.container, [file()]);
  expect(m.upload).not.toHaveBeenCalled();
  expect(
    (screen.getByRole("button", { name: "Upload group logo" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
it.each(["resolve", "reject"] as const)(
  "cancels busy work on unmount and rejects a late %s callback",
  async (result) => {
    let resolve!: (value: typeof ready) => void, reject!: (reason: Error) => void;
    m.upload.mockReturnValue(
      new Promise((done, fail) => {
        resolve = done;
        reject = fail;
      }),
    );
    const q = renderWithI18n(<Harness />);
    select(q.container, [file()]);
    await waitFor(() => expect(m.upload).toHaveBeenCalledOnce());
    expect(q.container.querySelector(".skeleton")).not.toBeNull();
    select(q.container, [file()]);
    expect(m.upload).toHaveBeenCalledOnce();
    const signal = m.upload.mock.calls[0][3] as AbortSignal;
    q.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => (result === "resolve" ? resolve(ready) : reject(new Error("late"))));
    expect(m.change).not.toHaveBeenCalled();
    expect(m.options.feedback?.onError).not.toHaveBeenCalled();
    expect(m.busy).toHaveBeenLastCalledWith(false);
  },
);
it("retains usable imagery during replacement and works without optional feedback handlers", async () => {
  m.options = { ...m.options, feedback: undefined };
  const q = renderWithI18n(<Harness initial={ready} />);
  select(q.container, [file()]);
  expect(screen.getByRole("img", { name: "Group logo" })).not.toBeNull();
  await waitFor(() => expect(m.upload).toHaveBeenCalledOnce());
  await waitFor(() => expect(m.busy).toHaveBeenLastCalledWith(false));
  m.upload.mockRejectedValueOnce(new Error("failed replacement"));
  select(q.container, [file()]);
  expect(await screen.findByRole("alert")).not.toBeNull();
  expect(screen.getByRole("img", { name: "Group logo" })).not.toBeNull();
});
