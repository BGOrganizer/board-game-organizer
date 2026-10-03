import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { InviteCard } from "@/components/InviteCard";
import { renderWithI18n } from "@/test-utils";

const state = vi.hoisted(() => ({
  isPending: false,
  isError: false,
  mutate: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    getToken: vi.fn().mockResolvedValue("token"),
  }),
}));

vi.mock("@board-game-organizer/shared", () => ({
  useInvites: () => ({
    data: null,
    error: null,
    isPending: state.isPending,
    isError: state.isError,
    mutate: state.mutate,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.isPending = false;
  state.isError = false;
});

it("starts invite creation from the empty state", () => {
  renderWithI18n(<InviteCard apiUrl="https://api.example.test" />);
  fireEvent.click(screen.getByRole("button", { name: "Create invite" }));
  expect(state.mutate).toHaveBeenCalledOnce();
});

it("announces invite creation immediately", () => {
  state.isPending = true;
  renderWithI18n(<InviteCard apiUrl="https://api.example.test" />);
  expect(screen.getByRole("status", { name: "Creating invite" })).not.toBeNull();
});

it("exposes invite creation failures as an alert", () => {
  state.isError = true;
  renderWithI18n(<InviteCard apiUrl="https://api.example.test" />);
  expect(screen.getByRole("alert").textContent).toBe("Could not create the invite. Try again.");
});
