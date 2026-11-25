import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { groupRecord } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupStatusBadge } from "../GroupStatusBadge";

it("does not show moderation status for a private group", () => {
  const view = renderWithI18n(
    <GroupStatusBadge group={{ type: "PRIVATE", approved: undefined, reviewStatus: "PENDING" }} />,
  );
  expect(view.container.childElementCount).toBe(0);
});

it.each([
  { approved: false, reviewStatus: "PENDING", label: "Awaiting review" },
  { approved: false, reviewStatus: undefined, label: "Awaiting review" },
  { approved: true, reviewStatus: "PENDING", label: "Awaiting review" },
  { approved: false, reviewStatus: "REJECTED", label: "Approval rejected" },
  { approved: true, reviewStatus: "REJECTED", label: "Changes rejected" },
  { approved: true, reviewStatus: undefined, label: "Approved" },
] as const)(
  "shows truthful public moderation status: $label ($reviewStatus, approved=$approved)",
  ({ approved, reviewStatus, label }) => {
    renderWithI18n(
      <GroupStatusBadge
        group={{
          type: "PUBLIC",
          approved: approved ? groupRecord.approved : undefined,
          reviewStatus,
        }}
      />,
    );
    const badge = screen.getByText(label).closest('[data-slot="chip"]');
    expect(badge).toHaveClass(label === "Approval rejected" ? "chip--primary" : "chip--soft");
    if (reviewStatus === "REJECTED") expect(badge).toHaveClass("chip--danger");
  },
);
