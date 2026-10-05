import { expect, it, vi } from "vitest";
import { requestUserPosition } from "../user-location";

const granted = { granted: true, canAskAgain: true };
const denied = { granted: false, canAskAgain: true };
const position = { coords: { longitude: 12.5, latitude: 41.9 } };
function setup() {
  const location = {
    getForegroundPermissionsAsync: vi.fn().mockResolvedValue(granted),
    requestForegroundPermissionsAsync: vi.fn(),
    getCurrentPositionAsync: vi.fn().mockResolvedValue(position),
  };
  return { location, openSettings: vi.fn().mockResolvedValue(undefined), onPermission: vi.fn() };
}
it("reads current permission before centering, without requesting it again when granted", async () => {
  const { location, openSettings, onPermission } = setup();
  expect(await requestUserPosition(location, openSettings, onPermission)).toEqual(position);
  expect(onPermission).toHaveBeenCalledWith(granted);
  expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  expect(openSettings).not.toHaveBeenCalled();
});
it("re-requests askable permission and refreshes its real state immediately", async () => {
  const { location, openSettings, onPermission } = setup();
  location.getForegroundPermissionsAsync
    .mockResolvedValueOnce(denied)
    .mockResolvedValueOnce(granted);
  expect(await requestUserPosition(location, openSettings, onPermission)).toEqual(position);
  expect(location.requestForegroundPermissionsAsync).toHaveBeenCalledOnce();
  expect(location.getForegroundPermissionsAsync).toHaveBeenCalledTimes(2);
  expect(onPermission.mock.calls).toEqual([[denied], [granted]]);
});
it("opens settings for permanent denial, rereads permission and never fabricates coordinates", async () => {
  const { location, openSettings, onPermission } = setup();
  location.getForegroundPermissionsAsync.mockResolvedValue({ ...denied, canAskAgain: false });
  expect(await requestUserPosition(location, openSettings, onPermission)).toBeNull();
  expect(openSettings).toHaveBeenCalledOnce();
  expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  expect(location.getCurrentPositionAsync).not.toHaveBeenCalled();
  expect(location.getForegroundPermissionsAsync).toHaveBeenCalledTimes(2);
});
it("keeps denial observable and propagates location errors", async () => {
  const { location, openSettings, onPermission } = setup();
  location.getForegroundPermissionsAsync.mockResolvedValue(denied);
  expect(await requestUserPosition(location, openSettings, onPermission)).toBeNull();
  location.getForegroundPermissionsAsync.mockResolvedValue(granted);
  location.getCurrentPositionAsync.mockRejectedValue(new Error("GPS unavailable"));
  await expect(requestUserPosition(location, openSettings, onPermission)).rejects.toThrow(
    "GPS unavailable",
  );
});
