import { describe, expect, it } from "vitest";
import { presentKey } from "./keys";

describe("presentKey", () => {
  it("advances and goes back within bounds", () => {
    expect(presentKey("ArrowRight", 0, 3)).toEqual({ type: "go", index: 1 });
    expect(presentKey(" ", 2, 3)).toEqual({ type: "go", index: 2 });
    expect(presentKey("ArrowLeft", 0, 3)).toEqual({ type: "go", index: 0 });
    expect(presentKey("PageUp", 2, 3)).toEqual({ type: "go", index: 1 });
  });

  it("jumps to the ends", () => {
    expect(presentKey("Home", 2, 5)).toEqual({ type: "go", index: 0 });
    expect(presentKey("End", 0, 5)).toEqual({ type: "go", index: 4 });
  });

  it("exits, toggles notes, and ignores other keys", () => {
    expect(presentKey("Escape", 1, 3)).toEqual({ type: "exit" });
    expect(presentKey("n", 1, 3)).toEqual({ type: "toggle-notes" });
    expect(presentKey("x", 1, 3)).toBeNull();
  });
});
