import { expect, type Locator } from "@playwright/test";

/** Real browser geometry: virtual rows must fit the scroll host and its viewport. */
export async function expectVirtualizedListFits(list: Locator) {
  await expect
    .poll(() =>
      list.evaluate((root) => {
        const bounds = root.getBoundingClientRect();
        const left = bounds.left + root.clientLeft;
        const right = left + root.clientWidth;
        const rows = [...root.querySelectorAll('[role="option"]')];
        return (
          rows.length > 0 &&
          root.scrollWidth <= root.clientWidth + 1 &&
          bounds.left >= -1 &&
          bounds.right <= document.documentElement.clientWidth + 1 &&
          rows.every((row) => {
            const box = row.getBoundingClientRect();
            return box.left >= left - 1 && box.right <= right + 1;
          })
        );
      }),
    )
    .toBe(true);
}
