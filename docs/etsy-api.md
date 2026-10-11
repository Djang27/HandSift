# Etsy Open API v3: what HandSift uses

Findings from Phase 1 recon (Oct 2026), based on real responses saved in `fixtures/real/`
(gitignored) and Etsy's OpenAPI spec. Seller content is never quoted here because this repo is
public.

## Access status

Etsy's emails are marked confidential, so they are not quoted here. Daniel keeps them on file.

| Item                                                  | Status                                                                                                                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App approved by Etsy                                  | Yes, Oct 8, 2026                                                                                                                                                                         |
| Section 5 written authorization (browser extension)   | **Granted** (Oct 2026): HandSift may operate as a Chrome extension that accesses and analyzes Etsy data via the API, and may be distributed to the general public, as described to Etsy. |
| Features described to Etsy                            | "Seller disclosed AI" and "Possibly AI" labels with reasons; label / blur / hide modes; caching within the 6 h / 24 h limits.                                                            |
| ML / analytics (on-device image check, accuracy eval) | **Granted** in writing (Oct 2026), per Daniel.                                                                                                                                           |

Anything beyond what was described (new signals that use other data, new modes) must go to Etsy for approval before it ships.

## Authentication

- Every request sends `x-api-key: <keystring>:<shared_secret>` (both parts, colon-separated).
  The full value is the `ETSY_API_KEY` secret (`apps/worker/.dev.vars` locally, Wrangler secret
  when deployed).
- The public endpoints below need no OAuth.
- `GET /v3/application/openapi-ping` returns `{"application_id": ...}`; useful as a key check.

## Rate limits

- **5 requests/second, 5,000 requests/day**, shared by every HandSift user.
- Every response reports usage in headers. The Worker should log `x-remaining-today`:

  | Header                    | Meaning                |
  | ------------------------- | ---------------------- |
  | `x-limit-per-second`      | 5                      |
  | `x-remaining-this-second` | Calls left this second |
  | `x-limit-per-day`         | 5000                   |
  | `x-remaining-today`       | Calls left today       |

## Endpoints

### `GET /v3/application/listings/batch?listing_ids=<ids>&includes=Shop`

The only endpoint HandSift needs.

- `listing_ids` is comma-separated, **max 100 IDs** (101 returns `400` with
  `"Array only allows [100] elements ([101] provided)."`).
- `includes=Shop` attaches each listing's full shop object. It is **identical** to
  `GET /v3/application/shops/{shop_id}` (same keys, same values), so **no separate shop calls
  are needed**: one call covers a whole search page, listings and shops.
- Response: `{ "count": number, "results": ShopListingWithAssociations[] }`. Associations not
  requested (`images`, `user`, `translations`, `videos`, `inventory`, ...) come back `null`.
- **If any requested ID doesn't exist, the whole batch fails** with `404` and
  `{"error": "Not all requested listings exist. Missing listing_ids: <ids>."}`. The Worker must
  parse the missing IDs, drop them, and retry once. If the message can't be parsed, treat the
  batch as failed (no badges), never guess.

### `GET /v3/application/shops/{shop_id}`

Not needed (see `includes=Shop` above). The fixture script still saves it for comparison.

## Listing fields

Spec marks almost everything optional; all of these were present in every fixture.

| Field                 | Type                                                  | Use                                                         |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| `listing_id`          | integer                                               | ID                                                          |
| `shop_id`             | integer                                               | Joins to the shop                                           |
| `title`               | string                                                | Disclosure text                                             |
| `description`         | string, **HTML-entity encoded** (`&quot;`, ...)       | Disclosure text; decode entities before matching            |
| `tags`                | string[]                                              | Disclosure text (sellers tag "AI art", "AI generated", ...) |
| `materials`           | string[]                                              | Disclosure text (one AI listing lists "AI Software")        |
| `who_made`            | `"i_did" \| "someone_else" \| "collective"`, nullable | Maker type (see below)                                      |
| `production_partners` | `{ production_partner_id, partner_name, location }[]` | Outside production (print-on-demand)                        |
| `listing_type`        | `"physical" \| "download" \| "both"`                  | Digital downloads (shop heuristics)                         |
| `state`               | `"active" \| "inactive" \| "sold_out" \| ...`         | Not used yet                                                |

Not useful: `when_made` is unreliable (an AI digital download claims `2007_2009`).

## Shop fields

| Field                    | Type             | Use                        |
| ------------------------ | ---------------- | -------------------------- |
| `shop_id`                | integer          | ID                         |
| `create_date`            | integer, seconds | Shop age                   |
| `listing_active_count`   | integer          | Catalog size               |
| `digital_listing_count`  | integer          | Share of digital downloads |
| `transaction_sold_count` | integer          | Sales relative to listings |

The shop object also contains personal information (`login_name`, `user_id`, `policy_seller_info`,
policies, vacation messages). **Never store or forward it.** The Zod schemas pick only the fields
above.

## Is there an AI flag?

**No.** No listing or shop field exposes Etsy's AI disclosure checkbox. The `aiFlag` signal is
dropped. AI disclosure shows up only in seller-written text: title, description, tags, and
materials.

## "Made by" vs "Designed by"

There is no direct field. Observed in fixtures:

| Fixture group                         | `who_made`     | `production_partners` |
| ------------------------------------- | -------------- | --------------------- |
| Handmade (3 listings)                 | `i_did`        | empty                 |
| AI digital downloads (2)              | `i_did`        | empty                 |
| AI wall art, printed by a partner (1) | `someone_else` | 1 partner             |
| Print-on-demand shirt (1)             | `someone_else` | 1 partner             |
| Print-on-demand mug (1)               | `i_did`        | empty                 |

So `who_made = "someone_else"` with a production partner reliably means "designed here, made by a
partner", but some "Designed by" listings (the mug) look identical to handmade in the API. The
`designedBy` signal therefore uses `someone_else` + partner only, and stays **moderate**: it
covers ordinary print-on-demand too, so it is never proof of AI on its own.

## Open questions

- Do `sold_out` / `inactive` listings come back from the batch endpoint (with `state`) or count
  as missing (404)? Test when a fixture listing changes state.
