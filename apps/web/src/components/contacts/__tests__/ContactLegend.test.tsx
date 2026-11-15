import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Mail, Send, UsersRound } from "lucide-react";
import { describe, expect, it } from "vitest";
import { renderWithI18n } from "@/test-utils";
import { ContactLegend } from "../ContactLegend";

describe("ContactLegend", () => {
  it("opens labeled explanations with presence states, closes with Escape", async () => {
    renderWithI18n(
      <ContactLegend
        title="Connections"
        icon={UsersRound}
        entries={[
          {
            icon: UsersRound,
            label: "Friends",
            color: "text-primary",
            description: "Friendship accepted.",
          },
        ]}
      />,
    );
    expect(screen.queryByText("Friendship accepted.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Connections: Icon legend" }));
    expect(await screen.findByText("Friendship accepted.")).toBeTruthy();
    expect(screen.getByText("Online")).toBeTruthy();
    expect(screen.getByText("Offline")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("shows request-specific explanations", async () => {
    renderWithI18n(
      <ContactLegend
        title="Requests"
        icon={Mail}
        entries={[
          {
            icon: Mail,
            label: "Received",
            color: "text-primary",
            description: "Requests awaiting your reply.",
          },
          {
            icon: Send,
            label: "Sent",
            color: "text-warning",
            description: "Requests awaiting their reply.",
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Requests: Icon legend" }));
    expect(await screen.findByText("Requests awaiting your reply.")).toBeTruthy();
    expect(screen.getByText("Requests awaiting their reply.")).toBeTruthy();
    expect(screen.queryByText("Friendship accepted.")).toBeNull();
  });
});
