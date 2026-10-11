import { createRoot } from "react-dom/client";
import { browser } from "wxt/browser";
import { requestClearCache, requestPageStats } from "../../adapters/messaging/bus";
import { createSettingsStore } from "../../adapters/storage/settings";
import { Popup } from "../../ui/popup/Popup";
import "../../ui/popup/popup.css";

// Wiring only.
async function activeTabStats() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id === undefined ? null : requestPageStats(tab.id);
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <Popup
      settings={createSettingsStore()}
      clearCache={() => requestClearCache()}
      getPageStats={activeTabStats}
    />,
  );
}
