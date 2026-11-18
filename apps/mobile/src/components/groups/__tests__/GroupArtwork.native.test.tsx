import * as sharedArtwork from "@board-game-organizer/shared/artwork";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { afterEach, expect, it, vi } from "vitest";
import { NativeTestProviders } from "@/test/NativeTestProviders";
import { groupRecord } from "../../../../../web/src/test-fixtures/eventRecords";
import { GroupArtwork } from "../GroupArtwork";

const firstUri = "https://assets.example.test/a.png";
const secondUri = "https://assets.example.test/b.png";
function image() {
  const host = screen.container.queryAll((node) => node.type === "RCTImageView")[0];
  if (!host) throw new Error("Expected an actual React Native uploaded-logo Image host");
  return host;
}
function artworkFrame() {
  const frame = screen.container.queryAll(
    (node) =>
      typeof node.props.onLayout === "function" &&
      StyleSheet.flatten(node.props.style)?.justifyContent === "center",
  )[0];
  if (!frame) throw new Error("Expected the actual GroupArtwork layout boundary");
  return frame;
}
afterEach(() => vi.restoreAllMocks());

it("keeps uploaded logos first and scopes late error/load events to their original URI", async () => {
  const group = { ...groupRecord, logo: firstUri };
  const view = await render(
    <NativeTestProviders>
      <GroupArtwork group={group} size={96} />
    </NativeTestProviders>,
  );
  const original = image();
  const originalError = original.props.onError;
  const originalLoad = original.props.onLoad;
  expect(original.props.source).toEqual(
    expect.arrayContaining([expect.objectContaining({ uri: firstUri })]),
  );
  expect(original).toHaveProp("resizeMode", "contain");
  expect(screen.queryByTestId("dicebear-groups-image", { includeHiddenElements: true })).toBeNull();
  await fireEvent(original, "error", { nativeEvent: { error: "Cannot load fixture logo" } });
  expect(screen.getByTestId("dicebear-groups-image", { includeHiddenElements: true })).toBeTruthy();
  await view.rerender(
    <NativeTestProviders>
      <GroupArtwork group={{ ...group, logo: secondUri }} size={96} />
    </NativeTestProviders>,
  );
  const current = image();
  expect(current.props.source).toEqual(
    expect.arrayContaining([expect.objectContaining({ uri: secondUri })]),
  );
  // Native events already queued for an unmounted image can still be delivered
  // by the platform. Retain only public host event handlers for this boundary.
  await act(() => {
    originalError({ nativeEvent: { error: "Late original error" } });
    originalLoad({ nativeEvent: { source: { width: 300, height: 100 } } });
  });
  expect(image()).toBe(current);
  expect(current).toHaveStyle({ width: 96, height: 96 });
  expect(screen.queryByTestId("dicebear-groups-image", { includeHiddenElements: true })).toBeNull();
  await view.rerender(
    <NativeTestProviders>
      <GroupArtwork group={{ ...group, logo: null }} size={96} />
    </NativeTestProviders>,
  );
  expect(screen.getByTestId("dicebear-groups-image", { includeHiddenElements: true })).toBeTruthy();
});

it.each(["thumbnail", "cover", "background"] as const)(
  "contains an uploaded wide logo within the actual %s frame without cropping",
  async (presentation) => {
    await render(
      <NativeTestProviders>
        <GroupArtwork
          group={{ ...groupRecord, logo: firstUri }}
          size={96}
          presentation={presentation}
        />
      </NativeTestProviders>,
    );
    await fireEvent.layout(artworkFrame(), { width: 240, height: 120, x: 0, y: 0 });
    await fireEvent(image(), "load", { nativeEvent: { source: { width: 300, height: 100 } } });
    expect(image()).toHaveProp("resizeMode", "contain");
    expect(image()).toHaveStyle({
      width: presentation === "cover" ? 232 : 240,
      height: presentation === "cover" ? 232 / 3 : 80,
      borderRadius: 12,
      overflow: "hidden",
    });
    if (presentation !== "thumbnail")
      expect(artworkFrame()).toHaveStyle({ position: "absolute", inset: 0 });
  },
);

it("retains stable generated fallback geometry for the resource seed across size and role changes", async () => {
  const generate = vi.spyOn(sharedArtwork, "createResourceArtwork");
  const view = await render(
    <NativeTestProviders>
      <GroupArtwork group={{ ...groupRecord, logo: null }} size={64} />
    </NativeTestProviders>,
  );
  const drawing = () =>
    screen
      .getByTestId("dicebear-groups-image", { includeHiddenElements: true })
      .queryAll((node) => typeof node.props.d === "string")
      .map((node) => node.props.d);
  const paths = drawing();
  expect(paths.length).toBeGreaterThan(0);
  await view.rerender(
    <NativeTestProviders>
      <GroupArtwork group={{ ...groupRecord, logo: null, role: "accepted" }} size={96} />
    </NativeTestProviders>,
  );
  expect(drawing()).toEqual(paths);
  expect(screen.getByTestId("dicebear-groups-image", { includeHiddenElements: true })).toHaveStyle({
    width: 96,
    height: 96,
  });
  await view.rerender(
    <NativeTestProviders>
      <GroupArtwork
        group={{
          ...groupRecord,
          id: "44444444-4444-4444-8444-444444444444",
          logo: null,
          role: "accepted",
        }}
        size={96}
      />
    </NativeTestProviders>,
  );
  expect(generate).toHaveBeenLastCalledWith(
    "groups",
    "44444444-4444-4444-8444-444444444444",
    "none",
  );
  expect(drawing().length).toBeGreaterThan(0);
});

it.each([
  { role: "admin", label: "Group admin" },
  { role: "invited", label: "Invitation received" },
  { role: "requested", label: "Membership requested" },
] as const)(
  "announces the optional $role overlay and removes it when status is none",
  async ({ role, label }) => {
    const group = { ...groupRecord, logo: firstUri, role };
    const view = await render(
      <NativeTestProviders>
        <GroupArtwork group={group} />
      </NativeTestProviders>,
    );
    expect(screen.getByLabelText(label)).toBeVisible();
    await view.rerender(
      <NativeTestProviders>
        <GroupArtwork group={group} status="none" />
      </NativeTestProviders>,
    );
    expect(screen.queryByLabelText(label)).toBeNull();
    expect(image()).toBeTruthy();
  },
);
