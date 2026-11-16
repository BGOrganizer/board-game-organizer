import { useLingui } from "@lingui/react";
import { useQueryClient } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { StrictMode, useEffect, useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { beginOptimisticOperation } from "../../../../../../packages/shared/src/common/optimisticOperation";
import { InviteProviders } from "../../../../../api/src/app/invite/[token]/InviteProviders";

const auth = vi.hoisted(() => ({
  isLoaded: true,
  userId: "user_one" as string | null,
  sessionId: "session_one" as string | null,
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => auth }));
let client: ReturnType<typeof useQueryClient>;
function Probe() {
  client = useQueryClient();
  const { i18n } = useLingui();
  return <span>{i18n.locale}</span>;
}
function tree(initialLocale?: "en" | "it") {
  return (
    <InviteProviders initialLocale={initialLocale}>
      <Probe />
    </InviteProviders>
  );
}

beforeEach(() => {
  auth.isLoaded = true;
  auth.userId = "user_one";
  auth.sessionId = "session_one";
  vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
});

describe("API invitation providers", () => {
  it("keeps one client on ordinary rerenders and clears private data on account/session changes", async () => {
    const view = render(tree());
    const first = client;
    first.setQueryData(["private"], "first account");
    view.rerender(tree());
    expect(client).toBe(first);
    auth.sessionId = "session_two";
    view.rerender(tree());
    expect(client).not.toBe(first);
    await act(async () => {});
    expect(first.getQueryData(["private"])).toBeUndefined();
    const second = client;
    second.setQueryData(["private"], "second session");
    auth.userId = "user_two";
    view.rerender(tree());
    expect(client).not.toBe(second);
    await act(async () => {});
    expect(second.getQueryData(["private"])).toBeUndefined();
    expect(client.getQueryData(["private"])).toBeUndefined();
    const final = client;
    final.setQueryData(["private"], "last");
    view.unmount();
    await act(async () => {});
    expect(final.getQueryData(["private"])).toBeUndefined();
  });

  it("replaces the loading and signed-out scopes without retaining private queries", () => {
    auth.isLoaded = false;
    const view = render(tree("it"));
    const loading = client;
    auth.isLoaded = true;
    auth.userId = null;
    auth.sessionId = null;
    view.rerender(tree("it"));
    expect(client).not.toBe(loading);
    const anonymous = client;
    auth.userId = "user_one";
    view.rerender(tree("it"));
    expect(client).not.toBe(anonymous);
  });

  it("uses Italian browser language and the default HeroUI system palette, following changes", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("it-IT");
    let changed: (() => void) | undefined;
    const preference = {
      matches: true,
      addEventListener: vi.fn((_event, callback) => {
        changed = callback;
      }),
      removeEventListener: vi.fn(),
    };
    vi.spyOn(window, "matchMedia").mockReturnValue(preference as unknown as MediaQueryList);
    const view = render(tree());
    expect(screen.getByText("it")).toBeTruthy();
    expect(document.documentElement.lang).toBe("it");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    act(() => {
      preference.matches = false;
      changed?.();
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("light");
    view.unmount();
    expect(preference.removeEventListener).toHaveBeenCalledWith("change", changed);
  });

  it("falls back to English for other browser locales", () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
    render(tree("it"));
    expect(screen.getByText("en")).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
  });
});

it("keeps a single consent operation active across Strict Mode's effect replay", async () => {
  let operation: Awaited<ReturnType<typeof beginOptimisticOperation>> | undefined;
  function Consent() {
    const queryClient = useQueryClient();
    const started = useRef(false);
    useEffect(() => {
      if (started.current) return;
      started.current = true;
      void beginOptimisticOperation(queryClient, ["consent"], { queryKey: ["owned"] }).then(
        (result) => {
          operation = result;
        },
      );
    }, [queryClient]);
    return null;
  }
  const view = render(
    <StrictMode>
      <InviteProviders>
        <Consent />
      </InviteProviders>
    </StrictMode>,
  );
  await act(async () => {});
  expect(operation?.active).toBe(true);
  expect(operation?.signal.aborted).toBe(false);
  view.unmount();
  await act(async () => {});
  expect(operation?.signal.aborted).toBe(true);
});
