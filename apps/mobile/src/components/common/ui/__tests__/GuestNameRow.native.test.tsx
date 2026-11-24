import { act, fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { GuestNameRow } from "../GuestNameRow";

it("calls the guest action with a trimmed name and clears the draft after the owner accepts it", async () => {
  let accepted: (() => void) | undefined;
  const add = vi.fn((_name: string, reset: () => void) => {
    accepted = reset;
  });
  const guest = () => screen.getByLabelText("Guest name");
  const submit = () => screen.getByRole("button", { name: "Add a guest" });
  const user = userEvent.setup();
  const view = await render(<GuestNameRow maxLength={20} onAdd={add} isDisabled />, {
    wrapper: NativeTestProviders,
  });
  expect(submit()).toBeDisabled();
  await user.press(submit());
  expect(add).not.toHaveBeenCalled();

  await view.rerender(<GuestNameRow maxLength={20} onAdd={add} />);
  await fireEvent.changeText(guest(), "  Visiting Guide  ");
  await user.press(submit());
  expect(add).toHaveBeenCalledExactlyOnceWith("Visiting Guide", expect.any(Function));
  expect(guest()).toHaveDisplayValue("  Visiting Guide  ");
  if (!accepted) throw new Error("Expected the guest action's acceptance callback");

  await act(accepted);
  expect(guest()).toHaveDisplayValue("");
  expect(submit()).toBeDisabled();
});
