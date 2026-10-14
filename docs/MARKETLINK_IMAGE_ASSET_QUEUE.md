# MarketLink Gambia — image asset queue

**Status (14 October 2026):** Existing-asset category mapping and category-specific emoji fallbacks are implemented in `frontend/premium-marketlink.js` and deployed on Render static site `MarketLink-Gambia Frontend` from `main` (commit `29dfcbf856344a00c04ab80c28adee42b5780165`). The six-tile produce atlas now maps tomatoes, onions, rice, cooking oil/pantry, carrots and greens/produce; existing shopping, vendor and MarketLink bag images are used as category-appropriate fallbacks for other live categories. The official logo remains untouched. New high-resolution category-specific photography is still queued for a later image-generation pass; don't mark that part complete until those files are created and visually checked. Do not bake words/logos into generated photos.

## Existing assets to reuse now

- `frontend/assets/marketlink-category-atlas.webp` — existing six-tile produce/pantry atlas, including tomatoes, onions, rice, oil, carrots and greens.
- `frontend/assets/promo-shopping.webp` — existing local supermarket shoppers; use for shopping/food-related category fallbacks and the affiliate hero.
- `frontend/assets/promo-vendor.webp` — existing vendor/shop imagery; use for vendor, business and fashion fallbacks where relevant.
- `frontend/assets/hero-marketlink-bag.webp` — existing MarketLink bag/marketplace visual for the home hero and household/grocery fallback.
- `frontend/assets/marketlink-logo.png` — actual MarketLink logo for favicon, status cards and notifications.

The frontend already maps common category names to available assets and shows a category-specific emoji fallback if the image is unavailable. Keep that fallback so no category tile appears empty while proper images are prepared.

## Images to generate later

Create realistic, sharp, locally relevant category photos for each category returned by the live MarketLink category tree, prioritising:

1. Tomatoes and tomato products.
2. Onions.
3. Rice and grains.
4. Carrots and root vegetables.
5. Leafy greens and fresh vegetables.
6. Fruit and fresh produce.
7. Cooking oil, spices and pantry essentials.
8. Fish, meat and poultry.
9. Prepared Gambian meals and snacks.
10. Clothing, fabrics, shoes and accessories.
11. Beauty and cosmetics.
12. Household and kitchen items.
13. General marketplace categories that do not fit the groups above.

Also review whether clearer high-resolution hero photos are needed for the login screen, vendor promotion and rider/delivery promotion.

## Image specifications

- Prefer 4:3 category images at least 1200 × 900 pixels, with the subject clear at small card sizes.
- Keep photographic assets natural and realistic for The Gambia and West Africa; avoid text, labels, watermarks or generated MarketLink logos.
- Produce banner images separately from square/portrait category photos. Do not stretch a small banner into a tall card.
- Save optimized WebP versions under `frontend/assets/`, use meaningful filenames, and wire each image to the correct category mapping.
- Verify each image returns successfully, has the expected dimensions, loads on desktop/mobile, and has a visible fallback if it fails.

## Acceptance checks for the next image pass

- Test Home category cards and the full Browse Categories screen.
- Confirm every live category has either a real image or a visible fallback icon.
- Check cropping and sharpness at desktop and mobile sizes.
- Verify light and dark themes preserve card-label contrast.
- Confirm all existing logo assets remain unmodified and no random logo is introduced.
