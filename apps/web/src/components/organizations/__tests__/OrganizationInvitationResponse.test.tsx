import { fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { OrganizationInvitationResponse } from "../OrganizationInvitationResponse";

it.each(["accept", "decline"] as const)(
  "responds to an invitation only after choosing %s",
  (action) => {
    const run = vi.fn();
    renderWithI18n(<OrganizationInvitationResponse busy={false} onAction={run} />);
    fireEvent.click(screen.getByRole("button", { name: "Respond to organization invitation" }));
    const dialog = screen.getByRole("dialog", { name: "Respond to organization invitation" });
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Cancel", "Accept", "Reject"]);
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", { name: action === "accept" ? "Accept" : "Reject" }),
    );
    expect(run).toHaveBeenCalledWith(action);
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);

function PendingHarness({ onAction }: { onAction: (action: "accept" | "decline") => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setBusy(true)}>
        Make pending
      </button>
      <OrganizationInvitationResponse busy={busy} onAction={onAction} />
    </>
  );
}

it("allows cancellation but prevents dismissal and submission while pending", () => {
  const run = vi.fn();
  renderWithI18n(<PendingHarness onAction={run} />);
  fireEvent.click(screen.getByRole("button", { name: "Respond to organization invitation" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Respond to organization invitation" }));
  fireEvent.click(screen.getByRole("button", { name: "Make pending" }));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeTruthy();
  for (const name of ["Cancel", "Accept", "Reject"])
    expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
  expect(run).not.toHaveBeenCalled();
});
