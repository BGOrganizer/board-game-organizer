import { screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { InviteAppLink } from "../../../../../api/src/app/invite/[token]/InviteAppLink";

const token = "abcdefghijklmnopqrstuv";
afterEach(() => vi.restoreAllMocks());
it.each([
  [true, "Android", "bgo"],
  [false, "Android", "bgo-dev"],
  [false, "iPhone", "bgo"],
])(
  "links to the installed app variant for production=%s on %s",
  (production, userAgent, scheme) => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
    renderWithI18n(<InviteAppLink token={token} production={production} />);
    expect(screen.getByRole("link", { name: "Open in app" }).getAttribute("href")).toBe(
      `${scheme}:///invite/${token}`,
    );
    expect(screen.getByText(/Otherwise, continue on the web/)).toBeTruthy();
  },
);
it("never renders an app link for an invalid token", () => {
  renderWithI18n(<InviteAppLink token="invalid?redirect=external" production={false} />);
  expect(screen.queryByRole("link")).toBeNull();
});
