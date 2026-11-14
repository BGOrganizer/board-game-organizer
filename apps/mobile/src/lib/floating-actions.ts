export const FLOATING_ACTION_SIZE = 56;

export function screenFloatingActionLayout(
  bottomInset: number,
  navigatorType: string,
  hasFloatingActions = true,
) {
  const layout = floatingActionLayout(bottomInset, navigatorType === "tab" ? 16 : 100);
  return {
    ...layout,
    paddingBottom: hasFloatingActions ? layout.paddingBottom : bottomInset + 20,
  };
}

export function floatingActionLayout(bottomInset: number, extraBottom: number) {
  const bottom = Math.max(24, bottomInset + extraBottom);
  return { bottom, paddingBottom: bottom + FLOATING_ACTION_SIZE + 16 };
}
