import { createRoot } from "react-dom/client";
import { createSettingsStore } from "../../adapters/storage/settings";
import { Onboarding } from "../../ui/onboarding/Onboarding";
import "../../ui/onboarding/onboarding.css";

// Wiring only.
const root = document.getElementById("root");
if (root) createRoot(root).render(<Onboarding settings={createSettingsStore()} />);
