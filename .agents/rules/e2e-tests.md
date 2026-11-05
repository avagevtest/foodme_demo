# Playwright e2e rules

Applies to: `apps/web/e2e/**`, `apps/admin/e2e/**`

## Environment
- Both suites need a **running backend** at `VITE_API_BASE_URL` (default `http://localhost:8081`). Playwright starts only the Vite dev server (web on :5180, admin on :5174).
- Read the API base from `process.env.VITE_API_BASE_URL`. Don't hardcode it the way `layout.spec.ts` does.
- The database is persistent and shared between runs, so it keeps growing. Never assume it's empty or that counts are fixed.
- Admin uses hash routes: `/#/login`, `/#/orders`. Seeded admin login is `admin` / `admin123`.
- The admin suite runs serially (`fullyParallel: false`). The web suite runs in parallel, so web tests must not share state.

## Waiting
- API responses take 200–1500 ms by design. Use auto-waiting `expect(locator).toBeVisible()` / `toHaveCount()` / `toHaveURL()`, `expect.poll`, or `page.waitForResponse`.
- `page.waitForTimeout` is forbidden; see FM-FLAKE-01 for what goes wrong.
- Before you reload or navigate, wait for the UI to show the state you're relying on. For example, after adding to cart, wait for the item in `aside.uc-panel` before reloading. See FM-FLAKE-05 FIX.

## Locators
- Prefer `getByRole`, `getByLabel`, `getByText`, scoped to a container (e.g. `page.getByRole("form", { name: "Create account" })`).
- The existing CSS hooks are fine to use and must not be renamed:
  - `a.cc_card` (chef card)
  - `button.dc_card` (dish card)
  - `aside.uc-panel` (cart panel)
  - `.cic_root` (cart item)
- UI text comes from `apps/web/src/locales/en/translation.json`. If a test matches text, the text must exist there.

## Data setup
- **Set up through the API, verify through the UI.** Use the helpers in `apps/web/e2e/auth.ts`:
  - `registerCustomerViaApi(request, API)` returns `{ token, email }`
  - `createAccountAtCheckout(page)` registers through the UI
- To create an order: `GET /api/chef/active?page=0&size=12` → `GET /api/chef/{id}` → `POST /api/order` with a customer Bearer token, `paymentType: "CASH"`, and `deliveryMethod` set to `TAKEAWAY` (no address) or `DELIVERY` (send `addressDto`).
- Cart state lives in IndexedDB (`FoodMeCart`), which every Playwright context starts with empty. Don't clear it by hand.

## Running
```
npx playwright test e2e/<file>.spec.ts
npx playwright test -g "<test title>"
npx playwright test <file> --repeat-each=20 --retries=0
npx playwright show-report
```
