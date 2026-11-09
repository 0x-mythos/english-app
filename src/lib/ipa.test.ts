import { describe, expect, it } from "vitest";
import { formatIpa } from "./ipa";

describe("formatIpa", () => {
  it("does not double the slashes that data already has", () => {
    expect(formatIpa("/rɪˈliːs/")).toBe("/rɪˈliːs/");
  });
  it("wraps a bare transcription", () => {
    expect(formatIpa("pʊl")).toBe("/pʊl/");
  });
  it("replaces square brackets and trims", () => {
    expect(formatIpa(" [pʊl] ")).toBe("/pʊl/");
  });
  it("returns nothing for an empty value", () => {
    expect(formatIpa(" // ")).toBe("");
  });
});
