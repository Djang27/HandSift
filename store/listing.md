# Chrome Web Store listing

Everything the Chrome Web Store developer dashboard asks for, ready to paste. Images are in
`store/images/` (regenerate with `pnpm --filter @handsift/extension store:images`).

If what HandSift does changes, update this file, the site's privacy policy, and (for material
changes) tell Etsy before shipping. See CLAUDE.md, Etsy API Terms compliance.

## Store listing tab

**Name** (from the manifest): HandSift: AI Filter for Etsy

**Summary** (from the manifest, max 132 characters): Flags, blurs, or hides AI-generated
listings on Etsy, and explains why.

**Category:** Shopping

**Language:** English

**Description:**

```text
Shopping for handmade on Etsy? HandSift labels AI-generated listings in your search results and always tells you why.

TWO KINDS OF LABELS
• AI · disclosed: the seller says AI was used, in the title, description, tags, or materials. That's the seller's own statement.
• Likely AI: no disclosure, but several clues add up. That's HandSift's estimate, and it can be wrong.
Hover or tap a label to see the exact reason.

YOUR CHOICE OF WHAT HAPPENS
• Label: add a badge and keep the listing visible.
• Blur: blur flagged photos, with a one-click reveal.
• Hide: remove flagged listings from the results.
Pick how cautious HandSift is: Conservative (the default), Balanced, or Aggressive.

BUILT TO AVOID WRONGLY FLAGGING ARTISTS
HandSift would rather miss an AI listing than mislabel a real maker. It ignores sellers who say they don't use AI and never treats one weak clue as proof.

Honest accuracy: HandSift reliably catches sellers who disclose AI. Most undisclosed AI can't be detected yet, because it shows only in the photos, which HandSift doesn't analyze.

PRIVATE BY DESIGN
HandSift sends only the ID numbers of the listings on the Etsy page you're viewing, so it can look them up through Etsy's official API. No account, no tracking, no ads, nothing about you. Nothing is sent until you accept the terms on first run.

Privacy policy: https://djang27.github.io/HandSift/privacy.html
Support: handsift.extension@outlook.com

The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.
```

**Graphic assets:**

| Field                                   | File                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Store icon (128×128)                    | `apps/extension/public/icon/128.png`                                   |
| Screenshots (1280×800, upload in order) | `store/images/screenshot-1-label.png`, `-2-blur.png`, `-3-welcome.png` |
| Small promo tile (440×280)              | `store/images/promo-small.png`                                         |

**Additional fields:**

- Official URL: none (requires a verified domain; skip)
- Homepage URL: https://djang27.github.io/HandSift/
- Support URL: https://djang27.github.io/HandSift/ (lists the support email)
- Mature content: No

## Privacy practices tab

**Single purpose:**

```text
HandSift labels, blurs, or hides AI-generated listings on Etsy search and shop pages, and explains why each listing was flagged.
```

**Permission justifications:**

| Permission                                            | Justification                                                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storage`                                             | Saves the user's settings (on/off, label/blur/hide, sensitivity, accepted terms version) and caches results for listings already checked, for up to 6 hours. |
| Host: `*://*.etsy.com/*`                              | Reads the listing ID numbers on Etsy pages and shows labels on those listings. HandSift runs only on Etsy.                                                   |
| Host: `https://handsift-api.danjang815.workers.dev/*` | HandSift's own server, which looks the listing IDs up through Etsy's official API and returns public listing and shop information.                           |

**Remote code:** No, I am not using remote code. (All JavaScript is in the package; the server
returns data only.)

**Data usage.** What user data HandSift collects (check only this one):

- **Website content:** yes. HandSift reads listing ID numbers from Etsy pages and sends them to
  its server to look them up. Nothing else from the page is sent.
- Everything else (personally identifiable information, health, financial, authentication,
  personal communications, location, web history, user activity): **no**.

Certify all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://djang27.github.io/HandSift/privacy.html

## Distribution tab

- Visibility: Public
- Regions: all regions

## Account

- Publisher type: **non-trader** (free, personal project). Switch to trader if HandSift ever
  makes money.
- Contact email: handsift.extension@outlook.com
