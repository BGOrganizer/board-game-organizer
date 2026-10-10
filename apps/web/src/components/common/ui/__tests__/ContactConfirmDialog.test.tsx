import { fireEvent, screen, within } from "@testing-library/react";
import { X } from "lucide-react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { ContactConfirmDialog } from "../ContactConfirmDialog";

it("opts into icon/text row actions with cancel below and preserves all callbacks", () => {
  const accept = vi.fn(),
    cancel = vi.fn();
  renderWithI18n(
    <ContactConfirmDialog
      title="Request"
      description="Organization membership only"
      onCancel={cancel}
      cancelLast
      actionsInRow
      cancelIcon={<X />}
      actions={[{ label: "Accept", icon: <X />, onPress: accept }]}
    />,
  );
  const dialog = screen.getByRole("dialog", { name: "Request" });
  const buttons = within(dialog).getAllByRole("button");
  expect(buttons.map((button) => button.textContent)).toEqual(["Accept", "Cancel"]);
  expect(buttons[0].parentElement?.className).toBe("mt-5 flex flex-row gap-1");
  expect(buttons[0].className).toContain("flex-1 flex-row");
  expect(buttons[1].parentElement).not.toBe(buttons[0].parentElement);
  for (const button of buttons) expect(button.querySelector("svg")).toBeTruthy();
  fireEvent.click(buttons[0]);
  expect(accept).toHaveBeenCalledOnce();
  fireEvent.click(buttons[1]);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(cancel).toHaveBeenCalledTimes(2);
});
it.each([false, true])(
  "retains the existing layout when cancelLast is %s without row opt-in",
  (cancelLast) => {
    renderWithI18n(
      <ContactConfirmDialog
        title="Confirm"
        description="Existing caller"
        onCancel={vi.fn()}
        cancelLast={cancelLast}
        actions={[{ label: "Remove", variant: "danger", onPress: vi.fn() }]}
      />,
    );
    const buttons = within(screen.getByRole("dialog", { name: "Confirm" })).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(
      cancelLast ? ["Remove", "Cancel"] : ["Cancel", "Remove"],
    );
    expect(buttons[0].parentElement?.className).toContain(
      cancelLast ? "flex-col gap-2" : "flex-col-reverse",
    );
    expect(buttons[0].className).toContain("w-full");
  },
);
it("blocks repeated submission, Escape and backdrop dismissal while busy", () => {
  const confirm = vi.fn(),
    cancel = vi.fn();
  const { container } = renderWithI18n(
    <ContactConfirmDialog
      title="Busy"
      description="Pending"
      onCancel={cancel}
      busy
      actionsInRow
      actions={[{ label: "Accept", onPress: confirm }]}
    />,
  );
  for (const button of within(screen.getByRole("dialog", { name: "Busy" })).getAllByRole(
    "button",
  )) {
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
  }
  fireEvent.keyDown(window, { key: "Escape" });
  fireEvent.keyDown(window, { key: "Enter" });
  // The portal backdrop is aria-hidden, never another dialog or button.
  const backdrop = container.ownerDocument.querySelector('[aria-hidden="true"][class*="bg-black"]');
  if (!backdrop) throw new Error("Confirmation backdrop missing");
  fireEvent.click(backdrop);
  expect(confirm).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
});
