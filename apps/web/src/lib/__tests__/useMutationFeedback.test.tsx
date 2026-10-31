import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMutationFeedback } from "@/lib/useMutationFeedback";
import { renderWithI18n } from "@/test-utils";

const toastMocks = vi.hoisted(() => ({ show: vi.fn(), danger: vi.fn() }));
vi.mock("@heroui/react/toast", () => ({
  toast: Object.assign(toastMocks.show, { danger: toastMocks.danger }),
}));

function FeedbackProbe() {
  const feedback = useMutationFeedback();
  return (
    <>
      <button type="button" onClick={() => feedback.onOptimisticUpdate?.("follow")}>
        success
      </button>
      <button type="button" onClick={() => feedback.onError?.(new Error("failed"), "follow")}>
        error
      </button>
      <button
        type="button"
        onClick={() =>
          feedback.onError?.(new Error("BAN_FROZEN_PARTICIPATION"), "ban_group_member")
        }
      >
        frozen ban
      </button>
      <button
        type="button"
        onClick={() => feedback.onError?.(new Error("other failure"), "ban_group_member")}
      >
        failed ban
      </button>
      <button type="button" onClick={() => feedback.onOptimisticUpdate?.("update_match")}>
        update success
      </button>
      <button type="button" onClick={() => feedback.onError?.(new Error("failed"), "update_match")}>
        update error
      </button>
    </>
  );
}

describe("useMutationFeedback", () => {
  it("keeps the frozen-participation explanation observable after an immediate Group dialog close", () => {
    renderWithI18n(<FeedbackProbe />);
    fireEvent.click(screen.getByRole("button", { name: "frozen ban" }));
    expect(toastMocks.danger).toHaveBeenLastCalledWith(
      "This user is involved in a frozen public event and cannot be excluded.",
      expect.any(Object),
    );
    fireEvent.click(screen.getByRole("button", { name: "failed ban" }));
    expect(toastMocks.danger).toHaveBeenLastCalledWith(
      "Could not apply group ban",
      expect.any(Object),
    );
  });
  it("shows default confirmation and danger failure toasts", () => {
    renderWithI18n(<FeedbackProbe />);

    fireEvent.click(screen.getByRole("button", { name: "success" }));
    fireEvent.click(screen.getByRole("button", { name: "error" }));

    expect(toastMocks.show).toHaveBeenCalledWith(
      "User followed",
      expect.objectContaining({ indicator: expect.anything() }),
    );
    expect(toastMocks.danger).toHaveBeenCalledWith(
      "Could not follow user",
      expect.objectContaining({ indicator: expect.anything() }),
    );

    fireEvent.click(screen.getByRole("button", { name: "update success" }));
    fireEvent.click(screen.getByRole("button", { name: "update error" }));
    expect(toastMocks.show).toHaveBeenLastCalledWith(
      "Match updated",
      expect.objectContaining({ indicator: expect.anything() }),
    );
    expect(toastMocks.danger).toHaveBeenLastCalledWith(
      "Could not update match",
      expect.objectContaining({ indicator: expect.anything() }),
    );
  });
});
