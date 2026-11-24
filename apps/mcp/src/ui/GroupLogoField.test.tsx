// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { File } from "node:buffer";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GROUP_LOGO_CHUNK_BYTES } from "@board-game-organizer/schemas";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GroupLogoField } from "./GroupLogoField";

const i18n = setupI18n({ locale: "en" });
const assetId = "630553c1-45fe-4851-bf2f-8ba157b52a63";
const callServerTool = vi.fn<App["callServerTool"]>();
const app = { callServerTool } as unknown as App;
const changed = vi.fn<(value: string | null) => void>();
const pending = vi.fn<(value: boolean) => void>();

function LogoFixture({ initial, disabled }: { initial: string | null; disabled: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <I18nProvider i18n={i18n}>
      <GroupLogoField
        app={app}
        value={value}
        onChange={(id) => {
          changed(id);
          setValue(id);
        }}
        onPendingChange={pending}
        required
        disabled={disabled}
      />
    </I18nProvider>
  );
}

function show(initial: string | null = null, disabled = false) {
  return render(<LogoFixture initial={initial} disabled={disabled} />);
}

function response(operation: string, data: unknown) {
  return { content: [], structuredContent: { operation, data } };
}

function logoBytes() {
  return readFileSync(resolve("../mobile/assets/adaptive-icon-foreground.png"));
}

beforeEach(() => {
  vi.clearAllMocks();
  callServerTool.mockReset();
});
afterEach(() => cleanup());

it("opens the native chooser and sends every exact chunk before making a completed logo removable", async () => {
  const bytes = logoBytes();
  const file = new File([new Uint8Array(bytes)], "club.png", { type: "image/png" });
  const gate = Promise.withResolvers<Awaited<ReturnType<App["callServerTool"]>>>();
  callServerTool.mockImplementation(({ name }) => {
    if (name === "start_group_logo") return gate.promise;
    return Promise.resolve(response(name, name === "complete_group_logo" ? { id: assetId } : {}));
  });
  show();
  const input = screen.getByLabelText<HTMLInputElement>(/^Group logo/);
  const chooser = vi.spyOn(input, "click");
  fireEvent.click(screen.getByRole("button", { name: "Upload group logo" }));
  expect(chooser).toHaveBeenCalledOnce();
  fireEvent.change(input, { target: { files: [] } });
  expect(callServerTool).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { files: [file] } });
  expect(await screen.findByLabelText("Loading…")).toBeVisible();
  expect(screen.getByRole("button", { name: "Upload group logo" })).toBeDisabled();
  expect(input).toBeDisabled();
  fireEvent.change(input, { target: { files: [file] } });
  expect(callServerTool).toHaveBeenCalledTimes(1);
  expect(changed).not.toHaveBeenCalled();
  expect(pending.mock.calls).toEqual([[true]]);
  gate.resolve(response("start_group_logo", { id: assetId }));
  expect(await screen.findByText("club.png")).toBeVisible();
  expect(changed).toHaveBeenCalledExactlyOnceWith(assetId);
  expect(pending.mock.calls).toEqual([[true], [false]]);

  const expected = [];
  for (let offset = 0; offset < bytes.length; offset += GROUP_LOGO_CHUNK_BYTES) {
    expected.push({
      name: "upload_group_logo_chunk",
      arguments: {
        params: { assetId },
        body: {
          offset,
          base64: bytes.subarray(offset, offset + GROUP_LOGO_CHUNK_BYTES).toString("base64"),
        },
      },
    });
  }
  expect(expected.length).toBeGreaterThan(1);
  expect(callServerTool.mock.calls.map(([request]) => request)).toEqual([
    {
      name: "start_group_logo",
      arguments: { body: { mimeType: "image/png", byteLength: bytes.length } },
    },
    ...expected,
    { name: "complete_group_logo", arguments: { params: { assetId } } },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Remove logo" }));
  expect(changed).toHaveBeenLastCalledWith(null);
  expect(screen.queryByText("club.png")).toBeNull();
  expect(screen.queryByRole("button", { name: "Remove logo" })).toBeNull();
});

it("does not replace a saved logo when a chunk is denied", async () => {
  const file = new File([new Uint8Array(logoBytes())], "replacement.png", { type: "image/png" });
  callServerTool
    .mockResolvedValueOnce(response("start_group_logo", { id: assetId }))
    .mockResolvedValueOnce({ content: [], isError: true, structuredContent: { status: 403 } });
  show("0edca611-a61e-4520-a596-da69df0c2796");
  fireEvent.change(screen.getByLabelText(/^Group logo/), { target: { files: [file] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not upload logo");
  expect(changed).not.toHaveBeenCalled();
  expect(pending.mock.calls).toEqual([[true], [false]]);
  expect(callServerTool.mock.calls.map(([request]) => request.name)).toEqual([
    "start_group_logo",
    "upload_group_logo_chunk",
  ]);
  expect(screen.getByRole("button", { name: "Remove logo" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Upload group logo" })).toBeEnabled();
});

it("keeps existing logos immutable while the owning form is disabled", () => {
  show(assetId, true);
  expect(screen.getByRole("button", { name: "Upload group logo" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove logo" })).toBeDisabled();
  expect(screen.getByLabelText(/^Group logo/)).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/^Group logo/), {
    target: {
      files: [new File([new Uint8Array(logoBytes())], "replacement.png", { type: "image/png" })],
    },
  });
  expect(callServerTool).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
});
