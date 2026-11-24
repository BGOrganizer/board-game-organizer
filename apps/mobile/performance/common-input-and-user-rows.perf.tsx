import { measureRenders } from "@callstack/reassure-measure";
import { fireEvent, screen, userEvent } from "@testing-library/react-native";
import { UsersRound } from "lucide-react-native";
import { type ReactNode, useState } from "react";
import { Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ArtworkStatusPopover } from "@/components/common/ui/ArtworkStatusPopover";
import { FormInteractionScope } from "@/components/common/ui/FormInteractionScope";
import { GuestAvatar } from "@/components/common/ui/GuestAvatar";
import { GuestNameRow } from "@/components/common/ui/GuestNameRow";
import { Input } from "@/components/common/ui/Input";
import { InputField } from "@/components/common/ui/InputField";
import { InputSectionList } from "@/components/common/ui/InputSectionList";
import { RankPositionBadge } from "@/components/common/ui/RankPositionBadge";
import { UserList } from "@/components/common/ui/UserList";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { UserRelationshipBadge } from "@/components/common/ui/UserRelationshipBadge";
import { UserRoleBadge } from "@/components/common/ui/UserRoleBadge";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

function GuestEditor({ save }: { save: (name: string) => void }) {
  const [name, setName] = useState<string>();
  return (
    <>
      <GuestNameRow
        maxLength={80}
        onAdd={(guestName, reset) => {
          save(guestName);
          setName(guestName);
          reset();
        }}
      />
      {name ? <UserListRow name={name} avatarContent={<GuestAvatar name={name} />} /> : null}
    </>
  );
}

it("GuestNameRow and GuestAvatar: validate, add a trimmed guest and reset the input", async () => {
  const save = vi.fn();
  const result = await measureRenders(<GuestEditor save={save} />, {
    wrapper: NativeTestProviders,
    beforeEach: () => {
      save.mockClear();
    },
    scenario: async () => {
      const guest = screen.getByLabelText("Guest name");
      expect(screen.getByRole("button", { name: "Add a guest" })).toBeDisabled();
      await fireEvent.changeText(guest, "   ");
      expect(screen.getByRole("button", { name: "Add a guest" })).toBeDisabled();
      await fireEvent.changeText(guest, "  Guest Guide  ");
      await userEvent.setup().press(screen.getByRole("button", { name: "Add a guest" }));
      expect(save).toHaveBeenCalledExactlyOnceWith("Guest Guide");
      expect(screen.getByText("Guest Guide")).toBeVisible();
      expect(screen.getByLabelText("Guest name")).toHaveDisplayValue("");
    },
  });
  assertRenderMeasurement(result);
});

function SearchableSections() {
  const [query, setQuery] = useState("");
  const data = ["Ada", "Grace"].filter((name) => name.toLowerCase().includes(query.toLowerCase()));
  return (
    <FormInteractionScope>
      <InputSectionList
        sections={[{ key: "players", data }]}
        keyExtractor={(name) => name}
        renderItem={({ item }) => <UserListRow name={item} />}
        ListHeaderComponent={
          <InputField>
            <Input accessibilityLabel="Find a player" value={query} onChangeText={setQuery} />
          </InputField>
        }
      />
    </FormInteractionScope>
  );
}

it("InputSectionList: update a visible people page from the real controlled field", async () => {
  const result = await measureRenders(<SearchableSections />, {
    wrapper: NativeTestProviders,
    scenario: async () => {
      expect(screen.getByText("Ada")).toBeVisible();
      expect(screen.getByText("Grace")).toBeVisible();
      await fireEvent.changeText(screen.getByLabelText("Find a player"), "gr");
      expect(screen.getByLabelText("Find a player")).toHaveDisplayValue("gr");
      expect(screen.getByText("Grace")).toBeVisible();
      expect(screen.queryByText("Ada")).toBeNull();
    },
  });
  assertRenderMeasurement(result);
});

const noAction = async () => {};

function PeopleWindow({ retry }: { retry: () => void }) {
  return (
    <UserList
      data={["Ada", "Grace"]}
      pages={[
        {
          isLoading: false,
          isError: false,
          hasNextPage: false,
          fetchNextPage: noAction,
          refetch: noAction,
        },
        {
          isLoading: false,
          isError: true,
          hasNextPage: false,
          fetchNextPage: noAction,
          refetch: retry,
        },
      ]}
      keyExtractor={(name) => name}
      renderRow={(name) => <UserListRow name={name} />}
      empty="No connections"
      emptyIcon={<UsersRound />}
      error="Connections unavailable"
      skeleton={<Text>Loading connections</Text>}
    />
  );
}

it("UserList: retain cached people while retrying a failed source", async () => {
  const retry = vi.fn();
  const result = await measureRenders(<PeopleWindow retry={retry} />, {
    wrapper: NativeTestProviders,
    beforeEach: () => {
      retry.mockClear();
    },
    scenario: async () => {
      expect(screen.getByText("Ada")).toBeVisible();
      expect(screen.getByText("Grace")).toBeVisible();
      expect(screen.getByRole("alert")).toHaveTextContent("Connections unavailable");
      await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
      expect(retry).toHaveBeenCalledOnce();
      expect(screen.getByText("Ada")).toBeVisible();
      expect(screen.queryByText("No connections")).toBeNull();
    },
  });
  assertRenderMeasurement(result);
});

function RecordFacts({ children }: { children: ReactNode }) {
  return (
    <>
      <RankPositionBadge rank={1} />
      <RankPositionBadge rank={4} />
      <UserRoleBadge roles={["moderator"]} />
      <UserRelationshipBadge user={{ id: "pat", isFriend: true, isFollowing: true }} />
      {children}
    </>
  );
}

it("User badges: open roles on a ranked participant with relationship and attendance facts", async () => {
  const result = await measureRenders(
    <RecordFacts>
      <ArtworkStatusPopover kind="waiting" />
    </RecordFacts>,
    {
      wrapper: NativeTestProviders,
      scenario: async () => {
        expect(screen.getByRole("image", { name: "Position: #1" })).toBeTruthy();
        expect(screen.getByRole("image", { name: "Position: #4" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Friends · Following" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Waiting list" })).toBeEnabled();
        await pressMeasuredPopover(screen.getByRole("button", { name: "Moderator" }));
        expect(
          await screen.findByRole("heading", { name: "Roles and participation" }),
        ).toBeVisible();
        expect(screen.getByText("Moderator")).toBeVisible();
      },
    },
  );
  assertRenderMeasurement(result);
});
