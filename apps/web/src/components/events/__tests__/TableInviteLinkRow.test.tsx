import type { InviteRow } from "@board-game-organizer/shared";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { TableInviteLinkRow } from "../TableInviteLinkRow";

const state = vi.hoisted(() => ({
  data: undefined as InviteRow | undefined,
  isPending: false,
  isError: false,
  mutate: vi.fn(),
  useInvites: vi.fn(),
  getToken: vi.fn(),
}));
vi.mock("@board-game-organizer/shared", () => ({
  useInvites: (options: unknown) => {
    state.useInvites(options);
    return state;
  },
}));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: state.getToken,
    protectionBypass: "bypass",
  }),
}));
beforeEach(() => {
  state.data = undefined;
  state.isPending = false;
  state.isError = false;
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn() },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
const link = "https://api.test/invite/abcdefghijklmnopqrstuv";
function mount(disabled = false) {
  return renderWithI18n(
    <ul>
      <TableInviteLinkRow tableId="table-id" disabled={disabled} />
    </ul>,
  );
}
it("generates a contextual link using the shared fresh-token options", () => {
  mount();
  expect(state.useInvites).toHaveBeenCalledWith(
    expect.objectContaining({
      tableId: "table-id",
      token: null,
      apiUrl: "https://api.test",
      protectionBypass: "bypass",
      getToken: state.getToken,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Generate invite" }));
  expect(state.mutate).toHaveBeenCalledOnce();
});
it.each(["pending", "disabled"])("does not generate while %s", (mode) => {
  state.isPending = mode === "pending";
  mount(mode === "disabled");
  const button = screen.getByRole("button", { name: "Generate invite" });
  expect(button.hasAttribute("disabled")).toBe(true);
  fireEvent.click(button);
  expect(state.mutate).not.toHaveBeenCalled();
  if (mode === "pending")
    expect(screen.getByRole("status", { name: "Creating invite" })).toBeTruthy();
});
it("retains the row and retry action after a creation failure", () => {
  state.isError = true;
  mount();
  expect(screen.getByRole("alert").textContent).toContain(
    "Could not create the invite. Try again.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Generate invite" }));
  expect(state.mutate).toHaveBeenCalledOnce();
});
it("keeps the existing link visible during regeneration", () => {
  state.data = { token: "token", link, email: null, expiresAt: "2030-06-01" };
  state.isPending = true;
  mount();
  expect(screen.getByText(link)).toBeTruthy();
  expect(screen.queryByRole("status", { name: "Creating invite" })).toBeNull();
});
it("copies the complete link and resets copied feedback", async () => {
  vi.useFakeTimers();
  state.data = { token: "token", link, email: null, expiresAt: "2030-06-01" };
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);
  mount();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy" })));
  expect(writeText).toHaveBeenCalledWith(link);
  expect(screen.getByRole("button", { name: "Copied!" })).toBeTruthy();
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy" })));
  fireEvent.click(screen.getByRole("button", { name: "Generate invite" }));
  expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
});
it("leaves the complete link available when clipboard access fails", async () => {
  state.data = { token: "token", link, email: null, expiresAt: "2030-06-01" };
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("blocked"));
  mount();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Copy" })));
  expect(screen.getByText(link)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Copied!" })).toBeNull();
});
