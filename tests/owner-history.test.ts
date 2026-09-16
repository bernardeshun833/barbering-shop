import { describe, expect, it } from "vitest";
import { monthRange, readable } from "../src/lib/owner";

describe("monthRange", () => {
  it("covers a 30-day month end to end", () => {
    expect(monthRange(2026, 8)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("covers a 31-day month end to end", () => {
    expect(monthRange(2026, 0)).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("gets February right in a leap year", () => {
    expect(monthRange(2028, 1)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("gets February right in a common year", () => {
    expect(monthRange(2026, 1)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("pads single-digit months and days", () => {
    expect(monthRange(2026, 2)).toEqual({ from: "2026-03-01", to: "2026-03-31" });
  });
});

describe("readable", () => {
  it("names the time a lockout ends rather than just refusing", () => {
    expect(readable('LOCKED_UNTIL 21:45')).toBe(
      "Too many wrong PINs. Try again after 21:45."
    );
  });

  it("reads a lockout out of the noise Postgres wraps it in", () => {
    const raw = 'unexpected error: LOCKED_UNTIL 09:05\nCONTEXT: PL/pgSQL function owner_pin_ok(text)';
    expect(readable(raw)).toBe("Too many wrong PINs. Try again after 09:05.");
  });

  it("prefers the lockout over the wrong-PIN wording when both appear", () => {
    // The lockout is raised from inside the same call that checks the PIN, so
    // a message can carry both. Telling her to try again is the wrong advice.
    expect(readable("WRONG_PIN ... LOCKED_UNTIL 14:00")).toContain("Try again after 14:00");
  });

  it("says plainly that a PIN is wrong", () => {
    expect(readable("WRONG_PIN")).toBe("That PIN is not right");
  });

  it("points at the setup step when no owner PIN exists yet", () => {
    expect(readable("NO_OWNER_PIN")).toContain("No owner PIN has been set");
  });

  it("passes anything else through rather than swallowing it", () => {
    expect(readable("could not connect to server")).toBe("could not connect to server");
  });
});
