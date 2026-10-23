import { describe, expect, it } from "vitest";
import { extractJson } from "./json";

describe("extractJson", () => {
  it("reads bare, fenced, and prose-wrapped JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('Here:\n```json\n{"a":{"b":2}}\n```')).toEqual({ a: { b: 2 } });
    expect(extractJson('Sure! {"a":[1,2]} Hope that works.')).toEqual({ a: [1, 2] });
  });

  it("throws when there is no object", () => {
    expect(() => extractJson("no json here")).toThrow(SyntaxError);
  });
});
