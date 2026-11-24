// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { MatchLocation } from "@board-game-organizer/schemas";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import type { App } from "@modelcontextprotocol/ext-apps";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GroupVenuePicker } from "./GroupVenuePicker";

const i18n = setupI18n({ locale: "en" });
const callServerTool = vi.fn<App["callServerTool"]>();
const app = { callServerTool } as unknown as App;
const changed = vi.fn<(value: MatchLocation | null) => void>();
const short = {
  id: "address.001",
  address: "Po, Italy",
  longitude: 12.5,
  latitude: 41.9,
  timeZone: "Europe/Rome",
};
const nearby = { ...short, id: "address.002", address: "Via Roma 1, Rome, Italy" };

function VenueFixture({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState<MatchLocation | null>(null);
  return (
    <I18nProvider i18n={i18n}>
      <GroupVenuePicker
        app={app}
        value={value}
        onChange={(location) => {
          changed(location);
          setValue(location);
        }}
        required={false}
        disabled={disabled}
      />
    </I18nProvider>
  );
}
function response(items: Array<typeof short>) {
  return {
    content: [],
    structuredContent: { operation: "search_locations", data: { items } },
  };
}

beforeEach(() => {
  changed.mockReset();
  callServerTool.mockReset();
});
afterEach(() => cleanup());

it("ignores short searches and does not paint a failure after a cancelled search", async () => {
  const stale = Promise.withResolvers<Awaited<ReturnType<App["callServerTool"]>>>();
  callServerTool.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(response([nearby]));
  render(<VenueFixture />);
  const input = screen.getByRole("textbox", { name: "Group venue" });
  fireEvent.change(input, { target: { value: "  Ro " } });
  expect(screen.queryByLabelText("Loading…")).toBeNull();
  expect(callServerTool).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "  Road " } });
  expect(screen.getByLabelText("Loading…")).toBeVisible();
  await waitFor(() => expect(callServerTool).toHaveBeenCalledTimes(1));
  expect(callServerTool).toHaveBeenLastCalledWith(
    { name: "search_locations", arguments: { query: { query: "Road" } } },
    { signal: expect.any(AbortSignal) },
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(input).toHaveValue("");
  expect(callServerTool.mock.calls[0][1]?.signal?.aborted).toBe(true);
  await act(async () => stale.reject(new DOMException("Cancelled venue search", "AbortError")));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button", { name: short.address })).toBeNull();
  fireEvent.change(input, { target: { value: "Via Roma" } });
  expect(await screen.findByRole("button", { name: nearby.address })).toBeVisible();
  expect(screen.queryByRole("button", { name: short.address })).toBeNull();
  expect(changed).not.toHaveBeenCalled();
});

it("requires a name for a verified short address and lets the user remove the location", async () => {
  callServerTool.mockResolvedValueOnce(response([short]));
  const view = render(<VenueFixture />);
  fireEvent.change(screen.getByRole("textbox", { name: "Group venue" }), {
    target: { value: "Po Italy" },
  });
  const location = await screen.findByRole("button", { name: short.address });
  view.rerender(<VenueFixture disabled />);
  fireEvent.click(location);
  expect(changed).not.toHaveBeenCalled();
  view.rerender(<VenueFixture />);
  fireEvent.click(location);
  const name = screen.getByRole("textbox", { name: "Location name" });
  expect(name).toHaveValue("");
  expect(name).toBeRequired();
  expect(changed).toHaveBeenCalledExactlyOnceWith({
    ...short,
    id: expect.stringMatching(/^[a-f0-9-]{36}$/),
    name: "",
  });
  fireEvent.change(name, { target: { value: "Club venue" } });
  expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Club venue" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove location" }));
  expect(changed).toHaveBeenLastCalledWith(null);
  expect(screen.getByRole("textbox", { name: "Group venue" })).toHaveValue("");
});
