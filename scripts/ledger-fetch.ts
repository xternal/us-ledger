/**
 * Fetches the money in and out of the federal government from the Treasury's own open data, from fiscal year 2018
 * to the latest month, into data/ledger.json, which the build reads (scripts/ledger.ts). Nothing is estimated: every
 * figure is a line of the Monthly Treasury Statement as the Bureau of the Fiscal Service published it.
 *
 * - Receipts by source and outlays by function: MTS Table 9, from the September statement of each fiscal year (the
 *   year's total), and from the latest statement for a year still running ("October to <month>").
 * - Customs duties month by month (the same table), since tariffs are what several promises on this site are about.
 * - Debt: Debt to the Penny, the last business day of each fiscal year, and the latest day.
 *
 * Run: node scripts/ledger-fetch.ts (pnpm ledger:fetch). The data is committed, so a build never depends on the API;
 * run it again after each month's statement (published on the eighth business day) and commit what changed.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const API = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service";
const MTS9 = `${API}/v1/accounting/mts/mts_table_9`;
const DEBT = `${API}/v2/accounting/od/debt_to_penny`;
export const FIRST_YEAR = 2018;

interface Row {
  record_date: string;
  classification_desc: string;
  current_fytd_rcpt_outly_amt: string;
  sequence_level_nbr: string;
  parent_id: string;
  classification_id: string;
  src_line_nbr: string;
}

async function get<T>(url: string, onePage = true): Promise<T[]> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  const body = (await res.json()) as { data: T[]; meta: { "total-pages": number } };
  if (onePage && body.meta["total-pages"] > 1) throw new Error(`more than one page from ${url}`);
  return body.data;
}

/** Table 9 for one statement date, as { line name: dollars }, receipts and outlays apart (a name can repeat: "Total"). */
async function statement(date: string) {
  const url = `${MTS9}?filter=record_date:eq:${date}&page[size]=200&sort=src_line_nbr`;
  const rows = await get<Row>(url);
  if (!rows.length) return null;
  const heads = new Map(rows.filter((r) => r.sequence_level_nbr === "1").map((r) => [r.classification_id, r.classification_desc]));
  const parentOf = new Map(rows.map((r) => [r.classification_id, r.parent_id]));
  const section = (r: Row): string | undefined => {
    let id: string | undefined = r.parent_id;
    while (id && id !== "null" && !heads.has(id)) id = parentOf.get(id);
    return id ? heads.get(id) : undefined;
  };
  const receipts: Record<string, number> = {};
  const outlays: Record<string, number> = {};
  for (const r of rows) {
    if (r.current_fytd_rcpt_outly_amt === "null") continue;
    const s = section(r);
    const into = s === "Receipts" ? receipts : s === "Net Outlays" ? outlays : null;
    if (!into) throw new Error(`${date}: "${r.classification_desc}" is under "${s}", neither receipts nor outlays`);
    into[r.classification_desc.replace(/:$/, "")] = Number(r.current_fytd_rcpt_outly_amt);
  }
  return { url, receipts, outlays };
}

async function main() {
  const latest = (await get<{ record_date: string }>(`${MTS9}?fields=record_date&sort=-record_date&page[size]=1`, false))[0]!.record_date;
  const [ly, lm] = latest.split("-").map(Number) as [number, number];
  const lastFy = lm >= 10 ? ly + 1 : ly;
  const debtRows = await get<{ record_date: string; tot_pub_debt_out_amt: string; debt_held_public_amt: string }>(
    `${DEBT}?filter=record_date:gte:${FIRST_YEAR - 1}-09-01&fields=record_date,tot_pub_debt_out_amt,debt_held_public_amt&sort=record_date&page[size]=10000`,
  );
  const debtOn = (until: string) => {
    const r = debtRows.filter((d) => d.record_date <= until).at(-1)!;
    return { date: r.record_date, total: Number(r.tot_pub_debt_out_amt), public: Number(r.debt_held_public_amt) };
  };
  const years = [];
  for (let fy = FIRST_YEAR; fy <= lastFy; fy++) {
    const complete = fy < lastFy || lm === 9;
    const through = complete ? `${fy}-09-30` : latest;
    const s = await statement(through);
    if (!s) throw new Error(`no Table 9 for ${through}`);
    years.push({ fy, through, complete, statement: s.url, receipts: s.receipts, outlays: s.outlays, debt: debtOn(through) });
  }
  const customs = (
    await get<{ record_date: string; current_month_rcpt_outly_amt: string }>(
      `${MTS9}?filter=record_date:gte:${FIRST_YEAR - 1}-10-01,classification_desc:eq:Customs Duties&fields=record_date,current_month_rcpt_outly_amt&sort=record_date&page[size]=1000`,
    )
  ).map((r) => ({ month: r.record_date.slice(0, 7), amount: Number(r.current_month_rcpt_outly_amt) }));
  const last = debtRows.at(-1)!;
  const out = {
    note: "Written by scripts/ledger-fetch.ts from the Treasury's Fiscal Data API. Dollars, as published.",
    fetched_on: new Date().toISOString().slice(0, 10),
    sources: {
      mts: {
        title: "Monthly Treasury Statement, Table 9: Summary of Receipts by Source, and Outlays by Function of the U.S. Government",
        publisher: "Bureau of the Fiscal Service, US Department of the Treasury",
        url: "https://fiscaldata.treasury.gov/datasets/monthly-treasury-statement/",
        api: MTS9,
      },
      debt: {
        title: "Debt to the Penny",
        publisher: "Bureau of the Fiscal Service, US Department of the Treasury",
        url: "https://fiscaldata.treasury.gov/datasets/debt-to-the-penny/",
        api: DEBT,
      },
    },
    latest_statement: latest,
    debt_now: { date: last.record_date, total: Number(last.tot_pub_debt_out_amt), public: Number(last.debt_held_public_amt) },
    years,
    customs_by_month: customs,
  };
  writeFileSync(join(ROOT, "data", "ledger.json"), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Ledger: fiscal years ${FIRST_YEAR} to ${lastFy} (latest statement ${latest}), debt to ${last.record_date}, into data/ledger.json.`);
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
