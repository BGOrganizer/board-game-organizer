import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import InviteLayout from "../../../../../api/src/app/invite/layout";

vi.mock("../../../../../api/src/app/invite/invite.css", () => ({}));
it("server-renders the invitation review inside the themed document", () => {
  const tree = InviteLayout({ children: <main aria-label="Invitation">Reviewed table</main> });
  const html = renderToString(tree);
  expect(tree.type).toBe("html");
  expect(tree.props.suppressHydrationWarning).toBe(true);
  expect(html).toContain('lang="en"');
  expect(html).toContain('class="bg-background text-foreground"');
  expect(html).toContain('<main aria-label="Invitation">Reviewed table</main>');
});
