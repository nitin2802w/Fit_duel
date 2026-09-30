/**
 * smoother.test.ts
 * ----------------
 */

import { describe, it, expect } from "vitest";
import { Smoother } from "../src/smoother.js";

describe("Smoother", () => {
  it("returns the first value unchanged", () => {
    const s = new Smoother(0.4);
    expect(s.update(100)).toBe(100);
  });

  it("applies EMA correctly", () => {
    const s = new Smoother(0.4);
    s.update(100); // value = 100
    const next = s.update(50); // 0.4*50 + 0.6*100 = 80
    expect(next).toBeCloseTo(80, 5);
  });

  it("converges toward target over many steps", () => {
    const s = new Smoother(0.5);
    let v = s.update(0);
    for (let i = 0; i < 30; i++) v = s.update(100);
    expect(v).toBeGreaterThan(99);
  });

  it("reset starts fresh", () => {
    const s = new Smoother(0.4);
    s.update(100);
    s.reset();
    expect(s.value).toBeNull();
    expect(s.update(50)).toBe(50);
  });
});
