import { Label } from "@heroui/react";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { clearDateTime, enterDateTime } from "@/test-fixtures/dateTime";
import { renderWithI18n } from "@/test-utils";
import { messages as english } from "../../../../../../../messages/en.js";
import { messages as italian } from "../../../../../../../messages/it.js";
import { DateTimePicker } from "../DateTimePicker";
import { TimePicker } from "../TimePicker";

function ControlledDateTime({
  onConfirm,
  isDisabled,
}: {
  onConfirm?: (value: string) => void;
  isDisabled?: boolean;
} = {}) {
  const [value, setValue] = useState("2030-06-03T20:00");
  return (
    <>
      <DateTimePicker
        name="date"
        value={value}
        onChange={setValue}
        onConfirm={onConfirm}
        isDisabled={isDisabled}
        label={<Label>Appointment</Label>}
      />
      <output>{value}</output>
    </>
  );
}

function openPicker(label: string) {
  fireEvent.click(within(screen.getByRole("group", { name: label })).getByRole("button"));
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

it("confirms the last calendar day and time only through Done", async () => {
  const onConfirm = vi.fn();
  renderWithI18n(<ControlledDateTime onConfirm={onConfirm} />);
  openPicker("Appointment");
  const dialog = await screen.findByRole("dialog", { name: "Choose date and time" });
  fireEvent.click(within(within(dialog).getByRole("grid")).getByText("15", { exact: true }));
  enterDateTime(within(dialog).getByRole("group", { name: "Time" }), "21:45");
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith("2030-06-15T21:45");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("dismisses the popover without confirming its edited value", async () => {
  const onConfirm = vi.fn();
  renderWithI18n(<ControlledDateTime onConfirm={onConfirm} />);
  openPicker("Appointment");
  const dialog = await screen.findByRole("dialog");
  enterDateTime(within(dialog).getByRole("group", { name: "Time" }), "21:45");
  fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(onConfirm).not.toHaveBeenCalled();
});

it.each([
  { value: "", isRequired: true },
  { value: "invalid" },
  { value: "2030-06-03T20:00", minValue: "2030-06-03T21:00" },
  { value: "2030-06-03T20:00", maxValue: "2030-06-03T19:00" },
  { value: "2030-06-03T20:00", isInvalid: true },
])("does not confirm an incomplete or invalid candidate: %j", async (props) => {
  const onConfirm = vi.fn();
  renderWithI18n(
    <DateTimePicker {...props} onChange={vi.fn()} onConfirm={onConfirm} aria-label="Date" />,
  );
  openPicker("Date");
  const dialog = await screen.findByRole("dialog");
  const done = within(dialog).getByRole("button", { name: "Done" });
  expect(done).toBeDisabled();
  fireEvent.click(done);
  expect(onConfirm).not.toHaveBeenCalled();
});

it("keeps empty non-add fields dismissible and blocks confirmation if disabled while open", async () => {
  const { unmount } = renderWithI18n(
    <DateTimePicker value="" onChange={vi.fn()} aria-label="Date" />,
  );
  openPicker("Date");
  const empty = await screen.findByRole("dialog");
  fireEvent.click(within(empty).getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  unmount();
  const onConfirm = vi.fn();
  const view = renderWithI18n(<ControlledDateTime onConfirm={onConfirm} />);
  openPicker("Appointment");
  await screen.findByRole("dialog");
  view.rerender(<ControlledDateTime onConfirm={onConfirm} isDisabled />);
  const done = within(screen.getByRole("dialog")).getByRole("button", { name: "Done" });
  expect(done).toBeDisabled();
  fireEvent.click(done);
  expect(onConfirm).not.toHaveBeenCalled();
});

it.each([
  ["en", english, "Done"],
  ["it", italian, "Fine"],
] as const)(
  "resolves confirmation from the real compiled %s catalog",
  async (locale, messages, done) => {
    const i18n = setupI18n({ locale, messages: { [locale]: messages } });
    expect(i18n._("Done")).toBe(done);
    const onConfirm = vi.fn();
    render(
      <I18nProvider i18n={i18n}>
        <ControlledDateTime onConfirm={onConfirm} />
      </I18nProvider>,
    );
    fireEvent.click(within(screen.getByRole("group", { name: "Appointment" })).getByRole("button"));
    const dialog = await screen.findByRole("dialog");
    const confirmation = within(dialog).getByRole("button", { name: done });
    expect(confirmation).toHaveTextContent(done);
    expect(within(dialog).queryByText("DPfwMq")).toBeNull();
    fireEvent.click(confirmation);
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith("2030-06-03T20:00");
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
