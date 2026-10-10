import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { EventDateTimeField } from "../EventDateTimeField";

it("offers one date-only field, accessible help and native picker without inventing times", () => {
  const change = vi.fn();
  renderWithI18n(
    <EventDateTimeField
      mode="date"
      label="Event date"
      help="One local day"
      value="2030-06-12T00:00"
      onChange={change}
    />,
  );
  const input = screen.getByLabelText("Event date") as HTMLInputElement;
  expect(input.type).toBe("date");
  expect(input.value).toBe("2030-06-12");
  expect(input.closest("li")).toBeTruthy();
  fireEvent.click(input);
  const showPicker = vi.fn();
  Object.defineProperty(input, "showPicker", { value: showPicker });
  fireEvent.click(input);
  expect(showPicker).toHaveBeenCalledOnce();
  fireEvent.change(input, { target: { value: "2030-06-13" } });
  expect(change).toHaveBeenCalledWith("2030-06-13T00:00");
  expect(input.value).toBe("2030-06-12");
});
it("offers time-only input on selected day, strict bounds, clearing and inline errors", () => {
  const change = vi.fn();
  const view = renderWithI18n(
    <EventDateTimeField
      mode="time"
      day="2030-06-12"
      label="End time"
      value="2030-06-12T18:00"
      min="2030-06-12T14:01"
      max="2030-06-12T21:59"
      error="Choose a later end"
      onChange={change}
    />,
  );
  const input = screen.getByLabelText("End time") as HTMLInputElement;
  expect(input.type).toBe("time");
  expect(input.min).toBe("14:01");
  expect(input.max).toBe("21:59");
  expect(screen.getByRole("alert").textContent).toBe("Choose a later end");
  for (const value of ["14:00", "22:00"]) fireEvent.change(input, { target: { value } });
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "20:00" } });
  expect(change).toHaveBeenCalledWith("2030-06-12T20:00");
  fireEvent.change(input, { target: { value: "" } });
  expect(change).toHaveBeenCalledWith("");
  view.unmount();
  renderWithI18n(
    <EventDateTimeField
      mode="time"
      day="2030-06-12"
      label="End time"
      value=""
      min="2030-06-12T18:01"
      max="2030-06-12T18:00"
      onChange={change}
    />,
  );
  expect((screen.getByLabelText("End time") as HTMLInputElement).disabled).toBe(true);
});
it("supports upper-only, lower-only and no bounds; missing day disables time choice", () => {
  const change = vi.fn();
  let view = renderWithI18n(
    <EventDateTimeField
      mode="time"
      day="2030-06-12"
      label="Time"
      value="2030-06-12T18:00"
      max="2030-06-12T18:00"
      onChange={change}
    />,
  );
  fireEvent.change(screen.getByLabelText("Time"), { target: { value: "19:00" } });
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Time"), { target: { value: "17:00" } });
  expect(change).toHaveBeenCalledWith("2030-06-12T17:00");
  view.unmount();
  view = renderWithI18n(
    <EventDateTimeField
      mode="time"
      day="2030-06-12"
      label="Time"
      value=""
      min="2030-06-12T16:00"
      onChange={change}
    />,
  );
  fireEvent.change(screen.getByLabelText("Time"), { target: { value: "18:00" } });
  expect(change).toHaveBeenCalledWith("2030-06-12T18:00");
  view.unmount();
  view = renderWithI18n(
    <EventDateTimeField
      mode="date"
      label="Time"
      value=""
      min="2030-06-12T00:00"
      max="2030-06-13T00:00"
      onChange={change}
    />,
  );
  expect((screen.getByLabelText("Time") as HTMLInputElement).max).toBe("2030-06-13");
  fireEvent.change(screen.getByLabelText("Time"), { target: { value: "2030-06-13" } });
  expect(change).toHaveBeenCalledWith("2030-06-13T00:00");
  view.unmount();
  view = renderWithI18n(
    <EventDateTimeField mode="time" day="2030-06-12" label="Time" value="" onChange={change} />,
  );
  fireEvent.change(screen.getByLabelText("Time"), { target: { value: "18:30" } });
  expect(change).toHaveBeenCalledWith("2030-06-12T18:30");
  view.unmount();
  renderWithI18n(<EventDateTimeField mode="time" label="Time" value="" onChange={change} />);
  expect((screen.getByLabelText("Time") as HTMLInputElement).disabled).toBe(true);
});
