import { SIGNAL_WEIGHTS, type ListingData, type Signal } from "@handsift/shared";
import type { SignalModule } from "@handsift/shared/interfaces";
import { normalizeText, splitSentences } from "../text";
import {
  DISCLOSURE_PATTERNS,
  NEGATION_AFTER,
  NEGATION_BEFORE,
  NEGATION_WINDOW,
} from "./disclosurePatterns";

const ID = "descriptionDisclosure";
const WEIGHT = SIGNAL_WEIGHTS.descriptionDisclosure;

type Field = "title" | "tags" | "materials" | "description";

// Order matters only for which reason is shown when several fields disclose.
const FIELDS: readonly { field: Field; text: (l: ListingData) => string }[] = [
  { field: "title", text: (l) => l.title },
  { field: "tags", text: (l) => l.tags.join("\n") },
  { field: "materials", text: (l) => l.materials.join("\n") },
  { field: "description", text: (l) => l.description },
];

/** Strong signal: the seller's own text says AI was used. */
export const descriptionDisclosure: SignalModule = {
  id: ID,
  kind: "disclosure",
  defaultWeight: WEIGHT,
  evaluate({ listing }): Signal {
    for (const { field, text } of FIELDS) {
      const phrase = findDisclosure(text(listing));
      if (phrase !== null) {
        return {
          id: ID,
          kind: "disclosure",
          weight: WEIGHT,
          hit: true,
          reason: `Seller disclosed AI in the ${field}: "${phrase}"`,
        };
      }
    }
    return {
      id: ID,
      kind: "disclosure",
      weight: WEIGHT,
      hit: false,
      reason: "No AI disclosure found",
    };
  },
};

/** Returns the first non-negated disclosure phrase in `text`, or null. */
export function findDisclosure(text: string): string | null {
  for (const sentence of splitSentences(normalizeText(text))) {
    for (const pattern of DISCLOSURE_PATTERNS) {
      for (const match of sentence.matchAll(pattern)) {
        const start = match.index;
        const before = sentence.slice(Math.max(0, start - NEGATION_WINDOW), start);
        const after = sentence.slice(start + match[0].length);
        if (!NEGATION_BEFORE.test(before) && !NEGATION_AFTER.test(after)) return match[0];
      }
    }
  }
  return null;
}
