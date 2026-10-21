// Measures HandSift's accuracy on the hand-labeled listings in data/labels.csv.
// Fetches them through the Worker (the same path the extension uses; nothing is saved),
// runs the real signals and scoring, and prints precision/recall per threshold plus the
// listings it got wrong.
//
//   pnpm eval                  # uses the staging Worker (apps/extension/.env.staging)
//   pnpm eval --worker <url>   # any Worker, e.g. http://localhost:8787
//   pnpm eval --details        # also print every listing's features (for tuning)

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LIKELY_AI_THRESHOLDS, type Sensitivity } from "@handsift/shared";
import { createWorkerSource } from "../apps/extension/src/adapters/source/workerSource";
import { listingFeatures, type ListingFeatures } from "../apps/extension/src/core/eval/features";
import { parseLabels, type LabelRow } from "../apps/extension/src/core/eval/labels";
import {
  confusion,
  disclosedOnly,
  flaggedAtScore,
  precision,
  recall,
  type FlagRule,
  type LabeledVerdict,
} from "../apps/extension/src/core/eval/metrics";
import { score } from "../apps/extension/src/core/scoring/score";
import { SIGNALS } from "../apps/extension/src/core/signals";

const REPO_ROOT = join(import.meta.dirname, "..");
const SENSITIVITIES: Sensitivity[] = ["conservative", "balanced", "aggressive"];
const EXTRA_THRESHOLDS = [0.2, 0.3, 0.5, 0.7, 0.9];
const RELIABLE_LABEL_COUNT = 200;

async function readLabels(): Promise<LabelRow[]> {
  const { rows, errors } = parseLabels(await readFile(join(REPO_ROOT, "data/labels.csv"), "utf8"));
  if (errors.length > 0) throw new Error(`Fix data/labels.csv first:\n  ${errors.join("\n  ")}`);
  return rows;
}

async function workerUrl(): Promise<string> {
  const flag = process.argv.indexOf("--worker");
  const fromFlag = flag === -1 ? undefined : process.argv[flag + 1];
  if (fromFlag) return fromFlag;
  const env = await readFile(join(REPO_ROOT, "apps/extension/.env.staging"), "utf8");
  const match = /^WXT_WORKER_URL=(.+)$/m.exec(env);
  if (!match?.[1]) throw new Error("No Worker URL: pass --worker <url>");
  return match[1].trim();
}

function pct(n: number | null): string {
  return n === null ? "n/a" : `${(n * 100).toFixed(0)}%`;
}

function printTable(items: LabeledVerdict[], rules: { name: string; rule: FlagRule }[]): void {
  const header = ["Rule", "Flagged", "TP", "FP", "FN", "TN", "Precision", "Recall"];
  const rows = rules.map(({ name, rule }) => {
    const c = confusion(items, rule);
    return [
      name,
      String(c.tp + c.fp),
      String(c.tp),
      String(c.fp),
      String(c.fn),
      String(c.tn),
      pct(precision(c)),
      pct(recall(c)),
    ];
  });
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const format = (cells: string[]) =>
    cells
      .map((c, i) => (i === 0 ? c.padEnd(widths[i] ?? 0) : c.padStart(widths[i] ?? 0)))
      .join("  ");
  console.log(format(header));
  for (const row of rows) console.log(format(row));
}

type Item = LabeledVerdict & { id: string; features: ListingFeatures };

/** One row per listing, grouped by label and whether the seller disclosed AI, highest score first. */
function printDetails(items: Item[]): void {
  const group = (i: Item) =>
    i.label === "human" ? "human" : i.features.disclosed ? "ai-disclosed" : "ai-undisclosed";
  const num = (n: number | null, digits = 0) => (n === null ? "-" : n.toFixed(digits));
  const header = [
    "group",
    "id",
    "score",
    "clues",
    "shopDays",
    "listings",
    "digital",
    "sales/lst",
    "whoMade",
    "partner",
    "type",
  ];
  const rows = [...items]
    .sort((a, b) => group(a).localeCompare(group(b)) || b.verdict.score - a.verdict.score)
    .map((i) => {
      const f = i.features;
      return [
        group(i),
        i.id,
        f.score.toFixed(2),
        f.clues.join("+") || "-",
        num(f.shopAgeDays),
        num(f.activeListings),
        f.digitalShare === null ? "-" : `${(f.digitalShare * 100).toFixed(0)}%`,
        num(f.salesPerListing, 2),
        f.whoMade ?? "-",
        f.productionPartner ? "yes" : "",
        f.listingType,
      ];
    });
  const widths = header.map((h, c) => Math.max(h.length, ...rows.map((r) => (r[c] ?? "").length)));
  console.log("\nPer-listing details:");
  for (const row of [header, ...rows])
    console.log(row.map((c, k) => c.padEnd(widths[k] ?? 0)).join("  "));
}

async function main(): Promise<void> {
  const labels = await readLabels();
  const baseUrl = await workerUrl();
  const byId = new Map(labels.map((l) => [l.id, l]));
  const counts = {
    ai: labels.filter((l) => l.label === "ai").length,
    human: labels.filter((l) => l.label === "human").length,
  };
  console.log(
    `Labels: ${String(labels.length)} (${String(counts.ai)} ai, ${String(counts.human)} human)  Worker: ${baseUrl}`,
  );

  const source = createWorkerSource({ baseUrl, version: "eval" });
  const lookup = await source.getListings(labels.map((l) => l.id));
  const items: Item[] = lookup.results.flatMap((result) => {
    const { listing, shop, fetchedAt } = result;
    const row = byId.get(listing.listingId);
    if (!row) return [];
    const input = shop ? { listing, shop, fetchedAt } : { listing, fetchedAt };
    const signals = SIGNALS.map((s) => s.evaluate(input));
    const verdict = score({ listing, signals, checkedAt: fetchedAt });
    return [
      {
        id: row.id,
        label: row.label,
        verdict,
        features: listingFeatures(result, signals, verdict),
      },
    ];
  });
  console.log(
    `Evaluated: ${String(items.length)}` +
      (lookup.missing.length > 0
        ? `  Gone from Etsy (remove from labels): ${lookup.missing.join(", ")}`
        : "") +
      (lookup.unavailable.length > 0
        ? `  Couldn't fetch (try again): ${String(lookup.unavailable.length)}`
        : ""),
  );
  if (labels.length < RELIABLE_LABEL_COUNT) {
    console.log(
      `Note: only ${String(labels.length)} labels; these numbers aren't reliable yet (aim for ${String(RELIABLE_LABEL_COUNT)}+).`,
    );
  }
  console.log();

  printTable(items, [
    { name: "disclosed only", rule: disclosedOnly },
    ...SENSITIVITIES.map((s) => ({
      name: `${s} (≥${LIKELY_AI_THRESHOLDS[s].toFixed(2)})`,
      rule: flaggedAtScore(LIKELY_AI_THRESHOLDS[s]),
    })),
    ...EXTRA_THRESHOLDS.map((t) => ({ name: `score ≥${t.toFixed(2)}`, rule: flaggedAtScore(t) })),
  ]);

  for (const s of SENSITIVITIES) {
    const flagged = flaggedAtScore(LIKELY_AI_THRESHOLDS[s]);
    const wrong = items.filter((i) => flagged(i.verdict) && i.label === "human");
    const missed = items.filter((i) => !flagged(i.verdict) && i.label === "ai");
    if (wrong.length === 0 && missed.length === 0) continue;
    console.log(`\nMistakes at ${s}:`);
    for (const i of wrong) {
      console.log(
        `  WRONGLY FLAGGED ${i.id} (score ${i.verdict.score.toFixed(2)}): ${i.verdict.reasons.join(" | ")}`,
      );
    }
    for (const i of missed) {
      console.log(
        `  MISSED ${i.id} (score ${i.verdict.score.toFixed(2)}): label note: ${byId.get(i.id)?.note ?? ""}`,
      );
    }
  }

  if (process.argv.includes("--details")) printDetails(items);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
