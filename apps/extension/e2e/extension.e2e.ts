import { BATCH_DELAY_MS } from "@handsift/shared";
import { acceptTerms, cards, expect, findPage, openEtsySearch, test } from "./fixtures";

// The synthetic search page has two result cards for listing 1000000001 (seller disclosed
// AI), one for 1000000004 (handmade mug), and a non-card element carrying 1000000099.
const DISCLOSED = "1000000001";
const HANDMADE = "1000000004";
const CARD_IDS = ["1000000001", "1000000004"];

test("asks for consent on install and sends nothing until the user agrees", async ({
  context,
  mockWorker,
}) => {
  const welcome = await findPage(context, "/onboarding.html");
  const etsy = await openEtsySearch(context);
  await expect(cards(etsy, HANDMADE)).toBeVisible();

  // Absence can only be checked by waiting: well past the batch delay.
  await etsy.waitForTimeout(BATCH_DELAY_MS + 1_000);
  expect(mockWorker.requests).toEqual([]);
  await expect(etsy.locator("handsift-badge")).toHaveCount(0);

  await acceptTerms(welcome);

  // The open Etsy tab starts on its own, without a reload, in one batch.
  await expect(cards(etsy, DISCLOSED).getByRole("button", { name: "AI · disclosed" })).toHaveCount(
    2,
  );
  await expect(cards(etsy, HANDMADE).locator("handsift-badge")).toHaveCount(0);
  expect(mockWorker.requests.map((ids) => [...ids].sort())).toEqual([CARD_IDS]);
});

test("explains why a listing was flagged", async ({ context }) => {
  await acceptTerms(await findPage(context, "/onboarding.html"));
  const etsy = await openEtsySearch(context);

  await cards(etsy, DISCLOSED).first().getByRole("button", { name: "AI · disclosed" }).hover();
  const tooltip = etsy.getByRole("tooltip");
  await expect(tooltip).toContainText("The seller disclosed that AI was used.");
  await expect(tooltip).toContainText("Seller disclosed AI in the title");
});

test("reuses cached verdicts when a page is revisited", async ({ context, mockWorker }) => {
  await acceptTerms(await findPage(context, "/onboarding.html"));
  const etsy = await openEtsySearch(context);
  const badge = cards(etsy, DISCLOSED).first().getByRole("button", { name: "AI · disclosed" });
  await expect(badge).toBeVisible();

  await etsy.reload();
  await expect(badge).toBeVisible();
  expect(mockWorker.requests).toHaveLength(1);
});

test("hides flagged listings when the popup is set to hide", async ({ context, extensionId }) => {
  await acceptTerms(await findPage(context, "/onboarding.html"));
  const etsy = await openEtsySearch(context);
  await expect(cards(etsy, DISCLOSED).first().locator("handsift-badge")).toBeAttached();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  // The popup's radios follow saved settings, so they update after the save, not on click.
  const hide = popup.getByRole("radio", { name: "Hide it" });
  await hide.click();
  await expect(hide).toBeChecked();

  await expect(cards(etsy, DISCLOSED).first()).toBeHidden();
  await expect(cards(etsy, HANDMADE)).toBeVisible();
});
