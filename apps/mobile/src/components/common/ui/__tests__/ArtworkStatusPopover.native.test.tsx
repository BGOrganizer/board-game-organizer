import { render, screen } from "@testing-library/react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { ArtworkStatusPopover } from "../ArtworkStatusPopover";

beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

it.each(["default", "compact"] as const)(
  "reserves the %s indicator shape without claiming participation before an authoritative role",
  async (size) => {
    const view = await render(<ArtworkStatusPopover kind={undefined} size={size} />, {
      wrapper: NativeTestProviders,
    });
    const placeholder = screen.getByLabelText("Loading…", { includeHiddenElements: true });
    const width = size === "compact" ? 28 : 44;
    expect(placeholder).toHaveStyle({ width, height: width });
    expect(screen.queryByRole("button")).toBeNull();

    await view.rerender(<ArtworkStatusPopover kind="member" size={size} />);
    const trigger = screen.getByRole("button", { name: "Group member" });
    expect(trigger).toHaveStyle({ minWidth: 44, minHeight: 44 });
    await pressMeasuredPopover(trigger);
    expect(screen.getByText("You are a member of this group.")).toBeVisible();
  },
);

it.each([
  ["manager", "Management", "Your current permissions allow managing this item."],
  ["demonstrator", "Demonstrator", "You are assigned to demonstrate a game."],
  ["waiting", "Waiting list", "You are on the waiting list, not assigned a place."],
] as const)(
  "shows the actual %s semantics on the compact artwork action",
  async (kind, title, information) => {
    await render(<ArtworkStatusPopover kind={kind} size="compact" />, {
      wrapper: NativeTestProviders,
    });
    await pressMeasuredPopover(screen.getByRole("button", { name: title }));
    expect(
      screen.getByRole("heading", { name: kind === "manager" ? "Role" : title }),
    ).toBeVisible();
    expect(screen.getByText(information)).toBeVisible();
  },
);

it("shows the invitation and custom heading before the fuller role is known", async () => {
  await render(<ArtworkStatusPopover kind={undefined} action="reply" label="Table access" />, {
    wrapper: NativeTestProviders,
  });
  await pressMeasuredPopover(screen.getByRole("button", { name: "Table access · Reply required" }));
  expect(screen.getByRole("heading", { name: "Table access" })).toBeVisible();
  expect(screen.getByText("You have received an invitation.")).toBeVisible();
  expect(screen.getByText("Open details to accept or decline your invitation.")).toBeVisible();
  expect(screen.queryByLabelText("Loading…", { includeHiddenElements: true })).toBeNull();
});

it("keeps view-only artwork help separate from membership and invitation actions", async () => {
  await render(<ArtworkStatusPopover kind="viewer" size="compact" />, {
    wrapper: NativeTestProviders,
  });
  const viewer = screen.getByRole("button", { name: "Viewer" });
  await pressMeasuredPopover(viewer);
  expect(screen.getByRole("heading", { name: "Viewer" })).toBeVisible();
  expect(screen.getByText("You can view this item.")).toBeVisible();
  expect(screen.queryByText("Open details to accept or decline your invitation.")).toBeNull();
  expect(screen.queryByText("Open Members to approve or reject membership requests.")).toBeNull();
});

it("keeps the full-size neutral management badge separate from a confirmed player role", async () => {
  await render(<ArtworkStatusPopover kind="manager" size="default" />, {
    wrapper: NativeTestProviders,
  });
  const action = screen.getByRole("button", { name: "Management" });
  expect(action).toHaveStyle({ minWidth: 44, minHeight: 44 });
  await pressMeasuredPopover(action);
  expect(screen.getByText("Your current permissions allow managing this item.")).toBeVisible();
  expect(screen.queryByText("You have a confirmed place at a table.")).toBeNull();
});
