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
it("enforces changing min/max ranges, permits clearing and reports inline errors", () => {
  const change = vi.fn();
  const view = renderWithI18n(
    <EventDateTimeField
      label="Ends at"
      value="2030-06-12T18:00"
      min="2030-06-12T14:01"
      max="2030-06-13T18:00"
      error="Choose a later end"
      onChange={change}
    />,
  );
  const input = screen.getByLabelText("Ends at") as HTMLInputElement;
  expect(input.min).toBe("2030-06-12T14:01");
  expect(input.max).toBe("2030-06-13T18:00");
  expect(screen.getByRole("alert").textContent).toBe("Choose a later end");
  fireEvent.change(input, { target: { value: "2030-06-12T14:00" } });
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "2030-06-14T18:00" } });
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "2030-06-13T12:00" } });
  expect(change).toHaveBeenCalledWith("2030-06-13T12:00");
  fireEvent.change(input, { target: { value: "" } });
  expect(change).toHaveBeenCalledWith("");
  view.unmount();
  renderWithI18n(
    <EventDateTimeField
      label="Ends at"
      value="2030-06-12T18:00"
      min="2030-06-13T18:01"
      max="2030-06-13T18:00"
      onChange={change}
    />,
  );
  expect((screen.getByLabelText("Ends at") as HTMLInputElement).disabled).toBe(true);
});
it("supports an upper bound without a lower bound", () => {
  const change = vi.fn();
  renderWithI18n(
    <EventDateTimeField
      label="Ends at"
      value="2030-06-12T18:00"
      max="2030-06-13T18:00"
      onChange={change}
    />,
  );
  fireEvent.change(screen.getByLabelText("Ends at"), { target: { value: "2030-06-13T19:00" } });
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Ends at"), { target: { value: "2030-06-13T17:00" } });
  expect(change).toHaveBeenCalledWith("2030-06-13T17:00");
});
