import { SIGNAL_WEIGHTS, type Signal } from "@handsift/shared";
import type { SignalModule } from "@handsift/shared/interfaces";

const ID = "designedBy";
const WEIGHT = SIGNAL_WEIGHTS.designedBy;

/**
 * Moderate signal: the seller designed it and an outside production partner made it
 * (Etsy's "Designed by"). Ordinary print-on-demand looks the same, so this is never proof
 * of AI on its own. Some "Designed by" listings look identical to handmade in the API;
 * those are simply missed (see docs/etsy-api.md).
 */
export const designedBy: SignalModule = {
  id: ID,
  kind: "inference",
  defaultWeight: WEIGHT,
  evaluate({ listing }): Signal {
    const hit = listing.whoMade === "someone_else" && listing.hasProductionPartner;
    return {
      id: ID,
      kind: "inference",
      weight: WEIGHT,
      hit,
      reason: hit
        ? 'Made by an outside production partner (a "Designed by" listing). Common for print-on-demand, so not proof of AI on its own'
        : "No outside production partner",
    };
  },
};
