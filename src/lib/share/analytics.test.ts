import { describe, expect, it } from "vitest";
import { createDwellTracker, trackingAllowed } from "./analytics";

describe("dwell tracker", () => {
  it("attributes time to the active card while visible", () => {
    let t = 0;
    const tr = createDwellTracker("visitor-1", () => t);
    tr.setActive("a");
    t = 5000;
    tr.setActive("b");
    t = 5500;
    tr.setVisible(false);
    t = 60_000;
    tr.setVisible(true);
    t = 63_000;
    expect(tr.flush()).toEqual([
      { type: "dwell", visitor: "visitor-1", cardId: "a", ms: 5000 },
      { type: "dwell", visitor: "visitor-1", cardId: "b", ms: 3500 },
    ]);
    expect(tr.flush()).toEqual([]);
  });

  it("drops glances under a second", () => {
    let t = 0;
    const tr = createDwellTracker("v", () => t);
    tr.setActive("a");
    t = 400;
    expect(tr.flush()).toEqual([]);
  });
});

describe("trackingAllowed", () => {
  it("respects Do Not Track and Global Privacy Control", () => {
    expect(trackingAllowed({})).toBe(true);
    expect(trackingAllowed({ doNotTrack: "1" })).toBe(false);
    expect(trackingAllowed({ globalPrivacyControl: true })).toBe(false);
  });
});
