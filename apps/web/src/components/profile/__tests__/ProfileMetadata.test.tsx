import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { version } from "../../../../package.json";
import { ProfileIdentity } from "../ProfileIdentity";
import { ProfileVersion } from "../ProfileVersion";

const state = vi.hoisted(() => ({
  loaded: true,
  user: { id: "owner", createdAt: new Date("2020-06-15T12:00:00.000Z") } as {
    id: string;
    createdAt: Date | null;
  } | null,
  calls: 0,
}));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => {
    state.calls++;
    return { user: state.user, isLoaded: state.loaded };
  },
}));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  state.loaded = true;
  state.user = { id: "owner", createdAt: new Date("2020-06-15T12:00:00.000Z") };
  state.calls = 0;
});

it("places the actual Clerk creation date below the avatar without exposing owner metadata on another profile", () => {
  const view = renderWithI18n(
    <ul>
      <ProfileIdentity name="Owner" username="owner" ownerId="owner" />
    </ul>,
  );
  const date = view.container.querySelector("time");
  expect(date?.dateTime).toBe("2020-06-15T12:00:00.000Z");
  expect(date?.textContent).toBe("June 15, 2020");
  expect(screen.getByText("@owner")).not.toBeNull();
  const avatar = view.container.querySelector(".avatar");
  expect(
    (avatar?.compareDocumentPosition(screen.getByTestId("profile-joined-at")) ?? 0) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  state.calls = 0;
  view.rerender(
    <ul>
      <ProfileIdentity name="Other" />
    </ul>,
  );
  expect(screen.queryByTestId("profile-joined-at")).toBeNull();
  expect(state.calls).toBe(0);
});

it("loads only the missing date and never borrows a previous session's creation date", () => {
  state.loaded = false;
  state.user = null;
  const view = renderWithI18n(
    <ul>
      <ProfileIdentity name="Owner" ownerId="owner" />
    </ul>,
  );
  expect(screen.getByLabelText("Loading…")).not.toBeNull();
  expect(screen.getByText("Owner")).not.toBeNull();
  state.loaded = true;
  view.rerender(
    <ul>
      <ProfileIdentity name="Owner" ownerId="owner" />
    </ul>,
  );
  expect(screen.getByText("—")).not.toBeNull();
  state.user = { id: "previous-owner", createdAt: new Date("2020-06-15T12:00:00.000Z") };
  view.rerender(
    <ul>
      <ProfileIdentity name="Owner" ownerId="owner" />
    </ul>,
  );
  expect(view.container.querySelector("time")).toBeNull();
  state.user = { id: "owner", createdAt: null };
  view.rerender(
    <ul>
      <ProfileIdentity name="Owner" ownerId="owner" />
    </ul>,
  );
  expect(screen.getByText("—")).not.toBeNull();
});

it.each(["production", "development"])(
  "shows the running %s version with SHA only on a prerelease",
  (environment) => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", environment);
    vi.stubEnv("NEXT_PUBLIC_BUILD_SHA", "abcdef1234567890abcdef1234567890abcdef12");
    renderWithI18n(<ProfileVersion />);
    expect(screen.getByTestId("profile-version").textContent).toBe(
      `Version: ${version}${environment === "production" ? "" : "+abcdef1"}`,
    );
  },
);
