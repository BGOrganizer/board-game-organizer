import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { WizardSteps } from "../WizardSteps";

it("shows every step and marks only the current step for both wizard lengths", () => {
  const view = renderWithI18n(<WizardSteps count={3} current={1} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getByText("1").getAttribute("aria-current")).toBe("step");
  view.unmount();
  renderWithI18n(<WizardSteps count={4} current={4} />);
  expect(screen.getAllByRole("listitem")).toHaveLength(4);
  expect(screen.getByText("1").hasAttribute("aria-current")).toBe(false);
  expect(screen.getByText("4").getAttribute("aria-current")).toBe("step");
});
