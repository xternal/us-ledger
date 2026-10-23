/**
 * The Trades page's charts, drawn as inline SVG at build time so they read without JavaScript; each is a figure with
 * a caption and its numbers in a table under it, and every mark carries its value in a <title> for the pointer.
 *
 *   tradesByMonth   purchases above the line and sales below it, a bar each month, by count
 *   moneyByMonth    what was bought and sold each month as the reports give it: a range, solid to the least it can
 *                   have been and light to the most, never a single figure the reports do not give
 *   versus          one stock against the S&P 500 around the President's words, both 100 at the close before them
 *
 * Colours are the palette's (scripts/palette.ts): --ul-buy for purchases and for the stock, --ul-sell for sales, and
 * the S&P 500 in the faint ink, as the reference it is.
 */
import { createElement as h, Fragment, type ReactNode } from "react";
import type { Row } from "./trades.ts";

export interface Month {
  /** "2025-04" */
  month: string;
  purchases: number;
  sales: number;
  /** Sums of the reports' ranges: the least and the most the month's trades can have been, in dollars. */
  bought: [number, number];
  sold: [number, number];
}

/** "$1,001 - $15,000" → [1001, 15000]. */
export const bounds = (amount: string): [number, number] => {
  const [a, b] = amount.split(" - ").map((x) => Number(x.replace(/[$,]/g, "")));
  return [a!, b!];
};

/** Every month of a year, empty ones included, from the rows dated in it. */
export function monthsOf(rows: readonly Row[], year: number): Month[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    const of = rows.filter((r) => r.date.startsWith(month));
    const sum = (type: string) =>
      of
        .filter((r) => r.type === type)
        .map((r) => bounds(r.amount))
        .reduce<[number, number]>((t, [a, b]) => [t[0] + a, t[1] + b], [0, 0]);
    return { month, purchases: of.filter((r) => r.type === "purchase").length, sales: of.filter((r) => r.type === "sale").length, bought: sum("purchase"), sold: sum("sale") };
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const n = (x: number) => x.toLocaleString("en-US");
export const usdM = (x: number) => (x >= 1e9 ? `$${(x / 1e9).toFixed(2)}bn` : `$${(x / 1e6).toFixed(x < 1e7 ? 1 : 0)}m`);
/** Round numbers for an axis: 4 or 5 steps from 0 to at least `max`. */
function ticks(max: number): number[] {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw)!;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

const W = 720;
const table = (caption: string, head: string[], rows: (string | number)[][]) =>
  h(
    "details",
    { className: "chart__data" },
    h("summary", null, "The numbers"),
    h(
      "div",
      { className: "table-scroll" },
      h(
        "table",
        { className: "nums" },
        h("caption", { className: "visually-hidden" }, caption),
        h("thead", null, h("tr", null, head.map((x, i) => h("th", { key: i, scope: "col" }, x)))),
        h("tbody", null, rows.map((r, i) => h("tr", { key: i }, r.map((c, j) => (j === 0 ? h("th", { key: j, scope: "row" }, c) : h("td", { key: j }, c)))))),
      ),
    ),
  );
const legend = (items: { label: string; swatch: string; light?: boolean; line?: boolean }[]) =>
  h(
    "ul",
    { className: "chart__legend" },
    items.map((i) =>
      h("li", { key: i.label }, h("span", { className: `chart__swatch${i.line ? " chart__swatch--line" : ""}${i.light ? " chart__swatch--light" : ""}`, style: { background: i.swatch }, "aria-hidden": "true" }), i.label),
    ),
  );

/** Purchases above the line and sales below it, a column for each month. `marks` names months with a match. */
export function tradesByMonth(months: Month[], marks: { month: string; label: string }[], title: string): ReactNode {
  const H = 300;
  const [left, right, top, bottom] = [84, 12, 30, 30];
  const up = Math.max(...months.map((m) => m.purchases));
  const down = Math.max(...months.map((m) => m.sales));
  const t = ticks(Math.max(up, down));
  const stepV = t[1]!;
  const [tu, td] = [Math.ceil(up / stepV) * stepV, Math.ceil(down / stepV) * stepV];
  const scale = (H - top - bottom) / (tu + td);
  const zero = top + tu * scale;
  const col = (W - left - right) / months.length;
  const bw = Math.min(30, col * 0.56);
  const x = (i: number) => left + col * i + col / 2;
  return h(
    "figure",
    { className: "chart" },
    legend([
      { label: "Purchases", swatch: "var(--ul-buy)" },
      { label: "Sales", swatch: "var(--ul-sell)" },
    ]),
    h(
      "svg",
      { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": title, className: "chart__svg" },
      ...t.filter((v) => v <= tu).map((v) => h(Fragment, { key: `u${v}` }, h("line", { x1: left, x2: W - right, y1: zero - v * scale, y2: zero - v * scale, className: "chart__grid" }), h("text", { x: left - 8, y: zero - v * scale + 4, className: "chart__tick", textAnchor: "end" }, n(v)))),
      ...t.filter((v) => v > 0 && v <= td).map((v) => h(Fragment, { key: `d${v}` }, h("line", { x1: left, x2: W - right, y1: zero + v * scale, y2: zero + v * scale, className: "chart__grid" }), h("text", { x: left - 8, y: zero + v * scale + 4, className: "chart__tick", textAnchor: "end" }, n(v)))),
      ...marks.map((mk) => {
        const i = months.findIndex((m) => m.month === mk.month);
        return i < 0 ? null : h("text", { key: mk.label, x: x(i), y: 14, className: "chart__mark", textAnchor: "middle" }, mk.label);
      }),
      ...months.map((m, i) =>
        h(
          "g",
          { key: m.month },
          h("title", null, `${monthName(m.month)}: ${n(m.purchases)} purchases, ${n(m.sales)} sales`),
          h("rect", { x: x(i) - col / 2, y: top, width: col, height: H - top - bottom, className: "chart__hit" }),
          m.purchases ? h("rect", { x: x(i) - bw / 2, y: zero - 1 - m.purchases * scale, width: bw, height: m.purchases * scale, rx: 3, style: { fill: "var(--ul-buy)" } }) : null,
          m.sales ? h("rect", { x: x(i) - bw / 2, y: zero + 1, width: bw, height: m.sales * scale, rx: 3, style: { fill: "var(--ul-sell)" } }) : null,
          h("text", { x: x(i), y: H - 8, className: "chart__tick", textAnchor: "middle" }, MONTHS[Number(m.month.slice(5)) - 1]),
        ),
      ),
      h("line", { x1: left, x2: W - right, y1: zero, y2: zero, className: "chart__axis" }),
    ),
    table(title, ["Month", "Purchases", "Sales"], months.map((m) => [monthName(m.month), n(m.purchases), n(m.sales)])),
  );
}

/** What was bought and sold each month, as ranges: solid to the least, light to the most the reports allow. */
export function moneyByMonth(months: Month[], title: string): ReactNode {
  const H = 300;
  const [left, right, top, bottom] = [78, 12, 12, 30];
  const max = Math.max(...months.flatMap((m) => [m.bought[1], m.sold[1]]));
  const t = ticks(max);
  const y = (v: number) => H - bottom - (v / t.at(-1)!) * (H - top - bottom);
  const col = (W - left - right) / months.length;
  const bw = Math.min(16, col * 0.3);
  const x = (i: number) => left + col * i + col / 2;
  const bar = (cx: number, [lo, hi]: [number, number], fill: string) =>
    h(Fragment, null, h("rect", { x: cx - bw / 2, y: y(hi), width: bw, height: Math.max(0, y(lo) - y(hi) - 2), rx: 3, style: { fill }, className: "chart__range" }), h("rect", { x: cx - bw / 2, y: y(lo), width: bw, height: Math.max(0, y(0) - y(lo)), rx: 3, style: { fill } }));
  return h(
    "figure",
    { className: "chart" },
    legend([
      { label: "Bought, at least", swatch: "var(--ul-buy)" },
      { label: "up to", swatch: "var(--ul-buy)", light: true },
      { label: "Sold, at least", swatch: "var(--ul-sell)" },
      { label: "up to", swatch: "var(--ul-sell)", light: true },
    ]),
    h(
      "svg",
      { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": title, className: "chart__svg" },
      ...t.map((v) => h(Fragment, { key: v }, h("line", { x1: left, x2: W - right, y1: y(v), y2: y(v), className: "chart__grid" }), h("text", { x: left - 8, y: y(v) + 4, className: "chart__tick", textAnchor: "end" }, v === 0 ? "$0" : usdM(v)))),
      ...months.map((m, i) =>
        h(
          "g",
          { key: m.month },
          h("title", null, `${monthName(m.month)}: bought ${usdM(m.bought[0])} to ${usdM(m.bought[1])}; sold ${usdM(m.sold[0])} to ${usdM(m.sold[1])}`),
          h("rect", { x: x(i) - col / 2, y: top, width: col, height: H - top - bottom, className: "chart__hit" }),
          bar(x(i) - bw / 2 - 1, m.bought, "var(--ul-buy)"),
          bar(x(i) + bw / 2 + 1, m.sold, "var(--ul-sell)"),
          h("text", { x: x(i), y: H - 8, className: "chart__tick", textAnchor: "middle" }, MONTHS[Number(m.month.slice(5)) - 1]),
        ),
      ),
      h("line", { x1: left, x2: W - right, y1: y(0), y2: y(0), className: "chart__axis" }),
    ),
    table(title, ["Month", "Bought, at least", "Bought, up to", "Sold, at least", "Sold, up to"], months.map((m) => [monthName(m.month), usdM(m.bought[0]), usdM(m.bought[1]), usdM(m.sold[0]), usdM(m.sold[1])])),
  );
}

export interface Point {
  date: string;
  /** The stock's close, if the match has a stock. */
  stock?: number;
  index: number;
}
/**
 * A stock and the S&P 500 over the same trading days, both 100 at the close before the President's words (`zero`, the
 * index of that close in `points`). The words fall between that close and the next; the trade is marked on its day.
 */
export function versus(points: Point[], zero: number, o: { name?: string; trade?: string; tradeLabel: string; title: string; small?: boolean }): ReactNode {
  const H = o.small ? 200 : 300;
  const [left, right, top, bottom] = [44, 104, 22, 26];
  const base = points[zero]!;
  const st = points.map((p) => (p.stock !== undefined && base.stock ? (100 * p.stock) / base.stock : undefined));
  const ix = points.map((p) => (100 * p.index) / base.index);
  const all = [...ix, ...st.filter((v): v is number => v !== undefined)];
  const [lo, hi] = [Math.min(...all), Math.max(...all)];
  const step = hi - lo > 12 ? 5 : 2;
  const [y0, y1] = [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
  const y = (v: number) => top + ((y1 - v) / (y1 - y0)) * (H - top - bottom);
  const x = (i: number) => left + (i / (points.length - 1)) * (W - left - right);
  const path = (vs: (number | undefined)[]) => vs.map((v, i) => (v === undefined ? "" : `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join("");
  const wordsX = (x(zero) + x(zero + 1)) / 2;
  const ti = o.trade ? points.findIndex((p) => p.date === o.trade) : -1;
  const last = points.length - 1;
  const fmt = (v: number) => v.toFixed(1);
  const endLabels = [
    ...(st[last] !== undefined ? [{ v: st[last]!, text: `${o.name} ${fmt(st[last]!)}`, cls: "chart__end chart__end--stock" }] : []),
    { v: ix[last]!, text: `S&P 500 ${fmt(ix[last]!)}`, cls: "chart__end" },
  ].sort((a, b) => b.v - a.v);
  if (endLabels.length === 2 && Math.abs(y(endLabels[0]!.v) - y(endLabels[1]!.v)) < 16) {
    const mid = (y(endLabels[0]!.v) + y(endLabels[1]!.v)) / 2;
    Object.assign(endLabels[0]!, { at: mid - 8 });
    Object.assign(endLabels[1]!, { at: mid + 8 });
  }
  const dateShort = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return h(
    "figure",
    { className: `chart${o.small ? " chart--small" : ""}` },
    o.small
      ? null
      : legend([
          ...(o.name ? [{ label: o.name, swatch: "var(--ul-buy)", line: true }] : []),
          { label: "S&P 500", swatch: "var(--op-faint)", line: true },
        ]),
    h(
      "svg",
      { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.title, className: "chart__svg" },
      ...Array.from({ length: Math.round((y1 - y0) / step) + 1 }, (_, i) => y0 + i * step).map((v) =>
        h(Fragment, { key: v }, h("line", { x1: left, x2: W - right, y1: y(v), y2: y(v), className: v === 100 ? "chart__axis" : "chart__grid" }), h("text", { x: left - 8, y: y(v) + 4, className: "chart__tick", textAnchor: "end" }, String(v))),
      ),
      h("line", { x1: wordsX, x2: wordsX, y1: top - 6, y2: H - bottom, className: "chart__words" }),
      h("text", { x: wordsX, y: top - 10, className: "chart__mark", textAnchor: "middle" }, "The words"),
      h("path", { d: path(ix), className: "chart__line chart__line--index" }),
      st.some((v) => v !== undefined) ? h("path", { d: path(st), className: "chart__line chart__line--stock" }) : null,
      ti >= 0
        ? h(
            "g",
            null,
            h("title", null, `${o.tradeLabel}, ${dateShort(o.trade!)}`),
            h("circle", { cx: x(ti), cy: y(st[ti] ?? ix[ti]!), r: 6, className: "chart__trade" }),
            h("text", { x: x(ti), y: y(st[ti] ?? ix[ti]!) + 22, className: "chart__mark", textAnchor: "middle" }, "Trade"),
          )
        : null,
      ...points.map((p, i) =>
        h(
          "g",
          { key: p.date },
          h("title", null, `${dateShort(p.date)}: ${st[i] !== undefined ? `${o.name} ${fmt(st[i]!)}, ` : ""}S&P 500 ${fmt(ix[i]!)}`),
          h("rect", { x: x(i) - (W - left - right) / (points.length - 1) / 2, y: top, width: (W - left - right) / (points.length - 1), height: H - top - bottom, className: "chart__hit" }),
        ),
      ),
      ...endLabels.map((l) => h("text", { key: l.text, x: W - right + 8, y: ((l as { at?: number }).at ?? y(l.v)) + 4, className: l.cls }, l.text)),
      h("text", { x: x(0), y: H - 8, className: "chart__tick" }, dateShort(points[0]!.date)),
      h("text", { x: x(last), y: H - 8, className: "chart__tick", textAnchor: "end" }, dateShort(points[last]!.date)),
    ),
    o.small ? null : table(o.title, ["Close", ...(o.name ? [`${o.name} (100 = before the words)`] : []), "S&P 500 (100 = before the words)"], points.map((p, i) => [dateShort(p.date), ...(st[i] !== undefined ? [fmt(st[i]!)] : []), fmt(ix[i]!)])),
  );
}

export interface Guess {
  label: string;
  /** Around the words, above the S&P 500: a range in dollars, or null where it cannot be measured. */
  above: [number, number] | null;
  /** From the close on the day of the trade to the fifth close after the words. */
  held: [number, number] | null;
}
const usdK = (x: number) => `${x < 0 ? "−" : x > 0 ? "+" : ""}$${Math.abs(x) >= 1e6 ? `${(Math.abs(x) / 1e6).toFixed(2)}m` : `${Math.round(Math.abs(x) / 1000).toLocaleString("en-US")}k`}`;
export const guessRange = ([lo, hi]: [number, number]) => `${usdK(lo)} to ${usdK(hi)}`;

/** Each match as two range bars about zero, in dollars: above the index around the words, and since the trade's day. */
export function guessChart(rows: Guess[], title: string): ReactNode {
  const rowH = 76;
  const [left, right, top, bottom] = [44, 44, 8, 34];
  const H = top + rowH * rows.length + bottom;
  const vals = rows.flatMap((r) => [...(r.above ?? []), ...(r.held ?? [])]).concat(0);
  const t = ticks(Math.max(...vals.map(Math.abs)));
  const lim = t.at(-1)!;
  const lo = Math.min(...vals) < 0 ? -lim : 0;
  const x = (v: number) => left + ((v - lo) / (lim - lo)) * (W - left - right);
  const tickVals = [...t.filter((v) => v > 0).map((v) => -v).filter((v) => v >= lo).reverse(), ...t];
  const bar = (r: [number, number] | null, y: number, cls: string, what: string, label: string) =>
    r
      ? h(
          "g",
          null,
          h("title", null, `${label}, ${what}: ${guessRange(r)}`),
          h("rect", { x: x(r[0]), y, width: Math.max(3, x(r[1]) - x(r[0])), height: 14, rx: 3, className: cls }),
          h("text", { x: x(r[1]) + 6, y: y + 12, className: "chart__tick" }, guessRange(r)),
        )
      : h("text", { x: x(0) + 6, y: y + 11, className: "chart__tick" }, "not measurable here");
  return h(
    "figure",
    { className: "chart" },
    legend([
      { label: "Around the words, above the S&P 500", swatch: "var(--ul-buy)" },
      { label: "From the day of the trade", swatch: "var(--op-faint)" },
    ]),
    h(
      "svg",
      { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": title, className: "chart__svg" },
      ...tickVals.map((v) => h(Fragment, { key: v }, h("line", { x1: x(v), x2: x(v), y1: top, y2: H - bottom, className: v === 0 ? "chart__axis" : "chart__grid" }), h("text", { x: x(v), y: H - 8, className: `chart__tick${v !== 0 && Math.abs(v) !== lim ? " chart__tick--minor" : ""}`, textAnchor: "middle" }, v === 0 ? "$0" : usdK(v)))),
      ...rows.map((r, i) =>
        h(
          "g",
          { key: r.label },
          h("text", { x: 0, y: top + rowH * i + 16, className: "chart__mark" }, r.label),
          bar(r.above, top + rowH * i + 26, "chart__guess chart__guess--above", "around the words, above the S&P 500", r.label),
          bar(r.held, top + rowH * i + 48, "chart__guess chart__guess--held", "from the day of the trade", r.label),
        ),
      ),
    ),
    table(title, ["Trade", "Around the words, above the S&P 500", "From the day of the trade"], rows.map((r) => [r.label, r.above ? guessRange(r.above) : "Not measurable here", r.held ? guessRange(r.held) : "—"])),
  );
}
