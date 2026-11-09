import { describe, expect, it } from "vitest";
import { isTelegramIdAllowed } from "./access";

describe("isTelegramIdAllowed", () => {
  it("allows only listed ids", () => {
    expect(isTelegramIdAllowed(111, "111, 222", false)).toBe(true);
    expect(isTelegramIdAllowed(222, "111, 222", false)).toBe(true);
    expect(isTelegramIdAllowed(333, "111, 222", false)).toBe(false);
  });
  it("denies everyone in production when the list is missing or empty", () => {
    expect(isTelegramIdAllowed(111, undefined, false)).toBe(false);
    expect(isTelegramIdAllowed(111, "", false)).toBe(false);
    expect(isTelegramIdAllowed(111, " , abc", false)).toBe(false);
  });
  it("allows everyone in development when the list is empty", () => {
    expect(isTelegramIdAllowed(111, undefined, true)).toBe(true);
  });
  it("still applies a configured list in development", () => {
    expect(isTelegramIdAllowed(333, "111", true)).toBe(false);
  });
});
