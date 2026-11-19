import { createRequire } from "node:module";
import { type Preset, presets } from "vitest-native";

// Pure published SDK math has no native runtime/worklet initialization.
const interpolation = createRequire(import.meta.url)(
  "react-native-reanimated/lib/module/interpolation.js",
) as Pick<typeof import("react-native-reanimated"), "interpolate" | "clamp" | "Extrapolation">;

/** HeroUI imports Keyframe builders; motion itself is a native boundary, not measured here. */
export default function reanimatedPreset(): Preset {
  const preset = presets.reanimated();
  const module = preset.modules["react-native-reanimated"];
  return {
    ...preset,
    name: "reanimated-keyframe",
    modules: {
      "react-native-reanimated": {
        ...module,
        exports: [...module.exports, "Keyframe"],
        factory: () => {
          const runtime = module.factory();
          // This installed builder method records configuration at the native boundary.
          // The maintained preset omits it; it must not run or simulate motion.
          runtime.LinearTransition.reduceMotion = () => runtime.LinearTransition;
          function Keyframe() {
            return runtime.LinearTransition;
          }
          function useAnimatedStyle(updater: () => Record<string, unknown>) {
            const style = runtime.useAnimatedStyle(updater);
            // Shared values update native styles without React commits. The
            // maintained Node preset otherwise freezes the first style snapshot.
            return new Proxy(style, {
              get: (_target, key) => Reflect.get(updater(), key),
              ownKeys: () => Reflect.ownKeys(updater()),
              getOwnPropertyDescriptor: (_target, key) => {
                const current = updater();
                return Object.hasOwn(current, key)
                  ? { configurable: true, enumerable: true, value: Reflect.get(current, key) }
                  : undefined;
              },
            });
          }
          // Babel's default import must resolve the preset's Animated namespace.
          return { ...runtime, ...interpolation, __esModule: true, Keyframe, useAnimatedStyle };
        },
      },
    },
  };
}
