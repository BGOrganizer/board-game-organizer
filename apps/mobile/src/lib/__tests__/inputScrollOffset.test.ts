import { expect, it } from "vitest";
import { inputScrollOffset } from "../inputScrollOffset";

it.each([
  [{}, 436],
  [{ anchorTop: 400 }, 384],
  [{ anchorTop: 550 }, 436],
  [{ anchorTop: 0 }, 436],
  [{ anchorTop: 400, viewportHeight: 100 }, 460],
  [{ fontScale: 2 }, 372],
  [{ viewportHeight: 50 }, 500],
  [{ offset: 0, fieldTop: 50 }, 0],
])(
  "keeps labels when they fit, otherwise reveals the input without negative offsets: %j",
  (changes, expected) => {
    expect(
      inputScrollOffset({
        offset: 100,
        fieldTop: 500,
        fieldHeight: 44,
        viewportTop: 100,
        viewportHeight: 500,
        fontScale: 1,
        ...changes,
      }),
    ).toBe(expected);
  },
);
