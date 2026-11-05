# Frontend code rules

Applies to: `apps/web/src/**`, `apps/admin/src/**`

- **Don't break the e2e hooks.**
  - Keep these CSS classes: `cc_card` (chef card), `dc_card` (dish card), `uc-panel` (cart panel), `cic_root` (cart item).
  - Keep accessible names (button text, form `aria-label`s such as "Create account", input labels), because the specs select by role and label.
- **Storefront copy** goes in `apps/web/src/locales/en/translation.json`, not hardcoded strings. Changing existing copy can break e2e tests, so search `apps/*/e2e` for the text first.
- **API calls:**
  - Storefront: go through `apps/web/src/api/client.ts` / `foodme.ts`.
  - Admin: go through `apps/admin/src/api/*` and the react-admin `dataProvider`.
  - Don't add hardcoded hosts. The production API base is relative (`""`).
- **Admin routing is hash-based.** Don't add a `basename`, and don't switch to `BrowserRouter` (see the comment in `apps/admin/src/App.jsx`).
- **Untrusted HTML:** never render server text with `dangerouslySetInnerHTML` (FM-BUG-08 is an example of the bug, not a pattern to copy).
- **Checks before you finish:**
  - web: `npm run lint` and `npm run build`. `tsc -b` is the typecheck.
  - admin: `npm run lint`.
