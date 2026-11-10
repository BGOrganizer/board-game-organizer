import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { HelpPopover } from "../HelpPopover";

it("opens rich feature content with a heading, constrains wrapping and closes with Escape", async () => {
  renderWithI18n(
    <HelpPopover label="Votes help" title="Votes" placement="bottom end" className="max-w-72">
      <ul>
        <li>Yes</li>
        <li>If needed</li>
      </ul>
    </HelpPopover>,
  );
  expect(screen.queryByText("If needed")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Votes help" }));
  expect(await screen.findByRole("heading", { name: "Votes" })).toBeTruthy();
  expect(screen.getByText("If needed")).toBeTruthy();
  const dialog = screen.getByRole("dialog");
  expect(dialog.className).toContain("break-words");
  fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("supports plain help without inventing a heading", async () => {
  renderWithI18n(<HelpPopover label="Field help">A plain instruction</HelpPopover>);
  fireEvent.click(screen.getByRole("button", { name: "Field help" }));
  expect(await screen.findByText("A plain instruction")).toBeTruthy();
  expect(screen.queryByRole("heading")).toBeNull();
});

it.each([
  ["primary", "text-accent-foreground"],
  ["danger-soft", "text-danger-soft-foreground"],
] as const)(
  "preserves the %s action color while dimmed help stays keyboard/click accessible",
  async (triggerVariant, foreground) => {
    renderWithI18n(
      <HelpPopover
        label="Unavailable action"
        title="Reason"
        triggerVariant={triggerVariant}
        triggerClassName="opacity-60"
      >
        Not available yet
      </HelpPopover>,
    );
    const button = screen.getByRole("button", { name: "Unavailable action" });
    expect(button.className).toContain(`button--${triggerVariant}`);
    expect(button.className).toContain(foreground);
    expect(button.className).toContain("opacity-60");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.getAttribute("aria-disabled")).not.toBe("true");
    fireEvent.click(button);
    expect(await screen.findByText("Not available yet")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  },
);
