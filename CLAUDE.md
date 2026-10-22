# HandSift: Project Plan

**Name:** HandSift
**Chrome Web Store title:** HandSift: AI Filter for Etsy
**Package/repo name:** `handsift`

## How to use this file (for Claude Code)

- Work **one phase at a time**. At the end of each phase: run lint, typecheck, and tests, make the final commit, then stop and give me a short summary of what changed and anything I need to do manually.
- **Commit in small, logical steps as you go** (e.g. one commit per package, module, or feature), not one big commit per phase. Each commit should be coherent on its own and have a clear message.
- Follow the **Code Architecture Rules** below strictly. If a change would break a rule, stop and ask instead of working around it.
- Ask before adding any dependency not listed in the Tech Stack section.
- Never guess Etsy API response shapes. Base every schema and type on real responses saved locally in `fixtures/real/` (gitignored). Committed test fixtures in `fixtures/synthetic/` copy the real shape with made-up content.
- **Only commit what the project needs:** source, config, the lockfile, docs, and synthetic fixtures. Never commit real Etsy data (API JSON or saved pages), build output, generated files, or secrets. Delete a folder's `.gitkeep` once a real file lands in it.
- Follow the **Etsy API Terms compliance** section below. If a feature would conflict with it, stop and ask.
- **Never put the Etsy API key in the extension or the repo.** It lives only as a Cloudflare Worker secret.
- Prioritize **precision over recall**. Falsely flagging a real handmade artist is worse than missing an AI listing.
- Commit messages must not include a `Co-Authored-By: Claude` trailer or any other Claude attribution.

---

## What we're building

A Chrome extension (Manifest V3) for Etsy shoppers that flags, blurs, or hides AI-generated listings in search results and shop pages.

Etsy requires sellers to disclose AI use (AI checkbox, "Designed by" instead of "Made by", and a note in the description), but enforcement is weak. So the extension:

1. Reliably reads honest disclosures.
2. Uses extra signals (shop heuristics, optional image classifier) to catch undisclosed ones.
3. Always explains **why** something was flagged.

Listing and shop data comes from the **official Etsy Open API v3**, through a Cloudflare Worker that holds the API key and caches results. The extension only reads listing IDs from the page; it never scrapes listing HTML.

Etsy is the first **site adapter**. The architecture must make adding Pinterest or Google Images later a matter of adding a new adapter, not rewriting the core.

---

## Tech stack

| Layer | Tool |
|---|---|
| Repo | pnpm workspaces monorepo: `apps/extension`, `apps/worker`, `packages/shared` |
| Extension framework | WXT (Manifest V3, Vite-based) |
| Language | TypeScript (strict mode) everywhere, including config files |
| Shared contracts | Zod schemas + inferred types in `packages/shared`, used by both apps |
| UI (popup + badges) | React (via `@wxt-dev/module-react`), badges rendered inside Shadow DOM |
| Page observation | MutationObserver + `visibilitychange` (whole page per batch; see Scaling plan) |
| Data source | Etsy Open API v3 (public listing + shop endpoints, `x-api-key` auth) |
| API proxy + shared cache | Cloudflare Workers (Wrangler) + D1 shared cache (Phase 10). Per-listing Cache API layer dropped Oct 2026 (free-plan subrequest limit; see Scaling plan) |
| Shared database | Cloudflare D1 (SQLite), raw SQL with bound parameters, migrations via `wrangler d1 migrations` |
| Request batching/throttling | p-limit in the extension, Etsy's batch listings endpoint (100 IDs per call) |
| Scripts | TypeScript run with jiti (`scripts/`) |
| Local database | IndexedDB via Dexie |
| Settings | chrome.storage.sync |
| Image classifier (stretch) | transformers.js in an offscreen document |
| Unit tests | Vitest (extension, shared) + Vitest with Cloudflare's Workers test pool (worker); jsdom for DOM tests; fake-indexeddb for Dexie tests; Testing Library (+ user-event) for React components |
| E2E tests | Playwright with the extension loaded (Chromium, mock Worker; `pnpm test:e2e`, runs in CI) |
| Architecture enforcement | dependency-cruiser (import boundary rules, run in CI) |
| CI/CD | GitHub Actions: CI on every push/PR, Worker deploys via `cloudflare/wrangler-action`, Chrome Web Store submission via `wxt submit` |
| Lint/format | ESLint + Prettier |
| Error monitoring (later, optional) | Sentry free tier |

---

## Code Architecture Rules

### Layers and dependency direction
Imports only flow **downward**. A layer never imports from a layer above it.

```
ui / entrypoints        (React components, content script, service worker, popup)
      │
adapters                (site adapters, API client, Dexie storage, chrome.* wrappers)
      │
core                    (signals, scoring, pipeline orchestration)  ← pure TypeScript
      │
packages/shared         (Zod schemas, types, message contracts, constants)
```

- **`core/` is pure.** No `chrome.*`, no `fetch`, no DOM, no Dexie. It receives data and returns data. This makes it trivially unit-testable and reusable (the eval script runs it directly in Node).
- **Only adapters touch the outside world** (DOM, network, storage, browser APIs).
- **Entrypoints are thin.** `background.ts` and `content.ts` wire things together; no business logic in them.
- These rules are enforced by **dependency-cruiser in CI**, so a bad import fails the build.

### Interfaces (the plug-in points)

```ts
// A site the extension runs on. Etsy now, Pinterest/Google Images later.
interface SiteAdapter {
  id: "etsy";
  matches(url: URL): boolean;
  findItemElements(root: ParentNode): Element[];
  extractItemId(el: Element): string | null;
  mountBadge(el: Element): HTMLElement;   // returns a Shadow DOM host
  unmountBadge(el: Element): void;
  setItemDisplay(el: Element, display: "visible" | "blurred" | "hidden"): void;  // site-specific blur/hide
}

// Where item data comes from (Etsy API via Worker now; could be another source later).
// Shops arrive with their listings (no getShop). Never rejects: failures are "unavailable".
interface ItemSource {
  getListings(ids: readonly string[]): Promise<{
    results: { listing: ListingData; shop: ShopData | null; fetchedAt: number }[];
    missing: string[];       // don't exist on Etsy
    unavailable: string[];   // couldn't be checked right now
  }>;
}

// One detection signal. Adding a signal = one new file + register it. Scoring never changes.
interface SignalModule {
  id: string;
  kind: "disclosure" | "inference";   // seller said so (fact) vs a clue (guess)
  defaultWeight: number;
  evaluate(input: SignalInput): Signal;   // pure, synchronous where possible
}

// Persistence for verdicts and shop data.
interface VerdictStore {
  get(ids: string[]): Promise<Map<string, Verdict>>;
  put(verdicts: Verdict[]): Promise<void>;
  clear(): Promise<void>;
}
```

- Signals live in a **registry array** (`core/signals/index.ts`). Scoring loops over the registry.
- The pipeline depends on interfaces, not concrete classes, so tests use fakes (in-memory store, fake source).

### Conventions
- **One responsibility per file.** Aim for files under ~200 lines; split when a file does two things.
- **Named exports only**, no default exports.
- **No `any`.** Validate all external data (API responses, messages, storage reads) with Zod at the boundary; trust types inside.
- **All tunables in one place:** weights, thresholds, TTLs, batch sizes, concurrency live in `packages/shared/src/config.ts`.
- **All DOM selectors live inside their site adapter**, nowhere else.
- **Errors:** adapters catch and log; core never throws on bad data, it returns an `unclear` verdict. A failure must never produce a wrong badge.
- **Tests sit next to the code they test** (`foo.ts` + `foo.test.ts`), fixtures in `/fixtures`.

---

## Architecture

```
Etsy page
  └─ Content script (entrypoint)
       - uses EtsyAdapter to find cards + extract listing IDs (every card on the page, once the tab is visible)
       - sends IDs to service worker, mounts badges from verdicts
            │  typed messages (packages/shared/messages)
            ▼
Service worker (entrypoint)
  - pipeline (core): check VerdictStore -> fetch missing via ItemSource -> run signals -> score -> store
            │
            ▼
Cloudflare Worker
  - holds Etsy API key as a secret
  - GET /v1/listings?ids=...  -> batched Etsy lookup; each listing comes with its shop
  - GET /health               -> unversioned liveness check (smoke tests)
  - cache layer: D1 (Phase 10) -> Etsy
  - per-IP rate limiting (primary abuse defense), input validation,
    origin check (filters casual misuse only, NOT a security boundary)
  - structured JSON logs (Workers Logs)
            │
            ▼
Etsy Open API v3
```

### File structure

```
apps/
  extension/
    src/
      entrypoints/
        background.ts            # wiring only
        content.ts               # wiring only
        popup/                   # settings UI
        onboarding/              # first-run page: terms + privacy consent
        offscreen/               # stretch: classifier
      adapters/
        sites/
          etsy/
            etsyAdapter.ts       # implements SiteAdapter
            selectors.ts         # Etsy DOM selectors (only place they exist)
        page/
          observePageItems.ts    # reports every card on a visible page, site agnostic
        source/
          workerSource.ts        # implements ItemSource, calls the Worker
          loggingSource.ts       # logs fetched listing data (dev visibility)
        storage/
          memoryStore.ts         # in-memory VerdictStore (tests)
          dexieStore.ts          # implements VerdictStore
          settings.ts            # chrome.storage.sync wrapper
        messaging/
          bus.ts                 # typed chrome.runtime messaging wrapper
        browser/
          onboardingTab.ts       # opens the welcome page
      core/
        pipeline.ts              # orchestration, depends only on interfaces
        batchQueue.ts            # batches visible listing IDs
        consent.ts               # terms accepted? (nothing runs until they are)
        text.ts                  # text normalization helpers for signals
        eval/                    # metrics + labels parser for scripts/eval.ts (not shipped)
        signals/
          index.ts               # registry
          descriptionDisclosure.ts
          disclosurePatterns.ts  # phrase + negation patterns
          designedBy.ts
          shopHeuristics.ts
          imageClassifier.ts     # stretch
        scoring/
          scorer.ts              # Scorer type
          score.ts               # signals -> verdict + reasons
          levels.ts              # level for a score/sensitivity; display-time level
      ui/
        badge/                   # Badge.tsx, Tooltip.tsx, badge.css, renderBadge.tsx (Shadow DOM)
        popup/                   # Popup.tsx, ChoiceGroup.tsx, popup.css
        onboarding/              # Onboarding.tsx, onboarding.css
        legal.ts                 # Etsy's required notice
        pageController.ts        # applies verdicts + settings to cards (badges, blur, hide)
        contentApp.ts            # content script logic (entrypoint stays wiring only)
    e2e/                         # Playwright: fixtures, mock Worker, *.e2e.ts
    public/icon/                 # 16/32/48/128 PNGs exported from branding/logo.svg
    scripts/renderIcons.ts       # `pnpm --filter @handsift/extension icons`: exports the logo
  worker/
    src/
      index.ts                   # entry, wiring only
      wiring.ts                  # builds per-request deps from bindings (subrequest budget test)
      router.ts
      responses.ts               # typed error responses
      handlers/
        listings.ts
        health.ts
      etsy/
        etsyClient.ts            # only file that talks to Etsy
        coalesce.ts              # concurrent lookups for the same ID share one Etsy call
        budgetGuard.ts           # cache-only mode when Etsy's daily quota runs low
      cache/
        cache.ts                 # cache interface
        d1Cache.ts               # D1 impl (Phase 10)
        layeredCache.ts          # layers in order (D1 today; room for a faster layer later)
      middleware/
        rateLimit.ts
        validate.ts
        origin.ts
      log.ts                     # structured JSON logger
      cron/
        cleanup.ts               # deletes expired D1 rows (Phase 10)
    migrations/                  # D1 SQL migrations, numbered
    wrangler.toml
packages/
  shared/
    src/
      schemas/                   # Zod: listing, shop, verdict, signal, raw Etsy
      etsy/                      # raw Etsy -> ListingData/ShopData (used by Worker, tests, eval)
      messages.ts                # extension message contracts
      api.ts                     # Worker request/response contracts
      config.ts                  # all tunables
      interfaces.ts              # SiteAdapter, ItemSource, SignalModule, VerdictStore
branding/
  logo.svg                       # logo source of truth (teal #0F766E, sparkle #FDE68A)
fixtures/
  real/                          # gitignored: raw Etsy JSON + saved pages, local only
    listings/  shops/  search-pages/
  synthetic/                     # committed: same shape as real, made-up content
site/                            # GitHub Pages: landing page, privacy.html, terms.html (plain HTML)
scripts/
  fetch-fixtures.ts
  eval.ts                        # pnpm eval: runs core/ in Node on data/labels.csv
data/
  labels.csv
docs/
.github/workflows/
  ci.yml
  deploy-staging.yml
  pages.yml                      # publishes site/ to GitHub Pages
  release.yml
.dependency-cruiser.ts
```

### Core types (defined as Zod schemas in `packages/shared`)

```ts
type ListingData = {
  listingId: string;
  shopId: string;
  title: string;
  description: string;          // HTML entities decoded
  tags: string[];
  materials: string[];
  whoMade: string | null;       // "i_did" | "someone_else" | "collective"
  listingType: string;          // "physical" | "download" | "both"
  hasProductionPartner: boolean;
};
// No AI flag: Etsy's API doesn't expose the AI checkbox (Phase 1 finding).

type ShopData = {
  shopId: string;
  createdAt: number;            // ms
  activeListingCount: number;
  digitalListingCount: number;
  salesCount: number;
};

type Signal = { id: string; kind: "disclosure" | "inference"; weight: number; hit: boolean; reason: string };

type Verdict = {
  listingId: string;
  level: "disclosed_ai" | "likely_ai" | "unclear" | "clean";
  score: number;              // 0 to 1
  reasons: string[];
  checkedAt: number;
};
```

`disclosed_ai` must stay separate from inferred levels. "The seller said so" is a fact; "likely AI" is a guess, and the UI should show the difference.

---

## Scaling plan

The Worker itself scales automatically; the real bottleneck is **Etsy's API quota**, since every user shares one API key. So the design minimizes Etsy calls at every layer:

1. **Client cache (Dexie):** a user doesn't re-fetch a listing checked within the last **6 hours** (Etsy's freshness limit for listing content; see Etsy API Terms compliance).
2. **Batching:** one Worker request per page of listings (up to 100), not per listing or per visible row. Etsy charges per call, not per listing, so requesting the whole page at once costs 1 call instead of ~15-20 (found in Phase 4 testing). Hidden tabs request nothing until shown.
3. **Worker edge cache (Cache API): dropped Oct 20, 2026; kept in mind for later.** Cloudflare's free plan allows **50 subrequests per request**, and Cache API *and* D1 calls count. The edge cache needed one Cache API call per listing, so a 52-listing request used up the budget and the Etsy call was refused (found by `pnpm eval`; the local test simulator doesn't enforce the limit). Lookups now go D1 -> Etsy (~4 subrequests for 100 listings), guarded by a budget test in `apps/worker/src/wiring.test.ts`. **Bring it back** (code in git history at `48b743f`, `apps/worker/src/cache/edgeCache.ts`) only if: we move to Workers Paid (10,000 subrequests, 1,000 Cache API calls per request), or we cache **one entry per whole page** (1 read + 1 write). Add it as a layer in front of D1 in `wiring.ts`; handlers don't change. Note: on staging (`*.workers.dev`) the Cache API did serve hits, though Cloudflare only documents it for custom domains.
4. **Shared global cache (Phase 10, D1):** once one user checks a listing or shop, every user gets it free. Lookup order is D1 (global) -> Etsy. Free plan: 5M D1 rows read/day, roughly 50,000 full-page lookups. D1 stores **only the normalized fields the signals need (not raw Etsy JSON, not verdicts)**, so tuning scoring never requires refetching, Etsy's minimum-data rule is respected, and no user data is ever stored. Entries expire within Etsy's freshness limits (6 h listings, 24 h shops).
5. **Graceful degradation:** if Etsy returns 429 or errors, the Worker still returns what it has cached and lists the other IDs as `unavailable`; the extension shows nothing new for those (cached verdicts still display) and backs off. Never a wrong badge.
6. **Global Etsy budget guard (done, Phase 12):** per-IP limits don't stop abuse spread across many IPs, so once `x-remaining-today` drops below `ETSY_DAILY_RESERVE` (500), or Etsy answers 429, the Worker goes cache-only and re-probes every 15 minutes (`apps/worker/src/etsy/budgetGuard.ts`). State is per Worker instance.
7. **When to add a queue (not needed yet):** lookups are interactive, so overload is handled by shedding load (cached results + `unavailable`, client backs off), not queuing. The extension's batching (Phase 4) and request coalescing (Phase 10) cover current scale. Add more only when Worker logs show the need:
   - frequent `etsy_rate_limited` outcomes: a **Durable Object** as a global pacer keeping all Etsy calls under 5/s (today each Worker instance acts alone);
   - daily quota running low: the same Durable Object **merging IDs from many users' requests into one 100-ID Etsy call**;
   - popular listings repeatedly expiring: **Cloudflare Queues** to refresh them in the background.
   All of these slot in behind `etsyClient` and the cache interface; handlers don't change.

---

## Security, versioning, and observability

### Abuse model: the Worker is a public endpoint
- An extension **cannot prove its identity**. The `Origin` header and extension ID are trivially spoofed by any script, so anyone can call the Worker directly and burn the shared Etsy quota.
- The **origin check is not security**. It only filters casual misuse (random web pages calling the Worker from a browser). Never rely on it for anything.
- **Per-IP rate limiting is the actual defense and is required**, not optional. Use Cloudflare's Workers Rate Limiting binding (`[[ratelimits]]` in `wrangler.toml`), keyed on `CF-Connecting-IP`. The limit (currently 30 requests/minute per IP, per Cloudflare location) lives in `wrangler.toml`, the one exception to "all tunables in `config.ts`", because Cloudflare reads it from there. It is **soft**: Cloudflare's limiter is eventually consistent, and on staging 429s only began after about 140 requests in a minute. It blunts sustained abuse but is not a strict cap, which is why the global Etsy budget guard (Scaling plan) matters.
- **Strict input validation** before anything reaches Etsy: ID format (numeric strings only), max IDs per request, reject unknown query params. Never forward unvalidated input to Etsy.
- **The shared cache is also a defense**: repeated requests for the same IDs (abusive or not) are served from cache and never reach Etsy.
- Over-limit requests get `429` with a typed error body; the extension treats it like an Etsy 429 (show nothing new, never a wrong badge).

### API versioning
- Installed extensions keep running old versions after the Worker updates, so **all API routes are prefixed `/v1/`**. `/health` stays unversioned.
- A breaking change to a request or response shape means a new `/v2/` route; `/v1/` keeps working until logs show old extension versions are negligible.
- Request/response contracts in `packages/shared/src/api.ts` are versioned to match (e.g. `V1ListingsResponse`).
- The extension sends its version in an `X-HandSift-Version` header so logs show which versions are still live.

### Observability
- Enable Workers Logs (`[observability] enabled = true` in `wrangler.toml`).
- `log.ts` emits **structured JSON** (one object per event): route, status, latency, cache layer hit (D1 / miss), Etsy calls made, Etsy 429s, our own rate-limit rejections, extension version, errors.
- **Never log raw IPs, full URLs with user data, or the API key.** Rate limiting may use the IP; logs must not store it. This keeps the privacy policy honest.

---

## Etsy API Terms compliance

From Etsy's API Terms of Use (last updated Aug 18, 2026). Record details and any later changes in `docs/etsy-api.md`.

- **Browser-extension authorization (Section 5): granted in writing (Oct 2026)**, including public distribution, for the app as described to Etsy (disclosed / possibly-AI labels with reasons, label / blur / hide). Details in `docs/etsy-api.md`.
- **Machine learning / analytics (Section 5): granted in writing (Oct 2026)** for the on-device image check (Phase 11) and accuracy eval (Phase 8).
- Anything beyond what Etsy approved (new data sources, new modes, materially different behavior) goes to Etsy before it ships.
- **Freshness:** never display listing content more than **6 hours** old, or other Etsy content (shops) more than **24 hours** old. Never cache longer than reasonably necessary. All TTLs in `config.ts` must respect this.
- **Minimum data:** request and store only the fields the signals use.
- **Auth:** the `x-api-key` header is `<keystring>:<shared_secret>`. Store that full value as the `ETSY_API_KEY` Worker secret. One key, one app; never create extra keys to get around rate limits.
- **App changes need Etsy approval:** submit any material change to what the app does (e.g. new signals or modes) to Etsy before shipping it.
- **Required in the app (Phase 12):**
  - the trademark notice: "The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.";
  - user terms with Etsy's warranty disclaimer plus a privacy policy, accepted by click-through on first run;
  - a monitored support email.
- **Never:** copy Etsy's look and feel, use internal Etsy endpoints, scrape pages, or store member personal information.
- **Dormancy:** an app with no successful API call for 6 months can be suspended.

---

## CI/CD

### Environments
- **Staging Worker:** used by `pnpm dev` and CI builds.
- **Production Worker:** used only by release builds.
- Wrangler environments (`[env.staging]`, `[env.production]`). The extension reads the Worker URL from a build-time env var (`WXT_WORKER_URL`), never hardcoded.
- `ETSY_API_KEY` set once per environment with `wrangler secret put ETSY_API_KEY --env <env>`. It never touches GitHub or CI logs.

### `ci.yml` (every push and pull request)
- Current Node LTS, pnpm with dependency caching.
- Install, lint, typecheck, test all packages.
- Run dependency-cruiser architecture check.
- Build the extension (pointing at staging) and upload the zip as an artifact.
- Required to pass before merging to `main` (branch protection).

### `deploy-staging.yml` (push to `main`)
- Runs only after CI succeeds; path filter on `apps/worker/**` and `packages/shared/**`.
- Applies pending D1 migrations to the staging database (`wrangler d1 migrations apply --remote --env staging`), then deploys the Worker to `staging` with `cloudflare/wrangler-action`, then smoke tests `/health`.

### `release.yml` (push of a `v*` tag)
- Job 1: full CI.
- Job 2: apply D1 migrations to production, deploy Worker to `production`, smoke test `/health`. Uses a GitHub Environment named `production` (optionally with required manual approval).
- Job 3 (depends on job 2): build extension with production Worker URL, verify manifest version matches the tag, create a GitHub Release with the zip, submit to Chrome Web Store with `wxt submit`.
- Chrome Web Store review is manual on Google's side, so a tag means "submitted", not "live".

### Release flow
1. Bump version in `apps/extension/package.json` in a PR, merge after CI passes.
2. Tag `main` with `vX.Y.Z`, push the tag.

### GitHub secrets
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN` (Phase 12)

---

## Signals and default weights (starting point, tune later)

Each is its own `SignalModule` file.

1. **`descriptionDisclosure`** (strong). Scans the seller's own text: title, description (entities decoded), tags, and materials (each tag/material on its own). Phrases like: AI-generated, AI art, AI-assisted, created with AI, AI software, Midjourney, Stable Diffusion, DALL-E. For precision, a bare "AI" never counts (digital downloads list Adobe Illustrator "AI" files), and Firefly/Leonardo/prompt only count with AI context ("Adobe Firefly", "Leonardo AI", "AI prompt"). Negations and contrasts in the same sentence cancel a match ("not AI", "AI-free", "unlike AI art").
2. ~~`aiFlag`~~ **Dropped.** Phase 1 found no AI checkbox field in the API (see `docs/etsy-api.md`).
3. **`designedBy`** (moderate only). Hits when `whoMade = "someone_else"` and the listing has a production partner. This also covers ordinary print-on-demand, so it is NOT proof of AI alone. Some "Designed by" listings look identical to handmade in the API; those are simply missed.
4. **`shopHeuristics`** (weak to moderate, inference): new shop with a huge active listing count, catalog dominated by digital downloads, low sales relative to listings. Each clue is weak; they combine as 1 - product(1 - w), capped at 0.55. Thresholds and clue weights in `SHOP_HEURISTICS` (`config.ts`); minimum listing counts keep small shops out. Shop age uses `SignalInput.fetchedAt`.
5. **`imageClassifier`** (weak, stretch). Only on already-ambiguous listings.

---

## Phases

### Phase 0: Scaffold + CI + architecture guardrails
- pnpm monorepo named `handsift` (packages scoped as `@handsift/extension`, `@handsift/worker`, `@handsift/shared`): `apps/extension` (WXT, TS strict, React, ESLint, Prettier, Vitest), `apps/worker` (Wrangler, TS, Vitest Workers pool), `packages/shared` (TS, Zod).
- Create empty folder structure and `interfaces.ts` from this plan.
- `.dependency-cruiser.ts` enforcing the layer rules (core cannot import adapters/ui/chrome/dexie; entrypoints contain no logic is enforced by review).
- Manifest: name "HandSift: AI Filter for Etsy", short name "HandSift". Host permissions for `*://*.etsy.com/*` and the Worker URL only, plus `storage`.
- Worker names in `wrangler.toml`: `handsift-api-staging`, `handsift-api` (production).
- Content script logs "loaded"; Worker has `/health`.
- `ci.yml` as described above.
- **Manual step for me:** push to GitHub, turn on branch protection for `main`.
- **Done when:** extension loads unpacked, Worker runs with `wrangler dev`, CI (including dependency-cruiser) passes.

### Phase 1: Etsy API access + recon + shared schemas
- **Manual step for me:** register an app on Etsy's developer portal (done) and put `ETSY_API_KEY=<keystring>:<shared_secret>` in `apps/worker/.dev.vars` (gitignored). Note the app's rate limits. The staging secret (`wrangler secret put ETSY_API_KEY --env staging`) can wait until Phase 2.
- `scripts/fetch-fixtures.ts` saves JSON for 8 to 10 listings I provide (disclosed AI, handmade, "Designed by" non-AI) plus their shops into `fixtures/real/` (gitignored).
- **Manual step for me:** save 1 to 2 Etsy search pages as HTML into `fixtures/real/search-pages/` (gitignored).
- `docs/etsy-api.md`: available fields, how "Made by"/"Designed by" maps to API fields, whether an AI flag exists, batch endpoints and limits.
- `docs/etsy-api.md` also records the terms that affect us (see Etsy API Terms compliance) and the status of the Section 5 authorization.
- Zod schemas in `packages/shared/src/schemas/` built from the real responses. Synthetic fixtures in `fixtures/synthetic/` mirror them for CI. Tests parse every synthetic fixture, plus every real one when present locally (skipped otherwise).
- **Done when:** schemas validate all fixtures and the terms are documented.

### Phase 2: Worker
- Modules per the file structure: router, handlers, `etsyClient`, cache interface + Cache API impl, middleware (validate, rateLimit, origin), `log.ts`.
- `etsyClient` uses only `GET /v3/application/listings/batch?listing_ids=...&includes=Shop` (max 100 IDs per call; shop data comes attached, so no separate shop calls). If any ID is missing, Etsy fails the whole batch with a 404 naming the missing IDs: drop them and retry once; if the error can't be parsed, return no data (never guess). Log Etsy's `x-remaining-today` header. Normalization (raw Etsy -> `ListingData`/`ShopData`, decoding description entities) happens here.
- Stay under Etsy's 5 requests/second across all requests; back off on Etsy 429s.
- All API routes under `/v1/` (see Security, versioning, and observability).
- Per-IP rate limiting via the Workers Rate Limiting binding (required). Strict input validation (numeric IDs, max batch size).
- Structured JSON logging + `[observability] enabled = true`.
- Request/response contracts from `packages/shared/src/api.ts`.
- Tests with the Workers Vitest pool, Etsy mocked. Include tests for rate-limit rejection, invalid input, and that no request reaches Etsy without passing validation.
- Staging/production Wrangler envs + `deploy-staging.yml`.
- **Manual step for me:** Cloudflare API token + account ID in GitHub secrets.
- **Done when:** merging to `main` auto-deploys staging, smoke test passes, staging returns real data for fixture IDs.

### Phase 3: Signals
- `descriptionDisclosure` and `designedBy` as `SignalModule`s in the registry.
- Unit tests per signal against fixtures.
- **Done when:** each signal correct on every fixture.

### Phase 4: Site adapter + pipeline
- Decided: `ItemSource` has a single `getListings` returning listings with shops plus missing/unavailable IDs (no `getShop`).
- Until Phase 5 the service worker uses an in-memory `VerdictStore`; until Phase 6 it uses an interim scorer that always returns `unclear` (no badge) but keeps signal reasons for logging.
- `pnpm --filter @handsift/extension build:staging` builds against the staging Worker.
- `EtsyAdapter` implementing `SiteAdapter`, tested on saved search pages.
- `WorkerSource` implementing `ItemSource`, typed message bus.
- `core/pipeline.ts` using interfaces only; tested with fake source + in-memory store.
- **Done when:** scrolling Etsy logs listing data for visible cards, batched, no request flooding.

### Phase 5: Client cache
- `DexieStore` implementing `VerdictStore`, 6-hour TTL from `config.ts` measured from `checkedAt` (the data's fetch time). Replaces the in-memory store in the service worker. Expired verdicts are deleted on startup and at most hourly. Tests run real Dexie against `fake-indexeddb` (dev dependency, approved).
- Settings wrapper over `chrome.storage.sync`: `enabled`, `mode` (label/blur/hide), `sensitivity` (conservative/balanced/aggressive), defaults in `config.ts` (on, label, conservative). Each field validated separately on read.
- **Done when:** revisiting a page makes zero new requests for checked listings.

### Phase 6: Scoring + UI
- Decided: signals declare `kind: "disclosure" | "inference"`. Any disclosure hit -> `disclosed_ai`; otherwise inference weights combine as 1 - product(1 - w) and `LIKELY_AI_THRESHOLDS` (per sensitivity, in `config.ts`) decide `likely_ai`. The level is re-derived at display time, so changing sensitivity needs no refetch. A lone `designedBy` never reaches any threshold.
- `core/scoring/score.ts` replaced the interim scorer; DexieStore v2 clears its verdicts.
- Decided: `SiteAdapter.setItemDisplay` / `unmountBadge`; Etsy hides a card's grid `<li>` or blurs its photo, restoring Etsy's inline styles after.
- Etsy's trademark notice is already in the popup (required; pulled forward from Phase 12).
- Badge + Tooltip in Shadow DOM via `adapter.mountBadge`. Modes: label / blur / hide.
- Popup: enable toggle, mode, sensitivity, clear cache, stats.
- **Done when:** badges correct while scrolling, all modes work, tooltips show reasons.

### Phase 7: Shop heuristics
- `shopHeuristics` signal. Shop data arrives with each listing batch (`includes=Shop`), so there are no separate shop fetches; cache it for at most 24 hours (it shares the listing's 6-hour cache today, well within that).
- Decided: `SignalInput` gains `fetchedAt` (reference time for shop age; signals stay pure).
- **Done when:** shop reasons appear in tooltips; no duplicate shop fetches.

### Phase 8: Eval harness
- `data/labels.csv`: `listing_id, label (ai|human), source_of_label`.
- `scripts/eval.ts` (`pnpm eval`) runs `core/` directly in Node on labeled data, prints precision, recall, confusion matrix at several thresholds, plus the listings it got wrong. Listings are fetched through the Worker (nothing saved). How-to in `docs/evaluation.md`.
- **Manual step for me:** grow labels toward 200+.
- **Done when:** one command prints metrics.

### Phase 9: Tuning
- Tune weights/thresholds in `config.ts` for precision. Document in `docs/scoring.md`.
- Done (Oct 21, 2026) with 107 labels: **no number changed.** Conservative/Balanced already have 100% precision; the Aggressive gains on offer depended on young shops, and the labels contain no young honest shops to test against. `docs/scoring.md` records the results, the label biases, the rules for future changes, and the labels that would unlock them. `pnpm eval --details` prints per-listing features for future tuning.

### Phase 10: Shared cache with D1
- Done: `handsift-staging` and `handsift-prod` D1 databases created (Oct 19, 2026) and bound as `DB` per environment in `wrangler.toml`.
- Decided: **one table**. Shops always arrive with their listing, so each row stores the listing with its shop (or a "missing" marker); no join, and a listing can't be fresh while its shop is stale. First migration (`migrations/0001_create_listings_cache.sql`):
  ```sql
  CREATE TABLE listings_cache (
    listing_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,      -- listing + shop (normalized, not raw Etsy JSON), Zod-validated on read
    fetched_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX idx_listings_cache_expires ON listings_cache (expires_at);
  ```
- D1 entries live `D1_CACHE_TTL_MS` (3 h), leaving clients at least 3 of Etsy's 6 hours; "missing" markers 1 h.
- The Cloudflare API token used by CI needs **D1 Edit** (the "Edit Cloudflare Workers" template doesn't include it).
- `d1Cache.ts` implements the cache interface: bound parameters only (never string-built SQL), batched reads (`WHERE listing_id IN (...)`) and batched upserts (`db.batch`).
- `layeredCache.ts`: layers in order, D1 today (the per-listing Cache API layer was dropped; see Scaling plan item 3). Handlers do not change.
- Cron Trigger (hourly) runs `cleanup.ts` to delete expired rows.
- Request coalescing: concurrent lookups for the same uncached ID share one Etsy call (per Worker instance; a global version would need the Durable Object in the Scaling plan).
- Handle Etsy 429s per the Scaling plan.
- Tests use the Workers Vitest pool with a local D1 binding and migrations applied (`test/applyMigrations.ts`).
- Migrations are forward-only and committed to the repo; CI applies them before deploys.
- **Done when:** a second "user" (fresh browser profile) gets results with zero Etsy calls, and expired rows are cleaned up.

### Phase 11 (stretch): Image classifier
- **Deferred until after launch** (decided Oct 21, 2026). Plan when picked up: first an offline experiment running 2–3 openly licensed AI-image detectors on the labeled listings' photos; build it into the extension only if one separates undisclosed AI from human listings without false flags.
- `imageClassifier` SignalModule; model runs in offscreen document behind an adapter.
- Only in ambiguous score range, feature-flagged off. Keep only if eval improves.

### Phase 12: Hardening + ship
- Decided (Oct 21, 2026):
  - Privacy policy, terms, and a simple landing page on **GitHub Pages** (from this repo); a custom domain can be added later (GitHub redirects the old links).
  - Support email: **handsift.extension@outlook.com**, a dedicated inbox (`SUPPORT_EMAIL` in `config.ts`, also in `site/*.html`).
  - Name in Etsy's warranty disclaimer: **HandSift**.
  - Repo README styled like a product page (banner, install badges, website link, features + screenshots, changelog, honest accuracy, disclaimer); store badges and screenshots finished after launch.
  - Shipped as separate PRs: budget guard, consent screen, pages + README, Playwright e2e, release workflow.
  - License: **none for now** (all rights reserved); revisit later.
  - Logo: a crossed-out AI sparkle on HandSift teal (`branding/logo.svg`). Teal (`#0F766E`, `#2DD4BF` in dark mode) is the accent across the popup, welcome page, and site; never Etsy's orange or styling. Badge colors stay meaning-based (solid = disclosed, outlined amber = likely).
- Playwright e2e on a saved search page.
  - Done: `apps/extension/e2e/` builds the extension against a mock Worker (`e2e/mockWorker.ts`, synthetic fixtures), loads it in Chromium, and serves the synthetic search page at an etsy.com URL. Covers consent (nothing sent before agreeing), badges, tooltips, the client cache, and hide mode.
- Re-read Etsy's API terms for changes; submit the final app behavior to Etsy if it changed since approval.
- First-run screen: user terms (with Etsy's warranty disclaimer) and privacy policy, accepted by click-through. Support email in the popup and store listing.
  - Done: settings store `termsAcceptedVersion`; `TERMS_VERSION` in `config.ts` (bump it when the terms or policy change in a way users must re-accept). Install (or an update with unaccepted terms) opens `onboarding.html`. Until accepted, the content script requests nothing and the service worker refuses lookups; the popup shows "Review and accept".
- Display Etsy's required notice prominently in the popup and store listing: "The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy." Follow Etsy's Trademark Policy for any use of the name; never use Etsy's logo or brand styling.
- **Manual step for me:** Chrome Web Store developer account, first manual upload for the extension ID, CWS API credentials into GitHub secrets.
- `release.yml`, tested with a `v0.1.0` tag.
- Store listing: privacy policy (only listing IDs sent to our Worker, forwarded to Etsy; IP addresses used transiently for rate limiting and never logged or stored), permission justifications, screenshots, README with honest accuracy notes.
- **Done when:** a tag deploys production Worker, creates a GitHub Release, submits the extension.

---

## Out of scope for v1
- HTML scraping of listing pages
- Pinterest / Google Images adapters (architecture supports them; not built yet)
- Community reporting
