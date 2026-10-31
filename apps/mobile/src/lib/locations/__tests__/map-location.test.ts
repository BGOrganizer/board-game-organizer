import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { locationMapPoint } from "../map-location";

it("keeps longitude/latitude ordering and refuses malformed native coordinates", () => {
  expect(locationMapPoint(12.5, 41.9)).toEqual([12.5, 41.9]);
  expect(locationMapPoint(-180, -90)).toEqual([-180, -90]);
  expect(locationMapPoint(180, 90)).toEqual([180, 90]);
  for (const point of [
    [NaN, 41],
    [Infinity, 41],
    [181, 41],
    [-181, 41],
    [12, NaN],
    [12, -Infinity],
    [12, 91],
    [12, -91],
    [undefined, 41],
    [12, null],
    ["12", 41],
  ])
    expect(locationMapPoint(...(point as [unknown, unknown]))).toBeNull();
});

// Execute actual JS callbacks without RN imports. Native rendering/SIGSEGV acceptance needs a device.
function pickerCallbacks() {
  const source = readFileSync(
    new URL("../../../components/locations/LocationPicker.tsx", import.meta.url),
    "utf8",
  );
  const file = ts.createSourceFile(
    "picker.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const functions = new Map<string, string>();
  const events = new Map<string, string>();
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ["moveTo", "chooseFavorite"].includes(node.name.getText(file))
    )
      functions.set(node.name.getText(file), node.initializer.getText(file));
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(file) === "useEffect" &&
      node.arguments[0]?.getText(file).includes("camera.current?.easeTo")
    )
      functions.set("updateCamera", node.arguments[0].getText(file));
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(file) === "MapLibreMap")
      for (const attribute of node.attributes.properties.filter(ts.isJsxAttribute))
        if (
          attribute.name.getText(file).startsWith("on") &&
          attribute.initializer &&
          ts.isJsxExpression(attribute.initializer)
        )
          events.set(
            attribute.name.getText(file),
            attribute.initializer.expression?.getText(file) ?? "",
          );
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(functions.size).toBe(3);
  const state = {
    center: null as [number, number] | null,
    mapReady: false,
    mapActive: true,
    camera: { current: { easeTo: vi.fn() } },
    locationMapPoint,
    setCenter: (point: [number, number]) => {
      state.center = point;
    },
    setMapReady: (ready: boolean) => {
      state.mapReady = ready;
    },
    cancelLocate: vi.fn(),
    setSelected: vi.fn(),
    setFavoriteKey: vi.fn(),
    setName: vi.fn(),
    setQuery: vi.fn(),
    setResults: vi.fn(),
    setError: vi.fn(),
    t: (value: string) => value,
    callbacks: {} as Record<
      | "moveTo"
      | "chooseFavorite"
      | "updateCamera"
      | "onWillStartLoadingMap"
      | "onDidFinishLoadingStyle"
      | "onDidFailLoadingMap",
      (...args: unknown[]) => void
    >,
  };
  const declarations = [...functions, ...events]
    .map(([name, body]) => `const ${name} = ${body};`)
    .join("\n");
  const code = ts.transpileModule(
    `${declarations}\ncallbacks = { ${[...functions.keys(), ...events.keys()].join(",")} };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  runInNewContext(code, state);
  return { state, ...state.callbacks, source };
}
it("queues the latest favorite before style readiness and applies it once ready", () => {
  const p = pickerCallbacks();
  const location = { name: "Club", address: "Verified street", longitude: 12.5, latitude: 41.9 };
  p.chooseFavorite("one", location);
  p.updateCamera();
  expect(p.state.camera.current.easeTo).not.toHaveBeenCalled();
  p.chooseFavorite("two", { ...location, longitude: 10 });
  p.updateCamera();
  expect(p.state.camera.current.easeTo).not.toHaveBeenCalled();
  p.onDidFinishLoadingStyle();
  p.updateCamera();
  expect(p.state.camera.current.easeTo).toHaveBeenCalledExactlyOnceWith({
    center: [10, 41.9],
    zoom: 14,
    duration: 500,
  });
  expect(p.state.cancelLocate).toHaveBeenCalledTimes(2);
  expect(p.state.setFavoriteKey).toHaveBeenLastCalledWith("two");
  expect(p.state.setName).toHaveBeenLastCalledWith("Club");
});
it("never mutates camera while inactive, reloading, failed, or without a target", () => {
  const p = pickerCallbacks();
  p.onDidFinishLoadingStyle();
  p.updateCamera();
  expect(p.state.camera.current.easeTo).not.toHaveBeenCalled();
  p.moveTo(12, 42);
  p.state.mapActive = false;
  p.updateCamera();
  expect(p.state.camera.current.easeTo).not.toHaveBeenCalled();
  p.state.mapActive = true;
  p.onWillStartLoadingMap();
  p.updateCamera();
  expect(p.state.camera.current.easeTo).not.toHaveBeenCalled();
  p.onDidFinishLoadingStyle();
  p.updateCamera();
  expect(p.state.camera.current.easeTo).toHaveBeenCalledOnce();
  p.onDidFailLoadingMap();
  p.updateCamera();
  expect(p.state.camera.current.easeTo).toHaveBeenCalledOnce();
  expect(p.state.setError).toHaveBeenLastCalledWith("Map unavailable");
});
it("rejects corrupt favorite and geocoding coordinates before changing native state", () => {
  const p = pickerCallbacks();
  p.onDidFinishLoadingStyle();
  p.chooseFavorite("bad", { name: "Bad", longitude: NaN, latitude: 42 });
  p.moveTo(12, Infinity);
  p.updateCamera();
  expect(p.state.setSelected).not.toHaveBeenCalled();
  expect(p.state.setFavoriteKey).not.toHaveBeenCalled();
  expect(p.state.camera.current.easeTo).not.toHaveBeenCalled();
  expect(p.state.setError).toHaveBeenLastCalledWith("Location unavailable");
});
it("keeps static selection inside the map style, frozen initial viewport and visible attribution", () => {
  const { source } = pickerCallbacks();
  expect(source).not.toMatch(/<Marker\b/);
  expect(source).toMatch(/<GeoJSONSource\s+id="selected-location"/);
  expect(source).toContain('type="circle"');
  expect(source).toContain("initialViewState={initialViewState}");
  expect(source).toContain("mapReady && selectedPoint");
  expect(source).toContain('setMapActive(state === "active")');
  expect(source).toContain("attribution");
  expect(source).toContain("https://www.maptiler.com/");
  expect(source).toContain("!selectedPoint");
});
