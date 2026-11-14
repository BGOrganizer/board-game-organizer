import { useQueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SessionQueryProvider } from "../SessionQueryProvider";

const auth = vi.hoisted(() => ({ userId: "user_1", sessionId: "session_1" }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, ...auth }),
}));

it("discards private cache when the authenticated session changes or signs out", () => {
  let client = null as ReturnType<typeof useQueryClient> | null;
  function Probe() {
    client = useQueryClient();
    return null;
  }
  const screen = render(
    <SessionQueryProvider>
      <Probe />
    </SessionQueryProvider>,
  );
  const first = client;
  first?.setQueryData(["private"], "secret");
  auth.sessionId = "session_2";
  screen.rerender(
    <SessionQueryProvider>
      <Probe />
    </SessionQueryProvider>,
  );
  expect(client).not.toBe(first);
  expect(client?.getQueryData(["private"])).toBeUndefined();
  const second = client;
  auth.userId = "";
  screen.rerender(
    <SessionQueryProvider>
      <Probe />
    </SessionQueryProvider>,
  );
  expect(client).not.toBe(second);
  expect(client?.getQueryData(["private"])).toBeUndefined();
});
