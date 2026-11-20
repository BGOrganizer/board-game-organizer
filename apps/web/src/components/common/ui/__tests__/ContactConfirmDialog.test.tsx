import { fireEvent, screen, within } from "@testing-library/react";
import { X } from "lucide-react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { ContactConfirmDialog } from "../ContactConfirmDialog";

function DismissibleConfirmation() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open confirmation
      </button>
      {open ? (
        <ContactConfirmDialog
          title="Confirm action"
          description="Review before continuing"
          onCancel={() => setOpen(false)}
          actions={[{ label: "Confirm", onPress: () => setOpen(false) }]}
        />
      ) : null}
    </>
  );
}

it.each(["close", "escape", "backdrop", "action"])(
  "returns focus to the opener after %s dismissal",
  (method) => {
    renderWithI18n(<DismissibleConfirmation />);
    const trigger = screen.getByRole("button", { name: "Open confirmation" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Confirm action" });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    if (method === "close") fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    else if (method === "escape") fireEvent(dialog, new Event("cancel", { cancelable: true }));
    else if (method === "action")
      fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));
    else {
      const backdrop = dialog.querySelector<HTMLElement>(".bg-backdrop");
      if (!backdrop) throw new Error("The confirmation backdrop is required");
      fireEvent.click(backdrop);
    }
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  },
);

it("uses an icon-only close action above aligned footer actions and preserves callbacks", () => {
  const accept = vi.fn(),
    cancel = vi.fn();
  renderWithI18n(
    <ContactConfirmDialog
      title="Request"
      description="Organization membership only"
      onCancel={cancel}
      actions={[{ label: "Accept", icon: <X />, onPress: accept }]}
    />,
  );
  const dialog = screen.getByRole("dialog", { name: "Request" });
  const buttons = within(dialog).getAllByRole("button");
  expect(buttons.map((button) => button.textContent)).toEqual(["", "Accept"]);
  expect(buttons[0]).toHaveAccessibleName("Cancel");
  expect(buttons[0]).toHaveFocus();
  expect(buttons[0].parentElement?.className).toBe("flex justify-end");
  expect(buttons[1].parentElement?.className).toBe("mt-5 flex items-stretch justify-end gap-3");
  expect(buttons[1].parentElement).not.toBe(buttons[0].parentElement);
  for (const button of buttons) expect(button.querySelector("svg")).toBeTruthy();
  fireEvent.click(buttons[1]);
  expect(accept).toHaveBeenCalledOnce();
  fireEvent.click(buttons[0]);
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(cancel).toHaveBeenCalledTimes(2);
});
it.each(["primary", "danger", "danger-soft"] as const)(
  "keeps the %s action semantic while cancellation is only the close control",
  (variant) => {
    renderWithI18n(
      <ContactConfirmDialog
        title="Confirm"
        description="Existing caller"
        onCancel={vi.fn()}
        actions={[{ label: "Remove", variant, onPress: vi.fn() }]}
      />,
    );
    const buttons = within(screen.getByRole("dialog", { name: "Confirm" })).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["", "Remove"]);
    expect(buttons[0]).toHaveAccessibleName("Cancel");
    expect(buttons[1]).toHaveClass(`button--${variant}`, "whitespace-normal", "h-auto");
  },
);
it("opens a native modal and releases it on unmount without sharing title ids", () => {
  const close = vi.spyOn(HTMLDialogElement.prototype, "close");
  const view = renderWithI18n(
    <>
      <ContactConfirmDialog
        title="First"
        description="First operation"
        onCancel={vi.fn()}
        actions={[]}
      />
      <ContactConfirmDialog
        title="Second"
        description="Second operation"
        onCancel={vi.fn()}
        actions={[]}
      />
    </>,
  );
  const first = screen.getByRole("dialog", { name: "First" }),
    second = screen.getByRole("dialog", { name: "Second" });
  expect(first.tagName).toBe("DIALOG");
  expect(first.hasAttribute("open")).toBe(true);
  expect(second.getAttribute("aria-labelledby")).not.toBe(first.getAttribute("aria-labelledby"));
  view.unmount();
  expect(close).toHaveBeenCalledTimes(2);
  close.mockRestore();
});
it("keeps multiple actions in one evenly spaced row with wrapping labels", () => {
  renderWithI18n(
    <ContactConfirmDialog
      title="Remove member"
      description="Organization removal only"
      onCancel={vi.fn()}
      actions={[
        { label: "Remove from organization", variant: "danger", onPress: vi.fn() },
        { label: "Remove and exclude", variant: "danger", onPress: vi.fn() },
      ]}
    />,
  );
  const dialog = screen.getByRole("dialog", { name: "Remove member" });
  const buttons = within(dialog).getAllByRole("button");
  expect(buttons.map((button) => button.textContent)).toEqual([
    "",
    "Remove from organization",
    "Remove and exclude",
  ]);
  expect(buttons[1].parentElement).toBe(buttons[2].parentElement);
  expect(buttons[1].parentElement).toHaveClass("flex", "gap-3", "items-stretch");
  expect(buttons[1].parentElement).not.toHaveClass("flex-col", "flex-wrap");
  for (const action of buttons.slice(1))
    expect(action).toHaveClass("h-auto", "min-h-11", "min-w-11", "whitespace-normal");
});
it("blocks repeated submission, Escape and backdrop dismissal while busy", () => {
  const confirm = vi.fn(),
    cancel = vi.fn();
  const { container } = renderWithI18n(
    <ContactConfirmDialog
      title="Busy"
      description="Pending"
      onCancel={cancel}
      busy
      actions={[{ label: "Accept", onPress: confirm }]}
    />,
  );
  for (const button of within(screen.getByRole("dialog", { name: "Busy" })).getAllByRole(
    "button",
  )) {
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
  }
  fireEvent(
    screen.getByRole("dialog", { name: "Busy" }),
    new Event("cancel", { cancelable: true }),
  );
  fireEvent.keyDown(window, { key: "Enter" });
  // The portal backdrop is aria-hidden, never another dialog or button.
  const backdrop = container.ownerDocument.querySelector('[aria-hidden="true"].bg-backdrop');
  if (!backdrop) throw new Error("Confirmation backdrop missing");
  fireEvent.click(backdrop);
  expect(confirm).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
});
