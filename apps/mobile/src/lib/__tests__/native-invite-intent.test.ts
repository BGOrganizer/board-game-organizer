import { expect, it } from "vitest";
import { redirectSystemPath as redirect } from "../../app/+native-intent";

// Pure native-intent routing adapter: import its real function, never a JSX/VM harness.
const token = "abcdefghijklmnopqrstuv";
it("rewrites the stable Development App Link without changing authentication or other routes", () => {
  expect(
    redirect({
      path: `https://api.board-game-organizer.com/development/invite/${token}?web=ignored`,
      initial: true,
    }),
  ).toBe(`/invite/${token}`);
  for (const path of [
    "clerk://com.bgo.boardgameorganizer.dev.callback",
    "bgo-dev:///profile",
    "/groups",
    `https://evil.test/development/invite/${token}`,
  ])
    expect(redirect({ path, initial: false })).toBe(path);
});
