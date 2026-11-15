import type { ClientRecordState } from "@board-game-organizer/shared";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { ClientRecordBadge, useClientRecordStatus } from "../ClientRecordBadge";

const phases = [
  ["saving", "Saving", "Saving", "save"],
  ["verifying", "Verifying", "Checking saved changes", "clock-3"],
  ["failed", "Not saved", "Not saved. Edit draft", "circle-alert"],
] as const;

function Status({ phase }: { phase?: ClientRecordState["phase"] }) {
  const status = useClientRecordStatus(phase);
  return <output>{status}</output>;
}

it.each(phases)(
  "keeps %s icon-only and accessible in a fixed title slot",
  (phase, label, status, icon) => {
    const view = renderWithI18n(<ClientRecordBadge iconOnly />);
    const slot = view.container.firstElementChild;
    expect(slot?.className).toContain("size-6 shrink-0 self-start");
    expect(slot?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("status")).toBeNull();
    view.rerender(<ClientRecordBadge phase={phase} iconOnly />);
    expect(view.container.firstElementChild).toBe(slot);
    const badge = screen.getByRole("status", { name: label });
    expect(badge.querySelector(`svg.lucide-${icon}`)).not.toBeNull();
    expect(badge.textContent).toBe("");
    expect(badge.querySelector(".chip__label")).toBeNull();
    expect(slot?.getAttribute("aria-hidden")).toBeNull();
    view.rerender(<Status phase={phase} />);
    expect(screen.getByRole("status").textContent).toBe(status);
  },
);

it.each(phases)("preserves the labeled %s presentation for non-card consumers", (phase, label) => {
  renderWithI18n(<ClientRecordBadge phase={phase} />);
  expect(screen.getByRole("status", { name: label }).textContent).toBe(label);
});

it("has no visible status without a phase and preserves the empty accessible status string", () => {
  const view = renderWithI18n(<ClientRecordBadge />);
  expect(view.container.firstElementChild).toBeNull();
  view.rerender(<Status />);
  expect(screen.getByRole("status").textContent).toBe("");
});
