import { render, screen } from "@testing-library/react-native";
import { expect, it } from "vitest";
import { RuntimeError } from "../RuntimeError";

it("renders the crash fallback without the application's HeroUI providers", async () => {
  await render(<RuntimeError />);
  expect(screen.getByText("Errore imprevisto")).toBeTruthy();
  expect(screen.getByText("L'errore è stato segnalato. Riavvia l'app.")).toBeTruthy();
});

it("includes the exception and bounds the displayed component stack", async () => {
  const stack = "Component frame\n".repeat(150);
  const view = await render(<RuntimeError message="Unexpected state" componentStack={stack} />);
  expect(screen.getByText("Unexpected state")).toBeTruthy();
  expect(screen.getByText(stack.slice(0, 1500))).toHaveProp("numberOfLines", 30);
  await view.rerender(<RuntimeError message="" componentStack="" />);
  expect(screen.queryByText("Unexpected state")).toBeNull();
  expect(screen.queryByText(stack.slice(0, 1500))).toBeNull();
});
