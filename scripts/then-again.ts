/**
 * "Then again": pairs of statements by the same person, each in exact words with its date and source, where the
 * later one cannot be true or carried out at the same time as the earlier one, read as written. Both are on the
 * record; the reader decides. The same test applies to everyone with an actor file.
 *
 * A pair is a file in content/then-again/<id>.yaml (format below). Each quote is checked character for character
 * against the saved source in content/sources/, at the span the file names, as the engine checks a card's quote.
 * Like a card, a pair is published only once an editor in content/editors.yaml has approved it; until then it shows
 * only in the preview build.
 *
 *   node scripts/then-again.ts check                       every pair against its sources and the words lint
 *   node scripts/then-again.ts approve <id> --by "<name>"  the editor's approval, dated today in Washington
 *
 * Format:
 *   format: usledger-then-again/1
 *   id: trump-gaza-palestinians-2025          # the file's name
 *   actor_id: donald-trump
 *   subject: "Whether Gaza's residents would leave Gaza"    # our neutral words
 *   promise_id: trump-example-2025            # optional: the card for the promise the pair is about
 *   first:   { date, venue, where, text, source_url, source_text: { file, span: [from, to] } }
 *   later:   { same }
 *   explanation: { same }                     # optional: the speaker's own account of the change
 *   note: "…"                                 # optional, our neutral words
 *   recorded_on: "2026-10-21"
 *   reviews: [ { by, kind: editor, on, approves: true } ]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lexicon, lintText, todayIn, type Config } from "@openpromises/core";
import { findConfig, loadConfig, readYaml } from "@openpromises/files";

export const FORMAT = "usledger-then-again/1";
export const DIR = "then-again";

export interface Said {
  date: string;
  venue: string;
  where: string;
  text: string;
  source_url: string;
  source_text: { file: string; span: [number, number] };
}
export interface Pair {
  format: string;
  id: string;
  actor_id: string;
  subject: string;
  /** The card on this site for the promise the pair is about, if there is one. */
  promise_id?: string;
  first: Said;
  later: Said;
  explanation?: Said;
  note?: string;
  recorded_on: string;
  reviews: { by: string; kind: string; on: string; approves: boolean }[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A quote's address and its words at the span it names in the saved source: an empty list means both check out. */
export function quoteProblems(contentDir: string, s: Pick<Said, "text" | "source_url" | "source_text">, name: string): string[] {
  const problems: string[] = [];
  if (!/^https:\/\//.test(s.source_url ?? "")) problems.push(`${name}.source_url should be an https address`);
  const src = join(contentDir, "sources", s.source_text?.file ?? "");
  if (!s.source_text?.file || !existsSync(src)) return [...problems, `${name}.source_text.file is missing from content/sources/`];
  const [a, b] = s.source_text.span ?? [];
  const saved = readFileSync(src, "utf8");
  if (typeof s.text !== "string" || !s.text || typeof a !== "number" || typeof b !== "number" || saved.slice(a, b) !== s.text) {
    const at = s.text ? saved.indexOf(s.text) : -1;
    problems.push(at < 0 ? `${name}.text is not in ${s.source_text.file} word for word` : `${name}.source_text.span should be [${at}, ${at + s.text.length}]`);
  }
  return problems;
}

/** Every pair, with the problems found in each: an empty list means it passes. */
export function readPairs(contentDir: string, config: Config, actorIds: Set<string>): { pair: Pair; file: string; problems: string[] }[] {
  const dir = join(contentDir, DIR);
  if (!existsSync(dir)) return [];
  const editors = new Set(((readYaml(readFileSync(join(contentDir, "editors.yaml"), "utf8")) as { editors: { handle: string }[] }).editors ?? []).map((e) => e.handle));
  const lex = lexicon(config, "en");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => {
      const file = `${DIR}/${f}`;
      const pair = readYaml(readFileSync(join(dir, f), "utf8")) as Pair;
      const problems: string[] = [];
      const need = (ok: unknown, what: string) => {
        if (!ok) problems.push(what);
      };
      need(pair.format === FORMAT, `format should be ${FORMAT}`);
      need(pair.id === f.replace(/\.yaml$/, ""), "id should be the file's name");
      need(actorIds.has(pair.actor_id), `no actor "${pair.actor_id}" in content/actors/`);
      need(typeof pair.subject === "string" && pair.subject.length > 0, "subject is missing");
      need(ISO.test(pair.recorded_on ?? ""), "recorded_on should be a date");
      const said = (s: Said | undefined, name: string) => {
        if (!s) return problems.push(`${name} is missing`);
        need(ISO.test(s.date ?? ""), `${name}.date should be a date`);
        need((config.venues as readonly string[]).includes(s.venue), `${name}.venue "${s.venue}" is not one of the configured venues`);
        need(typeof s.where === "string" && s.where.length > 0, `${name}.where is missing`);
        problems.push(...quoteProblems(contentDir, s, name));
        for (const word of lintText(s.where, lex)) problems.push(`${name}.where: "${word}" passes judgement`);
      };
      said(pair.first, "first");
      said(pair.later, "later");
      if (pair.explanation) said(pair.explanation, "explanation");
      if (pair.first?.date && pair.later?.date) need(pair.first.date < pair.later.date, "later.date should be after first.date");
      for (const [k, v] of [["subject", pair.subject], ["note", pair.note]] as const) if (v) for (const word of lintText(v, lex)) problems.push(`${k}: "${word}" passes judgement`);
      for (const r of pair.reviews ?? []) need(editors.has(r.by), `reviews: "${r.by}" is not in content/editors.yaml`);
      return { pair, file, problems };
    });
}

/** A pair is published once an editor has approved it. */
export const approved = (p: Pair) => (p.reviews ?? []).some((r) => r.kind === "editor" && r.approves);
export const daysApart = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

async function main() {
  const [cmd, id] = process.argv.slice(2);
  const root = join(import.meta.dirname, "..");
  const { config, contentDir } = await loadConfig(findConfig(root)!);
  const actorIds = new Set(readdirSync(join(contentDir, "actors")).map((f) => f.replace(/\.yaml$/, "")));
  const pairs = readPairs(contentDir, config, actorIds);
  if (cmd === "check") {
    const bad = pairs.filter((p) => p.problems.length);
    for (const p of bad) for (const m of p.problems) console.error(`${p.file}: ${m}`);
    if (bad.length) process.exit(1);
    console.log(`Then again: ${pairs.length} pairs, every quote found at its span in the saved source; ${pairs.filter((p) => approved(p.pair)).length} approved.`);
    return;
  }
  if (cmd === "approve" && id) {
    const by = process.argv[process.argv.indexOf("--by") + 1];
    const p = pairs.find((x) => x.pair.id === id);
    if (!p) throw new Error(`no pair "${id}" in content/${DIR}/`);
    if (p.problems.length) throw new Error(`${p.file} has problems; run check first`);
    if (!by || process.argv.indexOf("--by") < 0) throw new Error('say who approves: --by "<name>"');
    const path = join(contentDir, p.file);
    const text = readFileSync(path, "utf8");
    const review = `  - by: ${by}\n    kind: editor\n    "on": "${todayIn(config.timezone)}"\n    approves: true\n`;
    const next = /^reviews: \[\]\s*$/m.test(text) ? text.replace(/^reviews: \[\]\s*$/m, `reviews:\n${review.trimEnd()}`) : `${text.trimEnd()}\n${review}`;
    writeFileSync(path, next.endsWith("\n") ? next : `${next}\n`);
    console.log(`Approved ${id} by ${by}: it is published on the next build.`);
    return;
  }
  console.error('Usage: node scripts/then-again.ts check | approve <id> --by "<name>"');
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
