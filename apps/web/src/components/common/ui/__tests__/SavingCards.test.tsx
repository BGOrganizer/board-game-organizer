import type { ClientRecordState } from "@board-game-organizer/shared";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EventCard } from "@/components/events/EventCard";
import { GroupCard } from "@/components/groups/GroupCard";
import { groupRecord, plannedEvent } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";

it.each(["group", "event"] as const)(
  "retains %s facts and the footer through save, verification, failure and success",
  (kind) => {
    const onVerify = vi.fn();
    const card = (phase?: ClientRecordState["phase"]) => {
      const optimistic = phase ? { draftId: "draft", phase } : undefined;
      return kind === "group" ? (
        <GroupCard group={{ ...groupRecord, optimistic }} onVerify={onVerify} />
      ) : (
        <EventCard event={{ ...plannedEvent, optimistic }} onVerify={onVerify} />
      );
    };
    const view = renderWithI18n(card());
    const footer = view.container.querySelector(".overflow-x-auto");
    const footerClasses = footer?.className;
    expect(footer).not.toBeNull();
    const fact = kind === "group" ? "1 Member" : "1 Table";
    const info = kind === "group" ? "Private" : "Planning";
    const infoNode = screen.getByLabelText(info);
    const infoParent = infoNode.parentElement;
    for (const [phase, label] of [
      ["saving", "Saving"],
      ["verifying", "Verifying"],
      ["failed", "Not saved"],
    ] as const) {
      view.rerender(card(phase));
      expect(view.container.querySelector(".overflow-x-auto")).toBe(footer);
      expect(footer?.className).toBe(footerClasses);
      expect(screen.getByLabelText(info)).toBe(infoNode);
      expect(infoNode.parentElement).toBe(infoParent);
      expect(screen.getByText(fact)).toBeTruthy();
      expect(screen.getByRole("status", { name: label }).textContent).toBe("");
      // Draft projections must not turn a proposed creator into verified authority.
      expect(screen.queryByRole("button", { name: "Admin" })).toBeNull();
      expect(footer?.hasAttribute("inert")).toBe(phase === "saving");
      expect(screen.getByRole("link").getAttribute("aria-disabled")).toBe(
        String(phase !== "failed"),
      );
      if (phase === "saving") {
        fireEvent.click(infoNode);
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.queryByRole("button", { name: "Check saved changes" })).toBeNull();
      } else if (phase === "verifying") {
        fireEvent.click(screen.getByRole("button", { name: "Check saved changes" }));
        expect(onVerify).toHaveBeenCalledOnce();
      }
    }
    view.rerender(card());
    expect(view.container.querySelector(".overflow-x-auto")).toBe(footer);
    expect(footer?.hasAttribute("inert")).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(fact)).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("aria-disabled")).toBe("false");
  },
);
