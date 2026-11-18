import { RECORD_USER_ROLES, type RecordUserRole } from "@board-game-organizer/shared";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { Crown } from "lucide-react-native";
import { type ColorValue, processColor, StyleSheet, Text } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { IconBadge } from "../IconBadge";
import { UserAvatar } from "../UserAvatar";
import { UserListRow } from "../UserListRow";
import { UserRelationshipBadge } from "../UserRelationshipBadge";
import { UserRoleBadge } from "../UserRoleBadge";

beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

function avatarContainer() {
  const node = screen.container.queryAll(
    (candidate) => StyleSheet.flatten(candidate.props.style)?.isolation === "isolate",
  )[0];
  if (!node) throw new Error("Expected the actual avatar badge host container");
  return node;
}
function glyph(size: number) {
  const node = screen.container.queryAll(
    (candidate) =>
      candidate.type.startsWith("RNSVG") &&
      Number(candidate.props.bbWidth) === size &&
      Number(candidate.props.bbHeight) === size,
  )[0];
  if (!node) throw new Error(`Expected an actual ${size}dp SVG glyph host`);
  return node;
}
function multipleGlyphs() {
  return screen.container.queryAll(
    (candidate) => candidate.type.startsWith("RNSVG") && Number(candidate.props.bbWidth) === 8,
  );
}

function resolvedOpaqueColor(color: ColorValue | undefined) {
  // Undefined Uniwind tokens must fail: comparing two unresolved values is not
  // evidence of a shared opaque surface or distinct semantic foregrounds.
  expect(color).toBeDefined();
  const resolved = processColor(color);
  expect(typeof resolved).toBe("number");
  if (typeof resolved !== "number") throw new Error("Expected a resolved native semantic color");
  expect((resolved >>> 24) & 255).toBe(255);
  return resolved;
}

function resolvedOpaqueStroke(size: number) {
  // Lucide passes its color as SVG stroke. react-native-svg processes that
  // value into the native group's brush; the SVG viewport has no color prop.
  const group = glyph(size).queryAll(
    (node) => node.type === "RNSVGGroup" && node.props.stroke != null,
  )[0];
  if (!group) throw new Error(`Expected the actual ${size}dp glyph's native stroke brush`);
  const brush = group.props.stroke;
  expect(brush.type).toBe(0);
  expect(typeof brush.payload).toBe("number");
  if (typeof brush.payload !== "number") throw new Error("Expected a processed native ARGB stroke");
  expect((brush.payload >>> 24) & 255).toBe(255);
  return brush.payload;
}

describe("real native user badges", () => {
  it("uses the same opaque surface and 13dp icon in static, action and popover modes", async () => {
    const view = await render(<IconBadge icon={Crown} label="Admin" testID="static-badge" />, {
      wrapper: NativeTestProviders,
    });
    const informative = screen.getByTestId("static-badge", { includeHiddenElements: true });
    expect(informative).toHaveStyle({ width: 22, height: 22, borderRadius: 11 });
    const surface = StyleSheet.flatten(informative.props.style).backgroundColor;
    const opaqueSurface = resolvedOpaqueColor(surface);
    const defaultForeground = resolvedOpaqueStroke(13);
    const onPress = vi.fn();
    await view.rerender(
      <IconBadge
        icon={Crown}
        label="Lock player"
        color="danger"
        multiple
        onPress={onPress}
        isDisabled
        testID="seat-lock"
      />,
    );
    const action = screen.getByRole("button", { name: "Lock player" });
    expect(action).toBeDisabled();
    expect(action).toHaveStyle({ width: 22, height: 22, backgroundColor: surface });
    expect(resolvedOpaqueColor(StyleSheet.flatten(action.props.style).backgroundColor)).toBe(
      opaqueSurface,
    );
    expect(StyleSheet.flatten(action.props.style).opacity).toBeUndefined();
    const icon = glyph(13),
      plus = glyph(8);
    expect(icon).toHaveStyle({ opacity: 0.5 });
    const dangerForeground = resolvedOpaqueStroke(13);
    expect(dangerForeground).not.toBe(defaultForeground);
    expect(plus).toHaveStyle({ opacity: 0.5 });
    expect(resolvedOpaqueStroke(8)).toBe(dangerForeground);
    expect(plus.parent).toHaveStyle({
      top: 2,
      right: 2,
      width: 8,
      height: 8,
      backgroundColor: surface,
    });
    expect(22 + action.props.hitSlop * 2).toBe(44);
    await userEvent.setup().press(screen.getByRole("button", { name: "Lock player" }));
    expect(onPress).not.toHaveBeenCalled();
    await view.rerender(
      <IconBadge icon={Crown} label="Admin" title="Roles">
        <Text>Explanation</Text>
      </IconBadge>,
    );
    const explanatory = screen.getByRole("button", { name: "Admin" });
    expect(explanatory).toBeEnabled();
    expect(resolvedOpaqueColor(StyleSheet.flatten(explanatory.props.style).backgroundColor)).toBe(
      opaqueSurface,
    );
    expect(resolvedOpaqueStroke(13)).toBe(defaultForeground);
    await pressMeasuredPopover(screen.getByRole("button", { name: "Admin" }));
    expect(await screen.findByRole("heading", { name: "Roles" })).toBeTruthy();
    expect(screen.getByText("Explanation")).toBeTruthy();
  });

  it("preserves avatar fallback, online state and independent top/bottom badge space", async () => {
    const view = await render(<UserAvatar name="@Alex" />, { wrapper: NativeTestProviders });
    expect(avatarContainer()).toHaveStyle({ marginRight: 0, marginTop: 0, marginBottom: 0 });
    expect(screen.getByText("A")).toBeTruthy();
    await view.rerender(<UserAvatar name="" avatarUrl="https://images.test/avatar.png" />);
    const image = screen.container.queryAll((node) => node.type === "RCTImageView")[0];
    if (!image) throw new Error("Expected the actual native avatar image host");
    await fireEvent(image, "error", { nativeEvent: { error: "Fixture image unavailable" } });
    expect(screen.getByText("?")).toBeTruthy();
    await view.rerender(
      <UserAvatar
        name="Alex"
        online={false}
        badge={{
          icon: Crown,
          label: "Friends",
          color: "success",
          description: "Friendship accepted.",
        }}
      />,
    );
    expect(avatarContainer()).toHaveStyle({ marginTop: 0, marginBottom: 12 });
    expect(screen.getByRole("image", { name: "Offline" })).toBeTruthy();
    await pressMeasuredPopover(screen.getByRole("button", { name: "Friends" }));
    expect(await screen.findByText("Friendship accepted.")).toBeTruthy();
    await view.rerender(
      <UserAvatar
        name="Alex"
        online
        badgeContent={<Text>Roles</Text>}
        topBadgeContent={<Text>Lock</Text>}
      />,
    );
    const frame = avatarContainer();
    expect(frame).toHaveStyle({
      marginTop: 8,
      marginBottom: 8,
      marginRight: 12,
      isolation: "isolate",
    });
    expect(screen.getByRole("image", { name: "Online" })).toHaveStyle({ left: -1, zIndex: 1 });
    const decorations = frame.queryAll(() => true);
    expect(
      decorations.some(
        (node) =>
          StyleSheet.flatten(node.props.style)?.bottom === -20 &&
          StyleSheet.flatten(node.props.style)?.right === -20 &&
          StyleSheet.flatten(node.props.style)?.zIndex === 2,
      ),
    ).toBe(true);
    expect(
      decorations.some(
        (node) =>
          StyleSheet.flatten(node.props.style)?.top === -20 &&
          StyleSheet.flatten(node.props.style)?.right === -20 &&
          StyleSheet.flatten(node.props.style)?.zIndex === 2,
      ),
    ).toBe(true);
    await view.rerender(<UserAvatar name="Alex" topBadgeContent={<Text>Lock</Text>} />);
    expect(avatarContainer()).toHaveStyle({ marginRight: 12, marginTop: 12, marginBottom: 0 });
    await view.rerender(
      <UserAvatar name="Alex" badge={{ icon: Crown, label: "Friends", color: "success" }} />,
    );
    await pressMeasuredPopover(screen.getByRole("button", { name: "Friends" }));
    expect(await screen.findByRole("heading", { name: "Friends" })).toBeTruthy();
    expect(screen.getAllByText("Friends").length).toBeGreaterThan(0);
  });

  it("does not invent relationships and explains each independent relationship", async () => {
    const none = {
      id: "user-alex",
      blockedByMe: false,
      isFriend: false,
      isFollowing: false,
      isFollower: false,
    };
    const view = await render(<UserRelationshipBadge user={none} />, {
      wrapper: NativeTestProviders,
    });
    expect(screen.queryByRole("button")).toBeNull();
    await view.rerender(
      <UserRelationshipBadge
        user={{ ...none, blockedByMe: true, isFriend: true, isFollowing: true, isFollower: true }}
      />,
    );
    const label = "Blocked · Friends · Following · Followers";
    expect(multipleGlyphs()).toHaveLength(1);
    resolvedOpaqueStroke(13);
    await pressMeasuredPopover(screen.getByRole("button", { name: label }));
    expect(await screen.findByRole("heading", { name: "Connections" })).toBeTruthy();
    for (const description of [
      "People you have blocked.",
      "Friendship accepted.",
      "People you follow.",
      "People who follow you.",
    ])
      expect(screen.getByText(description)).toBeTruthy();
    await view.rerender(<UserRelationshipBadge user={{ ...none, isFriend: true }} />);
    expect(multipleGlyphs()).toHaveLength(0);
  });

  it("shows no role control for no roles and retains every supplied role explanation", async () => {
    const view = await render(<UserRoleBadge roles={[]} />, { wrapper: NativeTestProviders });
    expect(screen.queryByRole("button")).toBeNull();
    await view.rerender(<UserRoleBadge roles={["moderator"]} />);
    expect(screen.getByRole("button", { name: "Moderator" })).toBeEnabled();
    expect(multipleGlyphs()).toHaveLength(0);
    const roles: RecordUserRole[] = [
      "admin",
      "moderator",
      "demonstrator",
      "invitedPlayer",
      "waitingPlayer",
      "confirmedPlayer",
    ];
    await view.rerender(<UserRoleBadge roles={roles} />);
    expect(multipleGlyphs()).toHaveLength(1);
    const label = roles.map((role) => RECORD_USER_ROLES[role].message).join(" · ");
    await pressMeasuredPopover(screen.getByRole("button", { name: label }));
    expect(await screen.findByRole("heading", { name: "Roles and participation" })).toBeTruthy();
    for (const role of roles)
      expect(screen.getByText(RECORD_USER_ROLES[role].message)).toBeTruthy();
  });

  it("keeps both avatar controls and sibling actions in a disabled user row", async () => {
    const onPress = vi.fn();
    await render(
      <UserListRow
        name="Alex"
        badgeContent={<Text>Roles</Text>}
        topBadgeContent={<Text>Lock</Text>}
        onPress={onPress}
        isDisabled
        actions={<Text>Menu</Text>}
      />,
      { wrapper: NativeTestProviders },
    );
    expect(screen.getByRole("button", { name: "Alex" })).toBeDisabled();
    expect(screen.getByText("Roles")).toBeTruthy();
    expect(screen.getByText("Lock")).toBeTruthy();
    expect(screen.getByText("Menu")).toBeTruthy();
    await userEvent.setup().press(screen.getByRole("button", { name: "Alex" }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
