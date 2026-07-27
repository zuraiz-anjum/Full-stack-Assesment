import { describe, expect, it } from "vitest";
import { parseWallClock } from "./datetime";

describe("parseWallClock", () => {
  it("does not reinterpret the string through the browser's timezone", () => {
    // The backend sends a naive local-wall-clock string. Regardless of
    // what timezone this test runs in, the parsed Date's individual
    // components must match the string's digits exactly.
    const d = parseWallClock("2026-07-27T15:35:00");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // 0-indexed -> July
    expect(d.getDate()).toBe(27);
    expect(d.getHours()).toBe(15);
    expect(d.getMinutes()).toBe(35);
    expect(d.getSeconds()).toBe(0);
  });

  it("handles a string with fractional seconds", () => {
    const d = parseWallClock("2026-01-05T06:00:00.123456");
    expect(d.getHours()).toBe(6);
    expect(d.getMinutes()).toBe(0);
  });

  it("falls back to native parsing for a malformed string", () => {
    const d = parseWallClock("not-a-real-date");
    expect(d instanceof Date).toBe(true);
  });
});
