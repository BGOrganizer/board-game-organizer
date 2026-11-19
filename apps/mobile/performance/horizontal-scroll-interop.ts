import { createRequire } from "node:module";

type NativeFactory = (name: string, ...configuration: unknown[]) => unknown;
type NativeRegistry = { get: NativeFactory };

/**
 * Extend vitest-native's existing OS host boundary for Android horizontal scroll.
 * Its RCTScrollView host already normalizes native responder negotiation for
 * RNTL; the AndroidHorizontalScrollView binding otherwise skips that adaptation.
 *
 * Reuse the installed factory with the SAME horizontal config callback. Real RN
 * ScrollView/HeroUI JS, horizontal props, refs and commands remain untouched;
 * there is no additional React wrapper or hand-written native component.
 * Install before SDK/SUT imports, after the native runner initialized its registry.
 */
export function installHorizontalScrollInterop() {
  const require = createRequire(import.meta.url);
  const registry =
    require("react-native/Libraries/NativeComponent/NativeComponentRegistry") as NativeRegistry;
  const previous = registry.get;
  const get: NativeFactory = function (this: NativeRegistry, name, ...configuration) {
    return previous.call(
      this,
      name === "AndroidHorizontalScrollView" ? "RCTScrollView" : name,
      ...configuration,
    );
  };
  registry.get = get;
  return () => {
    if (registry.get !== get)
      throw new Error("Another native component factory was installed after horizontal interop");
    registry.get = previous;
  };
}
