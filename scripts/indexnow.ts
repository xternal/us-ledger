/**
 * IndexNow: tells Bing (which also feeds ChatGPT and Copilot search), Yandex, Seznam and Naver which pages changed,
 * so they fetch them again soon instead of on their own schedule. Run by .github/workflows/indexnow.yml after each
 * push to main: it waits until the live site serves the pushed commit (public/version.txt, written by the build),
 * then sends the pages whose sitemap lastmod is recent, and the home page.
 *
 * The key is public by design: IndexNow checks it at https://usledger.org/<key>.txt, which the build writes.
 *
 * Run: node scripts/indexnow.ts [--wait <commit>] [--days <n>] [--all] [--dry-run]
 */
export const INDEXNOW_KEY = "937160bc509e36e27ac79712c1b7deff";
const SITE = "https://usledger.org";
const ENDPOINT = "https://api.indexnow.org/indexnow";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};

/** Every <url> of a sitemap, or of the sitemaps a sitemap index names, with its lastmod if it has one. */
async function urls(sitemap: string): Promise<{ loc: string; lastmod?: string }[]> {
  const xml = await (await fetch(sitemap)).text();
  const children = [...xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  if (children.length) return (await Promise.all(children.map(urls))).flat();
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({ loc: /<loc>([^<]+)<\/loc>/.exec(m[1]!)![1]!, lastmod: /<lastmod>([^<]+)<\/lastmod>/.exec(m[1]!)?.[1] }));
}

async function main() {
  const commit = arg("--wait");
  if (commit) {
    // A deploy takes a few minutes; give up after 20, since a ping for the old pages is worth nothing.
    const until = Date.now() + 20 * 60_000;
    for (;;) {
      const live = (await fetch(`${SITE}/version.txt`, { cache: "no-store" }).then((r) => (r.ok ? r.text() : ""), () => "")).trim();
      if (live === commit) break;
      if (Date.now() > until) {
        console.log(`The live site still serves ${live || "an older build"}, not ${commit}: nothing sent.`);
        return;
      }
      await new Promise((r) => setTimeout(r, 20_000));
    }
  }
  const days = Number(arg("--days") ?? 3);
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const all = await urls(`${SITE}/sitemap.xml`);
  const changed = process.argv.includes("--all") ? all.map((u) => u.loc) : all.filter((u) => u.lastmod && u.lastmod >= since).map((u) => u.loc);
  const urlList = [...new Set([`${SITE}/`, ...changed])];
  if (process.argv.includes("--dry-run")) {
    console.log(urlList.join("\n"));
    return;
  }
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(SITE).host, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList }),
  });
  // 200 and 202 both mean accepted; anything else is printed and fails the job, so it shows in Actions.
  console.log(`IndexNow answered ${r.status} for ${urlList.length} ${urlList.length === 1 ? "page" : "pages"} changed since ${since}.`);
  if (r.status !== 200 && r.status !== 202) {
    console.error(await r.text());
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
