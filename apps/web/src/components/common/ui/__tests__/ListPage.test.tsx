import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { ListPage } from "../ListPage";

it.each([false, true])(
  "reserves the floating action clearance only when present: %s",
  (visible) => {
    renderWithI18n(
      <ListPage hasFloatingActions={visible}>
        <p>Last row</p>
      </ListPage>,
    );
    const content = screen.getByText("Last row").parentElement;
    expect(content?.style.paddingBottom).toBe(
      visible ? "calc(4.5rem + max(1.5rem, env(safe-area-inset-bottom)))" : "",
    );
  },
);

it("does not reserve a floating action by default", () => {
  renderWithI18n(<ListPage>Ordinary list</ListPage>);
  expect(screen.getByText("Ordinary list").style.paddingBottom).toBe("");
});
