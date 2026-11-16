import type { XmlAST } from "react-native-svg";
import { expect, it } from "vitest";
import { resourceArtworkTree } from "../resourceArtworkTree";

it("replaces only approved animated groups while preserving SVG geometry, refs and draw order", () => {
  const original = () => null;
  const animated = () => null;
  const node = (
    tag: string,
    props: Record<string, string> = {},
    children: (XmlAST | string)[] = [],
  ): XmlAST => ({ tag, props, children, Tag: original, parent: null });
  const calendar = node("g", { class: "bgo-events-calendar", fill: "#ffffff" }, [
    node("path", { d: "M0 0H20" }),
  ]);
  const unknown = node("g", { class: "static" });
  const banner = node("g", { class: "bgo-events-banner" });
  const art = node("svg", { viewBox: "0 0 240 240" }, [
    node("defs", {}, [calendar, banner, unknown]),
    node("use", { href: "#calendar" }),
    node("style", {}, ["approved CSS"]),
    node("g", {}),
  ]);
  const before = JSON.stringify(art);
  expect(resourceArtworkTree(art, animated, "stars")).toBe(art);
  expect(calendar.Tag).toBe(animated);
  expect(banner.Tag).toBe(animated);
  expect(unknown.Tag).toBe(original);
  expect(JSON.stringify(art)).toBe(before);
  expect(resourceArtworkTree(node("g", { class: "bgo-events-banner" }), animated).Tag).toBe(
    original,
  );
});
