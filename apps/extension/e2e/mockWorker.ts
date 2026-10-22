import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import {
  EtsyBatchResponseSchema,
  EtsyListingSchema,
  toListingData,
  toShopData,
  V1_LISTINGS_PATH,
  type V1ListingsResponse,
} from "@handsift/shared";

// A stand-in for the HandSift Worker, serving the synthetic Etsy fixtures in the Worker's
// /v1 response shape. Records every requested ID so tests can assert what was sent.

export const MOCK_WORKER_PORT = 8799; // must match .env.e2e

const FIXTURE = join(import.meta.dirname, "../../../fixtures/synthetic/etsy/listings-batch.json");

export interface MockWorker {
  /** IDs requested so far, in order, one array per request. */
  requests: string[][];
  close(): Promise<void>;
}

function loadListings(): Map<string, V1ListingsResponse["results"][number]> {
  const batch = EtsyBatchResponseSchema.parse(JSON.parse(readFileSync(FIXTURE, "utf8")));
  return new Map(
    batch.results.map((item) => {
      const raw = EtsyListingSchema.parse(item);
      return [
        String(raw.listing_id),
        {
          listing: toListingData(raw),
          shop: raw.shop ? toShopData(raw.shop) : null,
          fetchedAt: Date.now(),
        },
      ] as const;
    }),
  );
}

export async function startMockWorker(): Promise<MockWorker> {
  const listings = loadListings();
  const requests: string[][] = [];

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${String(MOCK_WORKER_PORT)}`);
    if (url.pathname !== V1_LISTINGS_PATH) {
      res.writeHead(404).end();
      return;
    }
    const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
    requests.push(ids);
    const body: V1ListingsResponse = {
      results: ids.flatMap((id) => {
        const found = listings.get(id);
        return found ? [{ ...found, fetchedAt: Date.now() }] : [];
      }),
      missing: ids.filter((id) => !listings.has(id)),
      unavailable: [],
    };
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
  });

  await new Promise<void>((resolve) => server.listen(MOCK_WORKER_PORT, resolve));
  return {
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
