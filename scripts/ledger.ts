/**
 * The ledger: the federal government's money in and out, fiscal year by fiscal year, from data/ledger.json (written
 * by scripts/ledger-fetch.ts from the Monthly Treasury Statement). This file only groups and adds up the Treasury's
 * own lines; it estimates nothing. The groups are fixed, so a year compares with any other, and every Treasury line
 * is still shown on its own in the tables.
 *
 * Money in: the receipts by source, and what was borrowed to cover the rest (outlays minus receipts, the deficit).
 * Money out: the outlays by budget function. Interest on the debt is drawn in the same colour as the borrowing, as on
 * LedgerGov.UK: it is what past borrowing costs.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface LedgerFile {
  fetched_on: string;
  latest_statement: string;
  sources: Record<"mts" | "debt", { title: string; publisher: string; url: string; api: string }>;
  debt_now: Debt;
  years: { fy: number; through: string; complete: boolean; statement: string; receipts: Record<string, number>; outlays: Record<string, number>; debt: Debt }[];
  customs_by_month: { month: string; amount: number }[];
}
export interface Debt {
  date: string;
  total: number;
  public: number;
}

export type FlowKind = "in" | "gap" | "out" | "interest";
export interface Flow {
  key: string;
  /** Short, for the chart. */
  label: string;
  /** What it holds, in a sentence fragment. */
  long: string;
  kind: FlowKind;
  /** Dollars. */
  amount: number;
  /** The Treasury's own line names it adds up. */
  lines: string[];
}
export interface Year {
  fy: number;
  through: string;
  complete: boolean;
  statement: string;
  receipts: number;
  outlays: number;
  /** Outlays minus receipts: what was borrowed. Negative in a surplus. */
  borrowed: number;
  ins: Flow[];
  outs: Flow[];
  /** Every Treasury line as published, receipts and outlays, totals left out. */
  raw: { receipts: Record<string, number>; outlays: Record<string, number> };
  debt: Debt;
  presidents: string[];
}

interface Group {
  key: string;
  label: string;
  long: string;
  lines: string[];
  kind?: FlowKind;
}

const INS: Group[] = [
  { key: "income", label: "Income tax", long: "Individual income taxes", lines: ["Individual Income Taxes"] },
  {
    key: "payroll",
    label: "Payroll taxes",
    long: "Payroll taxes for Social Security, Medicare and unemployment insurance, and federal staff's retirement contributions",
    lines: ["Employment and General Retirement", "Unemployment Insurance", "Other Retirement"],
  },
  { key: "corporate", label: "Corporate tax", long: "Corporation income taxes", lines: ["Corporation Income Taxes"] },
  { key: "customs", label: "Tariffs", long: "Customs duties, that is tariffs, net of refunds", lines: ["Customs Duties"] },
  { key: "excise", label: "Excise taxes", long: "Excise taxes, on fuel, alcohol, tobacco, air travel and other goods", lines: ["Excise Taxes"] },
  { key: "estate", label: "Estate and gift", long: "Estate and gift taxes", lines: ["Estate and Gift Taxes"] },
  { key: "misc", label: "Other receipts", long: "Miscellaneous receipts: the Federal Reserve's earnings paid to the Treasury, fees, fines and other", lines: ["Miscellaneous Receipts"] },
];

const OUTS: Group[] = [
  { key: "social_security", label: "Social Security", long: "Social Security pensions and disability benefits", lines: ["Social Security"] },
  { key: "medicare", label: "Medicare", long: "Medicare, health insurance for people 65 and over and some with disabilities", lines: ["Medicare"] },
  { key: "health", label: "Health", long: "Health: Medicaid, health insurance subsidies, medical research and public health", lines: ["Health"] },
  { key: "interest", label: "Interest", long: "Net interest on the debt", lines: ["Net Interest"], kind: "interest" },
  { key: "defense", label: "Defense", long: "National defense", lines: ["National Defense"] },
  {
    key: "income_security",
    label: "Income security",
    long: "Income security: food aid, refundable tax credits, unemployment benefits, housing aid and federal staff's pensions",
    lines: ["Income Security"],
  },
  { key: "veterans", label: "Veterans", long: "Veterans' benefits and services", lines: ["Veterans Benefits and Services"] },
  { key: "transportation", label: "Transportation", long: "Transportation: highways, air, rail and transit", lines: ["Transportation"] },
  { key: "education", label: "Education and jobs", long: "Education, training, employment and social services", lines: ["Education, Training, Employment, and Social Services"] },
];
/** Any other function line this large a share of a year's outlays is drawn on its own that year (the Paycheck Protection Program in 2020 and 2021, under commerce and housing credit). */
const OWN_LINE_SHARE = 0.02;

/** Every Treasury line, in the order it prints, with the name we use for it. */
export const LINE_NAMES: Record<string, string> = {
  "Individual Income Taxes": "Individual income taxes",
  "Corporation Income Taxes": "Corporation income taxes",
  "Employment and General Retirement": "Payroll taxes: employment and general retirement",
  "Unemployment Insurance": "Payroll taxes: unemployment insurance",
  "Other Retirement": "Payroll taxes: other retirement",
  "Excise Taxes": "Excise taxes",
  "Estate and Gift Taxes": "Estate and gift taxes",
  "Customs Duties": "Customs duties (tariffs)",
  "Miscellaneous Receipts": "Miscellaneous receipts",
  "National Defense": "National defense",
  "International Affairs": "International affairs",
  "General Science, Space, and Technology": "General science, space and technology",
  Energy: "Energy",
  "Natural Resources and Environment": "Natural resources and environment",
  Agriculture: "Agriculture",
  "Commerce and Housing Credit": "Commerce and housing credit",
  Transportation: "Transportation",
  "Community and Regional Development": "Community and regional development",
  "Education, Training, Employment, and Social Services": "Education, training, employment and social services",
  Health: "Health",
  Medicare: "Medicare",
  "Income Security": "Income security",
  "Social Security": "Social Security",
  "Veterans Benefits and Services": "Veterans' benefits and services",
  "Administration of Justice": "Administration of justice",
  "General Government": "General government",
  "Net Interest": "Net interest",
  "Undistributed Offsetting Receipts": "Undistributed offsetting receipts",
};

/** Who was President during each fiscal year (1 October to 30 September). */
const PRESIDENTS = [
  { name: "Donald Trump", from: "2017-01-20", to: "2021-01-20" },
  { name: "Joe Biden", from: "2021-01-20", to: "2025-01-20" },
  { name: "Donald Trump", from: "2025-01-20", to: "9999-12-31" },
];
export const presidentsIn = (fy: number) => PRESIDENTS.filter((p) => p.from <= `${fy}-09-30` && p.to > `${fy - 1}-10-01`).map((p) => p.name);

const sum = (rec: Record<string, number>, lines: string[]) =>
  lines.reduce((t, l) => {
    if (!(l in rec)) throw new Error(`the Treasury line "${l}" is missing`);
    return t + rec[l]!;
  }, 0);

export function readLedger(root: string): { file: LedgerFile; years: Year[] } {
  const file = JSON.parse(readFileSync(join(root, "data", "ledger.json"), "utf8")) as LedgerFile;
  const years = file.years.map((y): Year => {
    const { Total: receipts, ...r } = y.receipts;
    const { Total: outlays, ...o } = y.outlays;
    if (receipts === undefined || outlays === undefined) throw new Error(`FY${y.fy}: no totals`);
    const named = new Set([...INS, ...OUTS].flatMap((g) => g.lines));
    for (const l of [...Object.keys(r), ...Object.keys(o)]) if (!LINE_NAMES[l]) throw new Error(`FY${y.fy}: a Treasury line this site has no name for: "${l}"`);
    const ins: Flow[] = INS.map((g) => ({ key: g.key, label: g.label, long: g.long, kind: "in" as const, amount: sum(r, g.lines), lines: g.lines }));
    const added = Object.values(r).reduce((a, b) => a + b, 0);
    if (Math.abs(added - receipts) > 1e6) throw new Error(`FY${y.fy}: receipts lines add up to ${added}, the total is ${receipts}`);
    const borrowed = outlays - receipts;
    if (borrowed > 0) ins.push({ key: "borrowed", label: "Borrowed", long: "Borrowed: what receipts did not cover, the deficit", kind: "gap", amount: borrowed, lines: [] });
    const own = Object.entries(o)
      .filter(([l, v]) => !named.has(l) && l !== "Undistributed Offsetting Receipts" && v >= OWN_LINE_SHARE * outlays)
      .map(([l]) => l);
    // A group below zero in a year (education in 2023, when student loan costs were re-estimated) cannot be drawn as
    // a flow: that year it goes into "everything else", which is net.
    const outs: Flow[] = [
      ...OUTS.map((g) => ({ key: g.key, label: g.label, long: g.long, kind: g.kind ?? ("out" as const), amount: sum(o, g.lines), lines: g.lines })),
      ...own.map((l) => ({ key: l.toLowerCase().replace(/[^a-z]+/g, "_"), label: LINE_NAMES[l]!, long: LINE_NAMES[l]!, kind: "out" as const, amount: o[l]!, lines: [l] })),
    ]
      .filter((f) => f.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const drawn = new Set(outs.flatMap((f) => f.lines));
    const rest = Object.keys(o).filter((l) => !drawn.has(l));
    outs.push({ key: "rest", label: "Everything else", long: `Everything else, net: ${rest.map((l) => LINE_NAMES[l]!.toLowerCase()).join("; ")}`, kind: "out", amount: sum(o, rest), lines: rest });
    const outSum = outs.reduce((t, f) => t + f.amount, 0);
    if (Math.abs(outSum - outlays) > 1e6) throw new Error(`FY${y.fy}: outlay groups add up to ${outSum}, the total is ${outlays}`);
    if (outs.at(-1)!.amount <= 0) throw new Error(`FY${y.fy}: "everything else" is not positive; split it`);
    return { fy: y.fy, through: y.through, complete: y.complete, statement: y.statement, receipts, outlays, borrowed, ins, outs, raw: { receipts: r, outlays: o }, debt: y.debt, presidents: presidentsIn(y.fy) };
  });
  return { file, years };
}

/** "$7,396bn", "$41bn", "−$15bn". */
export const bn = (dollars: number) => `${dollars < 0 ? "−" : ""}$${Math.round(Math.abs(dollars) / 1e9).toLocaleString("en-US")}bn`;
/** "$7.4 trillion", "$40.17 trillion" with `digits`. */
export const tn = (dollars: number, digits = 1) => `$${(dollars / 1e12).toFixed(digits)} trillion`;
/** Cents of every dollar spent. */
export const cents = (dollars: number, outlays: number) => `${Math.round((100 * dollars) / outlays)}¢`;
/** "fiscal year 2026", or for a year still running "fiscal year 2027 so far". */
export const fyName = (y: Pick<Year, "fy" | "complete">) => `fiscal year ${y.fy}${y.complete ? "" : " so far"}`;
/** "October 2025 to September 2026". */
export function fySpan(y: Pick<Year, "fy" | "through">): string {
  const month = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return `October ${y.fy - 1} to ${month(y.through)}`;
}
export const ledgerPath = (fy?: number) => (fy ? `/ledger/${fy}/` : "/ledger/");

/**
 * The promises on this site that are about a line of the ledger, by the Treasury's line name ("borrowed" for the
 * deficit): which card touches which line. A card is listed under a line when its words name that tax, spending or
 * the deficit; the line's money is not the promise's cost.
 */
export const PROMISES_ON: Record<string, string[]> = {
  "Individual Income Taxes": ["gop-2024-06-tax-cuts-no-tax-on-tips"],
  "Corporation Income Taxes": ["trump-full-expensing-2025"],
  "Customs Duties": ["trump-tariff-dividend-2025", "jeffries-end-tariffs-2026", "gop-2024-05-manufacturing-superpower"],
  borrowed: ["trump-balance-budget-2025"],
  "Social Security": ["gop-2024-14-social-security-medicare"],
  Medicare: ["gop-2024-14-social-security-medicare"],
  Health: ["jeffries-reverse-medicaid-changes-2026", "jeffries-extend-aca-tax-credits-2026", "trump-drug-prices-2025"],
  "National Defense": ["gop-2024-12-strongest-military", "trump-defense-budget-1-5-trillion-2026", "gop-2024-08-peace-missile-defense", "trump-golden-dome-2025", "hegseth-drones-2025", "trump-warrior-dividend-2025"],
  Energy: ["trump-fill-spr-2025"],
  "International Affairs": ["rubio-usaid-into-state-2025"],
};
const promisesOn = (f: Flow) => [...new Set((f.key === "borrowed" ? ["borrowed"] : f.lines).flatMap((l) => PROMISES_ON[l] ?? []))];

/** The year's flows that promises are about, in the chart's order; inside "everything else", each Treasury line on its own. */
export function promiseLines(y: Year): { key: string; label: string; note?: string; ids: string[] }[] {
  return [...y.ins, ...y.outs].flatMap((f) =>
    f.key === "rest"
      ? f.lines.filter((l) => PROMISES_ON[l]?.length).map((l) => ({ key: l, label: LINE_NAMES[l]!, note: "within everything else", ids: PROMISES_ON[l]! }))
      : promisesOn(f).length
        ? [{ key: f.key, label: f.label, note: f.kind === "gap" ? "the deficit" : undefined, ids: promisesOn(f) }]
        : [],
  );
}

/**
 * The Sankey's geometry in pixels, laid out at build time so the page needs no script. Each side's nodes are as tall
 * as their money, with room enough for a two-line label beside even the smallest; the centre bar is the year's
 * outlays. `scale` is pixels per dollar.
 */
export interface Placed {
  flow: Flow;
  /** The node's top and height, and its label's centre. */
  top: number;
  height: number;
  /** Where its ribbon meets the centre bar. */
  at: number;
}
export function layout(y: Year, opts = { flowHeight: 400, slot: 44, gap: 6 }) {
  const scale = opts.flowHeight / y.outlays;
  const side = (flows: Flow[]) => {
    let top = 0;
    let at = 0;
    const placed: Placed[] = [];
    for (const f of flows) {
      const height = Math.max(f.amount * scale, 1.5);
      const room = Math.max(height, opts.slot);
      placed.push({ flow: f, top: top + (room - height) / 2, height, at });
      top += room + opts.gap;
      at += f.amount * scale;
    }
    return { placed, height: top - opts.gap };
  };
  const left = side(y.ins);
  const right = side(y.outs);
  const height = Math.ceil(Math.max(left.height, right.height, opts.flowHeight + 40));
  const centreTop = (height - opts.flowHeight) / 2;
  const shift = (s: { placed: Placed[]; height: number }) => {
    const d = (height - s.height) / 2;
    return s.placed.map((p) => ({ ...p, top: p.top + d, at: centreTop + p.at }));
  };
  return { height, centreTop, centreHeight: opts.flowHeight, left: shift(left), right: shift(right) };
}
