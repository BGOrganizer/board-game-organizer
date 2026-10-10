import type {
  EventResponse,
  EventTableResponse,
  OrganizationMemberResponse,
} from "@board-game-organizer/schemas";
import { act, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import type { OrganizationMemberPicker } from "../../organizations/OrganizationMemberPicker";
import { EventTableInvitationPicker } from "../EventTableInvitationPicker";

const s = vi.hoisted(() => ({
  open: true,
  busy: false,
  invite: vi.fn(),
  props: {} as ComponentProps<typeof OrganizationMemberPicker>,
}));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useEventWindow: () => s.open,
  useEventActions: () => ({ busy: s.busy, invite: { mutateAsync: s.invite } }),
}));
vi.mock("@/lib/useCommunityApi", () => ({ useCommunityApi: () => ({ userId: "admin" }) }));
vi.mock("@/components/organizations/OrganizationMemberPicker", () => ({
  OrganizationMemberPicker: (props: ComponentProps<typeof OrganizationMemberPicker>) => {
    s.props = props;
    return <h1>{props.title}</h1>;
  },
}));
const event = {
  id: "event",
  organizationId: "org",
  role: "admin",
  status: "PUBLISHED",
  canModify: true,
} as EventResponse;
const table = {
  id: "table",
  status: "PLANNING",
  maxPlayers: 4,
  reservedCount: 1,
} as EventTableResponse;
const member = { userId: "member" } as OrganizationMemberResponse;
beforeEach(() => {
  vi.clearAllMocks();
  s.open = true;
  s.busy = false;
  s.invite.mockResolvedValue(undefined);
});
it("invites only eligible accepted members through the existing mutation and retains failure", async () => {
  const close = vi.fn();
  renderWithI18n(
    <EventTableInvitationPicker event={event} table={table} occupied={["taken"]} onClose={close} />,
  );
  expect(screen.getByRole("heading", { name: "Invite organization members" })).toBeTruthy();
  expect(s.props.organizationId).toBe("org");
  expect(s.props.isDisabled?.(member)).toBe(false);
  expect(s.props.isDisabled?.({ ...member, userId: "taken" })).toBe(true);
  s.props.onSelect({ ...member, userId: "taken" });
  expect(s.invite).not.toHaveBeenCalled();
  s.invite.mockRejectedValueOnce(new Error("network"));
  await act(async () => {
    s.props.onSelect(member);
  });
  expect(close).not.toHaveBeenCalled();
  await act(async () => {
    s.props.onSelect(member);
  });
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(s.invite).toHaveBeenLastCalledWith({
    eventId: "event",
    tableId: "table",
    userId: "member",
  });
  s.props.onClose();
  expect(close).toHaveBeenCalledTimes(2);
});
it.each(["busy", "role", "draft", "permission", "deadline", "fixed", "full"])(
  "blocks both selection and mutation for %s",
  (why) => {
    const close = vi.fn();
    const e = { ...event };
    const t = { ...table };
    if (why === "busy") s.busy = true;
    if (why === "role") e.role = "member";
    if (why === "draft") e.status = "DRAFT";
    if (why === "permission") e.canModify = false;
    if (why === "deadline") s.open = false;
    if (why === "fixed") t.status = "CREATED";
    if (why === "full") t.reservedCount = 4;
    renderWithI18n(
      <EventTableInvitationPicker event={e} table={t} occupied={[]} onClose={close} />,
    );
    expect(s.props.isDisabled?.(member)).toBe(true);
    s.props.onSelect(member);
    expect(s.invite).not.toHaveBeenCalled();
    s.props.onClose();
    expect(close).toHaveBeenCalledTimes(why === "busy" ? 0 : 1);
  },
);
