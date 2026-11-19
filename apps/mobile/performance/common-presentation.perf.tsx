import { measureRenders } from "@callstack/reassure-measure";
import { screen, userEvent } from "@testing-library/react-native";
import { Dices, LockKeyhole } from "lucide-react-native";
import type { ReactElement } from "react";
import { Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HeaderTitle } from "@/components/common/layout/HeaderTitle";
import { AddUserRow } from "@/components/common/ui/AddUserRow";
import { ClientRecordBadge } from "@/components/common/ui/ClientRecordBadge";
import { DateTimeInfo } from "@/components/common/ui/DateTimeInfo";
import { EmptyList } from "@/components/common/ui/EmptyList";
import { FormSubmitButton } from "@/components/common/ui/FormSubmitButton";
import { GroupedList } from "@/components/common/ui/GroupedList";
import { GroupedRow } from "@/components/common/ui/GroupedRow";
import { HelpPopover } from "@/components/common/ui/HelpPopover";
import { IconBadge } from "@/components/common/ui/IconBadge";
import { InvitationActions } from "@/components/common/ui/InvitationActions";
import { LinkedListCard } from "@/components/common/ui/LinkedListCard";
import { ListCard } from "@/components/common/ui/ListCard";
import { ListCardBody } from "@/components/common/ui/ListCardBody";
import { NotificationCountBadge } from "@/components/common/ui/NotificationCountBadge";
import { NotificationUnreadDot } from "@/components/common/ui/NotificationUnreadDot";
import { PendingArtworkBadge } from "@/components/common/ui/PendingArtworkBadge";
import { UserListRow } from "@/components/common/ui/UserListRow";
import { WizardSteps } from "@/components/common/ui/WizardSteps";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

type Scenario = { ui: ReactElement; assert: () => void | Promise<void>; reset?: () => void };

const scenarios: readonly [string, () => Scenario][] = [
  [
    "EmptyList: visible empty state",
    () => ({
      ui: <EmptyList icon={<Dices />}>No tables found</EmptyList>,
      assert: () => {
        expect(screen.getByText("No tables found")).toBeTruthy();
      },
    }),
  ],
  [
    "HeaderTitle: accessible heading",
    () => ({
      ui: <HeaderTitle title="Group details" icon={Dices} />,
      assert: () => {
        expect(screen.getByRole("header", { name: "Group details" })).toBeTruthy();
      },
    }),
  ],
  [
    "GroupedList and GroupedRow: populated two-row segment",
    () => ({
      ui: (
        <GroupedList segment={{ index: 1, count: 3 }}>
          <GroupedRow>
            <Text>Alice</Text>
          </GroupedRow>
          <GroupedRow>
            <Text>Bob</Text>
          </GroupedRow>
        </GroupedList>
      ),
      assert: () => {
        expect(screen.getByText("Alice")).toBeTruthy();
        expect(screen.getByText("Bob")).toBeTruthy();
      },
    }),
  ],
  [
    "ListCard: background and actual card content",
    () => ({
      ui: (
        <ListCard background={<Text>Artwork</Text>}>
          <Text>Event details</Text>
        </ListCard>
      ),
      assert: () => {
        expect(screen.getByTestId("card-background")).toBeTruthy();
        expect(screen.getByText("Event details")).toBeTruthy();
      },
    }),
  ],
  [
    "ListCardBody: unread heading and facts",
    () => ({
      ui: (
        <ListCardBody title="Evening games" unread titleAccessory={<Text>Private</Text>}>
          <Text>Four participants</Text>
        </ListCardBody>
      ),
      assert: () => {
        expect(screen.getByText("Evening games")).toBeTruthy();
        expect(screen.getByText("Four participants")).toBeTruthy();
        expect(screen.getByLabelText("Unread updates")).toBeTruthy();
      },
    }),
  ],
  [
    "NotificationUnreadDot: visible attention signal",
    () => ({
      ui: <NotificationUnreadDot active />,
      assert: () => {
        expect(screen.getByRole("image", { name: "Unread updates" })).toBeTruthy();
      },
    }),
  ],
  [
    "NotificationCountBadge: capped visible count",
    () => ({
      ui: <NotificationCountBadge count={120} counted corner />,
      assert: () => {
        expect(screen.getByLabelText("Notifications: 120")).toBeTruthy();
        expect(screen.getByText("99+")).toBeTruthy();
      },
    }),
  ],
  [
    "PendingArtworkBadge: accessible pending invitation",
    () => ({
      ui: <PendingArtworkBadge kind="invitation" label="Invitation pending" />,
      assert: () => {
        expect(screen.getByRole("image", { name: "Invitation pending" })).toBeTruthy();
      },
    }),
  ],
  [
    "ClientRecordBadge: failed save",
    () => ({
      ui: <ClientRecordBadge phase="failed" />,
      assert: () => {
        expect(screen.getByText("Not saved")).toBeTruthy();
      },
    }),
  ],
  [
    "DateTimeInfo: explicit start and end timezone",
    () => ({
      ui: (
        <DateTimeInfo
          startsAt="2030-06-12T18:00:00.000Z"
          endsAt="2030-06-12T20:30:00.000Z"
          timeZone="UTC"
        />
      ),
      assert: () => {
        const format = new Intl.DateTimeFormat("en", {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
        });
        expect(
          screen.getByLabelText(
            `Start time: ${format.format(new Date("2030-06-12T18:00:00.000Z"))}`,
          ),
        ).toBeTruthy();
        expect(
          screen.getByLabelText(`End time: ${format.format(new Date("2030-06-12T20:30:00.000Z"))}`),
        ).toBeTruthy();
      },
    }),
  ],
  [
    "WizardSteps: progress state",
    () => ({
      ui: <WizardSteps current={2} count={4} />,
      assert: () => {
        expect(screen.getByRole("progressbar", { name: "Steps" })).toHaveAccessibilityValue({
          min: 1,
          max: 4,
          now: 2,
        });
      },
    }),
  ],
  [
    "AddUserRow: generation action",
    () => {
      const action = vi.fn();
      return {
        ui: (
          <AddUserRow label="Generate invite" description="Invite a new player" onPress={action} />
        ),
        reset: () => action.mockClear(),
        assert: async () => {
          await userEvent.setup().press(screen.getByRole("button", { name: "Generate invite" }));
          expect(action).toHaveBeenCalledOnce();
        },
      };
    },
  ],
  [
    "InvitationActions: explicit accept and decline",
    () => {
      const accept = vi.fn(),
        decline = vi.fn();
      return {
        ui: (
          <InvitationActions
            placement="card"
            name="Alice"
            pending={false}
            onAccept={accept}
            onDecline={decline}
          />
        ),
        reset: () => {
          accept.mockClear();
          decline.mockClear();
        },
        assert: async () => {
          await userEvent.setup().press(screen.getByRole("button", { name: "Accept: Alice" }));
          await userEvent.setup().press(screen.getByRole("button", { name: "Decline: Alice" }));
          expect(accept).toHaveBeenCalledOnce();
          expect(decline).toHaveBeenCalledOnce();
        },
      };
    },
  ],
  [
    "IconBadge: seat lock action",
    () => {
      const action = vi.fn();
      return {
        ui: <IconBadge icon={LockKeyhole} label="Lock seat" onPress={action} multiple />,
        reset: () => action.mockClear(),
        assert: async () => {
          await userEvent.setup().press(screen.getByRole("button", { name: "Lock seat" }));
          expect(action).toHaveBeenCalledOnce();
        },
      };
    },
  ],
  [
    "HelpPopover: open explanation",
    () => ({
      ui: (
        <HelpPopover label="Explain voting" title="Voting">
          <Text>Choose a positive preference.</Text>
        </HelpPopover>
      ),
      assert: async () => {
        await pressMeasuredPopover(screen.getByRole("button", { name: "Explain voting" }));
        expect(await screen.findByRole("heading", { name: "Voting" })).toBeVisible();
        expect(screen.getByText("Choose a positive preference.")).toBeVisible();
      },
    }),
  ],
  [
    "LinkedListCard and cover content: actual card navigation",
    () => {
      const action = vi.fn();
      return {
        ui: (
          <LinkedListCard
            label="Open event"
            onPress={action}
            artwork={<Text>Artwork</Text>}
            heading={<Text>Evening event</Text>}
            artworkLayout="cover"
          >
            <Text>Four seats</Text>
          </LinkedListCard>
        ),
        reset: () => action.mockClear(),
        assert: async () => {
          await userEvent.setup().press(screen.getByRole("button", { name: "Open event" }));
          expect(action).toHaveBeenCalledOnce();
          expect(screen.getByText("Evening event")).toBeTruthy();
        },
      };
    },
  ],
  [
    "FormSubmitButton: submit action",
    () => {
      const action = vi.fn();
      return {
        ui: (
          <FormSubmitButton accessibilityLabel="Save changes" onPress={action}>
            <Text>Save</Text>
          </FormSubmitButton>
        ),
        reset: () => action.mockClear(),
        assert: async () => {
          await userEvent.setup().press(screen.getByRole("button", { name: "Save changes" }));
          expect(action).toHaveBeenCalledOnce();
        },
      };
    },
  ],
  [
    "UserListRow and UserAvatar: accessible user navigation",
    () => {
      const action = vi.fn();
      return {
        ui: <UserListRow name="Alice" secondary="@alice" online onPress={action} />,
        reset: () => action.mockClear(),
        assert: async () => {
          expect(screen.getByText("@alice")).toBeTruthy();
          await userEvent.setup().press(screen.getByRole("button", { name: "Alice" }));
          expect(action).toHaveBeenCalledOnce();
        },
      };
    },
  ],
];

beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

for (const [name, prepare] of scenarios) {
  it(`actual native rendering — ${name}`, async () => {
    const fixture = prepare();
    const measurements = await measureRenders(fixture.ui, {
      wrapper: NativeTestProviders,
      beforeEach: fixture.reset,
      scenario: async () => fixture.assert(),
    });
    assertRenderMeasurement(measurements);
  });
}
