// @vitest-environment jsdom
import { useAuth } from "@clerk/expo";
import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useSessionAuth } from "../useSessionAuth";

vi.mock("@clerk/expo", () => ({ useAuth: vi.fn() }));

it("keeps the query-gating token stable across Clerk refreshes but uses the latest token for requests", async () => {
  let currentGetToken = vi.fn(async () => "initial");
  let sessionId = "session_1";
  vi.mocked(useAuth).mockImplementation(
    () =>
      ({
        getToken: currentGetToken,
        isLoaded: true,
        isSignedIn: true,
        userId: "user_1",
        sessionId,
      }) as unknown as ReturnType<typeof useAuth>,
  );
  let token: string | null = null;
  let requestToken: (() => Promise<string | null>) | undefined;
  let loads = 0;
  function Screen() {
    const { getToken } = useSessionAuth();
    const [keyToken, setKeyToken] = useState<string | null>(null);
    requestToken = getToken;
    token = keyToken;
    useEffect(() => {
      loads++;
      getToken().then(setKeyToken);
    }, [getToken]);
    return null;
  }

  const root = createRoot(Reflect.get(globalThis, "document").createElement("div"));
  await act(async () => root.render(<Screen />));
  const stableGetToken = requestToken;
  expect(token).toBe("initial");
  expect(loads).toBe(1);

  currentGetToken = vi.fn(async () => "renewed");
  await act(async () => root.render(<Screen />));
  expect(requestToken).toBe(stableGetToken);
  expect(token).toBe("initial");
  expect(loads).toBe(1);
  expect(await requestToken?.()).toBe("renewed");

  sessionId = "session_2";
  currentGetToken = vi.fn(async () => "new session");
  await act(async () => root.render(<Screen />));
  expect(requestToken).not.toBe(stableGetToken);
  expect(token).toBe("new session");
  expect(loads).toBe(2);
  await act(async () => root.unmount());
});
