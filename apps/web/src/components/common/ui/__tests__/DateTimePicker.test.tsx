import { Label } from "@heroui/react";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { clearDateTime, enterDateTime } from "@/test-fixtures/dateTime";
import { renderWithI18n } from "@/test-utils";
import { messages as english } from "../../../../../../../messages/en.js";
import { messages as italian } from "../../../../../../../messages/it.js";
import { DateTimePicker } from "../DateTimePicker";
import { TimePicker } from "../TimePicker";

function ControlledDateTime() {
  const [value, setValue] = useState("2030-06-03T20:00");
  return (
    <>
      <DateTimePicker
        name="date"
        value={value}
        onChange={setValue}
        label={<Label>Appointment</Label>}
      />
      <output>{value}</output>
    </>
  );
}

it("edits one location-local date/time and clears through actual keyboard segments", () => {
  renderWithI18n(<ControlledDateTime />);
  const field = screen.getByRole("group", { name: "Appointment" });
  enterDateTime(field, "2030-06-05T19:30");
  expect(screen.getByRole("status")).toHaveTextContent("2030-06-05T19:30");
  clearDateTime(field);
  expect(screen.getByRole("status")).toBeEmptyDOMElement();
});

it("keeps calendar and time inside one popover and closes with Done", async () => {
  renderWithI18n(<ControlledDateTime />);
  fireEvent.click(within(screen.getByRole("group", { name: "Appointment" })).getByRole("button"));
  const dialog = await screen.findByRole("dialog", { name: "Choose date and time" });
  expect(within(dialog).getByRole("grid")).toBeVisible();
  const time = within(dialog).getByRole("group", { name: "Time" });
  enterDateTime(time, "21:45");
  expect(screen.getByRole("status", { hidden: true })).toHaveTextContent("2030-06-03T21:45");
  fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it.each([
  ["en", english, "Done"],
  ["it", italian, "Fine"],
] as const)(
  "resolves confirmation from the real compiled %s catalog",
  async (locale, messages, done) => {
    const i18n = setupI18n({ locale, messages: { [locale]: messages } });
    expect(i18n._("Done")).toBe(done);
    render(
      <I18nProvider i18n={i18n}>
        <ControlledDateTime />
      </I18nProvider>,
    );
    fireEvent.click(within(screen.getByRole("group", { name: "Appointment" })).getByRole("button"));
    const dialog = await screen.findByRole("dialog");
    const confirmation = within(dialog).getByRole("button", { name: done });
    expect(confirmation).toHaveTextContent(done);
    expect(within(dialog).queryByText("DPfwMq")).toBeNull();
    fireEvent.click(confirmation);
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);

it("preserves disabled, required and invalid states and handles invalid restored wall values", () => {
  const { rerender } = renderWithI18n(
    <DateTimePicker
      value="invalid"
      minValue="invalid"
      maxValue="invalid"
      onChange={vi.fn()}
      aria-label="Date"
      isDisabled
      isRequired
      isInvalid
    />,
  );
  expect(screen.getByRole("button")).toBeDisabled();
  for (const segment of screen.getAllByRole("spinbutton"))
    expect(segment).toHaveAttribute("aria-disabled", "true");
  rerender(
    <DateTimePicker
      value="2030-06-03T20:00"
      minValue="2030-06-03T21:00"
      maxValue="2030-06-03T23:00"
      onChange={vi.fn()}
      aria-label="Date"
      isInvalid
    />,
  );
  expect(screen.getByRole("group", { name: "Date" })).toHaveAttribute("data-invalid", "true");
});

function ControlledTime({ changed }: { changed: (value: string) => void }) {
  const [value, setValue] = useState("20:00");
  return (
    <TimePicker
      value={value}
      minValue="20:00"
      maxValue="22:00"
      onChange={(next) => {
        setValue(next);
        changed(next);
      }}
      aria-label="Start time"
    />
  );
}

it("uses HeroUI TimeField for a date fixed by its event and preserves time bounds", () => {
  const onChange = vi.fn();
  const { rerender } = renderWithI18n(<ControlledTime changed={onChange} />);
  const field = screen.getByRole("group", { name: "Start time" });
  expect(within(field).queryByRole("spinbutton", { name: /^day/i })).toBeNull();
  enterDateTime(field, "20:30");
  expect(onChange).toHaveBeenLastCalledWith("20:30");
  clearDateTime(field);
  expect(onChange).toHaveBeenLastCalledWith("");
  rerender(
    <TimePicker
      value="invalid"
      minValue="bad"
      maxValue="bad"
      onChange={onChange}
      aria-label="Start time"
    />,
  );
  expect(
    within(screen.getByRole("group", { name: "Start time" })).getAllByRole("spinbutton")[0],
  ).toHaveAttribute("data-placeholder", "true");
});
