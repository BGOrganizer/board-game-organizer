import type { PlannedEventResponse } from "@board-game-organizer/schemas";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { plannedEvent } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { EventFinalizeAction } from "../EventFinalizeAction";

const m = vi.hoisted(() => ({
  busy: false,
  failed: false,
  mutate: vi.fn(),
  user: "owner",
  phase: undefined as "verifying" | undefined,
}));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useClientMutationDraft: () => (m.phase ? { phase: m.phase } : undefined),
  useEventRecordActions: () => ({
    busy: m.busy,
    finalize: { isError: m.failed, mutate: m.mutate },
  }),
}));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => ({ userId: m.user }) }));
const event = (): PlannedEventResponse => ({
  ...plannedEvent,
  status: "CONFIRMED",
  canFinalize: true,
  resultsReady: true,
});
beforeEach(() => {
  m.busy = false;
  m.failed = false;
  m.phase = undefined;
  m.user = "owner";
  m.mutate.mockReset();
});
it("confirms whole-event finalization in the header without sending scores from the client", () => {
  m.mutate.mockImplementation((_input, options) => options.onSuccess());
  renderWithI18n(<EventFinalizeAction event={event()} />);
  fireEvent.click(screen.getByRole("button", { name: "Finalize event" }));
  expect(screen.getByRole("dialog").textContent).toContain("immutable together");
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Finalize event" }),
  );
  expect(m.mutate).toHaveBeenCalledWith({ version: 1 }, expect.any(Object));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("prevents repeated finalization before pending state renders and permits only an explicit settled retry", () => {
  renderWithI18n(<EventFinalizeAction event={event()} />);
  fireEvent.click(screen.getByRole("button", { name: "Finalize event" }));
  const submit = within(screen.getByRole("dialog")).getByRole("button", { name: "Finalize event" });
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(m.mutate).toHaveBeenCalledOnce();
  m.mutate.mock.calls[0][1].onSettled();
  fireEvent.click(submit);
  expect(m.mutate).toHaveBeenCalledTimes(2);
});
it("shows verification without replay or claiming failed finalization", () => {
  const view = renderWithI18n(<EventFinalizeAction event={event()} />);
  fireEvent.click(screen.getByRole("button", { name: "Finalize event" }));
  m.phase = "verifying";
  m.failed = true;
  view.rerender(<EventFinalizeAction event={event()} />);
  expect(screen.getByRole("status").textContent).toBe("Checking saved changes");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(
    within(screen.getByRole("dialog")).queryByRole("button", { name: "Finalize event" }),
  ).toBeNull();
  expect(m.mutate).not.toHaveBeenCalled();
});
it("allows cancellation without any write", () => {
  renderWithI18n(<EventFinalizeAction event={event()} />);
  fireEvent.click(screen.getByRole("button", { name: "Finalize event" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(m.mutate).not.toHaveBeenCalled();
});
it.each([false, undefined])(
  "fails closed for missing/incomplete server readiness (%s) and explains exclusions",
  (ready) => {
    renderWithI18n(<EventFinalizeAction event={{ ...event(), resultsReady: ready }} />);
    expect(
      (screen.getByRole("button", { name: "Finalize event" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Why finalization is unavailable" }));
    expect(
      screen.getByText(
        "Save results for every included table before finalizing. Excluded tables do not require results.",
      ),
    ).toBeTruthy();
  },
);
it.each(["role", "state"])(
  "hides the action without admin/confirmed authorization (%s)",
  (kind) => {
    if (kind === "role") m.user = "guest";
    renderWithI18n(
      <EventFinalizeAction
        event={{ ...event(), ...(kind === "state" ? { status: "TERMINATED" } : {}) }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Finalize event" })).toBeNull();
  },
);
it.each(["busy", "placeholder", "capability"])("disables finalization for %s", (kind) => {
  m.busy = kind === "busy";
  renderWithI18n(
    <EventFinalizeAction
      event={{ ...event(), canFinalize: kind !== "capability" }}
      disabled={kind === "placeholder"}
    />,
  );
  expect(
    (screen.getByRole("button", { name: "Finalize event" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
it.each(["version", "scope"])(
  "never silently rebases an open finalization confirmation after a %s change",
  (kind) => {
    const view = renderWithI18n(<EventFinalizeAction event={event()} />);
    fireEvent.click(screen.getByRole("button", { name: "Finalize event" }));
    view.rerender(
      <EventFinalizeAction
        event={{
          ...event(),
          ...(kind === "version" ? { version: 2 } : { id: "77777777-7777-4777-8777-777777777777" }),
        }}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Close this confirmation and review the saved results",
    );
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", { name: "Finalize event" }),
    ).toBeNull();
    expect(m.mutate).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Finalize event" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Finalize event" }),
    );
    expect(m.mutate).toHaveBeenCalledWith(
      { version: kind === "version" ? 2 : 1 },
      expect.any(Object),
    );
  },
);
it("rechecks readiness after opening and keeps uncertain/error feedback observable", () => {
  m.failed = true;
  const view = renderWithI18n(<EventFinalizeAction event={event()} />);
  fireEvent.click(screen.getByRole("button", { name: "Finalize event" }));
  expect(screen.getByRole("alert").textContent).toContain("Could not verify event finalization");
  view.rerender(<EventFinalizeAction event={{ ...event(), resultsReady: false }} />);
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Finalize event" }),
  );
  expect(m.mutate).not.toHaveBeenCalled();
});
