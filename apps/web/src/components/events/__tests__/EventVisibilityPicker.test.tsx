import { fireEvent, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { EventVisibilityPicker } from "../EventVisibilityPicker";

const callbacks = vi.hoisted(() => ({
  change: undefined as ((value: string) => void) | undefined,
}));
vi.mock("@heroui/react", async (original) => {
  const actual = await original<typeof import("@heroui/react")>();
  return {
    ...actual,
    RadioGroup: (props: ComponentProps<typeof actual.RadioGroup>) => {
      callbacks.change = props.onChange;
      return <actual.RadioGroup {...props} />;
    },
  };
});

it("shows disabled Public styling and its reason without an unavailable label", () => {
  const change = vi.fn();
  renderWithI18n(
    <EventVisibilityPicker
      value="PRIVATE"
      publicAllowed={false}
      locked={false}
      busy={false}
      onChange={change}
    />,
  );
  expect(screen.queryByText("Unavailable")).toBeNull();
  expect(
    screen.getByText("Select an approved public group to enable public events."),
  ).not.toBeNull();
  const publicRadio = screen.getByRole("radio", { name: "Public" }) as HTMLInputElement;
  expect(publicRadio.closest(".card")?.className).toContain("border-dashed");
  expect(publicRadio.disabled).toBe(true);
  expect((screen.getByRole("radio", { name: "Private" }) as HTMLInputElement).disabled).toBe(false);
  fireEvent.click(publicRadio);
  callbacks.change?.("PUBLIC");
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Event visibility: Field help" }));
  const help = screen.getByRole("dialog");
  expect(
    within(help).getByText(
      "Public events are visible to everyone and can be joined without group membership. Select an approved public group to enable this option.",
    ),
  ).not.toBeNull();
  expect(help.textContent).not.toMatch(/Private events/);
});
it.each(["PRIVATE", "PUBLIC"] as const)(
  "lets approved Public-group creation switch from %s",
  (value) => {
    const change = vi.fn();
    renderWithI18n(
      <EventVisibilityPicker
        value={value}
        publicAllowed
        locked={false}
        busy={false}
        onChange={change}
      />,
    );
    expect(screen.queryByText("Unavailable")).toBeNull();
    expect(
      screen.queryByText("Select an approved public group to enable public events."),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("radio", { name: value === "PRIVATE" ? "Public" : "Private" }),
    );
    expect(change).toHaveBeenCalledWith(value === "PRIVATE" ? "PUBLIC" : "PRIVATE");
  },
);
it.each([
  [true, false],
  [false, true],
  [true, true],
])("keeps visibility disabled when locked=%s busy=%s", (locked, busy) => {
  const change = vi.fn();
  renderWithI18n(
    <EventVisibilityPicker
      value="PUBLIC"
      publicAllowed
      locked={locked}
      busy={busy}
      onChange={change}
    />,
  );
  for (const radio of screen.getAllByRole("radio")) {
    expect((radio as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(radio);
  }
  if (locked) callbacks.change?.("PRIVATE");
  expect(change).not.toHaveBeenCalled();
  expect(Boolean(screen.queryByText("Event visibility cannot be changed after creation."))).toBe(
    locked,
  );
});
