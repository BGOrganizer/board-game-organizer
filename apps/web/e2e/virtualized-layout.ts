import { expect, type Locator } from "@playwright/test";

/** Real browser geometry: windowed page rows fit the document without a nested scroll host. */
export async function expectDocumentWindowListFits(list: Locator) {
  await expect
    .poll(() =>
      list.evaluate((root) => {
        const bounds = root.getBoundingClientRect();
        const left = bounds.left + root.clientLeft;
        const right = left + root.clientWidth;
        const rows = [...root.querySelectorAll(":scope > li")];
        for (
          let node: Element | null = root;
          node && node !== document.body;
          node = node.parentElement
        ) {
          if (/^(auto|scroll|overlay)$/.test(getComputedStyle(node).overflowY)) return false;
        }
        return (
          rows.length > 0 &&
          rows.length < 40 &&
          root.scrollTop === 0 &&
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
