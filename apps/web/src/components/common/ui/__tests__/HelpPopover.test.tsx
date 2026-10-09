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
