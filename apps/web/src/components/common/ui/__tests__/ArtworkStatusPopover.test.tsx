import type { ParticipationIndicator } from "@board-game-organizer/shared";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { ArtworkStatusPopover } from "../ArtworkStatusPopover";
import { LinkedListCard } from "../LinkedListCard";

it.each([
  [
    "confirmed",
    "Confirmed player",
    "You have a confirmed place at a table.",
    "user-round-check",
    "text-success",
  ],
  [
    "request",
    "Participation requested",
    "Your request is awaiting approval.",
    "clock-3",
    "text-warning",
  ],
  [
    "invitation",
    "Invitation received",
    "You have an invitation awaiting your response.",
    "mail",
    "text-warning",
  ],
  [
    "waiting",
    "Waiting list",
    "You are on the waiting list, not assigned a place.",
    "list-ordered",
    "text-warning",
  ],
  ["admin", "Administrator", "You administer this item.", "crown", "text-warning"],
] as const)(
  "explains %s without activating card navigation",
  async (kind, label, description, icon, tone) => {
    const onOpen = vi.fn();
    renderWithI18n(
      <LinkedListCard
        href="/events/id"
        label="Open item"
        onOpen={onOpen}
        leadingActions={<ArtworkStatusPopover kind={kind as ParticipationIndicator | "admin"} />}
      >
        <span>Item content</span>
      </LinkedListCard>,
    );
    const trigger = screen.getByRole("button", { name: label });
    expect(trigger.closest("a")).toBeNull();
    expect(trigger.parentElement?.className).toContain("top-20");
    expect(trigger.parentElement?.className).toContain("justify-center");
    expect(trigger.className).toContain(tone);
    expect(trigger.classList.contains(`${tone}-soft-foreground`)).toBe(true);
    for (const geometry of ["inline-flex", "items-center", "justify-center"])
      expect(trigger.classList.contains(geometry)).toBe(true);
    expect(trigger.className).toContain("button--sm");
    expect(trigger.querySelector(`svg.lucide-${icon}`)?.classList.contains("size-5")).toBe(true);
    fireEvent.click(trigger);
    expect(await screen.findByText(description)).not.toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  },
);

it("uses a partial skeleton for unknown participation, not a fictitious confirmed seat", () => {
  renderWithI18n(<ArtworkStatusPopover kind={undefined} />);
  expect(screen.getByLabelText("Loading…").className).toContain("skeleton");
  expect(screen.queryByRole("button")).toBeNull();
});

it("supports domain-specific accessible labels while retaining the common request explanation", async () => {
  renderWithI18n(<ArtworkStatusPopover kind="request" label="Membership requested" />);
  fireEvent.click(screen.getByRole("button", { name: "Membership requested" }));
  expect(await screen.findByText("Your request is awaiting approval.")).not.toBeNull();
});
