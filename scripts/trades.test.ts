/** The Trades estimate (scripts/trades.ts), on the site's own matches. Run: node --test scripts/ (part of pnpm check). */
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { findConfig, loadConfig } from "@openpromises/files";
import { estimate, readMatches } from "./trades.ts";

const { config, contentDir } = await loadConfig(findConfig(join(import.meta.dirname, ".."))!);
const actors = new Set(readdirSync(join(contentDir, "actors")).map((f) => f.replace(/\.yaml$/, "")));
const byId = new Map(readMatches(contentDir, config, actors).map((x) => [x.match.id, x.match]));
const close = (a: number, b: number, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);

test("Intel: the range times the move, and the move above the S&P 500 over the same closes", () => {
  const e = estimate(contentDir, byId.get("trump-intel-stake-2025")!);
  assert.deepEqual(e.amount, [250001, 500000]);
  close(e.around, (24.93 / 23.5 - 1) * 100);
  close(e.above!, (24.93 / 23.5 - 1) * 100 - (6501.86 / 6370.17 - 1) * 100);
  close(e.onAbove![1], (500000 * e.above!) / 100);
  close(e.held!, (24.93 / 23.66 - 1) * 100);
});

test("a whole day of trades sums the day's ranges, and has no move above an index it is measured by", () => {
  const e = estimate(contentDir, byId.get("trump-tariff-pause-2025")!);
  assert.deepEqual(e.amount, [3629327, 12835000]);
  assert.equal(e.above, null);
  assert.equal(e.proxy, true);
});

test("a fall gives a loss: the lower end of the range is the larger loss", () => {
  const e = estimate(contentDir, byId.get("trump-thermo-fisher-cincinnati-2026")!);
  assert.ok(e.onAbove![0] < e.onAbove![1] && e.onAbove![1] < 0);
});
