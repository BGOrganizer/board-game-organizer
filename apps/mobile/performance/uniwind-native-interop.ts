import Module, { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath, URL } from "node:url";

type Resolution = { type: "sourceFile"; filePath: string };
type Context = {
  originModulePath: string;
  resolveRequest: (context: Context, request: string, platform: string) => Resolution;
};
type Resolver = (context: Context, request: string, platform: string) => Resolution;
type Load = (
  this: typeof Module,
  request: string,
  parent: NodeModule | null | undefined,
  isMain?: boolean,
) => unknown;
const nodeLoader = Module as typeof Module & {
  _load: Load;
  _nodeModulePaths: (directory: string) => string[];
  _resolveFilename: (
    request: string,
    parent: NodeModule,
    isMain: boolean,
    options: { conditions: Set<string> },
  ) => string;
};

/**
 * Test-only compatibility for native-engine CJS loads. Delegate the application's
 * actual Uniwind Metro resolver, including its importer-aware raw RN exceptions.
 * No component/style/palette replacement or mutation of the RN namespace occurs.
 *
 * Must run AFTER vitest-native setup but BEFORE importing the SDK/SUT. This first
 * adapter deliberately does not claim interception of external ESM RN facades.
 */
export function installNativeUniwindInterop(platform: "android" | "ios" = "android") {
  const require = createRequire(import.meta.url);
  const config = require(fileURLToPath(new URL("../metro.config.js", import.meta.url))) as {
    resolver: { resolveRequest: Resolver };
  };
  const priorLoad = nodeLoader._load;
  const resolved = new Map<string, string>();
  const resolveRequest: Context["resolveRequest"] = (context, request) => {
    const parent = new Module(context.originModulePath);
    parent.filename = context.originModulePath;
    parent.paths = nodeLoader._nodeModulePaths(dirname(context.originModulePath));
    // Node's installed native resolver receives the same native export condition
    // as Metro. In particular, Uniwind's public components entry must be native,
    // rather than its browser/default export. Preserve all existing native hooks.
    return {
      type: "sourceFile",
      filePath: nodeLoader._resolveFilename(request, parent, false, {
        conditions: new Set(["react-native", "node", "require", "default"]),
      }),
    };
  };
  const load: Load = function (request, parent, isMain) {
    if (!parent?.filename || (request !== "react-native" && !request.startsWith("react-native/")))
      return priorLoad.call(this, request, parent, isMain);
    const key = `${parent.filename}\0${request}`;
    let file = resolved.get(key);
    if (file === undefined) {
      const resolution = config.resolver.resolveRequest(
        { originModulePath: parent.filename, resolveRequest },
        request,
        platform,
      );
      file = resolution.filePath;
      resolved.set(key, file);
    }
    return priorLoad.call(this, file, parent, isMain);
  };
  nodeLoader._load = load;
  return {
    /** Exposed only for configuration diagnostics, not component dispatch. */
    resolve(request: string, originModulePath: string) {
      return config.resolver.resolveRequest({ originModulePath, resolveRequest }, request, platform)
        .filePath;
    },
    dispose() {
      if (nodeLoader._load !== load)
        throw new Error("Another native loader was installed after Uniwind interop");
      nodeLoader._load = priorLoad;
      resolved.clear();
    },
  };
}
