# How HandSift scores listings

How a listing becomes a badge, why each number is what it is, how accurate it is today, and the
rules for changing it. All numbers live in `packages/shared/src/config.ts`.

## Levels

| Level          | Meaning                                                                                   | Badge                                 |
| -------------- | ----------------------------------------------------------------------------------------- | ------------------------------------- |
| `disclosed_ai` | The seller's own text says AI was used. A fact.                                           | Solid "AI · disclosed"                |
| `likely_ai`    | No disclosure, but inference clues add up past the user's sensitivity threshold. A guess. | Outlined "Likely AI" ("may be wrong") |
| `unclear`      | Some clues, below the threshold (or evaluation failed).                                   | None                                  |
| `clean`        | No clues.                                                                                 | None                                  |

## Signals

| Signal                  | Kind       | Weight     | Fires when                                                                                                                                                                            |
| ----------------------- | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `descriptionDisclosure` | disclosure | 1          | Title, description, tags, or materials disclose AI ("AI generated", "made with Midjourney", ...). Bare "AI", negations ("no AI used"), and contrasts ("tired of AI art") don't count. |
| `designedBy`            | inference  | 0.25       | `who_made = someone_else` with a production partner. Also true for ordinary print-on-demand.                                                                                          |
| `shopHeuristics`        | inference  | up to 0.55 | Shop clues, each weak:                                                                                                                                                                |
|                         |            | 0.35       | shop under 180 days old with 300+ active listings                                                                                                                                     |
|                         |            | 0.15       | 90%+ of 50+ listings are digital downloads                                                                                                                                            |
|                         |            | 0.20       | under 0.1 sales per listing across 100+ listings                                                                                                                                      |

## Combining

- Any disclosure that hits makes the listing `disclosed_ai` (score 1), at every sensitivity.
- Otherwise inference weights combine as **1 − (1 − w₁)(1 − w₂)…** (shop clues first combine the
  same way, capped at 0.55). The score is compared with the user's sensitivity:

  | Sensitivity            | Likely-AI threshold |
  | ---------------------- | ------------------- |
  | Conservative (default) | 0.80                |
  | Balanced               | 0.60                |
  | Aggressive             | 0.40                |

- The level is re-derived at display time, so changing sensitivity never refetches anything.
- By design, no single inference clue reaches any threshold: `designedBy` alone is 0.25, all
  shop clues together are at most 0.55.

## Accuracy today (Oct 21, 2026)

From `pnpm eval` on 107 hand-labeled listings: 22 disclosed AI, 21 undisclosed AI, 32 clearly
handmade, 32 "tricky" human (print-on-demand, digital artists, vintage, photography, anti-AI
statements).

| Setting                       | Precision | Recall | Disclosed AI caught | Undisclosed AI caught | Humans wrongly flagged |
| ----------------------------- | --------- | ------ | ------------------- | --------------------- | ---------------------- |
| Conservative (0.80)           | 100%      | 51%    | 22 / 22             | 0 / 21                | 0 / 64                 |
| Balanced (0.60)               | 100%      | 51%    | 22 / 22             | 0 / 21                | 0 / 64                 |
| Aggressive (0.40)             | 100%      | 53%    | 22 / 22             | 1 / 21                | 0 / 64                 |
| (score ≥ 0.30, not a setting) | 100%      | 56%    | 22 / 22             | 2 / 21                | 0 / 64                 |
| (score ≥ 0.20, not a setting) | 91%       | 67%    | 22 / 22             | 7 / 21                | 3 / 64                 |

**Precision** = of the flagged listings, the share that are AI. **Recall** = of the AI listings,
the share flagged. 107 labels is still a small sample; read these as directions, not guarantees.

## What the numbers mean

- **Seller disclosures are handled well,** including disclosures buried in the description,
  tags, or materials, and anti-AI statements are correctly left alone.
- **Undisclosed AI is mostly invisible to HandSift today.** In the labels, 10 of 21 undisclosed
  AI listings trip no clue at all: normal-looking shops, no partner, no disclosure. The AI is in
  the photos (scribble text, fused objects, impossible structures), which HandSift doesn't look at.
  Of the rest, `designedBy` and the "mostly digital" shop clue fire just as often on human
  listings, so they can't separate the two.
- **Lowering thresholds trades artists for catches.** At 0.20, three human listings are flagged
  (print-on-demand art and a handmade mug sold with a production partner). That's the line
  HandSift doesn't cross.

## Known biases in the labels

- **No young human shops.** None of the 64 human labels comes from a shop under a year old (5
  are 1–2 years, 59 are older). Changes that target young shops (for example widening "new shop"
  from 180 days to a year) look free in the eval only because there are no honest young shops to
  get wrong.
- **Repeated shops.** Several undisclosed-AI labels come from the same few shops, so shop-level
  clues for those shops count more than once.
- **Category skew.** Undisclosed AI labels are crochet/sewing patterns and wall-art prints; other
  categories are untested.
- **Label sources.** Labels come from web research checked against the listing text through the
  API, and Daniel's own visual checks for undisclosed AI. Each row's note says which
  (`data/labels.csv`).

## Phase 9 decision (Oct 21, 2026): no changes

Conservative and Balanced already have 100% precision. The changes that would catch more
undisclosed AI on Aggressive (treating shops under a year as "new"; lowering Aggressive to 0.30:
4 of 21 instead of 1, 0 false flags in the labels) were **not** made, because the labels contain
no young honest shops to test them against. Revisit once the labels below exist.

## Rules for changing scoring

1. **Conservative and Balanced must keep 100% precision on the labels.** Aggressive may trade
   some precision for recall, but only with evidence, and disclosures must stay 100%.
2. **The labels must cover the listings a change affects.** A change to shop age needs young
   honest shops; a change to `designedBy` needs print-on-demand sellers; and so on.
3. **Prefer new evidence over looser thresholds.** Catching undisclosed AI needs a new kind of
   signal (e.g. the Phase 11 image check), not a lower bar for the clues we have.
4. **Use `pnpm eval --details`** to see every listing's features, and record each change here:
   date, what changed, before/after metrics.
5. **New signals or data sources change what the app does**: submit them to Etsy before shipping
   (see CLAUDE.md, Etsy API Terms compliance).

## Labels that would unlock tuning

- **~10–20 honest young shops** (under a year old), especially ones with big catalogs:
  print-on-demand, printables, new handmade shops that list a lot.
- **More undisclosed AI from different shops and categories** (not repeats of the same shops).
- **More tricky human listings with production partners** (print-on-demand shirts and mugs) and
  all-digital illustrators.
