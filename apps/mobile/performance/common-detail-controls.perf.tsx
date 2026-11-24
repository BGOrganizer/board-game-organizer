import { measureRenders } from "@callstack/reassure-measure";
import { fireEvent, screen, userEvent } from "@testing-library/react-native";
import { Dices, Plus, UsersRound } from "lucide-react-native";
import { Text } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HeaderBackButton } from "@/components/common/layout/HeaderBackButton";
import { ExpandableGroupedRow } from "@/components/common/ui/ExpandableGroupedRow";
import { FloatingActions } from "@/components/common/ui/FloatingActions";
import { FormInteractionScope } from "@/components/common/ui/FormInteractionScope";
import { HelpSectionCard } from "@/components/common/ui/HelpSectionCard";
import { IconLegend } from "@/components/common/ui/IconLegend";
import { InfoSection } from "@/components/common/ui/InfoSection";
import { ListPage } from "@/components/common/ui/ListPage";
import { MemberActions } from "@/components/common/ui/MemberActions";
import { RecordIdentityCard } from "@/components/common/ui/RecordIdentityCard";
import { RuntimeError } from "@/components/common/ui/RuntimeError";
import { ScheduleOptionsPopover } from "@/components/common/ui/ScheduleOptionsPopover";
import { ScreenScrollView } from "@/components/common/ui/ScreenScrollView";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { assertRenderMeasurement } from "./assertRenderMeasurement";

beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

it("Common detail controls: open the section guide on a real identity card", async () => {
  const back = vi.fn();
  const result = await measureRenders(
    <ListPage>
      <HeaderBackButton label="Back to group" onPress={back} />
      <ScreenScrollView hasFloatingActions>
        <RecordIdentityCard
          title="Friday games"
          icon={Dices}
          background={<Text>Board artwork</Text>}
        >
          <Text>Private event</Text>
        </RecordIdentityCard>
        <HelpSectionCard title="Participants" label="About participants" icon={UsersRound}>
          <IconLegend items={[{ icon: Dices, description: "Accepted players occupy a seat." }]} />
        </HelpSectionCard>
      </ScreenScrollView>
    </ListPage>,
    {
      wrapper: NativeTestProviders,
      beforeEach: () => {
        back.mockClear();
      },
      scenario: async () => {
        expect(screen.getByRole("header", { name: "Friday games" })).toBeVisible();
        expect(screen.getByText("Private event")).toBeVisible();
        expect(screen.getByText("Section guide")).toBeVisible();
        expect(screen.queryByText("Accepted players occupy a seat.")).toBeNull();
        await pressMeasuredPopover(screen.getByRole("button", { name: "About participants" }));
        expect(await screen.findByText("Accepted players occupy a seat.")).toBeVisible();
        await fireEvent.press(screen.getByRole("button", { name: "Back to group" }));
        expect(back).toHaveBeenCalledOnce();
      },
    },
  );
  assertRenderMeasurement(result);
});

it("Common schedule controls: reveal another date and dispatch a floating action", async () => {
  const add = vi.fn();
  const result = await measureRenders(
    <FormInteractionScope>
      <ScreenScrollView hasFloatingActions>
        <InfoSection
          label="Planning details"
          icon={Dices}
          headerAccessory={
            <ScheduleOptionsPopover
              name="Friday games"
              kind="dates"
              planning
              rows={[
                { id: "date-1", date: { startsAt: "2030-06-07T19:00:00Z", timeZone: "UTC" } },
                { id: "date-2", date: { startsAt: "2030-06-08T20:30:00Z", timeZone: "UTC" } },
              ]}
            />
          }
        >
          <Text>Pending selection</Text>
        </InfoSection>
      </ScreenScrollView>
      <FloatingActions label="Add date" onPress={add}>
        <Plus accessible={false} />
      </FloatingActions>
    </FormInteractionScope>,
    {
      wrapper: NativeTestProviders,
      beforeEach: () => {
        add.mockClear();
      },
      scenario: async () => {
        expect(screen.getByRole("header", { name: "Planning details" })).toBeVisible();
        expect(screen.getByText("Pending selection")).toBeVisible();
        await fireEvent.press(screen.getByRole("button", { name: "Add date" }));
        expect(add).toHaveBeenCalledOnce();
        await pressMeasuredPopover(
          screen.getByRole("button", { name: "Dates and times: Friday games" }),
        );
        expect(await screen.findByRole("heading", { name: "Dates and times" })).toBeVisible();
        expect(screen.getByText(/June 8, 2030/)).toBeVisible();
      },
    },
  );
  assertRenderMeasurement(result);
});

it("ExpandableGroupedRow: expand a ranked row and keep its summary", async () => {
  const result = await measureRenders(
    <ExpandableGroupedRow
      summary={<Text>Pat Player</Text>}
      disclosure={{
        label: "Show ranking for Pat",
        triggerText: "Ranking",
        content: <Text>Games won: 4</Text>,
      }}
    />,
    {
      wrapper: NativeTestProviders,
      scenario: async () => {
        expect(screen.getByText("Pat Player")).toBeVisible();
        const trigger = screen.getByLabelText("Show ranking for Pat");
        expect(screen.getByRole("button", { name: "Show ranking for Pat", expanded: false })).toBe(
          trigger,
        );
        await userEvent.setup().press(trigger);
        expect(
          screen.getByRole("button", { name: "Show ranking for Pat", expanded: true }),
        ).toBeTruthy();
        expect(screen.getByText("Games won: 4")).toBeTruthy();
        expect(screen.getByText("Pat Player")).toBeVisible();
      },
    },
  );
  assertRenderMeasurement(result);
});

it("MemberActions: select the requested moderation action", async () => {
  const action = vi.fn();
  const open = vi.fn();
  const result = await measureRenders(
    <MemberActions
      title="Manage Pat"
      busy={false}
      items={[{ action: "remove", label: "Remove Pat", icon: <UsersRound accessible={false} /> }]}
      onAction={action}
      onOpenChange={open}
    />,
    {
      wrapper: NativeTestProviders,
      beforeEach: () => {
        action.mockClear();
        open.mockClear();
      },
      scenario: async () => {
        expect(action).not.toHaveBeenCalled();
        await userEvent.setup().press(screen.getByRole("button", { name: "Manage Pat" }));
        expect(open).toHaveBeenLastCalledWith(true);
        // Portal body is present in React while worklet-driven native visibility is device-owned.
        await fireEvent.press(
          screen.getByRole("button", { name: "Remove Pat", includeHiddenElements: true }),
        );
        expect(action).toHaveBeenCalledExactlyOnceWith("remove");
        expect(open).toHaveBeenLastCalledWith(false);
      },
    },
  );
  assertRenderMeasurement(result);
});

it("RuntimeError: render the bounded diagnostic outside app providers", async () => {
  const stack = "Component frame\n".repeat(150);
  const result = await measureRenders(
    <RuntimeError message="Unexpected state" componentStack={stack} />,
    {
      scenario: async () => {
        expect(screen.getByText("Errore imprevisto")).toBeTruthy();
        expect(screen.getByText("Unexpected state")).toBeTruthy();
        expect(screen.getByText(stack.slice(0, 1500))).toHaveProp("numberOfLines", 30);
        expect(screen.queryByText(stack)).toBeNull();
      },
    },
  );
  assertRenderMeasurement(result);
});
