import { fireEvent, screen, within } from "@testing-library/react";
import { Crown } from "lucide-react";
import { expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { IconBadge } from "../IconBadge";
import { UserAvatar } from "../UserAvatar";
import { UserRelationshipBadge } from "../UserRelationshipBadge";
import { UserRoleBadge } from "../UserRoleBadge";

it("supports a static information badge without creating a button", () => {
  renderWithI18n(<IconBadge icon={Crown} label="Admin" />);
  expect(screen.getByRole("img", { name: "Admin" })).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
});

it("keeps an action disabled, then invokes only its handler", () => {
  const press = vi.fn();
  const { rerender } = renderWithI18n(
    <IconBadge
      icon={Crown}
      label="Lock player"
      color="danger"
      multiple
      onPress={press}
      isDisabled
    />,
  );
  const button = screen.getByRole("button", { name: "Lock player" });
  expect(button.getAttribute("disabled")).not.toBeNull();
  expect(button.style.opacity).toBe("1");
  expect(button.classList.contains("bg-transparent")).toBe(true);
  expect(button.querySelector('[data-slot="chip"]')?.classList.contains("chip--secondary")).toBe(
    true,
  );
  expect(button.querySelector(".lucide-crown")?.classList.contains("opacity-50")).toBe(true);
  fireEvent.click(button);
  expect(press).not.toHaveBeenCalled();
  rerender(<IconBadge icon={Crown} label="Lock player" onPress={press} />);
  fireEvent.click(screen.getByRole("button", { name: "Lock player" }));
  expect(press).toHaveBeenCalledTimes(1);
});

it("uses a 22px Chip, a 13px glyph and an absolute same-color plus inside a 44px trigger", async () => {
  renderWithI18n(
    <IconBadge icon={Crown} label="Admin and player" color="warning" multiple title="Roles">
      <p>Both facts remain independent.</p>
    </IconBadge>,
  );
  const button = screen.getByRole("button", { name: "Admin and player" });
  expect(button.className).toContain("size-11");
  expect(button.classList.contains("bg-transparent")).toBe(true);
  expect(button.querySelector(".size-\\[22px\\]")).toBeTruthy();
  expect(button.querySelector('[data-slot="chip"]')?.classList.contains("chip--secondary")).toBe(
    true,
  );
  expect(button.querySelector(".lucide-crown")?.classList.contains("size-[13px]")).toBe(true);
  const plus = button.querySelector(".lucide-plus");
  expect(plus?.classList.contains("absolute")).toBe(true);
  expect(plus?.classList.contains("top-0.5")).toBe(true);
  expect(plus?.classList.contains("right-0.5")).toBe(true);
  expect(plus?.classList.contains("size-2")).toBe(true);
  expect(plus?.getAttribute("class")).not.toMatch(/-top|-right/);
  expect(plus?.getAttribute("class")).not.toContain("text-");
  expect(plus?.classList.contains("bg-default")).toBe(true);
  fireEvent.click(button);
  const dialog = await screen.findByRole("dialog", { name: "Roles" });
  expect(within(dialog).getByText("Both facts remain independent.")).toBeTruthy();
});

it.each(["sm", "md", "lg"] as const)(
  "keeps %s avatar size and separates dual 44px targets without overlap",
  (size) => {
    const { container } = renderWithI18n(
      <UserAvatar
        name="@Alex"
        size={size}
        online
        badge={<IconBadge icon={Crown} label="Roles" onPress={() => {}} />}
        topBadge={<IconBadge icon={Crown} label="Lock" onPress={() => {}} />}
      />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    const pixels = { sm: 32, md: 40, lg: 48 }[size];
    expect(wrapper.classList.contains("isolate")).toBe(true);
    expect(wrapper.children[0].classList.contains("z-0")).toBe(true);
    const bottom = wrapper.children[2] as HTMLElement;
    const top = wrapper.children[3] as HTMLElement;
    expect(Number.parseFloat(top.style.top)).toBe(-(44 - pixels / 2));
    expect(Number.parseFloat(bottom.style.bottom)).toBe(-(44 - pixels / 2));
    expect(pixels - Number.parseFloat(top.style.top) - Number.parseFloat(bottom.style.bottom)).toBe(
      88,
    );
    expect(wrapper.style.marginTop).toBe(`${(64 - pixels) / 2}px`);
    expect(bottom.classList.contains("z-20")).toBe(true);
    expect(top.classList.contains("z-20")).toBe(true);
    expect(wrapper.children[1].className).toContain("-left-px");
  },
);

it("keeps single badges and online state, and needs no space without badges", () => {
  const { container, rerender } = renderWithI18n(
    <UserAvatar
      name="@Alex"
      avatarUrl="/avatar.png"
      online={false}
      badge={<IconBadge icon={Crown} label="Roles" onPress={() => {}} />}
    />,
  );
  let wrapper = container.firstElementChild as HTMLElement;
  expect(wrapper.style.marginBottom).toBe("12px");
  expect(wrapper.children[1].className).toContain("bg-muted");
  expect(wrapper.children[1].className).toContain("-right-px");
  rerender(<UserAvatar name="Alex" />);
  wrapper = container.firstElementChild as HTMLElement;
  expect(wrapper.style.marginRight).toBe("0px");
  expect(wrapper.children).toHaveLength(1);
  rerender(
    <UserAvatar
      name="Alex"
      online
      topBadge={<IconBadge icon={Crown} label="Lock" onPress={() => {}} />}
    />,
  );
  expect((container.firstElementChild as HTMLElement).children).toHaveLength(3);
});

it("shows only known canonical relationships and explains every independent fact", async () => {
  const { rerender } = renderWithI18n(<UserRelationshipBadge user={{ id: "user" }} />);
  expect(screen.queryByRole("button")).toBeNull();
  rerender(
    <UserRelationshipBadge
      user={{
        id: "user",
        blockedByMe: false,
        isFriend: false,
        isFollowing: false,
        isFollower: false,
      }}
    />,
  );
  expect(screen.queryByRole("button")).toBeNull();
  rerender(
    <UserRelationshipBadge
      user={{ id: "user", blockedByMe: true, isFriend: true, isFollowing: true, isFollower: true }}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Blocked · Friends · Following · Followers" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Connections" });
  for (const description of [
    "People you have blocked.",
    "Friendship accepted.",
    "People you follow.",
    "People who follow you.",
  ])
    expect(within(dialog).getByText(description)).toBeTruthy();
  await fireEvent.keyDown(dialog, { key: "Escape" });
  rerender(<UserRelationshipBadge user={{ id: "user", isFriend: true }} />);
  expect(screen.getByRole("button", { name: "Friends" }).querySelector(".lucide-plus")).toBeNull();
});

it("hides roles when none are authorized and supports one independent role", () => {
  const { rerender } = renderWithI18n(<UserRoleBadge roles={[]} />);
  expect(screen.queryByRole("button")).toBeNull();
  rerender(<UserRoleBadge roles={["admin"]} />);
  expect(screen.getByRole("button", { name: "Admin" }).querySelector(".lucide-plus")).toBeNull();
});
