import { test } from "node:test";
import assert from "node:assert/strict";
import { summary, parseBackup, validEntry } from "../src/finance.js";
const entry = (type, cents, date = "2026-10-19") => ({
  id: type,
  type,
  cents,
  name: type,
  date,
});
test("balance separates savings, supplier expenses and business income", () => {
  assert.deepEqual(
    summary([
      entry("income", 100000),
      entry("business", 50000),
      entry("expense", 20000),
      entry("subscription", 1000),
      entry("supplier", 15000),
      entry("saving", 10000),
    ]),
    {
      income: 150000,
      expenses: 36000,
      savings: 10000,
      balance: 104000,
      business: 35000,
    },
  );
});
test("backup rejects bad dates, duplicate IDs, negative or fractional cents", () => {
  for (const e of [
    entry("expense", -1),
    entry("expense", 1.5),
    entry("expense", 100, "2026-02-30"),
    entry("unknown", 100),
  ])
    assert.equal(validEntry(e), false);
  assert.throws(() =>
    parseBackup(
      JSON.stringify({
        version: 1,
        currency: "PEN",
        entries: [entry("expense", 100), entry("expense", 200)],
      }),
    ),
  );
});
test("backup preserves cents and accepts empty accounts", () => {
  const d = { version: 1, currency: "PEN", entries: [entry("saving", 2999)] };
  assert.deepEqual(parseBackup(JSON.stringify(d)), d);
  assert.equal(summary([]).balance, 0);
});
