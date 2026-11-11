import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { EventPlanningSettings } from "../EventPlanningSettings";
import { EventSeatOrderEditor } from "../EventSeatOrderEditor";

it("defaults to Assisted and Players and selecting BGG Best includes reduction without a switch", () => {
  const patch = vi.fn();
  const form = { draft: {}, patch };
  renderWithI18n(<EventPlanningSettings form={form as never} busy={false} />);
  expect((screen.getByRole("radio", { name: "Assisted" }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole("radio", { name: "Players" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByText("Manual"));
  expect(patch).toHaveBeenCalledWith({ planningMode: "MANUAL" });
  fireEvent.click(screen.getByRole("radio", { name: "BGG Best" }));
  expect(patch).toHaveBeenCalledWith({ playerPreference: "BEST", allowBestReduction: true });
  expect(screen.queryByRole("switch")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "BGG Best: Field help" }));
  expect(screen.getByRole("dialog").textContent).toContain("allows Assisted planning to reduce");
});
it("shows roster conflicts without silently clearing the draft and disables saving", () => {
  const reset = vi.fn(),
    start = vi.fn();
  renderWithI18n(
    <EventSeatOrderEditor
      model={
        {
          rows: [],
          capacity: 2,
          loading: false,
          error: false,
          stale: true,
          busy: false,
          reset,
          start,
          save: vi.fn(),
        } as never
      }
    />,
  );
  expect(
    screen.getByText("The roster changed. Review a fresh snapshot before saving."),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save seat order" }).hasAttribute("disabled")).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("button", { name: "Review latest roster" }));
  expect(start).toHaveBeenCalledOnce();
  expect(reset).not.toHaveBeenCalled();
});

it("warns and requires an explicit choice before switching Manual to Assisted", () => {
  const patch = vi.fn();
  renderWithI18n(
    <EventPlanningSettings
      form={{ draft: { planningMode: "MANUAL" }, patch } as never}
      busy={false}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Assisted" }));
  expect(patch).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Assisted" }));
  expect(patch).toHaveBeenCalledWith({ planningMode: "ASSISTED" });
});
