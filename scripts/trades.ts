/**
 * Trades: the securities trades in the President's accounts since 20 January 2025, from his own reports to the
 * Office of Government Ethics, and the trades that came within days of something he said or did in office. Each match
 * is a chain read left to right: the trade as the filing lists it, the stock's close before his words, the words, the
 * close after them, and the close five trading days later, each with the S&P 500 over the same days. Both ends have a
 * primary source: the filing on one side, the Daily Compilation of Presidential Documents (or another official
 * record) on the other. The figures say when; they do not say why. The White House's account of who makes the trades
 * is shown beside them, in its words.
 *
 * Two kinds of file in content/trades/:
 *   about.yaml       the page's figures, the filings, the White House's account and the bill (format below)
 *   <id>.yaml        one match (format below)
 * Every quote is checked character for character against the saved source in content/sources/, at the span the file
 * names, as Then again checks its pairs (scripts/then-again.ts). A filing row is a quote too: the row as the saved
 * extract or transcription gives it. Every close is read from a saved price file (date,close), never typed in, and
 * the days it is read on follow one rule for every match:
 *   before  the last close before the words (the same day's, if the words came after the 4 p.m. close)
 *   after   the first close after the words
 *   fifth   the fifth close after the words
 * Like a pair, a match is published only once an editor in content/editors.yaml has approved it, and the page is
 * published only once about.yaml is approved; until then both show only in the preview build.
 *
 *   node scripts/trades.ts check                       every file against its sources and the words lint
 *   node scripts/trades.ts approve <id> --by "<name>"  the editor's approval, dated today in Washington
 *
 * Match format:
 *   format: usledger-trades/1
 *   id: trump-example-2026                  # the file's name
 *   actor_id: donald-trump
 *   subject: "…"                            # our neutral words
 *   trade:
 *     asset: "…"                            # our name for what was traded; omit for a whole day of trades
 *     date: "2026-02-10"
 *     filing: { title, url, page, filed }   # the report, the PDF page, the day OGE posted it
 *     text: "…"                             # the row, as the saved source gives it
 *     source_text: { file, span }
 *     scope: "on the same page"             # where the same day's other rows are counted: the row's own block
 *     days: ["2025-04-09"]                  # optional: other days to count in the same block
 *   words: { date, venue, where, text, source_url, source_text, time: { text, source_url, source_text, note? } }
 *   prices: { symbol?, name?, file? }       # the stock's saved closes; without a symbol, only the S&P 500
 *   note: "…"                               # optional, our neutral words
 *   recorded_on, reviews                    # as a pair's
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lexicon, lintText, todayIn, type Config } from "@openpromises/core";
import { findConfig, loadConfig, readYaml } from "@openpromises/files";
import { quoteProblems, type Said } from "./then-again.ts";

export const FORMAT = "usledger-trades/1";
export const ABOUT_FORMAT = "usledger-trades-about/1";
export const DIR = "trades";
/** The index the moves are set against, read from its saved closes. */
export const INDEX = { name: "S&P 500", file: "fred-sp500.csv" };

interface Source {
  file: string;
  span: [number, number];
}
/** Words someone else said or wrote, in their exact words, with who and when. */
export interface Quote {
  by: string;
  date: string;
  where: string;
  text: string;
  source_url: string;
  source_text: Source;
}
export interface Review {
  by: string;
  kind: string;
  on: string;
  approves: boolean;
}
export interface Match {
  format: string;
  id: string;
  actor_id: string;
  subject: string;
  trade: {
    asset?: string;
    date: string;
    filing: { title: string; url: string; page: number; filed: string };
    text: string;
    source_text: Source;
    scope: string;
    days?: string[];
  };
  words: Said & { time: { text: string; source_url: string; source_text: Source; note?: string } };
  prices: { symbol?: string; name?: string; file?: string };
  note?: string;
  recorded_on: string;
  reviews: Review[];
}
export interface About {
  format: string;
  id: "about";
  actor_id: string;
  count: { number: number; year: number; text: string; source_url: string; source_text: Source; filing: { title: string; url: string; filed: string; pages: number } };
  filings: { posted: string; title: string; pages: number; url: string }[];
  form: Quote;
  review: Quote;
  press: (Quote & { figure: string })[];
  white_house: Quote[];
  bill: { number: string; title: string; sponsor: string; url: string; status_url: string; text: Quote[]; actions: (Quote & { label: string })[] };
  left_out: { lead: string; why: string }[];
  recorded_on: string;
  reviews: Review[];
}

/** One row of a filing, read from its fields: the extract's rows and the transcription's are both joined by " | ". */
export interface Row {
  account?: string;
  description: string;
  type: string;
  date: string;
  amount: string;
  label?: string;
}
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
export function parseRow(text: string): Row | null {
  const f = text.split(" | ");
  const at = f.findIndex((x) => US_DATE.test(x));
  if (at < 2) return null;
  const [, m, d, y] = US_DATE.exec(f[at]!)!;
  const description = f[at - 2]!;
  return {
    account: /^INVESTMENT ACCOUNT/.test(f[0]!) ? f[0]!.replace("ACCOUNT#", "ACCOUNT #") : undefined,
    description,
    type: f[at - 1]!.toLowerCase(),
    date: `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`,
    amount: f.at(-1)!,
    label: /\bUNSOLICITED\b/.test(description) ? "UNSOLICITED" : /DISCRETION/i.test(description) ? "DISCRETIONARY" : undefined,
  };
}

/** The rows of the block (the paragraph) of a saved source that holds a given span. */
export function blockRows(saved: string, at: number): Row[] {
  const from = saved.lastIndexOf("\n\n", at) + 2;
  const to = saved.indexOf("\n\n", at);
  return saved
    .slice(from, to < 0 ? undefined : to)
    .split("\n")
    .map(parseRow)
    .filter((r): r is Row => !!r);
}

/** How many of a block's rows fall on a day, purchases and sales apart. */
export const dayCount = (rows: readonly Row[], date: string) => {
  const day = rows.filter((r) => r.date === date);
  return { all: day.length, purchases: day.filter((r) => r.type === "purchase").length, sales: day.filter((r) => r.type === "sale").length };
};

/** A saved price file: comment lines, a header, then date,close; an empty close is a day with no trading. */
export function readCloses(contentDir: string, file: string): { date: string; close: number }[] {
  return readFileSync(join(contentDir, "sources", file), "utf8")
    .split("\n")
    .filter((l) => /^\d{4}-\d{2}-\d{2},/.test(l))
    .map((l) => l.split(","))
    .filter(([, c]) => c && c.trim() !== "" && c.trim() !== ".")
    .map(([date, c]) => ({ date: date!, close: Number(c) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** "NOTE: The President spoke at 4:31 p.m." → minutes after midnight, or null. */
export function minutesOf(note: string): number | null {
  const m = /(\d{1,2}):(\d{2}) ([ap])\.m\./.exec(note);
  if (!m) return null;
  const h = (Number(m[1]) % 12) + (m[3] === "p" ? 12 : 0);
  return h * 60 + Number(m[2]);
}
/** The New York market closes at 4 p.m. */
export const CLOSE = 16 * 60;

export interface Window {
  before: { date: string; close: number };
  after: { date: string; close: number };
  fifth: { date: string; close: number };
}
/** The three closes the rule names, for words on a day at a time; null if the saved closes do not reach that far. */
export function windowOf(closes: readonly { date: string; close: number }[], date: string, afterClose: boolean): Window | null {
  const i = closes.findIndex((c) => (afterClose ? c.date > date : c.date >= date));
  if (i < 1 || i + 4 >= closes.length) return null;
  return { before: closes[i - 1]!, after: closes[i]!, fifth: closes[i + 4]! };
}
export const change = (from: number, to: number) => ((to - from) / from) * 100;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function editorsOf(contentDir: string): Set<string> {
  return new Set(((readYaml(readFileSync(join(contentDir, "editors.yaml"), "utf8")) as { editors: { handle: string }[] }).editors ?? []).map((e) => e.handle));
}

/** Every match, with the problems found in each: an empty list means it passes. */
export function readMatches(contentDir: string, config: Config, actorIds: Set<string>): { match: Match; file: string; problems: string[] }[] {
  const dir = join(contentDir, DIR);
  if (!existsSync(dir)) return [];
  const editors = editorsOf(contentDir);
  const lex = lexicon(config, "en");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") && f !== "about.yaml")
    .sort()
    .map((f) => {
      const file = `${DIR}/${f}`;
      const match = readYaml(readFileSync(join(dir, f), "utf8")) as Match;
      const problems: string[] = [];
      const need = (ok: unknown, what: string) => {
        if (!ok) problems.push(what);
      };
      const lint = (name: string, text?: string) => {
        if (text) for (const word of lintText(text, lex)) problems.push(`${name}: "${word}" passes judgement`);
      };
      need(match.format === FORMAT, `format should be ${FORMAT}`);
      need(match.id === f.replace(/\.yaml$/, ""), "id should be the file's name");
      need(actorIds.has(match.actor_id), `no actor "${match.actor_id}" in content/actors/`);
      need(typeof match.subject === "string" && match.subject.length > 0, "subject is missing");
      need(ISO.test(match.recorded_on ?? ""), "recorded_on should be a date");
      lint("subject", match.subject);
      lint("note", match.note);

      const t = match.trade;
      if (!t) problems.push("trade is missing");
      else {
        need(ISO.test(t.date ?? ""), "trade.date should be a date");
        need(/^https:\/\//.test(t.filing?.url ?? ""), "trade.filing.url should be an https address");
        need(Number.isInteger(t.filing?.page) && t.filing.page > 0, "trade.filing.page should be a page number");
        need(ISO.test(t.filing?.filed ?? ""), "trade.filing.filed should be a date");
        need(typeof t.scope === "string" && t.scope.length > 0, "trade.scope is missing");
        lint("trade.scope", t.scope);
        lint("trade.asset", t.asset);
        problems.push(...quoteProblems(contentDir, { ...t, source_url: t.filing?.url }, "trade"));
        const row = parseRow(t.text ?? "");
        if (!row) problems.push("trade.text is not a filing row (fields joined by \" | \", with a date)");
        else need(row.date === t.date, `trade.date should be the row's date, ${row.date}`);
        for (const d of t.days ?? []) need(ISO.test(d), `trade.days: "${d}" should be a date`);
      }

      const w = match.words;
      if (!w) problems.push("words is missing");
      else {
        need(ISO.test(w.date ?? ""), "words.date should be a date");
        need((config.venues as readonly string[]).includes(w.venue), `words.venue "${w.venue}" is not one of the configured venues`);
        need(typeof w.where === "string" && w.where.length > 0, "words.where is missing");
        lint("words.where", w.where);
        problems.push(...quoteProblems(contentDir, w, "words"));
        if (!w.time) problems.push("words.time is missing: the note that says when the words were said");
        else {
          problems.push(...quoteProblems(contentDir, w.time, "words.time"));
          need(minutesOf(w.time.text ?? "") !== null, "words.time.text should give a time, as in \"spoke at 4:31 p.m.\"");
          lint("words.time.note", w.time.note);
        }
        if (t?.date && w.date) need(Math.abs(daysApart(t.date, w.date)) <= 14, "the trade and the words should be no more than 14 days apart");
      }

      const p = match.prices ?? {};
      const files = [INDEX.file, ...(p.symbol ? [p.file ?? ""] : [])];
      if (p.symbol) need(typeof p.name === "string" && p.name.length > 0, "prices.name is missing");
      for (const file of files) {
        if (!file || !existsSync(join(contentDir, "sources", file))) {
          problems.push(`prices: ${file || "file"} is missing from content/sources/`);
          continue;
        }
        if (w?.date && w.time?.text && minutesOf(w.time.text) !== null && !windowOf(readCloses(contentDir, file), w.date, minutesOf(w.time.text)! >= CLOSE))
          problems.push(`prices: ${file} does not hold the closes from before the words to five trading days after`);
      }
      for (const r of match.reviews ?? []) need(editors.has(r.by), `reviews: "${r.by}" is not in content/editors.yaml`);
      return { match, file, problems };
    });
}

/** The page's own file, with the problems found in it. */
export function readAbout(contentDir: string, config: Config, actorIds: Set<string>): { about: About; file: string; problems: string[] } | null {
  const path = join(contentDir, DIR, "about.yaml");
  if (!existsSync(path)) return null;
  const about = readYaml(readFileSync(path, "utf8")) as About;
  const editors = editorsOf(contentDir);
  const lex = lexicon(config, "en");
  const problems: string[] = [];
  const need = (ok: unknown, what: string) => {
    if (!ok) problems.push(what);
  };
  const lint = (name: string, text?: string) => {
    if (text) for (const word of lintText(text, lex)) problems.push(`${name}: "${word}" passes judgement`);
  };
  const quote = (q: Quote | undefined, name: string) => {
    if (!q) return problems.push(`${name} is missing`);
    need(ISO.test(q.date ?? ""), `${name}.date should be a date`);
    need(typeof q.by === "string" && q.by.length > 0, `${name}.by is missing`);
    lint(`${name}.where`, q.where);
    problems.push(...quoteProblems(contentDir, q, name));
  };
  need(about.format === ABOUT_FORMAT, `format should be ${ABOUT_FORMAT}`);
  need(about.id === "about", "id should be about");
  need(actorIds.has(about.actor_id), `no actor "${about.actor_id}" in content/actors/`);
  need(ISO.test(about.recorded_on ?? ""), "recorded_on should be a date");

  // The count is the sum of the last row numbers the extract lists, one per account: Part 7 numbers every account's
  // rows from 1 without a gap.
  const c = about.count;
  if (!c) problems.push("count is missing");
  else {
    problems.push(...quoteProblems(contentDir, c, "count"));
    if (c.source_text?.file && existsSync(join(contentDir, "sources", c.source_text.file))) {
      const saved = readFileSync(join(contentDir, "sources", c.source_text.file), "utf8");
      const at = saved.indexOf(c.text ?? "\u0000");
      const lasts = at < 0 ? [] : saved.slice(saved.indexOf("\n\n", at) + 2, saved.indexOf("\n\n", saved.indexOf("\n\n", at) + 2)).split("\n");
      const sum = lasts.map((l) => Number(l.split(" | ")[1])).reduce((a, b) => a + (Number.isFinite(b) ? b : NaN), 0);
      need(sum === c.number, `count.number should be ${sum}, the sum of the last row of each account under "${c.text}"`);
    }
    need(/^https:\/\//.test(c.filing?.url ?? ""), "count.filing.url should be an https address");
    const rows = readRows(contentDir);
    need(rows.length === c.number, `count.number should be ${rows.length}, the rows in ${ROWS_FILE}`);
    need(rows.every((r) => r.date.startsWith(String(c.year))), `every row in ${ROWS_FILE} should be dated in ${c.year}`);
  }
  for (const [i, f] of (about.filings ?? []).entries()) {
    need(ISO.test(f.posted ?? ""), `filings[${i}].posted should be a date`);
    need(/^https:\/\/extapps2\.oge\.gov\//.test(f.url ?? ""), `filings[${i}].url should be OGE's own address`);
    need(Number.isInteger(f.pages) && f.pages > 0, `filings[${i}].pages should be a number`);
  }
  need((about.filings ?? []).length > 0, "filings is empty");
  quote(about.form, "form");
  quote(about.review, "review");
  for (const [i, q] of (about.press ?? []).entries()) {
    quote(q, `press[${i}]`);
    need(typeof q.figure === "string" && q.figure.length > 0 && q.text?.includes(q.figure), `press[${i}].figure should be words from its own quote`);
  }
  need((about.white_house ?? []).length > 0, "white_house is missing: the White House's account is shown beside the figures");
  for (const [i, q] of (about.white_house ?? []).entries()) quote(q, `white_house[${i}]`);
  const b = about.bill;
  if (!b) problems.push("bill is missing");
  else {
    need(/^https:\/\//.test(b.url ?? "") && /^https:\/\//.test(b.status_url ?? ""), "bill.url and bill.status_url should be https addresses");
    for (const [i, q] of (b.text ?? []).entries()) quote(q, `bill.text[${i}]`);
    for (const [i, q] of (b.actions ?? []).entries()) {
      quote(q, `bill.actions[${i}]`);
      lint(`bill.actions[${i}].label`, q.label);
    }
  }
  for (const [i, x] of (about.left_out ?? []).entries()) {
    lint(`left_out[${i}].lead`, x.lead);
    lint(`left_out[${i}].why`, x.why);
  }
  for (const r of about.reviews ?? []) need(editors.has(r.by), `reviews: "${r.by}" is not in content/editors.yaml`);
  return { about, file: `${DIR}/about.yaml`, problems };
}

/** Every row of Part 7 of the annual report the count is taken from, in the report's order. */
export const ROWS_FILE = "oge-278e-2026-part7-rows.txt";
export function readRows(contentDir: string): Row[] {
  const path = join(contentDir, "sources", ROWS_FILE);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .map(parseRow)
    .filter((r): r is Row => !!r);
}

/** The closes around a match's words: ten trading days before the last close before them to ten after, the stock's
 * (if any) beside the S&P 500's, and where that last close sits in the list. */
export function around(contentDir: string, m: Match, span = 10) {
  const afterClose = minutesOf(m.words.time.text)! >= CLOSE;
  const index = readCloses(contentDir, INDEX.file);
  const stock = m.prices.symbol && m.prices.file ? readCloses(contentDir, m.prices.file) : null;
  const days = stock ?? index;
  const w = windowOf(days, m.words.date, afterClose)!;
  const at = days.findIndex((c) => c.date === w.before.date);
  const from = Math.max(0, at - span);
  const byDate = new Map(index.map((c) => [c.date, c.close]));
  const points = days
    .slice(from, at + span + 1)
    .filter((c) => byDate.has(c.date))
    .map((c) => ({ date: c.date, stock: stock ? c.close : undefined, index: byDate.get(c.date)! }));
  return { points, zero: points.findIndex((p) => p.date === w.before.date) };
}

/** A match or the page is published once an editor has approved it. */
export const approved = (x: { reviews?: Review[] }) => (x.reviews ?? []).some((r) => r.kind === "editor" && r.approves);
export const daysApart = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** What the build shows of a match: its row, the same day's count, and the closes, read from the saved sources. */
export function measure(contentDir: string, m: Match) {
  const saved = readFileSync(join(contentDir, "sources", m.trade.source_text.file), "utf8");
  const rows = blockRows(saved, m.trade.source_text.span[0]);
  const row = parseRow(m.trade.text)!;
  const afterClose = minutesOf(m.words.time.text)! >= CLOSE;
  const index = windowOf(readCloses(contentDir, INDEX.file), m.words.date, afterClose)!;
  const stock = m.prices.symbol && m.prices.file ? windowOf(readCloses(contentDir, m.prices.file), m.words.date, afterClose) : null;
  return {
    row,
    day: dayCount(rows, m.trade.date),
    days: (m.trade.days ?? []).map((d) => ({ date: d, ...dayCount(rows, d) })),
    afterClose,
    index,
    stock,
    gap: daysApart(m.trade.date, m.words.date),
  };
}

async function main() {
  const [cmd, id] = process.argv.slice(2);
  const root = join(import.meta.dirname, "..");
  const { config, contentDir } = await loadConfig(findConfig(root)!);
  const actorIds = new Set(readdirSync(join(contentDir, "actors")).map((f) => f.replace(/\.yaml$/, "")));
  const matches = readMatches(contentDir, config, actorIds);
  const about = readAbout(contentDir, config, actorIds);
  const all = [...(about ? [{ id: "about", file: about.file, problems: about.problems, x: about.about }] : []), ...matches.map((m) => ({ id: m.match.id, file: m.file, problems: m.problems, x: m.match }))];
  if (cmd === "check") {
    const bad = all.filter((p) => p.problems.length);
    for (const p of bad) for (const m of p.problems) console.error(`${p.file}: ${m}`);
    if (bad.length) process.exit(1);
    console.log(
      `Trades: ${matches.length} matches, every quote and filing row found at its span in the saved source and every close in its saved file; ${matches.filter((m) => approved(m.match)).length} approved; the page ${about ? (approved(about.about) ? "approved" : "not yet approved") : "has no about.yaml"}.`,
    );
    return;
  }
  if (cmd === "approve" && id) {
    const by = process.argv[process.argv.indexOf("--by") + 1];
    const p = all.find((x) => x.id === id);
    if (!p) throw new Error(`no match "${id}" in content/${DIR}/`);
    if (p.problems.length) throw new Error(`${p.file} has problems; run check first`);
    if (!by || process.argv.indexOf("--by") < 0) throw new Error('say who approves: --by "<name>"');
    const path = join(contentDir, p.file);
    const text = readFileSync(path, "utf8");
    const review = `  - by: ${by}\n    kind: editor\n    "on": "${todayIn(config.timezone)}"\n    approves: true\n`;
    const next = /^reviews: \[\]\s*$/m.test(text) ? text.replace(/^reviews: \[\]\s*$/m, `reviews:\n${review.trimEnd()}`) : `${text.trimEnd()}\n${review}`;
    writeFileSync(path, next.endsWith("\n") ? next : `${next}\n`);
    console.log(`Approved ${id} by ${by}: it is published on the next build${id === "about" ? "" : ", once the page itself (about) is approved"}.`);
    return;
  }
  console.error('Usage: node scripts/trades.ts check | approve <id> --by "<name>"');
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
