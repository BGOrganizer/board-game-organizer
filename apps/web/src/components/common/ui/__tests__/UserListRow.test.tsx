import { fireEvent, screen, within } from "@testing-library/react";
import { LockKeyhole, UsersRound } from "lucide-react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { GroupedList } from "../GroupedList";
import { IconBadge } from "../IconBadge";
import { UserListRow } from "../UserListRow";

it("renders the shared identity, username, presence and independent row actions", () => {
  const action = vi.fn();
  renderWithI18n(
    <GroupedList>
      <UserListRow
        name="Alex Mancini"
        secondary="@alex"
        online
        actions={
          <button type="button" onClick={action}>
            Manage Alex
          </button>
        }
        titleAccessory={<span>Unread invitation</span>}
      >
        <span>Confirmed player</span>
      </UserListRow>
    </GroupedList>,
  );
  const row = screen.getByRole("listitem");
  expect(within(row).getByText("Alex Mancini")).toBeVisible();
  expect(within(row).getByText("@alex")).toBeVisible();
  expect(within(row).getByRole("img", { name: "Online" })).toBeVisible();
  expect(within(row).getByText("Unread invitation")).toBeVisible();
  expect(within(row).getByText("Confirmed player")).toBeVisible();
  fireEvent.click(within(row).getByRole("button", { name: "Manage Alex" }));
  expect(action).toHaveBeenCalledOnce();
});

it("keeps avatar badges outside the selectable identity and never nests buttons", () => {
  const select = vi.fn();
  const lock = vi.fn();
  renderWithI18n(
    <GroupedList>
      <UserListRow
        name="Player"
        onPress={select}
        accessibilityLabel="Choose player"
        titleAccessory={<button type="button">Player information</button>}
        badge={<IconBadge icon={UsersRound} label="Participant" />}
        topBadge={<IconBadge icon={LockKeyhole} label="Lock player" onPress={lock} />}
      >
        <button type="button">Player rating</button>
      </UserListRow>
    </GroupedList>,
  );
  const choose = screen.getByRole("button", { name: "Choose player" });
  const badge = screen.getByRole("button", { name: "Lock player" });
  expect(choose.contains(badge)).toBe(false);
  expect(choose.contains(screen.getByRole("button", { name: "Player information" }))).toBe(false);
  expect(choose.contains(screen.getByRole("button", { name: "Player rating" }))).toBe(false);
  expect(screen.getByRole("img", { name: "Participant" })).toBeVisible();
  fireEvent.click(badge);
  expect(lock).toHaveBeenCalledOnce();
  expect(select).not.toHaveBeenCalled();
  fireEvent.click(choose);
  expect(select).toHaveBeenCalledOnce();
});

it("uses the identity name for selection and blocks a disabled selection", () => {
  const select = vi.fn();
  const view = renderWithI18n(
    <UserListRow
      as="div"
      className="rounded-xl"
      name="Alex"
      onPress={select}
      isDisabled
      online={false}
    />,
  );
  const button = screen.getByRole("button", { name: "Alex" });
  expect(button).toBeDisabled();
  expect(screen.getByRole("img", { name: "Offline" })).toBeVisible();
  fireEvent.click(button);
  expect(select).not.toHaveBeenCalled();
  view.rerender(<UserListRow as="div" name="Alex" />);
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText("Alex")).toBeVisible();
});
