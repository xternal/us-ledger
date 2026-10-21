/**
 * Checks the palette (scripts/palette.ts): every text colour passes WCAG AA (4.5:1) on each background it is used on,
 * every chart mark passes 3:1, and dark-mode body text sits near 13:1 and never above 14:1, which glares.
 * Run: node scripts/contrast.ts (part of pnpm check).
 */
import { dark, light, type Mode } from "./palette.ts";

/** A colour as sRGB 0–1, with an alpha channel blended over `under`. */
function rgb(c: string, under?: [number, number, number]): [number, number, number] {
  const m = c.match(/^rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)$/);
  if (m) {
    const [r, g, b, a] = m.slice(1).map(Number);
    const base = under ?? [0, 0, 0];
    return [r, g, b].map((v, i) => (v / 255) * a + base[i]! * (1 - a)) as [number, number, number];
  }
  const h = c.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}
const lum = ([r, g, b]: [number, number, number]) => {
  const f = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export function ratio(a: string, b: string): number {
  const bg = rgb(b);
  const [x, y] = [lum(rgb(a, bg)), lum(bg)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const problems: string[] = [];
function need(mode: string, what: string, fg: string, bg: string, min: number) {
  const r = ratio(fg, bg);
  if (r < min) problems.push(`${mode}: ${what} is ${r.toFixed(2)}:1, needs ${min}:1 (${fg} on ${bg})`);
}

for (const [name, m] of [["light", light], ["dark", dark]] as [string, Mode][]) {
  for (const bg of ["bg", "surface"] as const) {
    for (const t of ["ink", "muted", "faint", "accent", "good", "warn", "bad"] as const) need(name, `${t} text on ${bg}`, m[t], m[bg], 4.5);
  }
  for (const t of ["ink", "muted", "accent"] as const) need(name, `${t} text on sunk`, m[t], m.sunk, 4.5);
  need(name, "text on the accent", m.onAccent, m.accent, 4.5);
  for (const bg of ["bg", "surface"] as const) for (const mark of ["bar", "good", "bad", "accent", "moneyIn", "moneyOut", "gap"] as const) need(name, `${mark} mark on ${bg}`, m[mark], m[bg], 3);
}
const body = ratio(dark.ink, dark.bg);
if (body > 14) problems.push(`dark: body text is ${body.toFixed(2)}:1, above 14:1`);
if (body < 12) problems.push(`dark: body text is ${body.toFixed(2)}:1, below about 13:1`);

if (problems.length) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
console.log(`Contrast: every text colour passes 4.5:1 and every mark 3:1 in light and dark; dark body text ${body.toFixed(1)}:1.`);
