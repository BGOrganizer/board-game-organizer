import { fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { GroupBanDialog } from "../GroupBanDialog";

afterEach(() => vi.restoreAllMocks());
it("requires explicit dangerous confirmation, with ban icon and no manual timezone control", () => {
  const confirm = vi.fn(),
    cancel = vi.fn();
  renderWithI18n(
    <GroupBanDialog name="Player" busy={false} onConfirm={confirm} onCancel={cancel} />,
  );
  expect(screen.getByRole("dialog").textContent).toContain("separate from global blocking");
  expect(confirm).not.toHaveBeenCalled();
  const button = screen.getByRole("button", { name: "Ban from group" });
  expect(button.querySelector("svg")).not.toBeNull();
  expect(screen.queryByLabelText("Time zone")).toBeNull();
  fireEvent.click(button);
  expect(confirm).toHaveBeenCalledWith(null);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(cancel).toHaveBeenCalledOnce();
});
it("validates timed bans in the venue timezone, not the device timezone", () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2030, 0, 1));
  const confirm = vi.fn();
  renderWithI18n(
    <GroupBanDialog
      name="Player"
      timeZone="Europe/Rome"
      busy={false}
      onConfirm={confirm}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("switch"));
  const field = screen.getByLabelText("Excluded until");
  fireEvent.change(field, { target: { value: "2029-12-31T12:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Ban from group" }));
  expect(screen.getByRole("alert").textContent).toBe("Choose a valid future date and time.");
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.change(field, { target: { value: "2030-01-03T12:00" } });
  fireEvent.click(screen.getByRole("button", { name: "Ban from group" }));
  expect(confirm).toHaveBeenCalledWith("2030-01-03T11:00:00.000Z");
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
    (screen.getByRole("button", { name: "Ban from group" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
});
