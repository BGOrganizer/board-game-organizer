import { vi } from "vitest";
import { type Preset, presets } from "vitest-native";

type GestureApi = typeof import("react-native-gesture-handler").Gesture;
type Pan = ReturnType<GestureApi["Pan"]>;
type Native = ReturnType<GestureApi["Native"]>;

// Explicit installed SDK methods used by Gorhom's native sheet/scrollable configuration.
const commonMethods = [
  "enabled",
  "shouldCancelWhenOutside",
  "runOnJS",
  "onBegin",
  "onStart",
  "onEnd",
  "onFinalize",
  "simultaneousWithExternalGesture",
  "requireExternalGestureToFail",
] as const satisfies readonly (keyof Pan & keyof Native)[];
const panMethods = [
  "onChange",
  "activeOffsetX",
  "activeOffsetY",
  "failOffsetX",
  "failOffsetY",
] as const satisfies readonly (keyof Pan)[];

type Builder = Record<string, unknown>;
function completeConfiguration(builder: Builder, methods: readonly string[]) {
  for (const method of methods) {
    if (typeof builder[method] !== "function") {
      builder[method] = vi.fn(function recordConfiguration(this: Builder) {
        return this;
      });
    }
  }
  if (typeof builder.toGestureArray !== "function") {
    builder.toGestureArray = vi.fn(() => [builder]);
  }
  return builder;
}

/** Records native configuration only; this adapter never recognizes or executes gestures. */
export default function gestureHandlerPreset(): Preset {
  const preset = presets.gestureHandler();
  const module = preset.modules["react-native-gesture-handler"];
  return {
    ...preset,
    name: "gesture-handler-configuration",
    modules: {
      "react-native-gesture-handler": {
        ...module,
        factory: () => {
          const runtime = module.factory();
          return {
            ...runtime,
            Gesture: {
              ...runtime.Gesture,
              Pan: vi.fn(() =>
                completeConfiguration(runtime.Gesture.Pan(), [...commonMethods, ...panMethods]),
              ),
              Native: vi.fn(() => completeConfiguration({}, commonMethods)),
            },
          };
        },
      },
    },
  };
}
