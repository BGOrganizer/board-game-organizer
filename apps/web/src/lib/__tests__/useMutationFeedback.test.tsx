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
