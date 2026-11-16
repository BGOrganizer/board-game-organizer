import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { ListCard } from "../ListCard";

it.each([false, true])(
  "keeps card content accessible and actionable with decorative background=%s",
  (decorated) => {
    const action = vi.fn();
    const view = renderWithI18n(
      <ListCard
        className={decorated ? "owned-card" : undefined}
        background={decorated ? <svg role="img" aria-label="Decorative artwork" /> : undefined}
      >
        <h2>Owned resource</h2>
        <button type="button" onClick={action}>
          Edit resource
        </button>
      </ListCard>,
    );
    expect(screen.getByRole("heading", { name: "Owned resource" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Decorative artwork" })).toBeNull();
    const button = screen.getByRole("button", { name: "Edit resource" });
    expect(button.closest('[aria-hidden="true"]')).toBeNull();
    fireEvent.click(button);
    expect(action).toHaveBeenCalledOnce();
    expect(view.container.querySelector("svg") !== null).toBe(decorated);
    expect(button.closest(".card")?.classList.contains("owned-card")).toBe(decorated);
  },
);
