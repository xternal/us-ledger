/**
 * The ledger's pieces as static markup (scripts/ledger.ts holds the numbers): the flow from receipts to outlays, the
 * years side by side, tariffs month by month, and every Treasury line in a table. Drawn at build time, so they read
 * without JavaScript; colours are the palette's tokens (--ul-in, --ul-out, --ul-gap).
 */
import { createElement as h, type ReactNode } from "react";
import { bn, cents, layout, LINE_NAMES, ledgerPath, tn, type LedgerFile, type Year } from "./ledger.ts";

const px = (n: number) => `${Math.round(n * 10) / 10}px`;
const W = 1000;
const MID = [488, 512];

/** A curved band from (x0, y0) to (x1, y1), `t` thick, in the chart's stretched coordinates. */
const ribbon = (x0: number, y0: number, x1: number, y1: number, t: number) => {
  const m = (x0 + x1) / 2;
  return `M${x0} ${y0}C${m} ${y0} ${m} ${y1} ${x1} ${y1}L${x1} ${y1 + t}C${m} ${y1 + t} ${m} ${y0 + t} ${x0} ${y0 + t}Z`;
};

/** The year as a Sankey: money in on the left, the year's outlays as the bar in the middle, money out on the right. */
export function flowChart(y: Year): ReactNode {
  const L = layout(y);
  const scale = L.centreHeight / y.outlays;
  const label = (side: "in" | "out") => (p: (typeof L.left)[number]) =>
    h(
      "li",
      { key: p.flow.key, "data-kind": p.flow.kind, style: { top: px(p.top + p.height / 2) } },
      h("span", { className: "flow__node", style: { height: px(Math.max(p.height, 2)) } }),
      h("span", { className: "flow__name" }, p.flow.label),
      h("span", { className: "flow__amt" }, `${bn(p.flow.amount)} · ${cents(p.flow.amount, y.outlays)}`),
    );
  const top = y.ins.slice(0, 3).map((f) => `${f.label.toLowerCase()} ${bn(f.amount)}`);
  const outTop = y.outs.slice(0, 4).map((f) => `${f.label} ${bn(f.amount)}`);
  return h(
    "figure",
    { className: "flow" },
    h(
      "div",
      {
        className: "flow__chart",
        style: { height: px(L.height) },
        role: "img",
        "aria-label": `Fiscal year ${y.fy}: ${bn(y.outlays)} spent. In: ${top.join(", ")}, and ${bn(y.borrowed)} borrowed. Out: ${outTop.join(", ")} and the rest. Every line is in the table below.`,
      },
      h("ul", { className: "flow__side flow__side--in" }, L.left.map(label("in"))),
      h(
        "div",
        { className: "flow__mid" },
        h(
          "svg",
          { viewBox: `0 0 ${W} ${L.height}`, preserveAspectRatio: "none", width: "100%", height: L.height, "aria-hidden": "true", focusable: "false" },
          L.left.map((p) => h("path", { key: p.flow.key, className: `flow__ribbon flow__ribbon--${p.flow.kind}`, d: ribbon(0, p.top + (p.height - p.flow.amount * scale) / 2, MID[0]!, p.at, p.flow.amount * scale) })),
          L.right.map((p) => h("path", { key: p.flow.key, className: `flow__ribbon flow__ribbon--${p.flow.kind}`, d: ribbon(MID[1]!, p.at, W, p.top + (p.height - p.flow.amount * scale) / 2, p.flow.amount * scale) })),
          h("rect", { className: "flow__centre", x: MID[0], y: L.centreTop, width: MID[1]! - MID[0]!, height: L.centreHeight }),
        ),
        h("p", { className: "flow__total", style: { top: px(L.centreTop - 6) } }, h("strong", null, bn(y.outlays)), " spent"),
      ),
      h("ul", { className: "flow__side flow__side--out" }, L.right.map(label("out"))),
    ),
    h(
      "figcaption",
      null,
      h("span", { className: "key key--in" }, "Money in"),
      h("span", { className: "key key--gap" }, "Borrowed, and interest on the debt"),
      h("span", { className: "key key--out" }, "Money out"),
      h("span", null, "¢ is cents of every dollar spent."),
    ),
  );
}

/** Every year as one bar, as tall as its outlays: the part receipts covered, and the hatched part borrowed. */
export function yearsChart(years: Year[], current?: number): ReactNode {
  const max = Math.max(...years.map((y) => y.outlays));
  return h(
    "figure",
    { className: "years" },
    h(
      "ol",
      { className: "years__bars", style: { "--n": years.length } as Record<string, number> },
      years.map((y) =>
        h(
          "li",
          { key: y.fy },
          h(
            "a",
            { href: ledgerPath(y.fy), "aria-current": y.fy === current ? "page" : undefined },
            h(
              "span",
              { className: "years__plot", "aria-hidden": "true" },
              h(
                "span",
                { className: "years__bar", style: { height: `${((100 * y.outlays) / max).toFixed(1)}%` } },
                h("span", { className: "years__total" }, tn(y.outlays)),
                h("span", { className: "years__gap", style: { height: `${((100 * Math.max(y.borrowed, 0)) / y.outlays).toFixed(1)}%` } }),
                h("span", { className: "years__in" }),
              ),
            ),
            h("span", { className: "years__fy" }, h("span", { className: "visually-hidden" }, "Fiscal year "), String(y.fy), y.complete ? null : "*"),
            h("span", { className: "years__who" }, y.presidents.map((n) => n.split(" ").at(-1)).join(" · ")),
            h("span", { className: "visually-hidden" }, `: ${bn(y.receipts)} in, ${bn(y.outlays)} out, ${bn(y.borrowed)} borrowed. President: ${y.presidents.join(", then ")}.`),
          ),
        ),
      ),
    ),
    h(
      "figcaption",
      null,
      "Each bar is a fiscal year's spending, in trillions of dollars; the solid part was covered by receipts, the hatched part was borrowed. Under each year, the President in office during it. Open a year for its flow and every line.",
      years.some((y) => !y.complete) ? " * The year so far." : null,
    ),
  );
}

const month = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const bn1 = (d: number) => `${d < 0 ? "−" : ""}$${Math.abs(d / 1e9).toFixed(Math.abs(d) < 1e8 ? 2 : 1)}bn`;

/** Tariffs month by month: customs duties net of refunds, a bar each month, below the line where refunds were larger. */
export function customsChart(file: LedgerFile): ReactNode {
  const ms = file.customs_by_month;
  const hi = Math.max(...ms.map((m) => m.amount));
  const lo = Math.min(0, ...ms.map((m) => m.amount));
  const zero = (100 * hi) / (hi - lo);
  return h(
    "figure",
    { className: "months" },
    h(
      "div",
      { className: "months__plot", style: { "--zero": `${zero.toFixed(2)}%` } as Record<string, string>, "aria-hidden": "true" },
      h("span", { className: "months__axis months__axis--top" }, bn(hi)),
      lo < 0 ? h("span", { className: "months__axis months__axis--bottom" }, bn(lo)) : null,
      h(
        "ol",
        { className: "months__bars", style: { "--n": ms.length } as Record<string, number> },
        ms.map((m) =>
          h(
            "li",
            { key: m.month, title: `${month(m.month)}: ${bn1(m.amount)}`, "data-neg": m.amount < 0 ? "true" : undefined, "data-fy": m.month.endsWith("-10") ? String(Number(m.month.slice(0, 4)) + 1) : undefined },
            h("span", { style: { height: `${((100 * Math.abs(m.amount)) / (hi - lo)).toFixed(2)}%` } }),
          ),
        ),
      ),
    ),
    h("figcaption", null, `Customs duties each month, net of refunds, ${month(ms[0]!.month)} to ${month(ms.at(-1)!.month)}. A bar below the line is a month when refunds paid were larger than duties collected. Years are fiscal years, from October.`),
    h(
      "details",
      { className: "months__table" },
      h("summary", null, "Every month's figure"),
      h(
        "div",
        { className: "table-scroll" },
        h(
          "table",
          { className: "nums" },
          h("thead", null, h("tr", null, h("th", { scope: "col" }, "Month"), h("th", { scope: "col" }, "Customs duties, net"))),
          h("tbody", null, [...ms].reverse().map((m) => h("tr", { key: m.month }, h("th", { scope: "row" }, month(m.month)), h("td", null, bn1(m.amount))))),
        ),
      ),
    ),
  );
}

/** A line's nine years as a small sparkline. */
function spark(values: number[]): ReactNode {
  const w = 72;
  const hgt = 22;
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values);
  const pts = values.map((v, i) => `${((i * w) / Math.max(values.length - 1, 1)).toFixed(1)},${(hgt - 2 - ((v - lo) / (hi - lo || 1)) * (hgt - 4)).toFixed(1)}`);
  return h("svg", { className: "spark", viewBox: `0 0 ${w} ${hgt}`, width: w, height: hgt, "aria-hidden": "true", focusable: "false" }, h("polyline", { points: pts.join(" ") }));
}

/** Every Treasury line for every year, in billions, as the Treasury names and orders them. */
export function linesTable(years: Year[]): ReactNode {
  const row = (name: string, values: number[], cls?: string) =>
    h("tr", { key: name, className: cls }, h("th", { scope: "row" }, name), values.map((v, i) => h("td", { key: i }, Math.round(v / 1e9).toLocaleString("en-US"))), h("td", { className: "spark-cell" }, spark(values)));
  const rLines = Object.keys(years.at(-1)!.raw.receipts);
  const oLines = Object.keys(years.at(-1)!.raw.outlays);
  const head = (title: string) => h("tr", { className: "group" }, h("th", { scope: "rowgroup", colSpan: years.length + 2 }, title));
  return h(
    "div",
    { className: "table-scroll" },
    h(
      "table",
      { className: "nums lines" },
      h("caption", null, "Every line of the Monthly Treasury Statement, Table 9, by fiscal year, in billions of dollars."),
      h(
        "thead",
        null,
        h(
          "tr",
          null,
          h("th", { scope: "col" }, "Line"),
          years.map((y) => h("th", { key: y.fy, scope: "col" }, h("a", { href: ledgerPath(y.fy) }, String(y.fy)), y.complete ? null : "*")),
          h("th", { scope: "col" }, h("span", { className: "visually-hidden" }, "Trend")),
        ),
      ),
      h(
        "tbody",
        null,
        head("Money in"),
        rLines.map((l) => row(LINE_NAMES[l]!, years.map((y) => y.raw.receipts[l] ?? 0))),
        row("Total receipts", years.map((y) => y.receipts), "total"),
        head("Money out"),
        oLines.map((l) => row(LINE_NAMES[l]!, years.map((y) => y.raw.outlays[l] ?? 0))),
        row("Total outlays", years.map((y) => y.outlays), "total"),
        row("Borrowed (outlays minus receipts)", years.map((y) => y.borrowed), "total total--gap"),
        row("Debt at the year's end, total", years.map((y) => y.debt.total), "debt"),
      ),
    ),
  );
}

/** One year's lines against the year before: this year, last year, the change. */
export function yearTable(y: Year, prev?: Year): ReactNode {
  const pct = (a: number, b: number) => (b > 0 && a > 0 ? ` (${a >= b ? "+" : "−"}${Math.abs(Math.round((100 * (a - b)) / b))}%)` : "");
  const row = (name: string, a: number, b: number | undefined, cls?: string) =>
    h(
      "tr",
      { key: name, className: cls },
      h("th", { scope: "row" }, name),
      h("td", null, bn(a)),
      h("td", null, cents(a, y.outlays)),
      prev ? h("td", null, b === undefined ? "" : bn(b)) : null,
      prev ? h("td", null, b === undefined ? "" : `${a - b >= 0 ? "+" : ""}${bn(a - b)}${pct(a, b)}`) : null,
    );
  const head = (title: string) => h("tr", { className: "group" }, h("th", { scope: "rowgroup", colSpan: prev ? 5 : 3 }, title));
  return h(
    "div",
    { className: "table-scroll" },
    h(
      "table",
      { className: "nums year-table" },
      h("caption", null, `Fiscal year ${y.fy}, every line of the Monthly Treasury Statement, Table 9${prev ? `, against fiscal year ${prev.fy}` : ""}. ¢ is cents of every dollar spent.`),
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Line"), h("th", { scope: "col" }, String(y.fy)), h("th", { scope: "col" }, "¢"), prev ? h("th", { scope: "col" }, String(prev.fy)) : null, prev ? h("th", { scope: "col" }, "Change") : null)),
      h(
        "tbody",
        null,
        head("Money in"),
        Object.entries(y.raw.receipts).map(([l, v]) => row(LINE_NAMES[l]!, v, prev?.raw.receipts[l])),
        row("Total receipts", y.receipts, prev?.receipts, "total"),
        head("Money out"),
        Object.entries(y.raw.outlays).map(([l, v]) => row(LINE_NAMES[l]!, v, prev?.raw.outlays[l])),
        row("Total outlays", y.outlays, prev?.outlays, "total"),
        row("Borrowed", y.borrowed, prev?.borrowed, "total total--gap"),
      ),
    ),
  );
}

/** The years as links, the one shown marked. */
export function yearNav(years: Year[], current?: number): ReactNode {
  return h(
    "nav",
    { className: "yearnav", "aria-label": "Fiscal years" },
    h(
      "ul",
      null,
      h("li", null, h("a", { href: ledgerPath(), "aria-current": current === undefined ? "page" : undefined }, "All years")),
      years.map((y) => h("li", { key: y.fy }, h("a", { href: ledgerPath(y.fy), "aria-current": y.fy === current ? "page" : undefined }, `FY${y.fy}${y.complete ? "" : " so far"}`))),
    ),
  );
}

/** Plain sentences the numbers say, written from the data so they stay true when it updates. */
export function facts(years: Year[], file: LedgerFile): string[] {
  const first = years[0]!;
  const done = years.filter((y) => y.complete);
  const last = done.at(-1)!;
  const line = (y: Year, l: string) => y.raw.outlays[l] ?? y.raw.receipts[l] ?? 0;
  const out: string[] = [];
  const i0 = line(first, "Net Interest");
  const i1 = line(last, "Net Interest");
  const since = done.findIndex((_, k) => done.slice(k).every((y) => line(y, "Net Interest") > line(y, "National Defense")));
  out.push(
    `Interest on the debt was ${bn(i0)} in ${first.fy} and ${bn(i1)} in ${last.fy}, ${(i1 / i0).toFixed(1)} times as much.${since >= 0 ? ` It has been larger than defense spending every year since ${done[since]!.fy}.` : ""}`,
  );
  const c = (y: Year) => line(y, "Customs Duties");
  const peak = done.reduce((a, b) => (c(b) > c(a) ? b : a));
  const negative = file.customs_by_month.filter((m) => m.amount < 0 && m.month >= `${last.fy - 1}-10` && m.month <= `${last.fy}-09`).map((m) => month(m.month).split(" ")[0]!);
  out.push(
    `Tariffs brought in ${bn(c(first))} in ${first.fy} and ${bn(c(peak))} in ${peak.fy}${peak.fy !== last.fy ? `; in ${last.fy}, ${bn(c(last))}` : ""}.${negative.length ? ` In ${negative.join(", ").replace(/, ([^,]*)$/, " and $1")} ${last.fy} refunds paid were larger than duties collected.` : ""}`,
  );
  const most = done.reduce((a, b) => (b.borrowed / b.outlays > a.borrowed / a.outlays ? b : a));
  out.push(`The most borrowed in a year was ${bn(most.borrowed)}, in ${most.fy}: ${cents(most.borrowed, most.outlays)} of every dollar spent. In ${last.fy} it was ${bn(last.borrowed)}, ${cents(last.borrowed, last.outlays)}.`);
  out.push(`The debt was ${tn(first.debt.total, 1)} at the end of fiscal year ${first.fy} and ${tn(last.debt.total, 1)} at the end of ${last.fy}. On ${longUk(file.debt_now.date)} it was ${tn(file.debt_now.total, 2)}.`);
  return out;
}
export const longUk = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** What changed from one year to the next, in a few plain sentences: the totals, then the lines that moved most. */
export function yearFacts(y: Year, prev?: Year): string[] {
  const out: string[] = [];
  const change = (a: number, b: number) => `${a >= b ? "up" : "down"} ${bn(Math.abs(a - b))}`;
  if (prev) {
    out.push(`Against fiscal year ${prev.fy}: receipts ${change(y.receipts, prev.receipts)}, outlays ${change(y.outlays, prev.outlays)}, borrowing ${change(y.borrowed, prev.borrowed)}.`);
    const moves = Object.entries({ ...y.raw.receipts, ...y.raw.outlays })
      .map(([l, v]) => ({ l, d: v - (prev.raw.receipts[l] ?? prev.raw.outlays[l] ?? 0) }))
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
      .slice(0, 3);
    out.push(`The lines that moved most: ${moves.map((m) => `${LINE_NAMES[m.l]!.toLowerCase()}, ${m.d >= 0 ? "up" : "down"} ${bn(Math.abs(m.d))}`).join("; ")}.`);
  }
  out.push(`The debt at the end of the year: ${tn(y.debt.total, 2)} (${longUk(y.debt.date)}), of which ${tn(y.debt.public, 2)} held by the public.`);
  return out;
}

