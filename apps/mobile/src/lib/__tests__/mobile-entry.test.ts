import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const filename = fileURLToPath(new URL("../../../index.js", import.meta.url));
const source = readFileSync(filename, "utf8");

describe("the deployed mobile JavaScript bootstrap", () => {
  it("registers splash control synchronously before entering Expo Router", () => {
    const requireBoundary = vi.fn((_specifier: string) => ({}));
    runInNewContext(source, { require: requireBoundary }, { filename });
    expect(requireBoundary.mock.calls).toEqual([["./src/lib/splash"], ["expo-router/entry"]]);
  });

  it("does not enter the router if splash bootstrap fails", () => {
    const error = new Error("Splash initialization failed");
    const requireBoundary = vi.fn((_specifier: string) => {
      throw error;
    });
    expect(() => runInNewContext(source, { require: requireBoundary }, { filename })).toThrow(
      error,
    );
    expect(requireBoundary).toHaveBeenCalledExactlyOnceWith("./src/lib/splash");
  });

  it("propagates router initialization failure after splash control is registered", () => {
    const error = new Error("Router initialization failed");
    const requireBoundary = vi.fn((specifier: string) => {
      if (specifier === "expo-router/entry") throw error;
      return {};
    });
    expect(() => runInNewContext(source, { require: requireBoundary }, { filename })).toThrow(
      error,
    );
    expect(requireBoundary.mock.calls).toEqual([["./src/lib/splash"], ["expo-router/entry"]]);
  });
});
