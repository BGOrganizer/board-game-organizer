import { fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { GroupBanDialog } from "../GroupBanDialog";

afterEach(() => vi.restoreAllMocks());
it("requires explicit dangerous confirmation and distinguishes group exclusion from global blocking", () => {
  const confirm = vi.fn(),
    cancel = vi.fn();
  renderWithI18n(
    <GroupBanDialog name="Player" busy={false} onConfirm={confirm} onCancel={cancel} />,
  );
  expect(screen.getByRole("dialog").textContent).toContain("separate from global blocking");
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Exclude from group" }));
  expect(confirm).toHaveBeenCalledWith(null);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(cancel).toHaveBeenCalledOnce();
});
it("validates timed exclusions before submitting an ISO instant", () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2030, 0, 1));
  const confirm = vi.fn();
  renderWithI18n(
    <GroupBanDialog name="Player" busy={false} onConfirm={confirm} onCancel={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole("switch"));
  const field = screen.getByLabelText("Excluded until");
  fireEvent.change(field, { target: { value: "2029-12-31T12:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Exclude from group" }));
  expect(screen.getByRole("alert").textContent).toBe("Choose a valid future date and time.");
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: "2030-01-03T12:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Exclude from group" }));
  expect(confirm).toHaveBeenCalledWith(new Date("2030-01-03T12:00").toISOString());
});
it("shows server failure and disables repeated confirmation while pending", () => {
  renderWithI18n(
    <GroupBanDialog
      name="Player"
      busy
      failure="Frozen participation"
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  expect(screen.getByRole("alert").textContent).toBe("Frozen participation");
  expect(
    (screen.getByRole("button", { name: "Exclude from group" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
});
