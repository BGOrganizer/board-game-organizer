import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import EnglishPage from "../app/(english)/en/page";
import EnglishLayout, { metadata as englishMetadata } from "../app/(english)/layout";
import ItalianLayout, { metadata as italianMetadata } from "../app/(italian)/layout";
import ItalianPage from "../app/(italian)/page";
import { latestRelease, license, repository, webSignInUrl } from "../lib/links";
import { siteMetadata } from "../lib/siteMetadata";

beforeAll(() => {
  // jsdom has no layout or Web Animations APIs. Keep the real HeroUI components mounted.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.getAnimations ??= () => [];
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("public site routing", () => {
  it("sets the document language and canonical alternatives for both pages", () => {
    expect(renderToStaticMarkup(<ItalianLayout>Contenuto</ItalianLayout>)).toContain('lang="it"');
    expect(renderToStaticMarkup(<EnglishLayout>Content</EnglishLayout>)).toContain('lang="en"');
    expect(italianMetadata.alternates).toMatchObject({ canonical: "/", languages: { en: "/en" } });
    expect(englishMetadata.alternates).toMatchObject({ canonical: "/en", languages: { it: "/" } });
    expect(englishMetadata.description).toContain("Plan board game nights");
  });

  it("keeps Preview pages out of search indexes", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(siteMetadata("it").robots).toEqual({ index: false, follow: false });
    vi.stubEnv("VERCEL_ENV", "production");
    expect(siteMetadata("it").robots).toBeUndefined();
  });

  it("uses the configured Web origin, the stable APK release and working locale links", () => {
    vi.stubEnv("NEXT_PUBLIC_BGO_WEB_ORIGIN", "https://app.board-game-organizer.com");
    render(<ItalianPage />);
    for (const name of ["Accedi", "Apri l’app Web"]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute(
        "href",
        "https://app.board-game-organizer.com/sign-in",
      );
    }
    expect(screen.getByRole("link", { name: "Scarica APK" })).toHaveAttribute(
      "href",
      latestRelease,
    );
    expect(screen.getByRole("link", { name: "Switch to English" })).toHaveAttribute("href", "/en");
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", repository);
    expect(screen.getByRole("link", { name: "Licenza AGPL-3.0" })).toHaveAttribute("href", license);

    const nav = within(screen.getByRole("navigation"));
    for (const [name, id] of [
      ["Eventi", "eventi"],
      ["Funzionalità", "funzionalita"],
      ["Classifiche", "classifiche"],
      ["Community", "community"],
    ]) {
      expect(nav.getByRole("link", { name })).toHaveAttribute("href", `#${id}`);
      expect(document.getElementById(id)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Per le associazioni" })).toHaveAttribute(
      "href",
      "#organizzazioni",
    );
  });

  it("renders English content with a link back to Italian", () => {
    render(<EnglishPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("More games.");
    expect(screen.getByRole("link", { name: "Passa all’italiano" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("heading", { name: "Sync your BGG collection" })).toBeVisible();
  });
});

describe("Web sign-in configuration", () => {
  it("refuses a first Preview build classified as Production by Vercel", () => {
    vi.stubEnv("BGO_SITE_VERCEL_TARGET", "preview");
    vi.stubEnv("VERCEL_ENV", "production");
    const origin = "https://web-preview.vercel.app";
    expect(() => webSignInUrl(origin, true)).toThrow("Site expected a Vercel preview build");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(webSignInUrl(origin, true)).toBe(`${origin}/sign-in`);
  });

  it("uses the live Web address for local work and requires a configured Vercel target", () => {
    vi.stubEnv("NEXT_PUBLIC_BGO_WEB_ORIGIN", undefined);
    vi.stubEnv("VERCEL", undefined);
    expect(webSignInUrl()).toBe("https://board-game-organizer.com/sign-in");
    expect(webSignInUrl("", false)).toBe("https://board-game-organizer.com/sign-in");
    expect(() => webSignInUrl("", true)).toThrow("Set NEXT_PUBLIC_BGO_WEB_ORIGIN");
    expect(webSignInUrl(" https://web-preview.vercel.app/ ", true)).toBe(
      "https://web-preview.vercel.app/sign-in",
    );
  });

  it.each([
    "http://example.com",
    "https://example.com/sign-in",
    "https://example.com/?redirect=1",
    "https://example.com/#sign-in",
    "https://user@example.com",
    "//example.com",
  ])("rejects unsafe or ambiguous origins (%s)", (value) => {
    expect(() => webSignInUrl(value, true)).toThrow();
  });
});

describe("interactive examples", () => {
  it("pauses both the artwork source and the hero animation, then restores them", () => {
    const { container } = render(<ItalianPage />);
    const hero = screen.getByRole("heading", { level: 1 }).closest("section");
    expect(hero?.querySelector("picture source")).toHaveAttribute(
      "media",
      "(prefers-reduced-motion: no-preference)",
    );
    fireEvent.click(screen.getByRole("button", { name: "Metti in pausa le animazioni" }));
    expect(container.querySelector("[data-artwork-motion]")).toHaveAttribute(
      "data-artwork-motion",
      "off",
    );
    expect(container.querySelector("picture source")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Attiva le animazioni" }));
    expect(hero?.querySelector("picture source")).toBeInTheDocument();
  });

  it("shows the matching OpenSkill curve when switching scope", () => {
    render(<ItalianPage />);
    const group = screen.getByRole("img", { name: "Progresso personale · Nel gruppo · Hegemony" });
    expect(group.querySelectorAll("circle")).toHaveLength(6);
    fireEvent.click(screen.getByRole("tab", { name: "Rating globale" }));
    expect(screen.getByRole("tabpanel", { name: "Rating globale" })).toHaveTextContent("30,8");
    const global = screen.getByRole("img", {
      name: "Progresso personale · Rating globale · Hegemony",
    });
    expect(global.querySelectorAll("circle")).toHaveLength(9);
    fireEvent.click(screen.getByRole("tab", { name: "Nel gruppo" }));
    expect(screen.getByRole("tabpanel", { name: "Nel gruppo" })).toHaveTextContent("31,7");
  });
});
