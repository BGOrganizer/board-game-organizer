import { describe, expect, it, vi } from "vitest";

const { clerkMiddlewareMock, createRouteMatcherMock } = vi.hoisted(() => ({
  clerkMiddlewareMock: vi.fn<(handler: unknown) => unknown>((handler: unknown) => handler),
  createRouteMatcherMock: vi.fn<(routes: string[]) => (request: { url: string }) => boolean>(
    () => (request: { url: string }) => request.url === "public",
  ),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: (auth: unknown, request: unknown) => Promise<void> | void) =>
    clerkMiddlewareMock(handler),
  createRouteMatcher: (routes: string[]) => createRouteMatcherMock(routes),
}));

describe("web middleware", () => {
  it("protects non-public routes and lets public ones through", async () => {
    const { default: middleware, config } = await import("../middleware");

    // The default export is the handler passed to clerkMiddleware.
    const handler = clerkMiddlewareMock.mock.calls[0][0] as (
      auth: { protect: () => Promise<void> },
      request: { url: string },
    ) => Promise<void>;
    expect(handler).toBeTypeOf("function");
    expect(createRouteMatcherMock).toHaveBeenCalledWith([
      "/",
      "/sign-in(.*)",
      "/sign-up(.*)",
      "/invite/(.*)",
    ]);

    const protect = vi.fn();
    // Public route (createRouteMatcher returns true for url === "public").
    await handler({ protect }, { url: "public" });
    expect(protect).not.toHaveBeenCalled();

    // Protected route.
    await handler({ protect }, { url: "protected" });
    expect(protect).toHaveBeenCalled();

    expect(config.matcher).toContain("/(api|trpc)(.*)");
    expect(middleware).toBe(handler);
  });
});
