import { describe, expect, it } from "vitest";
import { isBearerValid } from "./bearer";

describe("isBearerValid", () => {
  it("accepts the matching secret", () => {
    expect(isBearerValid("Bearer s3cret-value", "s3cret-value")).toBe(true);
  });
  it("rejects a wrong secret or a missing header", () => {
    expect(isBearerValid("Bearer nope", "s3cret-value")).toBe(false);
    expect(isBearerValid(null, "s3cret-value")).toBe(false);
  });
  it("rejects everything when the secret is not configured", () => {
    expect(isBearerValid("Bearer undefined", undefined)).toBe(false);
    expect(isBearerValid("Bearer ", "")).toBe(false);
  });
});
