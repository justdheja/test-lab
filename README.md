# ShopGram Lab

Mocked social-commerce app for practicing UI test automation. Static site (vanilla JS), no build, no server. The "backend" is `docs/mock-api.js`, which intercepts `fetch('/api/...')` in the browser and keeps state in `localStorage`.

## Run
- **Local:** `npx serve docs` (or `python3 -m http.server -d docs`)
- **GitHub Pages:** push, then Settings → Pages → Branch `main`, folder `/docs`.

## Features
Auth (login/register) · Feed (post, tag product, like, comment, All/Following tabs) · Profiles (follow/unfollow) · Shop (search, category filter, product page) · Cart (add/remove, stock limit) · Checkout (address, vouchers) · Orders

## Accounts
| user | pass | note |
|---|---|---|
| demo | demo123 | buyer, follows `seller` |
| seller | seller123 | owns products/posts |
| blocked | blocked123 | login shows "Account is blocked" |

## Test data
- Vouchers: `SAVE10` (10%), `SAVE20` (20%); anything else → "Invalid voucher"
- Yoga Mat (id 4) stock 0 → Add button disabled
- Desk Lamp (id 5) stock 3 → add 4 → "Only 3 in stock"
- Post text max 280 chars; password min 6 chars
- API calls have ~80ms fake latency

## Reset state
State lives in `localStorage` (per browser, survives reload). Reset with:
- open `/?reset=1`, or
- `await page.evaluate(() => window.__lab.reset())`, or
- fresh browser context (Playwright default) — every test starts clean.

## Selectors
Every interactive element has `data-testid` (e.g. `login-submit`, `add-to-cart-1`, `like-1`, `checkout-submit`, `order-success`). Dynamic ones are suffixed with the id.

## Note
No real HTTP API exists, so API-level tests (`request.get(...)`) won't work on Pages. Use UI tests, or `page.route('**/api/**')` is moot too — requests never leave the page.
