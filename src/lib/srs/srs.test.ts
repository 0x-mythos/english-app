import { describe, expect, it } from "vitest";
import { formatInterval, previewIntervals, review, type CardRow } from "./fsrs";
import { parseTime, reminderText, shouldRemind } from "./reminders";
import {
  cardKind, clozeMatches, clozeOf, dailyLimits, everydayStartRank, interleave, itCefrLevels, localDate, startOfLocalDay,
} from "./session";

const NEW_ROW: CardRow = {
  due: "2026-11-04T10:00:00.000Z", stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0,
  learning_steps: 0, reps: 0, lapses: 0, state: 0, last_review: null,
};

describe("fsrs", () => {
  const now = new Date("2026-11-04T10:00:00Z");

  it("перший повтор нової картки: лог зберігає стан ДО, картка — ПІСЛЯ", () => {
    const { patch, log } = review(NEW_ROW, 3, now);
    expect(log.state).toBe(0);
    expect(log.rating).toBe(3);
    expect(patch.reps).toBe(1);
    expect(patch.state).toBe(1); // Learning
    expect(patch.last_review).toBe(now.toISOString());
    expect(new Date(patch.due).getTime()).toBeGreaterThan(now.getTime());
  });

  it("Again коротший за Good, Good коротший за Easy", () => {
    const due = (g: 1 | 3 | 4) => new Date(review(NEW_ROW, g, now).patch.due).getTime();
    expect(due(1)).toBeLessThan(due(3));
    expect(due(3)).toBeLessThan(due(4));
  });

  it("провал у Review рахує lapse і переводить у Relearning", () => {
    let row = NEW_ROW;
    let t = now;
    for (let i = 0; i < 4; i++) {
      row = review(row, 3, t).patch;
      t = new Date(new Date(row.due).getTime() + 60_000);
    }
    expect(row.state).toBe(2);
    const failed = review(row, 1, t).patch;
    expect(failed.lapses).toBe(1);
    expect(failed.state).toBe(3);
    expect(failed.elapsed_days).toBeGreaterThan(0);
  });

  it("підписи інтервалів для всіх 4 оцінок", () => {
    const p = previewIntervals(NEW_ROW, now);
    expect(Object.keys(p)).toEqual(["1", "2", "3", "4"]);
    expect(p[1]).toMatch(/хв$/);
  });

  it("formatInterval", () => {
    expect(formatInterval(30_000)).toBe("1 хв");
    expect(formatInterval(10 * 60_000)).toBe("10 хв");
    expect(formatInterval(3 * 3600_000)).toBe("3 год");
    expect(formatInterval(5 * 86_400_000)).toBe("5 дн");
    expect(formatInterval(90 * 86_400_000)).toBe("3 міс");
  });
});

describe("session", () => {
  it("ліміти від хвилин на день, з межами", () => {
    expect(dailyLimits(10)).toEqual({ newPerDay: 10, reviewsPerSession: 80 });
    expect(dailyLimits(1).newPerDay).toBe(5);
    expect(dailyLimits(60).newPerDay).toBe(25);
  });

  it("everyday стартує трохи нижче оціненого словника; без тесту — дефолт", () => {
    expect(everydayStartRank(4000)).toBe(3200);
    expect(everydayStartRank(null)).toBe(1200);
  });

  it("IT-рівні від одного нижче за словник", () => {
    expect(itCefrLevels("B1")).toEqual(["A2", "B1", "B2", "C1", "C2"]);
    expect(itCefrLevels("A1")[0]).toBe("A1");
  });

  it("interleave чергує групи і зберігає порядок усередині", () => {
    const xs = ["a1", "a2", "a3", "b1", "c1", "c2"];
    expect(interleave(xs, (x) => x[0])).toEqual(["a1", "b1", "c1", "a2", "c2", "a3"]);
  });

  it("нові картки — завжди recall, далі чергування; cloze лише коли слово є в прикладі", () => {
    expect(cardKind(0, 7, "I borrow it", "borrow")).toBe("recall");
    const kinds = new Set([2, 3, 4, 5].map((r) => cardKind(r, 1, "I borrow it", "borrow")));
    expect(kinds).toEqual(new Set(["recall", "reverse", "cloze"]));
    const noCloze = new Set([2, 3, 4, 5].map((r) => cardKind(r, 1, "Something else", "borrow")));
    expect(noCloze.has("cloze")).toBe(false);
  });

  it("cloze і перевірка відповіді", () => {
    expect(clozeOf("Let's Roll back the release.", "roll back")).toBe("Let's _____ the release.");
    expect(clozeOf("Nothing here", "deploy")).toBeNull();
    expect(clozeMatches("  Roll  back. ", "roll back")).toBe(true);
    expect(clozeMatches("rollback", "roll back")).toBe(false);
  });

  it("локальна дата і північ у Варшаві", () => {
    const now = new Date("2026-11-04T23:30:00Z"); // 00:30 5 листопада у Варшаві (UTC+1)
    expect(localDate(now, "Europe/Warsaw")).toBe("2026-11-05");
    expect(startOfLocalDay(now, "Europe/Warsaw").toISOString()).toBe("2026-11-04T23:00:00.000Z");
  });

  it("північ у день переходу на літній час", () => {
    const now = new Date("2026-03-29T20:00:00Z"); // 22:00 CEST, а північ була ще за CET
    expect(startOfLocalDay(now, "Europe/Warsaw").toISOString()).toBe("2026-03-28T23:00:00.000Z");
  });
});

describe("reminders", () => {
  const u = { reminders_on: true, remind_at: "19:00:00", timezone: "Europe/Warsaw", last_reminded_on: null };
  const at = (utc: string) => new Date(utc);

  it("parseTime", () => {
    expect(parseTime("19:00:00")).toBe(1140);
    expect(parseTime("7:05")).toBe(425);
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("abc")).toBeNull();
  });

  it("після remind_at за локальним часом — так; до — ні", () => {
    expect(shouldRemind(u, at("2026-11-04T18:05:00Z"), false)).toBe(true); // 19:05 Варшава
    expect(shouldRemind(u, at("2026-11-04T17:55:00Z"), false)).toBe(false); // 18:55
  });

  it("не нагадує, якщо вже займався, вже нагадано сьогодні, вимкнено або дуже пізно", () => {
    const t = at("2026-11-04T18:05:00Z");
    expect(shouldRemind(u, t, true)).toBe(false);
    expect(shouldRemind({ ...u, last_reminded_on: "2026-11-04" }, t, false)).toBe(false);
    expect(shouldRemind({ ...u, reminders_on: false }, t, false)).toBe(false);
    expect(shouldRemind(u, at("2026-11-04T23:30:00Z"), false)).toBe(false); // 00:30 наступного дня
  });

  it("текст під ситуацію", () => {
    expect(reminderText(5, 0)).toContain("5 карток");
    expect(reminderText(0, 10)).toContain("10 нових");
    expect(reminderText(3, 7)).toContain("3 на повтор і 7 нових");
  });
});
