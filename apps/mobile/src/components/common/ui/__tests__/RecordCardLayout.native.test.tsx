import { render, screen, userEvent } from "@testing-library/react-native";
import { Button } from "heroui-native/button";
import { Dices } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import {
  installNativePopoverMeasurements,
  pressMeasuredPopover,
} from "@/test/nativePopoverGeometry";
import { ClientRecordBadge } from "../ClientRecordBadge";
import { LinkedListCard } from "../LinkedListCard";
import { RecordIdentityCard } from "../RecordIdentityCard";
import { SearchHelpLabel } from "../SearchHelpLabel";

beforeEach(installNativePopoverMeasurements);
afterEach(() => vi.restoreAllMocks());

it.each([
  { phase: "saving", label: "Saving" },
  { phase: "verifying", label: "Verifying" },
  { phase: "failed", label: "Not saved" },
] as const)(
  "keeps the $phase badge in a persistent 24dp title slot while changing only its accessible icon",
  async ({ phase, label }) => {
    const view = await render(
      <NativeTestProviders>
        <ClientRecordBadge iconOnly />
      </NativeTestProviders>,
    );
    const reserved = screen.container.queryAll((node) => {
      const style = StyleSheet.flatten(node.props.style);
      return style?.width === 24 && style?.height === 24 && style?.alignSelf === "flex-start";
    })[0];
    expect(reserved).toBeTruthy();
    expect(screen.queryByLabelText(label)).toBeNull();
    await view.rerender(
      <NativeTestProviders>
        <ClientRecordBadge phase={phase} iconOnly />
      </NativeTestProviders>,
    );
    expect(reserved).toHaveStyle({ width: 24, height: 24, flexShrink: 0, alignSelf: "flex-start" });
    const badge = screen.getByLabelText(label);
    expect(badge).toHaveStyle({
      width: 24,
      height: 24,
      paddingHorizontal: 0,
      justifyContent: "center",
    });
    expect(screen.queryByText(label)).toBeNull();
    expect(
      badge.queryAll((node) => node.type.startsWith("RNSVG") && Number(node.props.bbWidth) === 14),
    ).toHaveLength(1);
    await view.rerender(
      <NativeTestProviders>
        <ClientRecordBadge phase={phase} iconSize={20} />
      </NativeTestProviders>,
    );
    expect(screen.getByText(label)).toBeVisible();
    expect(
      screen.container.queryAll(
        (node) => node.type.startsWith("RNSVG") && Number(node.props.bbWidth) === 20,
      ),
    ).toHaveLength(1);
  },
);

it.each(["cover", "thumbnail"] as const)(
  "keeps %s artwork, facts and native controls mounted while saving, and separates control presses from navigation",
  async (artworkLayout) => {
    const navigation = vi.fn(),
      info = vi.fn(),
      check = vi.fn();
    const fixture = (saving: boolean) => (
      <NativeTestProviders>
        <LinkedListCard
          label="Open resource"
          onPress={navigation}
          disabled={saving}
          controlsDisabled={saving}
          artworkLayout={artworkLayout}
          heading={<Text>Resource title</Text>}
          artwork={<View testID="uploaded-artwork" />}
          leadingActions={
            <Button onPress={info} accessibilityLabel="Information">
              <Button.Label>Info</Button.Label>
            </Button>
          }
          actions={
            <Button onPress={check} accessibilityLabel="Inspect">
              <Button.Label>Inspect</Button.Label>
            </Button>
          }
          notificationCount={2}
        >
          <Text>Cached resource facts</Text>
        </LinkedListCard>
      </NativeTestProviders>
    );
    const view = await render(fixture(false));
    const artwork = screen.getByTestId("uploaded-artwork");
    const originalInfo = screen.getByRole("button", { name: "Information" });
    const open = screen.getByRole("button", { name: "Open resource" });
    expect(open).toHaveProp("accessibilityValue", { text: "Unread updates" });
    await userEvent.setup().press(originalInfo);
    expect(info).toHaveBeenCalledOnce();
    expect(navigation).not.toHaveBeenCalled();
    await userEvent.setup().press(screen.getByRole("button", { name: "Inspect" }));
    expect(check).toHaveBeenCalledOnce();
    expect(navigation).not.toHaveBeenCalled();
    await view.rerender(fixture(true));
    expect(screen.getByTestId("uploaded-artwork", { includeHiddenElements: true })).toBe(artwork);
    expect(screen.getByRole("button", { name: "Information", includeHiddenElements: true })).toBe(
      originalInfo,
    );
    expect(screen.queryByRole("button", { name: "Information" })).toBeNull();
    expect(screen.getByText("Cached resource facts")).toBeVisible();
    expect(screen.getByRole("button", { name: "Open resource" })).toBeDisabled();
    await userEvent.setup().press(screen.getByRole("button", { name: "Open resource" }));
    expect(navigation).not.toHaveBeenCalled();
    const controlScope = screen.container.queryAll(
      (node) =>
        node.props.importantForAccessibility === "no-hide-descendants" &&
        node.props.pointerEvents === "none",
    );
    expect(controlScope.length).toBeGreaterThan(0);
    await view.rerender(fixture(false));
    expect(screen.getByRole("button", { name: "Information" })).toBe(originalInfo);
    await userEvent.setup().press(screen.getByRole("button", { name: "Open resource" }));
    expect(navigation).toHaveBeenCalledOnce();
  },
);

it("keeps a cover title full-width above bottom-aligned artwork and one overlapping horizontal action row", async () => {
  const title = "A long resource title that must have access to the full width of its card";
  const fixture = (controls: boolean) => (
    <NativeTestProviders>
      <LinkedListCard
        label="Open resource"
        onPress={() => {}}
        artworkLayout="cover"
        heading={<Text>{title}</Text>}
        artwork={<Text>Artwork</Text>}
        leadingActions={
          controls ? (
            <Button accessibilityLabel="Status">
              <Button.Label>Status</Button.Label>
            </Button>
          ) : undefined
        }
      >
        <Text>Facts</Text>
      </LinkedListCard>
    </NativeTestProviders>
  );
  const view = await render(fixture(true));
  expect(screen.getByText(title)).toBeVisible();
  expect(screen.getByText(title).parent).toHaveStyle({ minWidth: 0 });
  expect(screen.getByTestId("card-body-row")).toHaveStyle({
    flexDirection: "row",
    alignItems: "flex-end",
    position: "relative",
  });
  expect(screen.getByTestId("card-artwork")).toHaveStyle({ width: 96, height: 96, flexShrink: 0 });
  expect(screen.getByTestId("card-facts")).toHaveStyle({
    flex: 1,
    minWidth: 0,
    minHeight: 96,
    paddingBottom: 56,
  });
  expect(screen.getByTestId("card-controls")).toHaveProp("horizontal", true);
  expect(screen.getByTestId("card-controls")).toHaveStyle({
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 48,
    zIndex: 1,
  });
  await view.rerender(fixture(false));
  expect(screen.queryByTestId("card-controls")).toBeNull();
  expect(screen.getByTestId("card-facts")).toHaveStyle({ paddingBottom: 0 });
});

it("keeps complete artwork behind a naturally wrapping detail heading and controls at the bottom", async () => {
  const title = "An unusually long detail title which must remain fully visible";
  await render(
    <NativeTestProviders>
      <RecordIdentityCard
        title={title}
        icon={Dices}
        background={<View testID="detail-background" />}
        titleAccessory={<ClientRecordBadge iconOnly phase="saving" />}
        titleAction={
          <Button accessibilityLabel="Notifications">
            <Button.Label>Notices</Button.Label>
          </Button>
        }
      >
        <Button accessibilityLabel="State">
          <Button.Label>State</Button.Label>
        </Button>
      </RecordIdentityCard>
    </NativeTestProviders>,
  );
  const heading = screen.getByRole("header", { name: title });
  expect(heading).toHaveStyle({ flexShrink: 1, minWidth: 0 });
  expect(heading.props.numberOfLines).toBeUndefined();
  expect(heading.parent).toHaveStyle({
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 2,
    alignItems: "center",
  });
  expect(StyleSheet.flatten(heading.props.style).textShadowColor).toBeUndefined();
  expect(screen.getByTestId("record-identity-card")).toHaveStyle({
    minHeight: 224,
    paddingBottom: 4,
    flexGrow: 1,
  });
  expect(screen.getByTestId("detail-background")).toBeVisible();
  expect(screen.getByTestId("record-identity-controls")).toHaveProp("horizontal", true);
  expect(screen.getByTestId("record-identity-controls")).toHaveStyle({
    marginTop: "auto",
    width: "100%",
    height: 44,
    flexGrow: 0,
    flexShrink: 0,
  });
  expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible();
});

it("allows a long field-help label to shrink beside its actual 44dp control without truncating its help", async () => {
  const label = "Filter by a long resource name";
  await render(
    <NativeTestProviders>
      <SearchHelpLabel
        label={label}
        required
        help="Only matching authorized resources are shown."
      />
    </NativeTestProviders>,
  );
  const text = screen.getByText(`${label} *`);
  expect(text).toHaveStyle({ flexShrink: 1 });
  expect(text.parent).toHaveStyle({ flexShrink: 1, minWidth: 0, flexDirection: "row" });
  const trigger = screen.getByRole("button", { name: `${label}: Search help` });
  expect(trigger).toHaveStyle({ minWidth: 44, minHeight: 44 });
  await pressMeasuredPopover(trigger);
  expect(screen.getByText("Only matching authorized resources are shown.")).toBeVisible();
});
