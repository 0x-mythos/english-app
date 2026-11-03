import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyInitData } from "./telegram-auth";

const BOT_TOKEN = "123456:TEST-token";
const NOW = 1_800_000_000_000;

function sign(fields: Record<string, string>, token = BOT_TOKEN) {
  const dcs = Object.entries(fields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const fields = {
  auth_date: String(NOW / 1000 - 60),
  query_id: "AAE",
  user: JSON.stringify({ id: 42, first_name: "Arsenii", username: "arsen" }),
};

describe("verifyInitData", () => {
  it("accepts correctly signed data", () => {
    const r = verifyInitData(sign(fields), BOT_TOKEN, { now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user.id).toBe(42);
  });

  it("rejects data signed with another bot token", () => {
    const r = verifyInitData(sign(fields, "999:other"), BOT_TOKEN, { now: NOW });
    expect(r).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("rejects tampered user", () => {
    const tampered = sign(fields).replace("42", "43");
    expect(verifyInitData(tampered, BOT_TOKEN, { now: NOW })).toEqual({ ok: false, reason: "bad_hash" });
  });

  it("rejects missing hash", () => {
    expect(verifyInitData("auth_date=1", BOT_TOKEN)).toEqual({ ok: false, reason: "missing_hash" });
  });

  it("rejects stale auth_date", () => {
    const old = { ...fields, auth_date: String(NOW / 1000 - 2 * 86400) };
    expect(verifyInitData(sign(old), BOT_TOKEN, { now: NOW })).toEqual({ ok: false, reason: "expired" });
  });
});
