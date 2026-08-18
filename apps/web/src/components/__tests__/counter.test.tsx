import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Counter } from "@/components/Counter";
import { renderWithI18n } from "@/test-utils";

describe("Counter", () => {
  it("starts at zero and updates via the store actions", () => {
    renderWithI18n(<Counter />);
    expect(screen.getByText("0")).toBeTruthy();

    fireEvent.click(screen.getByText("+1"));
    expect(screen.getByText("1")).toBeTruthy();

    fireEvent.click(screen.getByText("-1"));
    expect(screen.getByText("0")).toBeTruthy();

    fireEvent.click(screen.getByText("Reset"));
    expect(screen.getByText("0")).toBeTruthy();
  });
});
