import type { GroupRecordResponse } from "@board-game-organizer/schemas";
import type { CreateGroupVariables } from "@board-game-organizer/shared";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { groupRecord, plannedEvent } from "@/test-fixtures/eventRecords";
import { renderWithI18n } from "@/test-utils";
import { GroupWizard } from "../GroupWizard";

const m = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  group: undefined as GroupRecordResponse | undefined,
  recovery: undefined as CreateGroupVariables | undefined,
}));
const friend = {
  id: "friend",
  name: "Ada",
  username: "ada",
  email: "ada@example.test",
  avatarUrl: null,
};
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: m.replace, back: m.back }) }));
vi.mock("@/lib/useCommunityApi", () => ({
  useCommunityApi: () => ({
    apiUrl: "https://api.test",
    userId: "owner",
    getToken: async () => "fresh",
  }),
}));
vi.mock("@board-game-organizer/shared", async (original) => ({
  ...(await original<typeof import("@board-game-organizer/shared")>()),
  useGroupRecord: () => ({ data: m.group, isPending: false }),
  useGroupRecordActions: () => ({
    create: { mutate: m.create },
    update: { mutate: m.update },
    busy: false,
  }),
  useClientMutationDraft: () => undefined,
  useGroupCreationDraft: () => (m.recovery ? { variables: m.recovery } : undefined),
  creationState: () => ({ phase: "failed" }),
  useFavoriteLocations: () => ({ status: { isError: false } }),
}));
vi.mock("@/components/contacts/PeoplePicker", () => ({
  PeoplePicker: ({
    onSelect,
    onClose,
  }: {
    onSelect: (user: typeof friend) => void;
    onClose: () => void;
  }) => (
    <>
      <button type="button" onClick={() => onSelect(friend)}>
        Select Ada
      </button>
      <button type="button" onClick={onClose}>
        Close picker
      </button>
    </>
  ),
}));
vi.mock("@/components/locations/SearchLocationPage", () => ({
  SearchLocationPage: ({
    onSelect,
  }: {
    onSelect: (value: (typeof plannedEvent.locations)[number]) => void;
  }) => (
    <button type="button" onClick={() => onSelect(plannedEvent.locations[0])}>
      Select verified venue
    </button>
  ),
}));
vi.mock("@/components/locations/LocationFavoriteButton", () => ({
  LocationFavoriteButton: () => null,
}));
// Prepared-asset bridge only. Actual logo upload/control paths have their own component tests.
vi.mock("../GroupLogoPicker", () => ({
  GroupLogoPicker: ({
    value,
    onChange,
  }: {
    value: unknown;
    onChange: (value: { id: string; preview: string } | null) => void;
  }) => (
    <>
      <button
        type="button"
        onClick={() =>
          onChange({
            id: "88888888-8888-4888-8888-888888888888",
            preview: "data:image/png;base64,AAAA",
          })
        }
      >
        Use uploaded logo
      </button>
      {value ? (
        <button type="button" onClick={() => onChange(null)}>
          Clear prepared logo
        </button>
      ) : null}
    </>
  ),
}));
beforeEach(() => {
  vi.clearAllMocks();
  m.group = undefined;
  m.recovery = undefined;
});
function addFriend() {
  fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
  fireEvent.click(screen.getByRole("button", { name: "Select Ada" }));
}
function nameGroup() {
  fireEvent.change(screen.getByRole("textbox", { name: "Group name" }), {
    target: { value: "Board Club" },
  });
}
it("resets selected friends on every actual visibility change and disables Public invitations", () => {
  renderWithI18n(<GroupWizard />);
  nameGroup();
  addFriend();
  expect(screen.getByText("Ada")).not.toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "Private" }));
  expect(screen.getByText("Ada")).not.toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "Public" }));
  expect(screen.queryByText("Ada")).toBeNull();
  expect((screen.getByRole("button", { name: "Add friend" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.getByText("Invitations are only available for private groups.")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
  expect(screen.queryByRole("button", { name: "Select Ada" })).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "Private" }));
  expect(screen.queryByText("Ada")).toBeNull();
  expect((screen.getByRole("button", { name: "Add friend" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  fireEvent.click(screen.getByRole("button", { name: "Create group" }));
  expect(m.create).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "PRIVATE",
      invitedUserIds: [],
      clientDraft: expect.objectContaining({ friends: [] }),
    }),
  );
  expect(m.replace).toHaveBeenCalledWith("/groups");
});
it("keeps Public logo and venue validation mandatory, including after clearing a required logo", () => {
  renderWithI18n(<GroupWizard />);
  nameGroup();
  addFriend();
  fireEvent.click(screen.getByRole("radio", { name: "Public" }));
  expect(
    (screen.getByRole("button", { name: "Submit for review" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Use uploaded logo" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose a location" }));
  fireEvent.click(screen.getByRole("button", { name: "Select verified venue" }));
  expect(
    (screen.getByRole("button", { name: "Submit for review" }) as HTMLButtonElement).disabled,
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Clear prepared logo" }));
  expect(
    (screen.getByRole("button", { name: "Submit for review" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Use uploaded logo" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
  expect(m.create).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "PUBLIC",
      invitedUserIds: [],
      clientDraft: expect.objectContaining({ friends: [] }),
    }),
  );
});
it("does not expose mutable visibility or creation invitations while editing", () => {
  m.group = groupRecord;
  renderWithI18n(<GroupWizard groupId={groupRecord.id} />);
  expect(screen.queryByRole("radiogroup")).toBeNull();
  expect(screen.queryByRole("button", { name: "Add friend" })).toBeNull();
  expect(screen.getByRole("button", { name: "Save changes" })).not.toBeNull();
});
it("does not resurrect invisible friends from an older failed Public draft", () => {
  m.recovery = {
    type: "PUBLIC",
    name: "Public club",
    logoAssetId: "88888888-8888-4888-8888-888888888888",
    location: plannedEvent.locations[0],
    invitedUserIds: [],
    clientDraft: { friends: [friend], name: "Public club" },
  };
  renderWithI18n(<GroupWizard draftId="failed" />);
  expect(screen.queryByText("Ada")).toBeNull();
  expect((screen.getByRole("button", { name: "Add friend" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Private" }));
  expect(screen.queryByText("Ada")).toBeNull();
});
