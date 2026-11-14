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
  ["invitation", "Invitation received", "You have received an invitation.", "mail", "text-warning"],
  [
    "waiting",
    "Waiting list",
    "You are on the waiting list, not assigned a place.",
    "list-ordered",
    "text-warning",
  ],
  ["admin", "Administrator", "You administer this item.", "crown", "text-warning"],
  ["member", "Group member", "You are a member of this group.", "user-round-check", "text-success"],
  [
    "manager",
    "Management",
    "Your current permissions allow managing this item.",
    "shield-check",
    "text-muted",
  ],
  [
    "demonstrator",
    "Demonstrator",
    "You are assigned to demonstrate a game.",
    "presentation",
    "text-muted",
  ],
  ["viewer", "Viewer", "You can view this item.", "eye", "text-muted"],
] as const)(
  "explains %s without activating card navigation",
  async (kind, label, description, icon, tone) => {
    const onOpen = vi.fn();
    renderWithI18n(
      <LinkedListCard
        href="/events/id"
        artwork={<span aria-hidden>Artwork</span>}
        label="Open item"
        onOpen={onOpen}
        leadingActions={<ArtworkStatusPopover kind={kind} />}
      >
        <span>Item content</span>
      </LinkedListCard>,
    );
    const trigger = screen.getByRole("button", { name: label });
    expect(trigger.closest("a")).toBeNull();
    expect(trigger.parentElement?.className).toContain("flex-wrap");
    expect(trigger.parentElement?.className).not.toContain("absolute");
    expect(trigger.className).toContain(tone);
    expect(
      trigger.classList.contains(tone === "text-muted" ? tone : `${tone}-soft-foreground`),
    ).toBe(true);
    for (const geometry of ["inline-flex", "items-center", "justify-center"])
      expect(trigger.classList.contains(geometry)).toBe(true);
    expect(trigger.className).toContain("button--sm");
    expect(trigger.querySelector(`svg.lucide-${icon}`)?.classList.contains("size-5")).toBe(true);
    fireEvent.click(trigger);
    expect(await screen.findByText(description)).not.toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  },
);

it("keeps a known invitation reply visible while participation positions are unknown, without duplicating its glyph", async () => {
  renderWithI18n(<ArtworkStatusPopover kind={undefined} action="reply" />);
  const trigger = screen.getByRole("button", { name: "Invitation received · Reply required" });
  expect(screen.queryByLabelText("Loading…")).toBeNull();
  expect(trigger.querySelectorAll("svg.lucide-mail")).toHaveLength(1);
  fireEvent.click(trigger);
  expect(
    await screen.findByText("Open details to accept or decline your invitation."),
  ).not.toBeNull();
});

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
