import { expect, it, vi } from "vitest";
import { createArtworkVisibility } from "../artworkVisibility";

it("notifies only rows crossing the visible boundary, never every mounted row", () => {
  const visibility = createArtworkVisibility();
  const a = vi.fn(),
    b = vi.fn(),
    secondA = vi.fn();
  const stopA = visibility.subscribe("a", a);
  const stopSecond = visibility.subscribe("a", secondA);
  visibility.subscribe("b", b);
  expect(visibility.isVisible("a")).toBe(false);
  visibility.update([
    { key: "a", isViewable: true },
    { key: "b", isViewable: false },
  ]);
  expect(visibility.isVisible("a")).toBe(true);
  expect(a).toHaveBeenCalledOnce();
  expect(secondA).toHaveBeenCalledOnce();
  expect(b).not.toHaveBeenCalled();
  visibility.update([{ key: "a", isViewable: true }]);
  expect(a).toHaveBeenCalledOnce();
  stopSecond();
  visibility.update([{ key: "b", isViewable: true }]);
  expect(a).toHaveBeenCalledTimes(2);
  expect(secondA).toHaveBeenCalledOnce();
  expect(b).toHaveBeenCalledOnce();
  stopA();
  visibility.update([{ key: "a", isViewable: true }]);
  expect(a).toHaveBeenCalledTimes(2);
});

it("pauses detail headers after their measured bottom and retains row visibility", () => {
  const visibility = createArtworkVisibility();
  const header = vi.fn();
  visibility.subscribe(visibility.headerKey, header);
  visibility.scroll(0);
  expect(visibility.isVisible(visibility.headerKey)).toBe(false);
  visibility.viewport(96);
  visibility.headerLayout(12, 96);
  expect(visibility.isVisible(visibility.headerKey)).toBe(true);
  visibility.update([{ key: "row", isViewable: true }]);
  expect(visibility.isVisible(visibility.headerKey)).toBe(true);
  visibility.scroll(108);
  expect(visibility.isVisible(visibility.headerKey)).toBe(false);
  expect(visibility.isVisible("row")).toBe(true);
  visibility.update([{ key: "row", isViewable: true }]);
  expect(visibility.isVisible(visibility.headerKey)).toBe(false);
  visibility.scroll(-10);
  expect(visibility.isVisible(visibility.headerKey)).toBe(true);
  visibility.headerLayout(0, 0);
  expect(visibility.isVisible(visibility.headerKey)).toBe(false);
  expect(header).toHaveBeenCalledTimes(4);
});

it("measures individual header illustrations only on layout, then gates their actual bounds on scroll", () => {
  const visibility = createArtworkVisibility();
  const top = vi.fn(),
    lower = vi.fn();
  visibility.subscribe("top", top);
  visibility.subscribe("lower", lower);
  const measureTop = vi.fn(() => visibility.frame("top", 10, 64));
  const measureLower = vi.fn(() => visibility.frame("lower", 300, 96));
  const stopTop = visibility.registerFrame("top", measureTop);
  const stopLower = visibility.registerFrame("lower", measureLower);
  expect(visibility.isVisible("top")).toBe(false);
  visibility.headerLayout(0, 1000);
  visibility.viewport(100);
  expect(visibility.isVisible("top")).toBe(true);
  expect(visibility.isVisible("lower")).toBe(false);
  const layoutCalls = measureLower.mock.calls.length;
  visibility.scroll(210);
  expect(visibility.isVisible("top")).toBe(false);
  expect(visibility.isVisible("lower")).toBe(true);
  expect(measureLower).toHaveBeenCalledTimes(layoutCalls);
  visibility.update([{ key: "row", isViewable: true }]);
  expect(visibility.isVisible("lower")).toBe(true);
  visibility.viewport(20);
  expect(visibility.isVisible("lower")).toBe(false);
  visibility.headerLayout(20, 1200);
  expect(measureLower).toHaveBeenCalledTimes(layoutCalls + 1);
  visibility.scroll(300, 100);
  expect(visibility.isVisible("lower")).toBe(true);
  visibility.measureFrame("lower");
  expect(measureLower).toHaveBeenCalledTimes(layoutCalls + 2);
  visibility.measureFrame("unmounted");
  visibility.frame("top", 0, 0);
  stopTop();
  stopLower();
  expect(visibility.isVisible("lower")).toBe(false);
  visibility.headerLayout(0, 10);
  expect(measureLower).toHaveBeenCalledTimes(layoutCalls + 2);
});
