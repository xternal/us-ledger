import { defineConfig } from "@openpromises/core";

/**
 * USLedger.org on the OpenPromises engine (github.com/xternal/openpromises), started on 20 October 2026: what the
 * US President, the officials who speak for the Administration and the party leaders in Congress promise. The first site the engine runs from day
 * one rather than by migration; its sisters are LedgerGov.UK, BoroughBook.UK and RussiaLedger.com, and the rules
 * are the same.
 *
 * The areas are the twenty promises the 2024 Republican Platform, "Make America Great Again!", opens with, so the
 * yardstick is the platform's own, never ours, and every later promise is filed under the one it serves. Promise 8,
 * "RESTORE PEACE IN EUROPE", holds the commitments on the war in Ukraine, which no other tracker keeps by official
 * (README, "Why this site").
 *
 * `publish.tag` is fixed on the first deploy and never changes after, or every feed reader sees every entry again.
 */
export default defineConfig({
  site: {
    name: "USLedger.org",
    url: "https://usledger.org",
    description: {
      en: "What the US President, senior officials and the party leaders in Congress promise, filed under the 20 promises of the 2024 Republican Platform: the exact words, the deadline, the cost, and a timeline that moves only on evidence.",
    },
  },
  content: "content",
  // The speakers are in Washington, so "today", and with it every passed deadline, is taken there.
  timezone: "America/New_York",
  locales: { default: "en", all: ["en"] },
  // Costs are written as announced or scored (CBO, JCT): a total, with the years it covers in the note.
  money: { currency: "USD", unit: "bn", period: "total", qualities: ["sourced", "approx", "modelled"], costedBy: "required" },
  actors: {
    kinds: ["person", "party", "government", "legislature"],
    // Republicans hold the White House and both chambers of Congress as of 20 October 2026. The midterm elections
    // are on 3 November 2026: each party's `standing` is checked again once the new Congress meets.
    standing: "manual",
    // Who must deliver a promise is a body (the Administration, Congress), never a person or a party (decision 14).
    responsible: ["government", "legislature"],
    responsibleRequired: true,
    ids: { bioguide_id: "https://bioguide.congress.gov/search/bio/{id}" },
  },
  venues: ["platform", "campaign_rally", "debate", "interview", "speech", "press_conference", "social", "executive_order", "statement", "testimony"],
  areas: {
    kind: "enum",
    // The platform's twenty, in its order, then everything else. Labels are our neutral words for each; the
    // platform's own words are on its card. Every area shows on every person's page, empty ones included.
    values: [
      "border",
      "deportation",
      "inflation",
      "energy",
      "manufacturing",
      "taxes",
      "rights",
      "peace",
      "government",
      "crime",
      "cities",
      "military",
      "dollar",
      "social_security",
      "regulation",
      "schools",
      "sports",
      "campuses",
      "elections",
      "unity",
      "other",
    ],
    labels: {
      border: { en: "1. Seal the border" },
      deportation: { en: "2. Deportations" },
      inflation: { en: "3. Inflation and prices" },
      energy: { en: "4. Energy production" },
      manufacturing: { en: "5. Manufacturing" },
      taxes: { en: "6. Tax cuts and tips" },
      rights: { en: "7. Constitution and Bill of Rights" },
      peace: { en: "8. Peace in Europe and the Middle East, missile defense" },
      government: { en: "9. Government and political opponents" },
      crime: { en: "10. Crime, cartels and gangs" },
      cities: { en: "11. Cities, including Washington DC" },
      military: { en: "12. Military" },
      dollar: { en: "13. The dollar as reserve currency" },
      social_security: { en: "14. Social Security and Medicare" },
      regulation: { en: "15. Electric vehicles and regulation" },
      schools: { en: "16. School funding and teaching" },
      sports: { en: "17. Women's sports" },
      campuses: { en: "18. College campuses" },
      elections: { en: "19. Elections" },
      unity: { en: "20. Unity" },
      other: { en: "Not among the 20" },
    },
    // Published area URLs: never change a slug.
    slugs: {
      border: "1-border",
      deportation: "2-deportations",
      inflation: "3-inflation-prices",
      energy: "4-energy",
      manufacturing: "5-manufacturing",
      taxes: "6-tax-cuts-tips",
      rights: "7-constitution-rights",
      peace: "8-peace-missile-defense",
      government: "9-government",
      crime: "10-crime-cartels-gangs",
      cities: "11-cities",
      military: "12-military",
      dollar: "13-dollar",
      social_security: "14-social-security-medicare",
      regulation: "15-electric-vehicles-regulation",
      schools: "16-schools",
      sports: "17-womens-sports",
      campuses: "18-college-campuses",
      elections: "19-elections",
      unity: "20-unity",
      other: "other",
    },
  },
  ladder: "national",
  // One editor, who approves every card before it is published (decisions 22 and 27): a card about a sitting
  // President is where a mistake costs most, so publishing by checks alone is not used here. The editor declares
  // no US party, and never approves a card about their own party.
  editorial: { approvals: 1, publish: "approved", partyConflict: true },
  quotes: {
    archive: "optional",
    require: "editor",
    licences: [
      {
        hosts: ["whitehouse.gov", "state.gov", "defense.gov", "war.gov", "treasury.gov", "usmission.gov", "congress.gov", "govinfo.gov", "federalregister.gov", "senate.gov", "house.gov"],
        name: "US government work, public domain (17 U.S.C. § 105)",
      },
    ],
    otherLicence: "Quoted for reporting; rights stay with the publisher",
  },
  publish: {
    tag: "usledger.org,2026",
    feeds: "atom",
    licence: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
  },
});
