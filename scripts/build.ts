/**
 * Builds the whole site as static files in public/: a page for every published card, its story, every actor and
 * area, the home page, and everything the engine publishes (feeds, Markdown, llms.txt, sitemap, open data). Every
 * page has its own title, description, canonical address and share card, with an image drawn from what the page is
 * about (scripts/share-image.ts). Drafts never appear. Pages are the engine's own components rendered once, so they
 * read without JavaScript; the little script there is only keeps the menu's current item in view.
 *
 * Run: node scripts/build.ts (Node 22.18 or later strips the types).
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { categoryOf, climb, statusLabel, todayIn, validateContent, type Actor, type Config } from "@openpromises/core";
import { findConfig, folderSource, loadConfig, readContent } from "@openpromises/files";
import {
  absolute,
  actorJsonLd,
  areaLabel,
  cardDescription,
  cardItemList,
  cardJsonLd,
  cardTitle,
  cardViews,
  collectionJsonLd,
  daysBetween,
  lastUpdated,
  longDate,
  paths,
  publishFiles,
  relatedCards,
  sitemapEntries,
  statusCounts,
  statusMix,
  words,
  type CardView,
  type JsonLd as LdData,
} from "@openpromises/publish";
import { ActorTimeline, AreaCoverage, Breadcrumbs, JsonLd, KeyPromises, PromiseCard, PromiseList, PromisesByMonth, PromiseSpotlight, PromiseStory, StatusPill } from "@openpromises/react";
import { createElement as h, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Resvg } from "@resvg/resvg-js";
import { faviconSvg, MARK_DOT, MARK_PATH, tileSvg } from "./mark.ts";
import { dark, light, tokensCss } from "./palette.ts";
import { clip, HEIGHT, shareImage, WIDTH, type Climb, type Share } from "./share-image.ts";

const ROOT = join(import.meta.dirname, "..");
/** `--preview` builds drafts too, into public-preview/, so the editor sees a page before approving it; never deployed. */
const PREVIEW = process.argv.includes("--preview");
const OUT = join(ROOT, PREVIEW ? "public-preview" : "public");
/** The President's term began at the inauguration on 20 January 2025; the home page counts its days. */
const TERM_START = "2025-01-20";

/** Every configured area, in the configured order, with how many published cards it holds: empty ones included. */
export function coverage(config: Config, views: readonly CardView[]): { area: string; count: number }[] {
  const areas = config.areas.kind === "enum" ? config.areas.values : [...new Set(views.map((v) => v.card.area))].sort();
  return areas.map((area) => ({ area, count: views.filter((v) => v.card.area === area).length }));
}

/**
 * The opening of the home page, chosen by rule, never by hand: the promises in a party's written platform, in the
 * order of the areas, which are the platform's own. A platform is the commitment a party asks voters to hold it to,
 * so it comes before what was said since. The same rule applies to every party.
 */
export function platformPromises(config: Config, views: readonly CardView[]): CardView[] {
  const order = config.areas.kind === "enum" ? config.areas.values : [];
  return views.filter((v) => v.card.venue === "platform").sort((a, b) => order.indexOf(a.card.area) - order.indexOf(b.card.area) || a.card.made_on.localeCompare(b.card.made_on));
}

/** Where a promise stands on the ladder, for the climb chart and the meters: the same rule for every card. */
export function climbOf(config: Config, v: CardView, n: number): Climb {
  const ladder = climb(config);
  const step = ladder.indexOf(v.card.status);
  const category = categoryOf(config, v.card.status);
  const kind = category === "off_ladder" ? "off" : step < 0 ? "ended" : step === ladder.length - 1 ? "top" : category === "open" ? "open" : "progress";
  return { n, step, kind };
}

/** The menu's sections, and which one a page belongs to: a card's page is under Promises, an area's under Areas. */
const sectionOf = (path: string) => (path.startsWith("/promises/area") ? "areas" : path.startsWith("/promise") ? "promises" : path.startsWith("/actor") ? "people" : path.startsWith("/about") ? "about" : null);
const trim = (path: string) => (path.length > 1 ? path.replace(/\/$/, "") : path);

/** Keeps the menu's current item in view on narrow screens, without moving the page. */
const NAV_SCRIPT = `(()=>{const c=document.querySelector('.site-nav [aria-current]');if(c){const u=c.closest('ul');if(u.scrollWidth>u.clientWidth)u.scrollLeft=c.offsetLeft-(u.clientWidth-c.offsetWidth)/2}})();`;
/** On the home page, marks the section in view in the "On this page" menu as the reader scrolls. */
const ONPAGE_SCRIPT = `(()=>{const n=document.querySelector('.onpage');if(!n||!('IntersectionObserver'in window))return;const u=n.querySelector('ul'),links=[...n.querySelectorAll('a')],by=new Map(links.map(a=>[a.hash.slice(1),a]));const io=new IntersectionObserver(es=>{for(const e of es){if(!e.isIntersecting)continue;const a=by.get(e.target.id);if(!a)continue;links.forEach(l=>l.removeAttribute('aria-current'));a.setAttribute('aria-current','true');if(u.scrollWidth>u.clientWidth)u.scrollLeft=a.offsetLeft-16}},{rootMargin:'-40% 0px -55% 0px'});by.forEach((a,id)=>{const s=document.getElementById(id);if(s)io.observe(s)})})();`;

interface Page {
  path: string;
  /** The page's own name; the site's is added after it, except on the home page. */
  title: string;
  /** A full title, when the engine words it (a card's). */
  fullTitle?: string;
  /** The title on a share card, without the site name. */
  socialTitle?: string;
  description: string;
  share: Share;
  /** What the share image shows, for people who cannot see it. */
  alt: string;
  body: ReactNode;
  ld?: LdData[];
  type?: "website" | "article";
  wide?: boolean;
  script?: string;
}

async function main() {
  const { config, contentDir } = await loadConfig(findConfig(ROOT)!);
  const result = validateContent(readContent(folderSource(contentDir), config).input);
  const errors = result.issues.filter((i) => i.severity === "error");
  if (errors.length) {
    for (const e of errors) console.error(`${e.file}: ${e.message}`);
    throw new Error(`${errors.length} errors: run pnpm validate`);
  }
  const L = config.locales.default;
  const w = words(config, L);
  const today = todayIn(config.timezone);
  const all = cardViews(result.cards, result.actors, result.editors);
  const views = PREVIEW ? all.map((v) => ({ ...v, where: "promises" as const })) : all.filter((v) => v.where === "promises");
  const p = paths(config);
  const name = config.site.name;
  const ld = { config, w, today };
  const actorName = (a: Actor) => a.name[L] ?? a.id;
  const headline = (v: CardView) => v.card.headline?.[L] ?? v.id;
  const ladder = climb(config);
  const ladderLabels = ladder.map((s) => statusLabel(config, s, L));
  const label = (status: string) => statusLabel(config, status, L);
  const platform = platformPromises(config, views);
  const numberOf = new Map(platform.map((v, i) => [v.id, i + 1]));
  const statuses = [...ladder, "failed", "quietly_dropped", "unscoreable"].filter((s) => categoryOf(config, s));
  const updated = (vs: readonly CardView[]) => vs.map((v) => lastUpdated(v.card, today)).filter((d): d is string => !!d).sort().at(-1) ?? today;
  const latest = (v: CardView) => [...v.card.events].filter((e) => e.date <= today).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const tally = (vs: readonly CardView[]) => statusCounts(vs, config).map(({ status, count }) => `${count} ${label(status).toLowerCase()}`).join(" · ");

  rmSync(OUT, { recursive: true, force: true });
  const write = (path: string, body: string | Buffer) => {
    const file = join(OUT, path.replace(/^\//, ""));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
  };
  const images: { path: string; share: Share }[] = [];
  const pages: string[] = [];

  const nav = [
    { key: "promises", href: p.promises(L), label: "Promises" },
    { key: "people", href: "/actor/", label: "People" },
    { key: "areas", href: "/promises/area/", label: "Areas" },
    { key: "about", href: "/about/", label: "How it works" },
  ];

  const page = (pg: Page) => {
    const image = `/og${pg.path === "/" ? "/home" : trim(pg.path)}.png`;
    images.push({ path: image, share: pg.share });
    pages.push(pg.path);
    const title = pg.fullTitle ?? (pg.title === name ? name : `${pg.title} · ${name}`);
    const social = pg.socialTitle ?? pg.title;
    const url = absolute(config, pg.path);
    const section = sectionOf(pg.path);
    const meta = (property: string, content: string) => h("meta", { key: property, property, content });
    const named = (n: string, content: string) => h("meta", { key: n, name: n, content });
    write(
      pg.path.endsWith("/") ? `${pg.path}index.html` : `${pg.path}/index.html`,
      "<!doctype html>\n" +
        renderToStaticMarkup(
          h(
            "html",
            { lang: L },
            h(
              "head",
              null,
              h("meta", { charSet: "utf-8" }),
              h("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
              h("title", null, title),
              named("description", pg.description),
              PREVIEW ? named("robots", "noindex, nofollow") : null,
              h("link", { rel: "canonical", href: url }),
              h("meta", { name: "theme-color", content: light.bg, media: "(prefers-color-scheme: light)" }),
              h("meta", { name: "theme-color", content: dark.bg, media: "(prefers-color-scheme: dark)" }),
              meta("og:type", pg.type ?? "website"),
              meta("og:site_name", name),
              meta("og:locale", "en_US"),
              meta("og:title", social),
              meta("og:description", pg.description),
              meta("og:url", url),
              meta("og:image", absolute(config, image)),
              meta("og:image:type", "image/png"),
              meta("og:image:width", String(WIDTH)),
              meta("og:image:height", String(HEIGHT)),
              meta("og:image:alt", pg.alt),
              named("twitter:card", "summary_large_image"),
              named("twitter:title", social),
              named("twitter:description", pg.description),
              named("twitter:image", absolute(config, image)),
              named("twitter:image:alt", pg.alt),
              h("link", { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }),
              h("link", { rel: "icon", href: "/favicon-32.png", sizes: "32x32", type: "image/png" }),
              h("link", { rel: "apple-touch-icon", href: "/apple-touch-icon.png" }),
              h("link", { rel: "preload", href: "/fonts/source-serif-4-latin-600-normal.woff2", as: "font", type: "font/woff2", crossOrigin: "" }),
              h("link", { rel: "stylesheet", href: "/styles.css" }),
              h("link", { rel: "stylesheet", href: "/tokens.css" }),
              h("link", { rel: "stylesheet", href: "/site.css" }),
              h("link", { rel: "alternate", type: "application/atom+xml", title: `${name}: every change`, href: "/feeds/all.xml" }),
              pg.ld?.length ? h(JsonLd, { data: pg.ld }) : null,
            ),
            h(
              "body",
              null,
              h("a", { className: "skip", href: "#main" }, "Skip to the content"),
              h(
                "header",
                { className: "site-header" },
                h(
                  "div",
                  { className: "wrap" },
                  h(
                    "a",
                    { href: "/", className: "brand", "aria-current": pg.path === "/" ? "page" : undefined },
                    h(
                      "svg",
                      { className: "brand__mark", viewBox: "0 0 32 32", width: 30, height: 30, "aria-hidden": "true", focusable: "false" },
                      h("path", { d: MARK_PATH, fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" }),
                      h("circle", { ...MARK_DOT, r: 2, style: { fill: "var(--ul-bar)" } }),
                    ),
                    h("span", null, "USLedger", h("span", { className: "brand__tld" }, ".org")),
                  ),
                  h(
                    "nav",
                    { className: "site-nav", "aria-label": "Site" },
                    h(
                      "ul",
                      null,
                      nav.map((n) =>
                        h("li", { key: n.key }, h("a", { href: n.href, "aria-current": trim(pg.path) === trim(n.href) ? "page" : section === n.key ? "true" : undefined }, n.label)),
                      ),
                    ),
                  ),
                ),
              ),
              PREVIEW ? h("p", { className: "preview-banner", role: "note" }, "Preview: drafts included. Nothing on this page is published or approved.") : null,
              h("main", { id: "main", className: pg.wide ? "wrap wrap--wide" : "wrap" }, pg.body),
              h(
                "footer",
                { className: "site-footer" },
                h(
                  "div",
                  { className: "wrap" },
                  h("p", { className: "site-footer__about" }, `${name} records what the US President and senior officials promise, in their exact words, and moves a promise's status only when a document shows it moved.`),
                  h("p", null, h("a", { href: "/data/promises.json" }, "Open data (JSON)"), " · ", h("a", { href: "/data/promises.csv" }, "CSV"), " · ", h("a", { href: "/feeds/all.xml" }, "Every change (Atom)"), " · ", h("a", { href: "/llms.txt" }, "llms.txt")),
                  h("p", null, "Our writing is under ", h("a", { href: config.publish.licence!.url }, config.publish.licence!.name), ". Quotes keep their own terms, named beside each source."),
                  h("p", null, "Built on ", h("a", { href: "https://github.com/xternal/openpromises" }, "OpenPromises"), ", like ", h("a", { href: "https://ledgergov.uk" }, "LedgerGov.UK"), ", ", h("a", { href: "https://boroughbook.uk" }, "BoroughBook.UK"), " and ", h("a", { href: "https://russialedger.com" }, "RussiaLedger.com"), "."),
                  h("p", { className: "site-footer__credit" }, "Made by ", h("a", { href: "https://guzh.uk" }, "Pavel Guzhikov"), " · ", h("a", { href: "https://ko-fi.com/pavelg" }, "Buy me a coffee")),
                ),
              ),
              h("script", { dangerouslySetInnerHTML: { __html: NAV_SCRIPT + (pg.script ?? "") } }),
            ),
          ),
        ),
    );
  };

  /** A promise's place on the ladder as six short bars, with its status in words beside them. */
  const meter = (v: CardView, c: Climb) =>
    c.kind === "off"
      ? h("div", { className: "meter meter--off" }, h(StatusPill, { status: v.card.status, config }), " ", h("span", { className: "meter__of" }, "Too vague to track"))
      : h(
          "div",
          { className: "meter", "data-kind": c.kind },
          c.step >= 0
            ? h(
                "ol",
                { className: "meter__steps", style: { "--steps": ladder.length } as Record<string, number>, "aria-label": `Status: ${label(v.card.status)}, step ${c.step + 1} of ${ladder.length}` },
                ladder.map((s, i) => h("li", { key: s, "data-on": i <= c.step ? "true" : undefined, "aria-current": i === c.step ? "step" : undefined }, h("span", { className: "visually-hidden" }, label(s)))),
              )
            : null,
          h(StatusPill, { status: v.card.status, config }),
        );

  const promiseShare = (v: CardView, kicker?: string): Share => {
    const c = climbOf(config, v, numberOf.get(v.id) ?? 0);
    return {
      kind: "promise",
      kicker: kicker ?? v.card.venue_label?.[L] ?? `${actorName(v.actor)}, ${longDate(w, v.card.made_on)}`,
      headline: headline(v),
      words: v.current.text,
      steps: ladderLabels,
      step: c.kind === "off" || c.kind === "ended" ? -1 : c.step,
      status: label(v.card.status),
      note: c.kind === "off" ? "Too vague to track: two or more of who, how much and when are missing" : undefined,
      latest: (() => {
        const e = latest(v);
        return e?.text?.[L] && c.kind !== "off" ? `${longDate(w, e.date)}: ${e.text[L]}` : undefined;
      })(),
      footer: `Updated ${longDate(w, updated([v]))} · usledger.org`,
    };
  };
  const promiseAlt = (v: CardView) => `${headline(v)}: “${clip(v.current.text, 200)}” Status: ${label(v.card.status)}.`;
  const chartShare = (kicker: string, title: string): Share => ({
    kind: "chart",
    kicker,
    title,
    climb: platform.map((v) => climbOf(config, v, numberOf.get(v.id)!)),
    steps: ladderLabels,
    tally: tally(platform),
    footer: `Updated ${longDate(w, updated(views))} · usledger.org`,
  });
  const chartAlt = `A bar for each of the twenty promises of the 2024 Republican Platform, as tall as the step it has reached: ${tally(platform)}.`;
  const pageShare = (kicker: string, title: string, sub: string): Share => ({ kind: "page", kicker, title, sub, footer: `Updated ${longDate(w, updated(views))} · usledger.org` });

  // Home: the platform's twenty first, by rule, as a chart and a ledger; then the promises on the first screen,
  // chosen by rule (decision 30); then how a status moves and the questions people ask.
  const day = daysBetween(TERM_START, today) + 1;
  const later = (v: CardView) => views.filter((x) => x.card.area === v.card.area && x.id !== v.id).length;
  const laterTotal = views.length - platform.length;
  const unscoreable = platform.filter((v) => v.card.status === "unscoreable").length;
  const faq: [string, string][] = [
    [
      `What is ${name}?`,
      `An open record of what the US President and senior officials promise, starting with the twenty promises that open the 2024 Republican Platform. Each promise is in its exact words, with a link to where they were said or written, and a dated timeline of what has happened since, each step linked to its document.`,
    ],
    [
      "Why the 2024 Republican Platform?",
      "It is the written list of promises the party asked voters to hold it to, and Republicans won the White House and both chambers of Congress in November 2024. Its twenty are this site's areas, in the platform's order, so the yardstick is the platform's own. Later promises by the President, the Vice President and the officials who speak for the Administration are filed under the one they serve.",
    ],
    [
      "Who decides where a promise stands?",
      "The documents do. Every step after “Promised” links to its evidence: an executive order, a law, an appropriation or an official statistic. An editor, named on each card, who declares no US party, approves every card before it is published, and a card's history only grows: a change is a new entry, never an edit.",
    ],
    [
      "What does “Unscoreable” mean?",
      `Too vague to track: two or more of who, how much and when are missing, so no document or statistic could show the promise as reached. ${unscoreable} of the twenty are unscoreable; each card says why.`,
    ],
    ["Can I use the data?", "Yes. Every card is open data in JSON and CSV, with an Atom feed of every change and Markdown beside every page. Our writing is under CC BY 4.0; quotes keep their own terms, named beside each source."],
    [
      "How is this different from PolitiFact's MAGA-Meter?",
      "The MAGA-Meter rates 75 of Donald Trump's 2024 campaign promises. This site files promises by the President and the officials who speak for the Administration under the platform's twenty, with deadlines, costs and their sources, and a history of every change, as open data.",
    ],
  ];
  const homeDescription = `The twenty promises of the 2024 Republican Platform, in their exact words, and where each one stands, shown by orders, laws, budgets and official statistics: ${tally(platform)}.`;
  page({
    path: "/",
    title: name,
    fullTitle: `${name}: the 2024 Republican Platform's twenty promises, and where each stands`,
    socialTitle: "The 2024 Republican Platform's twenty promises, and where each one stands",
    description: clip(homeDescription, 200),
    share: chartShare(`2024 Republican Platform · day ${day} of the term`, "The twenty promises, and where each one stands"),
    alt: chartAlt,
    wide: true,
    script: ONPAGE_SCRIPT,
    ld: [
      { "@context": "https://schema.org", "@type": "WebSite", name, url: absolute(config, "/"), description: config.site.description[L], inLanguage: L },
      cardItemList(platform, ld),
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
    body: h(
      Fragment,
      null,
      h(
        "section",
        { className: "hero", "aria-labelledby": "hero-h" },
        h(
          "div",
          { className: "hero__text" },
          h("p", { className: "kicker" }, `2024 Republican Platform · Day ${day} of the President's term`),
          h("h1", { id: "hero-h" }, "Twenty promises, and where each one stands"),
          h(
            "p",
            { className: "lede" },
            "The 2024 Republican Platform, “Make America Great Again!”, opens with twenty promises “that we will accomplish very quickly”. Each is here in its own words, with the orders, laws, budgets and official statistics that show where it stands. A status moves only when a document shows it moved.",
          ),
        ),
        platform.length
          ? h(
              "figure",
              { className: "climb" },
              h(
                "div",
                { className: "climb__plot", style: { "--rows": ladder.length, "--n": platform.length } as Record<string, number> },
                h("ol", { className: "climb__axis", "aria-hidden": "true" }, [...ladderLabels].reverse().map((s) => h("li", { key: s }, s))),
                h(
                  "ol",
                  { className: "climb__bars", "aria-label": "The twenty promises by how far each has gone" },
                  platform.map((v) => {
                    const c = climbOf(config, v, numberOf.get(v.id)!);
                    const what = `${c.n}. ${headline(v)}: ${label(v.card.status)}`;
                    return h(
                      "li",
                      { key: v.id, "data-kind": c.kind, style: { "--h": c.kind === "off" || c.kind === "ended" ? 1 : c.step + 1 } as Record<string, number> },
                      h("a", { href: `#promise-${c.n}`, title: what }, h("span", { className: "climb__bar" }), h("span", { className: "climb__n" }, h("span", { className: "visually-hidden" }, what), h("span", { "aria-hidden": "true" }, String(c.n)))),
                    );
                  }),
                ),
              ),
              h("figcaption", null, "Each bar is one promise, numbered in the platform's order, as tall as the step it has reached. A dashed bar is unscoreable: too vague to track."),
            )
          : null,
        h(
          "ul",
          { className: "tally", "aria-label": "The twenty by status" },
          statuses.map((s) => {
            const n = platform.filter((v) => v.card.status === s).length;
            return h("li", { key: s, className: n ? undefined : "tally__none" }, h("strong", null, String(n)), " ", label(s));
          }),
        ),
        h("p", { className: "updated" }, `Last change ${longDate(w, updated(views))}. Every step links to its document.`),
      ),
      h(
        "nav",
        { className: "onpage", "aria-label": "On this page" },
        h("ul", null, h("li", null, h("a", { href: "#twenty" }, "The twenty")), h("li", null, h("a", { href: "#latest" }, "Latest changes")), h("li", null, h("a", { href: "#ladder" }, "How a status moves")), h("li", null, h("a", { href: "#questions" }, "Questions"))),
      ),
      h(
        "section",
        { id: "twenty", className: "home-section", "aria-labelledby": "twenty-h" },
        h("h2", { id: "twenty-h" }, "The twenty, in the platform's order"),
        h("p", { className: "section-lede" }, "The platform's own words for each, the step it has reached, and the latest dated evidence. Open one for its sources, every event and the whole story."),
        platform.length
          ? h(
              "ol",
              { className: "ledger" },
              platform.map((v) => {
                const c = climbOf(config, v, numberOf.get(v.id)!);
                const e = latest(v);
                const more = later(v);
                return h(
                  "li",
                  { key: v.id, id: `promise-${c.n}`, className: "entry", "data-kind": c.kind },
                  h("p", { className: "entry__n", "aria-hidden": "true" }, String(c.n)),
                  h(
                    "div",
                    { className: "entry__body" },
                    h("h3", { className: "entry__title" }, h("a", { href: p.card(v.id, L) }, h("span", { className: "visually-hidden" }, `${c.n}. `), headline(v))),
                    h("blockquote", { className: "entry__words", cite: v.current.source_url }, h("p", null, v.current.text)),
                    meter(v, c),
                    e?.text?.[L] ? h("p", { className: "entry__latest" }, h("time", { dateTime: e.date }, longDate(w, e.date)), " ", clip(e.text[L]!, 190)) : null,
                    more ? h("p", { className: "entry__later" }, h("a", { href: p.area(v.card.area, L) }, `${more} later ${more === 1 ? "promise" : "promises"} filed under it`)) : null,
                  ),
                );
              }),
            )
          : h("p", null, "No promise is published yet. The first cards are being checked against their sources."),
        h(
          "p",
          { className: "note" },
          laterTotal
            ? h(Fragment, null, `${laterTotal} later ${laterTotal === 1 ? "promise is" : "promises are"} filed under the twenty, or under `, h("a", { href: p.area("other", L) }, "Not among the 20"), ".")
            : "Later promises by the President, the Vice President and the officials who speak for the Administration are filed under the one they serve. None is recorded yet.",
        ),
      ),
      h(
        "section",
        { id: "latest", className: "home-section", "aria-labelledby": "latest-h" },
        h("h2", { id: "latest-h" }, "Latest changes"),
        views.length ? h(PromiseSpotlight, { views, today, actors: result.actors, config }) : h("p", null, "No promise is published yet."),
      ),
      h(
        "section",
        { id: "ladder", className: "home-section", "aria-labelledby": "ladder-h" },
        h("h2", { id: "ladder-h" }, "How a status moves"),
        h("p", { className: "section-lede" }, "A promise climbs one step at a time, and only on a document. Each step on a card links to its evidence."),
        h(
          "ol",
          { className: "steps" },
          [
            ["promised", "The words are on record, with a link to where they were said or written."],
            ["in_plan", "An order, memorandum or plan sets out how it will be done."],
            ["legislated", "A law that does it is enacted."],
            ["funded", "Money for it is appropriated."],
            ["delivering", "It is in operation, and an official statistic or document shows it working."],
            ["delivered", "The outcome the words name is reached, shown by a document or an official statistic."],
          ]
            .filter(([s]) => ladder.includes(s!))
            .map(([s, what]) => h("li", { key: s, "data-top": s === ladder.at(-1) ? "true" : undefined }, h("strong", null, label(s!)), what)),
        ),
        h(
          "p",
          null,
          "A promise can also end as ",
          h("strong", null, label("failed")),
          ", when its deadline passes or its outcome is ruled out, or ",
          h("strong", null, label("quietly_dropped")),
          ", when a step it reached is reversed. ",
          h("strong", null, label("unscoreable")),
          " means too vague to track. ",
          h("a", { href: "/about/" }, "How it works"),
        ),
      ),
      h(
        "section",
        { id: "questions", className: "home-section", "aria-labelledby": "questions-h" },
        h("h2", { id: "questions-h" }, "Questions"),
        h("dl", { className: "faq" }, faq.map(([q, a]) => h(Fragment, { key: q }, h("dt", null, q), h("dd", null, a)))),
      ),
    ),
  });

  page({
    path: p.promises(L),
    title: "Every promise",
    description: clip(`Every promise on ${name}, newest first, with where each one stands: ${tally(views)}.`, 200),
    share: chartShare("Every promise", `Every promise on ${name}, and where each one stands`),
    alt: chartAlt,
    ld: collectionJsonLd({ path: p.promises(L), name: "Every promise", description: `Every promise on ${name}`, views }, ld),
    body: h(Fragment, null, h("h1", null, "Every promise"), h("p", { className: "lede" }, `${views.length} ${views.length === 1 ? "promise" : "promises"}, newest first: ${tally(views)}.`), h(PromiseList, { views, today, actors: result.actors, config, empty: "No promise is published yet." })),
  });

  for (const v of views) {
    const crumbs = [{ name, href: "/" }, { name: "Promises", href: p.promises(L) }, { name: headline(v), href: p.card(v.id, L) }];
    const t = cardTitle(v, config, w);
    page({
      path: p.card(v.id, L),
      title: headline(v),
      fullTitle: t.title,
      socialTitle: t.social,
      description: cardDescription(v, config, w),
      share: promiseShare(v),
      alt: promiseAlt(v),
      type: "article",
      ld: cardJsonLd(v, ld),
      body: h(
        Fragment,
        null,
        h(Breadcrumbs, { config, items: crumbs }),
        h(PromiseCard, { view: v, config, today, related: relatedCards(v, views), actions: h("a", { href: `${p.card(v.id, L)}/story/` }, "The whole story in one line") }),
      ),
    });
    page({
      path: `${p.card(v.id, L)}/story/`,
      title: `${headline(v)}: the story`,
      socialTitle: `${headline(v)}: the whole story`,
      description: clip(`Every dated step of “${headline(v)}”, from the day it was promised to today, each with its document. Status: ${label(v.card.status)}.`, 200),
      share: promiseShare(v, "The whole story, step by step"),
      alt: promiseAlt(v),
      type: "article",
      body: h(Fragment, null, h(Breadcrumbs, { config, items: [...crumbs, { name: "Story", href: `${p.card(v.id, L)}/story/` }] }), h(PromiseStory, { view: v, config, today, headingLevel: 2 })),
    });
  }

  const people = [...result.actors.values()].filter((a) => a.kind === "person").sort((a, b) => a.id.localeCompare(b.id));
  const parties = [...result.actors.values()].filter((a) => a.kind === "party").sort((a, b) => a.id.localeCompare(b.id));
  const bodies = [...result.actors.values()].filter((a) => a.kind !== "person" && a.kind !== "party").sort((a, b) => a.id.localeCompare(b.id));
  const ownOf = (a: Actor) => views.filter((v) => v.actor.id === a.id || v.party?.id === a.id);
  const roleOf = (a: Actor) => a.roles?.at(-1)?.title[L];
  const actorList = (list: Actor[]) =>
    h(
      "ul",
      { className: "people" },
      list.map((a) => {
        const n = ownOf(a).length;
        return h("li", { key: a.id }, h("a", { href: p.actor(a.id, L) }, h("strong", null, actorName(a)), roleOf(a) ? h("span", null, roleOf(a)) : null, h("span", { className: "people__count" }, n ? `${n} ${n === 1 ? "promise" : "promises"}` : "None recorded yet")));
      }),
    );
  page({
    path: "/actor/",
    title: "People",
    description: `The President, the Vice President and the officials who speak for the Administration, the parties and the bodies that must deliver, each with every promise on record and where it stands.`,
    share: pageShare("People", "Who promised what", "The President, the Vice President and the officials who speak for the Administration, each with every area listed, empty ones too."),
    alt: "Who promised what: the President, the Vice President and senior officials on USLedger.org.",
    body: h(
      Fragment,
      null,
      h("h1", null, "People"),
      h("p", { className: "lede" }, "Every page lists all twenty-one areas, so what has not been promised shows as plainly as what has."),
      h("h2", null, "The Administration"),
      actorList(people),
      h("h2", null, "Parties"),
      actorList(parties),
      h("h2", null, "The bodies that deliver"),
      actorList(bodies),
    ),
  });
  for (const a of result.actors.values()) {
    const own = ownOf(a);
    const party = a.party_id ? (result.actors.get(a.party_id) ?? null) : null;
    const role = roleOf(a);
    const summary = own.length ? `${own.length} ${own.length === 1 ? "promise" : "promises"} on record: ${statusMix(own, config, w)}.` : `No promise by ${actorName(a)} is recorded yet. Every area is listed below, so what has not been promised shows too.`;
    page({
      path: p.actor(a.id, L),
      title: actorName(a),
      description: clip(`${actorName(a)}${role ? `, ${role}` : ""}: ${summary}`, 200),
      share: pageShare(role ?? "People", actorName(a), summary),
      alt: `${actorName(a)}${role ? `, ${role}` : ""}. ${summary}`,
      type: "article",
      ld: actorJsonLd(a, party, own, ld),
      body: h(
        Fragment,
        null,
        h(Breadcrumbs, { config, items: [{ name, href: "/" }, { name: "People", href: "/actor/" }, { name: actorName(a), href: p.actor(a.id, L) }] }),
        h("h1", null, actorName(a)),
        a.roles?.length ? h("ul", { className: "roles" }, a.roles.map((r, i) => h("li", { key: i }, r.title[L], r.from ? ` from ${longDate(w, r.from)}` : "", r.to ? ` to ${longDate(w, r.to)}` : ""))) : null,
        h("p", { className: "lede" }, summary),
        own.length ? h(KeyPromises, { views: own, today, config, headingLevel: 2 }) : null,
        own.length ? h(ActorTimeline, { views: own, today, config, headingLevel: 2 }) : null,
        own.length ? h(PromisesByMonth, { views: own, today, config, headingLevel: 2 }) : null,
        h(AreaCoverage, { views: own, config, headingLevel: 2 }),
        own.length ? h(Fragment, null, h("h2", null, "Every promise"), h(PromiseList, { views: own, today, actors: result.actors, config, empty: "No promise is published yet." })) : null,
      ),
    });
  }

  page({
    path: "/promises/area/",
    title: "Areas",
    description: "The twenty promises of the 2024 Republican Platform are this site's areas, in its order, with “Not among the 20” for the rest. Every area is listed, empty ones too.",
    share: chartShare("Areas", "Twenty areas, the platform's own, in its order"),
    alt: chartAlt,
    body: h(
      Fragment,
      null,
      h("h1", null, "Promises by area"),
      h("p", { className: "lede" }, "The areas are the twenty promises of the 2024 Republican Platform, in its order, so the yardstick is the platform's own; everything else is under “Not among the 20”."),
      h(AreaCoverage, { views, config, headingLevel: 2 }),
    ),
  });
  for (const { area } of coverage(config, views)) {
    const areaName = areaLabel(config, area, L);
    const inArea = views.filter((v) => v.card.area === area);
    const own = platform.find((v) => v.card.area === area);
    const description = own
      ? clip(`${areaName}: the platform's words, “${own.current.text}”, where they stand (${label(own.card.status)}) and every later promise filed under them.`, 200)
      : `${areaName}: ${inArea.length ? `${inArea.length} promises, ${statusMix(inArea, config, w)}` : "no promise recorded yet"}.`;
    page({
      path: p.area(area, L),
      title: areaName,
      description,
      share: own ? promiseShare(own, `Area ${areaName.replace(/^\d+\.\s*/, "")}`) : pageShare("Area", areaName, inArea.length ? `${inArea.length} promises: ${statusMix(inArea, config, w)}` : "No promise is recorded in this area yet."),
      alt: own ? promiseAlt(own) : `${areaName} on ${name}.`,
      ld: collectionJsonLd({ path: p.area(area, L), name: areaName, description, views: inArea, breadcrumb: [{ name: "Areas", path: "/promises/area/" }] }, ld),
      body: h(
        Fragment,
        null,
        h(Breadcrumbs, { config, items: [{ name, href: "/" }, { name: "Areas", href: "/promises/area/" }, { name: areaName, href: p.area(area, L) }] }),
        h("h1", null, areaName),
        h(PromiseList, { views: inArea, today, actors: result.actors, config, empty: "No promise is recorded in this area." }),
      ),
    });
  }

  page({
    path: "/about/",
    title: "How it works",
    description: "How USLedger.org records promises: exact words with their source, a status that moves only on documents, nothing rewritten, costs with who made them, and one standard for everyone.",
    share: pageShare("How it works", "Exact words. A status that moves only on evidence.", "Nothing rewritten; costs with who made them; the same rules and words for every person, party and government."),
    alt: "How USLedger.org works: exact words, and a status that moves only on evidence.",
    body: h(
      Fragment,
      null,
      h("h1", null, "How it works"),
      h(
        "ul",
        { className: "rules" },
        h("li", null, "A promise is a commitment about the future, in the speaker's exact words, with a link to where they were said. Opinions and insults are not promises."),
        h("li", null, "Its status moves only on evidence: a signed order, a law, a budget line, an official statistic. Each step links to its document. A deadline that passes with no evidence of delivery is recorded automatically."),
        h("li", null, "Nothing is rewritten. A reworded promise or a moved deadline is a new version beside the old one; our own mistakes are corrections, listed on the card."),
        h("li", null, "A cost is a range with its source and who made it, never a single figure."),
        h("li", null, "The same rules and the same words apply to every person, party and government. Every area is listed on every person's page, so what has not been promised shows too."),
        h("li", null, "Each card is approved by an editor, named on the card, who declares no US party."),
        h("li", null, "Anyone a card is about may reply; the reply is published on the card."),
      ),
      h(
        "p",
        null,
        h("a", { href: "https://www.politifact.com/truth-o-meter/promises/maga-meter-tracking-donald-trumps-2024-promises/" }, "PolitiFact's MAGA-Meter"),
        " rates 75 of Donald Trump's 2024 campaign promises. This site files every promise by the President and the officials who speak for the Administration under the platform's twenty, as open data with a history that only grows. What every government has promised Ukraine is on ",
        h("a", { href: "https://ukraineledger.com" }, "UkraineLedger.com"),
        ".",
      ),
    ),
  });

  if (!PREVIEW) {
    const files = publishFiles({ config, views, today, actors: result.actors });
    for (const f of files) write(f.path, f.body);
    // The engine's sitemap lists the promise pages; ours lists the rest, and sitemap.xml points to both.
    const listed = new Set(sitemapEntries(views, config, today).map((e) => e.loc));
    const rest = pages.map((pg) => absolute(config, pg)).filter((u) => !listed.has(u) && !listed.has(u.replace(/\/$/, "")));
    write("/sitemap-pages.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rest.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`);
    write(
      "/sitemap.xml",
      `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[p.sitemap(), "/sitemap-pages.xml"].map((s) => `  <sitemap><loc>${absolute(config, s)}</loc></sitemap>`).join("\n")}\n</sitemapindex>\n`,
    );
  }
  write(
    "/robots.txt",
    PREVIEW
      ? "# A preview with drafts: never indexed.\nUser-agent: *\nDisallow: /\n"
      : `# ${name} is public open data: search engines and AI crawlers are welcome.\nUser-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /\n\nSitemap: ${absolute(config, "/sitemap.xml")}\n`,
  );

  // Share images, a few at a time.
  for (let i = 0; i < images.length; i += 8) await Promise.all(images.slice(i, i + 8).map(async ({ path, share }) => write(path, await shareImage(share))));

  const require = createRequire(import.meta.url);
  copyFileSync(require.resolve("@openpromises/react/styles.css"), join(OUT, "styles.css"));
  write("/tokens.css", tokensCss());
  // The mark (scripts/mark.ts): an SVG favicon that follows the reader's light or dark setting, a PNG for browsers
  // without SVG icons, and the home-screen icon.
  write("/favicon.svg", faviconSvg());
  write("/favicon-32.png", new Resvg(tileSvg(32, true)).render().asPng());
  write("/apple-touch-icon.png", new Resvg(tileSvg(180, false)).render().asPng());
  copyFileSync(join(ROOT, "scripts", "site.css"), join(OUT, "site.css"));
  for (const weight of [400, 600]) {
    const file = `source-serif-4-latin-${weight}-normal.woff2`;
    mkdirSync(join(OUT, "fonts"), { recursive: true });
    copyFileSync(require.resolve(`@fontsource/source-serif-4/files/${file}`), join(OUT, "fonts", file));
  }
  console.log(
    `Built ${views.length} ${PREVIEW ? "cards, drafts included" : "published cards"} (${platform.length} from a platform), ${result.actors.size} actors, ${coverage(config, views).length} areas, ${pages.length} pages and ${images.length} share images into ${PREVIEW ? "public-preview" : "public"}/ (${today}).`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
