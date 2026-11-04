import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { bankErrors, type BankTopic } from "./drills";

// Банк генерують субагенти — кожен файл має пройти схему, інакше сервер його мовчки пропустить.
const dir = path.join(__dirname, "../../../data/grammar");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

describe("банк граматики", () => {
  it.each(files)("%s відповідає схемі", (f) => {
    const t = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as BankTopic;
    expect(t.topic).toBe(f.replace(/\.json$/, ""));
    expect(bankErrors(t)).toEqual([]);
  });

  it("id унікальні на весь банк", () => {
    const ids = files.flatMap((f) => (JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as BankTopic).items.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
