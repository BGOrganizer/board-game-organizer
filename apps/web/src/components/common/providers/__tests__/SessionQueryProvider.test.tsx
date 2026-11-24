import { useQueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SessionQueryProvider } from "../SessionQueryProvider";

const auth = vi.hoisted(() => ({
  isLoaded: true,
  userId: "user_1",
  sessionId: "session_1" as string | undefined,
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => auth,
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

it("discards cache during Clerk initialization and when the restored session becomes available", () => {
  auth.isLoaded = false;
  auth.userId = "user_1";
  auth.sessionId = undefined;
  const clients: ReturnType<typeof useQueryClient>[] = [];
  function Probe() {
    clients.push(useQueryClient());
    return null;
  }
  const surface = () => (
    <SessionQueryProvider>
      <Probe />
    </SessionQueryProvider>
  );
  const screen = render(surface());
  const booting = clients.at(-1);
  booting?.setQueryData(["anonymous"], "discard");
  auth.isLoaded = true;
  screen.rerender(surface());
  const awaitingSession = clients.at(-1);
  expect(awaitingSession).not.toBe(booting);
  expect(awaitingSession?.getQueryData(["anonymous"])).toBeUndefined();
  awaitingSession?.setQueryData(["viewer"], "discard");
  auth.sessionId = "session-recovered";
  screen.rerender(surface());
  const signedIn = clients.at(-1);
  expect(signedIn).not.toBe(awaitingSession);
  expect(signedIn?.getQueryData(["viewer"])).toBeUndefined();
});
