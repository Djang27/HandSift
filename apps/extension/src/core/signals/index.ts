import type { SignalModule } from "@handsift/shared/interfaces";
import { descriptionDisclosure } from "./descriptionDisclosure";
import { designedBy } from "./designedBy";

// The signal registry. Adding a signal = one new file + one entry here; scoring loops
// over this list and never changes. (Etsy's API has no AI checkbox, so there is no
// aiFlag signal; see docs/etsy-api.md.)
export const SIGNALS: readonly SignalModule[] = [descriptionDisclosure, designedBy];
