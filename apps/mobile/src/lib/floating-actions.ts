export const FLOATING_ACTION_SIZE = 56;

export function screenFloatingActionLayout(bottomInset: number, navigatorType: string) {
  return floatingActionLayout(bottomInset, navigatorType === "tab" ? 16 : 100);
}

export function floatingActionLayout(bottomInset: number, extraBottom: number) {
  const bottom = Math.max(24, bottomInset + extraBottom);
  return { bottom, paddingBottom: bottom + FLOATING_ACTION_SIZE + 16 };
}
