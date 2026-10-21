/**
 * The site's colours, in one place: the page tokens (written into tokens.css at build), the share images and the
 * contrast check (scripts/contrast.ts) all read them from here.
 *
 * Light mode is warm paper with blue links. Dark mode is the engine's dark brown (OpenPromises 0.13.0): page
 * #241f1a, text #efe7da at about 13:1, amber links, blue only where it carries meaning (the top of the ladder).
 * A promise's bar on the climb chart is as tall as the step it has reached, so the height says how far it has gone
 * and the colour only repeats it: `bar` for a step on the way, `good` for the top, `bad` for an ending.
 * The ledger's flows are blue for money in, a warm grey for money out, and orange for the gap, borrowing and the
 * interest it costs (dark mode: the chart blue #6f9fe8 and the orange #e07a45).
 */

export interface Mode {
  bg: string;
  surface: string;
  sunk: string;
  line: string;
  lineStrong: string;
  ink: string;
  muted: string;
  faint: string;
  accent: string;
  /** Text on an accent fill. */
  onAccent: string;
  good: string;
  warn: string;
  bad: string;
  /** A promise's bar on the climb chart, and the filled part of its meter. */
  bar: string;
  /** An unreached step on a meter, and the chart's grid. */
  grid: string;
  /** The ledger: money in (receipts), money out (outlays), and the gap (borrowing, and the interest it costs). */
  moneyIn: string;
  moneyOut: string;
  gap: string;
}

export const light: Mode = {
  bg: "#fbf8f2",
  surface: "#f4eee4",
  sunk: "#ece4d6",
  line: "#e3d9c8",
  lineStrong: "#c9bba4",
  ink: "#1f1a14",
  muted: "#5b5245",
  faint: "#665d50",
  accent: "#1f4f8f",
  onAccent: "#fbf8f2",
  good: "#1a6e3f",
  warn: "#8a5200",
  bad: "#b3261e",
  bar: "#9c6626",
  grid: "#e6dccb",
  moneyIn: "#3a6bb3",
  moneyOut: "#857a69",
  gap: "#b5561b",
};

export const dark: Mode = {
  bg: "#241f1a",
  surface: "#2e2822",
  sunk: "#39322b",
  line: "rgba(239,231,218,.10)",
  lineStrong: "rgba(239,231,218,.16)",
  ink: "#efe7da",
  muted: "#c0b5a4",
  faint: "#a59a88",
  accent: "#e2b26f",
  onAccent: "#241f1a",
  good: "#8aa3ec",
  warn: "#f0dcaa",
  bad: "#ec9286",
  bar: "#e2b26f",
  grid: "#3a3229",
  moneyIn: "#6f9fe8",
  moneyOut: "#9d9281",
  gap: "#e07a45",
};

const vars = (m: Mode) =>
  [
    `--op-bg: ${m.bg};`,
    `--op-surface: ${m.surface};`,
    `--op-sunk: ${m.sunk};`,
    `--op-line: ${m.line};`,
    `--op-line-strong: ${m.lineStrong};`,
    `--op-ink: ${m.ink};`,
    `--op-muted: ${m.muted};`,
    `--op-faint: ${m.faint};`,
    `--op-accent: ${m.accent};`,
    `--op-good: ${m.good};`,
    `--op-warn: ${m.warn};`,
    `--op-bad: ${m.bad};`,
    `--ul-on-accent: ${m.onAccent};`,
    `--ul-bar: ${m.bar};`,
    `--ul-grid: ${m.grid};`,
    `--ul-in: ${m.moneyIn};`,
    `--ul-out: ${m.moneyOut};`,
    `--ul-gap: ${m.gap};`,
  ]
    .map((l) => `  ${l}`)
    .join("\n");

/** The tokens as CSS, light first; dark by the reader's setting, or by `data-theme`, as the engine's stylesheet does. */
export function tokensCss(): string {
  return `/* Generated from scripts/palette.ts by the build: edit the palette there. */
:root {
  color-scheme: light dark;
${vars(light)}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${vars(dark).replace(/^/gm, "  ")}
  }
}
:root[data-theme="dark"] {
${vars(dark)}
}
`;
}
