import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { AddUserRow } from "../AddUserRow";

it("exposes an accessible invitation action in a list row", () => {
  const onPress = vi.fn();
  renderWithI18n(<AddUserRow label="Invite friends" onPress={onPress} />);
  const row = screen.getByRole("listitem");
  const action = within(row).getByRole("button", { name: "Invite friends" });
  expect(action).toHaveAttribute("data-form-control");
  expect(action.querySelector('[aria-hidden="true"]')).toBeTruthy();
  expect(within(row).getAllByRole("button")).toHaveLength(1);
  fireEvent.click(action);
  expect(onPress).toHaveBeenCalledOnce();
});

it("keeps description and trailing actions independent from the invitation action", () => {
  const invite = vi.fn();
  const copy = vi.fn();
  renderWithI18n(
    <AddUserRow
      label="Generate invitation"
      description="Share a one-use link"
      onPress={invite}
      actions={
        <button type="button" onClick={copy}>
          Copy invitation
        </button>
      }
    />,
  );
  expect(screen.getByText("Share a one-use link")).toBeTruthy();
  const copyAction = screen.getByRole("button", { name: "Copy invitation" });
  expect(copyAction.closest("button")?.parentElement?.closest("button")).toBeNull();
  fireEvent.click(copyAction);
  expect(copy).toHaveBeenCalledOnce();
  expect(invite).not.toHaveBeenCalled();
});

it("blocks disabled invitations while retaining the label and description", () => {
  const onPress = vi.fn();
  renderWithI18n(
    <AddUserRow
      label="Invite friends"
      description="Invitations unavailable"
      onPress={onPress}
      isDisabled
    />,
  );
  const action = screen.getByRole("button", { name: "Invite friends" }) as HTMLButtonElement;
  expect(action.disabled).toBe(true);
  expect(screen.getByText("Invitations unavailable")).toBeTruthy();
  fireEvent.click(action);
  expect(onPress).not.toHaveBeenCalled();
});
