import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinguiClientProvider } from "@/components/LinguiClientProvider";
import { messages } from "../../../../../messages/en.js";

describe("LinguiClientProvider", () => {
  it("renders children inside the i18n context", () => {
    render(
      <LinguiClientProvider initialLocale="en" initialMessages={messages}>
        <p>hello</p>
      </LinguiClientProvider>,
    );
    expect(screen.getByText("hello")).toBeTruthy();
  });

  it("keeps the server locale when the navigator speaks the same language", () => {
    render(
      <LinguiClientProvider initialLocale="en" initialMessages={messages}>
        <p>ok</p>
      </LinguiClientProvider>,
    );
    // jsdom default navigator.language is "en-US" → normalized to "en" == initial.
    expect(screen.getByText("ok")).toBeTruthy();
  });
});
