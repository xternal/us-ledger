/**
 * The site's mark: the Capitol's dome in a few lines (a base, three columns, the drum, the dome, the lantern), with a
 * dot above it in the ladder's colour. The Capitol is where a promise becomes law or money, the steps this site
 * records; the columns keep it a building rather than a bell.
 * Chosen by Pavel Guzhikov on 20 October 2026 from three sketches ("logo C").
 *
 * Drawn on a 32-unit grid. Small sizes (the favicon) use heavier lines so the mark still reads at 16 px.
 */
import { dark, light } from "./palette.ts";

/** The lines: the base, three columns, the drum, the dome and the lantern. */
export const MARK_PATH = "M4 26.5H28M11 21V26.5M16 21V26.5M21 21V26.5M7 21H25M9.5 21A6.5 6.5 0 0 1 22.5 21M16 14.5V11";
/** The dot above the lantern. */
export const MARK_DOT = { cx: 16, cy: 8 };

/** The mark's lines and its dot, as SVG elements, in the given colours. */
export function markShapes(ink: string, dot: string, heavy = false): string {
  const w = heavy ? 3 : 2.2;
  return `<path d="${MARK_PATH}" fill="none" stroke="${ink}" stroke-width="${w}" stroke-linecap="round"/><circle cx="${MARK_DOT.cx}" cy="${MARK_DOT.cy}" r="${heavy ? 2.4 : 2}" fill="${dot}"/>`;
}

/** A standalone mark, for the share images: cream lines and an amber dot, for a dark background. */
export function markOnDark(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${markShapes(dark.ink, dark.bar)}</svg>`;
}

/** The favicon: heavier lines, ink on light screens and cream in dark mode. */
export function faviconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><style>.i{stroke:${light.ink}}.d{fill:${light.bar}}@media (prefers-color-scheme:dark){.i{stroke:${dark.ink}}.d{fill:${dark.bar}}}</style><path class="i" d="${MARK_PATH}" fill="none" stroke-width="3" stroke-linecap="round"/><circle class="d" cx="${MARK_DOT.cx}" cy="${MARK_DOT.cy}" r="2.4"/></svg>\n`;
}

/** An icon on a solid square (the home-screen icon and the PNG favicon), with room around the mark. */
export function tileSvg(size: number, heavy: boolean): string {
  const pad = size * 0.16;
  const s = (size - 2 * pad) / 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${light.bg}"/><g transform="translate(${pad} ${pad}) scale(${s})">${markShapes(light.ink, light.bar, heavy)}</g></svg>`;
}
