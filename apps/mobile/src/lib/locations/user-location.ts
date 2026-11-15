export async function requestUserPosition(
  location: Pick<
    typeof import("expo-location"),
    | "getForegroundPermissionsAsync"
    | "requestForegroundPermissionsAsync"
    | "getCurrentPositionAsync"
  >,
  openSettings: () => Promise<void>,
  onPermission: (permission: { granted: boolean; canAskAgain: boolean }) => void,
) {
  let permission = await location.getForegroundPermissionsAsync();
  onPermission(permission);
  if (!permission.granted) {
    if (permission.canAskAgain) await location.requestForegroundPermissionsAsync();
    else await openSettings();
    permission = await location.getForegroundPermissionsAsync();
    onPermission(permission);
  }
  return permission.granted ? location.getCurrentPositionAsync() : null;
}
