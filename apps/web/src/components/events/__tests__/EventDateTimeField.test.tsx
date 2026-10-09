import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { EventDateTimeField } from "../EventDateTimeField";

it("uses one calendar row, preserves controlled values, opens the native picker and supports browsers without showPicker", () => {
  const change = vi.fn();
  renderWithI18n(
    <EventDateTimeField label="Starts at" value="2030-06-12T14:00" onChange={change} />,
  );
  const input = screen.getByLabelText("Starts at") as HTMLInputElement;
  expect(input.type).toBe("datetime-local");
  expect(input.closest("li")).toBeTruthy();
  fireEvent.click(input);
  const showPicker = vi.fn();
  Object.defineProperty(input, "showPicker", { value: showPicker });
  fireEvent.click(input);
  expect(showPicker).toHaveBeenCalledOnce();
  fireEvent.change(input, { target: { value: "2030-06-12T15:00" } });
  expect(change).toHaveBeenCalledWith("2030-06-12T15:00");
  expect(input.value).toBe("2030-06-12T14:00");
});
