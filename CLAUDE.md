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
| Page observation | MutationObserver + IntersectionObserver |
| Data source | Etsy Open API v3 (public listing + shop endpoints, `x-api-key` auth) |
| API proxy + shared cache | Cloudflare Workers (Wrangler), Cache API in front of D1 (Phase 10) |
| Shared database | Cloudflare D1 (SQLite), raw SQL with bound parameters, migrations via `wrangler d1 migrations` |
| Request batching/throttling | p-limit in the extension, batch endpoints where available |
| Local database | IndexedDB via Dexie |
| Settings | chrome.storage.sync |
| Image classifier (stretch) | transformers.js in an offscreen document |
| Unit tests | Vitest (extension, shared) + Vitest with Cloudflare's Workers test pool (worker) |
| E2E tests (later) | Playwright with the extension loaded |
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
}

// Where item data comes from (Etsy API via Worker now; could be another source later).
interface ItemSource {
  getListings(ids: string[]): Promise<ListingData[]>;
  getShop(shopId: string): Promise<ShopData>;
}

// One detection signal. Adding a signal = one new file + register it. Scoring never changes.
interface SignalModule {
  id: string;
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
       - uses EtsyAdapter to find cards + extract listing IDs (visible only)
       - sends IDs to service worker, mounts badges from verdicts
            │  typed messages (packages/shared/messages)
            ▼
Service worker (entrypoint)
  - pipeline (core): check VerdictStore -> fetch missing via ItemSource -> run signals -> score -> store
            │
            ▼
Cloudflare Worker
  - holds Etsy API key as a secret
  - GET /v1/listings?ids=...  -> batched Etsy lookup
  - GET /v1/shops/:shopId     -> Etsy shop lookup
  - GET /health               -> unversioned liveness check (smoke tests)
  - cache layer: Cache API -> D1 (Phase 10) -> Etsy
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
        offscreen/               # stretch: classifier
      adapters/
        sites/
          etsy/
            etsyAdapter.ts       # implements SiteAdapter
            selectors.ts         # Etsy DOM selectors (only place they exist)
        source/
          workerSource.ts        # implements ItemSource, calls the Worker
        storage/
          dexieStore.ts          # implements VerdictStore
          settings.ts            # chrome.storage.sync wrapper
        messaging/
          bus.ts                 # typed chrome.runtime messaging wrapper
      core/
        pipeline.ts              # orchestration, depends only on interfaces
        signals/
          index.ts               # registry
          descriptionDisclosure.ts
          aiFlag.ts
          designedBy.ts
          shopHeuristics.ts
          imageClassifier.ts     # stretch
        scoring/
          score.ts               # signals -> verdict + reasons
      ui/
        Badge.tsx
        Tooltip.tsx
  worker/
    src/
      index.ts                   # entry, wiring only
      router.ts
      handlers/
        listings.ts
        shops.ts
        health.ts
      etsy/
        etsyClient.ts            # only file that talks to Etsy
      cache/
        cache.ts                 # cache interface
        edgeCache.ts             # Cache API impl
        d1Cache.ts               # D1 impl (Phase 10)
        layeredCache.ts          # edge -> D1 -> miss
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
      schemas/                   # Zod: listing, shop, verdict, signal
      messages.ts                # extension message contracts
      api.ts                     # Worker request/response contracts
      config.ts                  # all tunables
      interfaces.ts              # SiteAdapter, ItemSource, SignalModule, VerdictStore
fixtures/
  real/                          # gitignored: raw Etsy JSON + saved pages, local only
    listings/  shops/  search-pages/
  synthetic/                     # committed: same shape as real, made-up content
scripts/
  fetch-fixtures.ts
  eval.ts                        # runs core/ directly in Node
data/
  labels.csv
docs/
.github/workflows/
  ci.yml
  deploy-staging.yml
  release.yml
.dependency-cruiser.ts
```

### Core types (defined as Zod schemas in `packages/shared`)

```ts
type ListingData = {
  listingId: string;
  shopId: string;
  title: string;
  description: string;
  whoMade: "i_did" | "someone_else" | "collective" | string;
  tags: string[];
  materials: string[];
  aiDisclosedFlag?: boolean;  // only if the API exposes Etsy's AI checkbox
};

type Signal = { id: string; weight: number; hit: boolean; reason: string };

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
2. **Batching:** one Worker request per batch of visible listings, not per listing.
3. **Worker edge cache (Cache API):** repeated lookups served without hitting Etsy. Note: this cache is per Cloudflare data center, not global.
4. **Shared global cache (Phase 10, D1):** once one user checks a listing or shop, every user gets it free. Lookup order is Cache API (fastest, per data center) -> D1 (global) -> Etsy. D1 stores **only the normalized fields the signals need (not raw Etsy JSON, not verdicts)**, so tuning scoring never requires refetching, Etsy's minimum-data rule is respected, and no user data is ever stored. Entries expire within Etsy's freshness limits (6 h listings, 24 h shops).
5. **Graceful degradation:** if Etsy returns 429, the Worker returns a clear "rate limited" response and the extension shows nothing new (cached verdicts still display). Never a wrong badge.

---

## Security, versioning, and observability

### Abuse model: the Worker is a public endpoint
- An extension **cannot prove its identity**. The `Origin` header and extension ID are trivially spoofed by any script, so anyone can call the Worker directly and burn the shared Etsy quota.
- The **origin check is not security**. It only filters casual misuse (random web pages calling the Worker from a browser). Never rely on it for anything.
- **Per-IP rate limiting is the actual defense and is required**, not optional. Use Cloudflare's Workers Rate Limiting binding (`[[ratelimits]]` in `wrangler.toml`), keyed on `CF-Connecting-IP`. Limits live in `config.ts`.
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
- `log.ts` emits **structured JSON** (one object per event): route, status, latency, cache layer hit (edge / D1 / miss), Etsy calls made, Etsy 429s, our own rate-limit rejections, extension version, errors.
- **Never log raw IPs, full URLs with user data, or the API key.** Rate limiting may use the IP; logs must not store it. This keeps the privacy policy honest.

---

## Etsy API Terms compliance

From Etsy's API Terms of Use (last updated Aug 18, 2026). Record details and any later changes in `docs/etsy-api.md`.

- **Browser-extension authorization (Section 5).** The terms prohibit browser extensions that access or analyze Etsy data "unless expressly authorized in writing by Etsy". Keep that written authorization on file (and note it in `docs/etsy-api.md`) **before Phase 4**, the first phase where the extension touches Etsy data.
- **Machine learning / analytics (Section 5)** also needs written authorization. Phase 8 (eval) and Phase 11 (image classifier) are gated on it.
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

1. **`descriptionDisclosure`** (strong). Regex for terms like: AI-generated, AI art, AI-assisted, created with AI, Midjourney, Stable Diffusion, DALL-E, Firefly, Leonardo, prompt. Handle negation ("not AI", "no AI used").
2. **`aiFlag`** (strong). Only if the API exposes Etsy's AI checkbox. Verify in Phase 1; omit if not exposed.
3. **`designedBy`** (moderate only). Figure out in Phase 1 how the API represents it. It also covers outside production partners, so NOT proof of AI alone.
4. **`shopHeuristics`** (weak to moderate): new shop with huge active listing count, catalog dominated by digital downloads, low sales relative to listings.
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
- All API routes under `/v1/` (see Security, versioning, and observability).
- Per-IP rate limiting via the Workers Rate Limiting binding (required). Strict input validation (numeric IDs, max batch size).
- Structured JSON logging + `[observability] enabled = true`.
- Request/response contracts from `packages/shared/src/api.ts`.
- Tests with the Workers Vitest pool, Etsy mocked. Include tests for rate-limit rejection, invalid input, and that no request reaches Etsy without passing validation.
- Staging/production Wrangler envs + `deploy-staging.yml`.
- **Manual step for me:** Cloudflare API token + account ID in GitHub secrets.
- **Done when:** merging to `main` auto-deploys staging, smoke test passes, staging returns real data for fixture IDs.

### Phase 3: Signals
- `descriptionDisclosure`, `aiFlag` (if applicable), `designedBy` as `SignalModule`s in the registry.
- Unit tests per signal against fixtures.
- **Done when:** each signal correct on every fixture.

### Phase 4: Site adapter + pipeline
- `EtsyAdapter` implementing `SiteAdapter`, tested on saved search pages.
- `WorkerSource` implementing `ItemSource`, typed message bus.
- `core/pipeline.ts` using interfaces only; tested with fake source + in-memory store.
- **Done when:** scrolling Etsy logs listing data for visible cards, batched, no request flooding.

### Phase 5: Client cache
- `DexieStore` implementing `VerdictStore`, 6-hour TTL from `config.ts`. Settings wrapper.
- **Done when:** revisiting a page makes zero new requests for checked listings.

### Phase 6: Scoring + UI
- `core/scoring/score.ts` loops over the signal registry, weights from `config.ts`, returns level + reasons.
- Badge + Tooltip in Shadow DOM via `adapter.mountBadge`. Modes: label / blur / hide.
- Popup: enable toggle, mode, sensitivity, clear cache, stats.
- **Done when:** badges correct while scrolling, all modes work, tooltips show reasons.

### Phase 7: Shop heuristics
- `shopHeuristics` signal, shop data fetched once per shop and cached for at most 24 hours.
- **Done when:** shop reasons appear in tooltips; no duplicate shop fetches.

### Phase 8: Eval harness
- **Gated:** needs Etsy's written authorization for analytics use (see Etsy API Terms compliance).
- `data/labels.csv`: `listing_id, label (ai|human), source_of_label`.
- `scripts/eval.ts` runs `core/` directly in Node on labeled data, prints precision, recall, confusion matrix at several thresholds.
- **Manual step for me:** grow labels toward 200+.
- **Done when:** one command prints metrics.

### Phase 9: Tuning
- Tune weights/thresholds in `config.ts` for precision. Document in `docs/scoring.md`.

### Phase 10: Shared cache with D1
- **Manual step for me:** create `handsift-staging` and `handsift-prod` D1 databases with `wrangler d1 create`, add bindings per environment in `wrangler.toml`.
- First migration:
  ```sql
  CREATE TABLE listings_cache (
    listing_id TEXT PRIMARY KEY,
    data       TEXT NOT NULL,      -- normalized fields only (not raw Etsy JSON), validated by Zod on read
    fetched_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE shops_cache (
    shop_id    TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX idx_listings_expires ON listings_cache(expires_at);
  CREATE INDEX idx_shops_expires ON shops_cache(expires_at);
  ```
- `d1Cache.ts` implements the cache interface: bound parameters only (never string-built SQL), batched reads (`WHERE listing_id IN (...)`) and batched upserts (`db.batch`).
- `layeredCache.ts`: Cache API -> D1 -> Etsy, writing back to both on a miss. Handlers do not change.
- Cron Trigger (hourly) runs `cleanup.ts` to delete expired rows.
- Request coalescing: concurrent lookups for the same uncached ID share one Etsy call.
- Handle Etsy 429s per the Scaling plan.
- Tests use the Workers Vitest pool with a local D1 binding and migrations applied.
- Migrations are forward-only and committed to the repo; CI applies them before deploys.
- **Done when:** a second "user" (fresh browser profile) gets results with zero Etsy calls, and expired rows are cleaned up.

### Phase 11 (stretch): Image classifier
- **Gated:** needs Etsy's written authorization for machine-learning use (see Etsy API Terms compliance).
- `imageClassifier` SignalModule; model runs in offscreen document behind an adapter.
- Only in ambiguous score range, feature-flagged off. Keep only if eval improves.

### Phase 12: Hardening + ship
- Playwright e2e on a saved search page.
- Re-read Etsy's API terms for changes; submit the final app behavior to Etsy if it changed since approval.
- First-run screen: user terms (with Etsy's warranty disclaimer) and privacy policy, accepted by click-through. Support email in the popup and store listing.
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
