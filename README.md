# USLedger.org

**What the US President and senior officials promise, filed under the 20 promises of the 2024 Republican Platform: the exact words, the deadline, the cost, and a timeline that moves only on evidence.**

The 2024 Republican Platform, "Make America Great Again!", opens with twenty promises "that we will accomplish very quickly when we win the White House and Republican Majorities in the House and Senate". Republicans won all three in November 2024. This site takes the platform at its word: the twenty are its areas, in the platform's order, so the yardstick is the platform's own, never ours. Every later promise by the President, the Vice President or the officials who speak for the Administration is filed under the one it serves, or under "Not among the 20".

It runs on [OpenPromises](https://github.com/xternal/openpromises) 0.14, the engine behind [LedgerGov.UK](https://ledgergov.uk), [BoroughBook.UK](https://boroughbook.uk) and [RussiaLedger.com](https://russialedger.com), with the same rules:

1. **Exact words.** A promise is what the speaker said, copied from the transcript, the order, the post or the platform, with a link to it. Opinions and insults are not promises.
2. **Evidence moves status.** Every step after "promised" links to its document: a signed order, a law, a budget line, an official statistic. A deadline that passes with no evidence of delivery is recorded automatically (`openpromises deadlines`).
3. **Nothing is rewritten.** A reworded promise or a moved deadline is a new version beside the old one. Our own mistakes are corrections, listed on the card.
4. **Numbers carry their source.** A cost is a range, with who made it (CBO, JCT, a department, a party or an independent modeller).
5. **One standard.** No rule, label or word depends on who made the promise. `openpromises lint` refuses judgement words in our own text; the platform's own words stay in its quotes.
6. **Every area, empty ones too.** Every person's page lists all twenty-one areas, so what has not been promised shows as plainly as what has.

## Why this site

Checked on 20 October 2026: [PolitiFact's MAGA-Meter](https://www.politifact.com/truth-o-meter/promises/maga-meter-tracking-donald-trumps-2024-promises/) rates 75 of Donald Trump's 2024 campaign promises. It has no open data, no record of how a rating changed, no costs, and no promises by the Vice President or the Cabinet. This site holds all of those, against the platform's own list. What every government has promised Ukraine is on [UkraineLedger.com](https://ukraineledger.com).

## Run it

Node 22.18 or later and pnpm 12.

```bash
pnpm install
pnpm validate        # every card, draft, actor and the editors list against format v1
pnpm lint:words      # judgement words in our own text
pnpm contrast        # every colour in scripts/palette.ts against WCAG AA
pnpm build           # the static site in public/, published cards only, with a share image for every page
pnpm preview         # the same with drafts, in public-preview/, never deployed
```

## Where things stand (20 October 2026)

- The twenty platform promises are approved by the editor and published. Each quote is matched character for character against a stored copy of the official PDF (`content/sources/rnc-2024-platform.txt`, a `source_text` span on every card), so the quote check passes by machine.
- Every card has a status with its evidence: 10 delivering, 2 funded, 1 legislated, 3 in plan and 4 unscoreable. No later promise by the President or an official is recorded yet.
- The home page leads with the twenty: a chart of how far each has climbed, then one entry each with the platform's words, its step and the latest dated evidence. Each person's page has the engine's key promises, timeline, promises by month and every area.
- Every page has its own title, description, canonical address and a 1200x630 share image drawn from its content (`scripts/share-image.ts`); `robots.txt` welcomes search and AI crawlers, with `sitemap.xml` and `llms.txt`.
- Not yet deployed: usledger.org does not resolve.
- Actors: the President, the Vice President, the Secretaries of State, Defense and the Treasury, the envoys and ambassadors, with their roles from official pages; the Republican and Democratic parties; the Administration and Congress as the bodies that deliver.

## Add a promise

```bash
pnpm exec openpromises new trump-example-2026 --actor donald-trump --made-on 2026-10-01 --venue speech --area energy
```

Fill in the exact words, the source, the deadline and the first event in `content/drafts/trump-example-2026.yaml` (the engine's [FORMAT.md](https://github.com/xternal/openpromises/blob/main/docs/FORMAT.md)), check the words at their source, then approve it:

```bash
pnpm exec openpromises review trump-example-2026 --by "Pavel Guzhikov"
```

On the approval the card moves from `drafts/` to `promises/` and is published on the next build. From then on its history only grows.

## Open decisions

- **Archived copies.** `quotes.archive` is `optional`. Posts and transcripts move or disappear; `required` would make every version carry an archived copy.
- **Standing after the midterms.** The midterm elections are on 3 November 2026. Each party's `standing` is checked again once the new Congress meets.
- **Address.** `.us` addresses need a US citizen, resident or entity (the usTLD nexus rules), so `.org` is used. `publish.tag` is fixed on the first deploy and never changes after.

## Licence

Code: [AGPL-3.0](LICENSE). Our writing (headlines, notes, events): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Quotes keep their own terms: US government works are in the public domain (17 U.S.C. § 105); every other source is quoted for reporting, and its rights stay with the publisher.

Made by [Pavel Guzhikov](https://guzh.uk).
