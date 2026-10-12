# Evaluating HandSift's accuracy

`pnpm eval` measures how well HandSift's signals and scoring match hand labels.

## Run it

```sh
pnpm eval                              # through the staging Worker
pnpm eval --worker http://localhost:8787   # through a local `wrangler dev`
```

It reads `data/labels.csv`, fetches those listings through the Worker (about one Etsy call
per 100 listings; nothing is saved), runs the same signals and scoring the extension uses,
and prints:

- a table per rule: seller disclosures only, each sensitivity setting, and extra score
  cut-offs, with true/false positives and negatives, **precision**, and **recall**;
- the listings it got wrong at each sensitivity, with HandSift's reasons (wrongly flagged)
  or your label note (missed). These drive tuning in `docs/scoring.md` (Phase 9).

**Precision** = of the listings HandSift flags, the share that really are AI. **Recall** =
of the AI listings, the share HandSift flags. HandSift favors precision: wrongly flagging a
real artist is worse than missing an AI listing.

## Labeling

Add rows to `data/labels.csv`:

```csv
listing_id,label,source_of_label
1234567890,ai,manual review 2026-10-12: description says made with Midjourney
2345678901,human,manual review 2026-10-12: hand-thrown pottery, Made by
```

- `label` is `ai` or `human`; the last column says why (commas are fine).
- Only label listings you're confident about.
- Aim for **200+** labels with a realistic mix: disclosed AI, **undisclosed** AI (needed to
  measure recall), clear handmade, and tricky human listings (print-on-demand, digital
  artists, vintage, sellers with anti-AI statements), across shops of different sizes and
  ages.
- Keep notes short and in your own words. Brief references ("title says AI generated") are fine; don't paste whole descriptions, since the repo is public.
- Bad rows (malformed IDs, unknown labels, duplicates) make `pnpm eval` stop and list the
  line numbers. A test also checks the committed file is valid.
- Listings that disappear from Etsy are reported as "gone"; remove them from the file.
