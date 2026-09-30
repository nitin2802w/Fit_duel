/**
 * counter.test.ts
 * ---------------
 * Tests for the PushupCounter state machine.
 */

import { describe, it, expect } from "vitest";
import { PushupCounter } from "../src/counter.js";

const OPTIONS = { downThresh: 95, upThresh: 155, backStraightMin: 155 };

describe("PushupCounter", () => {
  it("starts at count 0, stage 'up'", () => {
    const c = new PushupCounter(OPTIONS);
    expect(c.count).toBe(0);
    expect(c.stage).toBe("up");
  });

  it("transitions to 'down' when elbow drops below downThresh", () => {
    const c = new PushupCounter(OPTIONS);
    c.update(90, 160); // elbow=90 < downThresh=95
    expect(c.stage).toBe("down");
  });

  it("counts a valid rep on full down-up cycle", () => {
    const c = new PushupCounter(OPTIONS);
    c.update(90, 160); // go down
    c.update(160, 160); // come up
    expect(c.count).toBe(1);
    expect(c.feedback).toBe("Good rep!");
  });

  it("does NOT count a rep if elbow never went below downThresh", () => {
    const c = new PushupCounter(OPTIONS);
    c.update(100, 160); // not low enough (100 > 95)
    c.update(160, 160);
    expect(c.count).toBe(0);
    // Stage should remain 'up' since we never crossed downThresh
    expect(c.stage).toBe("up");
  });

  it("rejects rep with broken back form", () => {
    const c = new PushupCounter(OPTIONS);
    c.update(90, 140); // down + back break (140 < 155)
    c.update(160, 160); // up
    expect(c.count).toBe(0);
    expect(c.feedback).toBe("Keep your back/hips in a straight line");
  });

  it("rejects rep without sufficient depth", () => {
    const c = new PushupCounter(OPTIONS);
    // stage goes down on first frame, but min elbow is still 90 < 95 — wait,
    // let's use a threshold where depth fails: minElbow stays at 100
    const c2 = new PushupCounter({ ...OPTIONS, downThresh: 85 }); // stricter
    c2.update(90, 160); // 90 > 85, so stage never flips to down
    c2.update(160, 160);
    expect(c2.count).toBe(0);
  });

  it("accumulates multiple reps correctly", () => {
    const c = new PushupCounter(OPTIONS);
    for (let i = 0; i < 3; i++) {
      c.update(90, 160);
      c.update(160, 160);
    }
    expect(c.count).toBe(3);
  });

  it("initialCount is respected", () => {
    const c = new PushupCounter(OPTIONS, 5);
    c.update(90, 160);
    c.update(160, 160);
    expect(c.count).toBe(6);
  });
});
