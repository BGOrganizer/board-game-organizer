import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { expect, it } from "vitest";
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

it("keeps static selection inside the map style, frozen initial viewport and visible attribution", () => {
  const source = readFileSync(
    new URL("../../../components/locations/LocationPicker.tsx", import.meta.url),
    "utf8",
  );
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
