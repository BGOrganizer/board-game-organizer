import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
} from "@testing-library/react-native";
import { afterAll, beforeAll, expect, it } from "vitest";
import { installNativeUniwindInterop } from "../../performance/uniwind-native-interop";

const require = createRequire(import.meta.url);
let interop: ReturnType<typeof installNativeUniwindInterop>;
beforeAll(() => {
  interop = installNativeUniwindInterop();
});
afterAll(async () => {
  await cleanup();
  interop.dispose();
});

it("uses actual native Uniwind wrappers only for external SDK imports, preserving RN/Uniwind internals and public API identity", () => {
  const raw = require("react-native");
  const nativeRoot = dirname(require.resolve("react-native/package.json"));
  const uniwindRoot = dirname(require.resolve("uniwind/package.json"));
  const sdkOrigin = require.resolve("heroui-native/button");
  const nativeOrigin = join(nativeRoot, "Libraries/Components/View/View.js");
  const uniwindOrigin = join(uniwindRoot, "src/components/native/View.tsx");
  expect(interop.resolve("react-native", sdkOrigin)).toBe(
    join(uniwindRoot, "src/components/index.ts"),
  );
  expect(interop.resolve("react-native", nativeOrigin)).toBe(require.resolve("react-native"));
  expect(interop.resolve("react-native", uniwindOrigin)).toBe(require.resolve("react-native"));
  const sdkRequire = createRequire(sdkOrigin);
  const wrapped = sdkRequire("react-native");
  const internal = createRequire(uniwindOrigin)("react-native");
  expect(internal.View).not.toBe(wrapped.View);
  expect(wrapped.Keyboard).toBe(internal.Keyboard);
  expect(wrapped.BackHandler).toBe(internal.BackHandler);
  expect(wrapped.StyleSheet).toBe(internal.StyleSheet);
  expect(raw.Keyboard).toBe(internal.Keyboard);
});

it("renders the actual NameInput with installed HeroUI small-size CSS and preserves native touch targets", async () => {
  // Dynamic imports intentionally occur after loader installation. This probe
  // determines whether this native engine also exposes SUT imports through CJS;
  // a raw external ESM facade remains an explicit compatibility limit otherwise.
  const { NativeTestProviders } = await import("./NativeTestProviders");
  const { NameInput } = await import("@/components/common/ui/NameInput");
  await render(
    <NativeTestProviders>
      <NameInput category="gruppo" accessibilityLabel="Group name" value="Games club" />
    </NativeTestProviders>,
  );
  expect(screen.getByLabelText("Group name")).toHaveDisplayValue("Games club");
  expect(screen.getByRole("button", { name: "Generate a random name" })).toHaveStyle({
    height: 40,
    minWidth: 44,
    minHeight: 44,
  });
  await cleanup();
});

it("keeps the SDK Toast height-measurement copy CSS-hidden while the actual feedback copy becomes visible", async () => {
  const { NativeTestProviders } = await import("./NativeTestProviders");
  const { Button } = await import("heroui-native/button");
  const { Toast, useToast } = await import("heroui-native/toast");
  function FeedbackProbe() {
    const { toast } = useToast();
    return (
      <Button
        onPress={() =>
          toast.show({
            component: (props) => (
              <Toast {...props}>
                <Toast.Title>Actual feedback</Toast.Title>
              </Toast>
            ),
          })
        }
      >
        <Button.Label>Show feedback</Button.Label>
      </Button>
    );
  }
  await render(
    <NativeTestProviders>
      <FeedbackProbe />
    </NativeTestProviders>,
  );
  await userEvent.setup().press(screen.getByRole("button", { name: "Show feedback" }));
  const titles = await screen.findAllByText("Actual feedback", {
    includeHiddenElements: true,
  });
  const measurement = (title: (typeof titles)[number]) => {
    for (let node = title.parent; node; node = node.parent)
      if (node.props.pointerEvents === "none" && typeof node.props.onLayout === "function")
        return node;
    return null;
  };
  const measured = titles.map(measurement).filter((node) => node !== null);
  expect(measured).toHaveLength(1);
  expect(measured[0]).toHaveStyle({ opacity: 0 });
  expect(measured[0]).not.toBeVisible();
  await fireEvent.layout(measured[0], { x: 0, y: 0, width: 350, height: 64 });
  const displayed = titles.filter((title) => !measurement(title));
  expect(displayed).toHaveLength(1);
  await waitFor(() => expect(displayed[0]).toBeVisible());
  await cleanup();
});
