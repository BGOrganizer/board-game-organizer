import { act, fireEvent, within } from "@testing-library/react";

/** Enter through React Aria's actual keyboard-editable date/time segments. */
export function enterDateTime(field: HTMLElement, value: string) {
  const [date, time] = value.split("T");
  const values = value.includes("T")
    ? {
        year: date.slice(0, 4),
        month: date.slice(5, 7),
        day: date.slice(8, 10),
        hour: time.slice(0, 2),
        minute: time.slice(3, 5),
      }
    : { hour: value.slice(0, 2), minute: value.slice(3, 5) };
  for (const [name, digits] of Object.entries(values)) {
    const segment = within(field).getByRole("spinbutton", { name: new RegExp(`^${name}`, "i") });
    if (
      Number(segment.getAttribute("aria-valuenow")) === Number(digits) &&
      !segment.hasAttribute("data-placeholder")
    )
      continue;
    act(() => segment.focus());
    fireEvent(
      segment,
      new InputEvent("beforeinput", {
        inputType: "insertText",
        data: digits,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement && field.contains(active)) act(() => active.blur());
}

export function clearDateTime(field: HTMLElement) {
  for (const segment of within(field).getAllByRole("spinbutton")) {
    act(() => segment.focus());
    for (let index = 0; index < 5 && !segment.hasAttribute("data-placeholder"); index++)
      fireEvent(
        segment,
        new InputEvent("beforeinput", {
          inputType: "deleteContentBackward",
          bubbles: true,
          cancelable: true,
        }),
      );
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement && field.contains(active)) act(() => active.blur());
}

export function readDateTime(field: HTMLElement) {
  const part = (name: string) =>
    field.querySelector(`[data-type="${name}"]`)?.getAttribute("aria-valuenow");
  const hour = part("hour"),
    minute = part("minute");
  if (!hour || !minute) return "";
  const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  const year = part("year"),
    month = part("month"),
    day = part("day");
  return year && month && day
    ? `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${time}`
    : time;
}
