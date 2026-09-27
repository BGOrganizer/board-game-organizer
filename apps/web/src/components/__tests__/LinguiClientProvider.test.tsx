import { toast } from "@heroui/react/toast";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LinguiClientProvider } from "@/components/LinguiClientProvider";
import { messages } from "../../../../../messages/en.js";
import { messages as italianMessages } from "../../../../../messages/it.js";

it("dismisses localized toast with its close button", async () => {
  render(
    <LinguiClientProvider initialLocale="en" initialMessages={messages}>
      <button type="button" onClick={() => toast("Saved")}>
        Show toast
      </button>
      <button type="button" onClick={() => toast.danger("Failed")}>
        Show error
      </button>
    </LinguiClientProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Show toast" }));
  expect(await screen.findByText("Saved")).toBeTruthy();
  const close = screen.getByRole("button", { name: "Dismiss notification" });
  expect(close.querySelector('[data-slot="close-button-icon"]')).toBeTruthy();
  fireEvent.click(close);
  await waitFor(() => expect(screen.queryByText("Saved")).toBeNull());

  fireEvent.click(screen.getByRole("button", { name: "Show error" }));
  expect(await screen.findByText("Failed")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
  await waitFor(() => expect(screen.queryByText("Failed")).toBeNull());
});

it("labels toast dismissal in Italian", async () => {
  const language = vi.spyOn(window.navigator, "language", "get").mockReturnValue("it-IT");
  try {
    render(
      <LinguiClientProvider initialLocale="it" initialMessages={italianMessages}>
        <button type="button" onClick={() => toast("Salvato")}>
          Mostra notifica
        </button>
      </LinguiClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mostra notifica" }));
    expect(await screen.findByRole("button", { name: "Chiudi notifica" })).toBeTruthy();
  } finally {
    language.mockRestore();
  }
});
