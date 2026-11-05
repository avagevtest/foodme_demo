---
name: write-e2e-test
description: Write or extend a Playwright end-to-end test for the FoodMe storefront (apps/web) or admin back office (apps/admin). Use when asked to add, cover, automate or test a user flow in the browser.
---

# Write a FoodMe e2e test

Follow `.agents/rules/testing.md` and `.agents/rules/e2e-tests.md`. The steps below are the workflow.

## 1. Pin down the scenario
- E2E is the most expensive layer. Use it for **user flows across UI and API**. If the behavior is pure logic (prices, validation rules), write it with `write-unit-test`. If it's an endpoint, a role or persistence, use `write-integration-test`. Keep one e2e test per flow, plus the key UI-only failure states.
- Write the test as **Given / When / Then**, with the expected result taken from the requirement or the obvious correct behavior. Don't take the expected result from what the app does today, since this codebase has planted bugs (FM-BUG-xx).
- Pick the suite:
  - storefront flows → `apps/web/e2e/`
  - back-office flows → `apps/admin/e2e/`
- Add to the existing spec that covers the area. Create a new `<area>.spec.ts` only when none fits.
- Also list the negative and boundary variants (see the Coverage section of `testing.md`), and include the ones that matter.

## 2. Check the preconditions
- Is the backend up? `curl -s http://localhost:8081/actuator/health` should report `UP`. If it doesn't, ask the user to start it, or start it with `./gradlew bootRun` in `apps/backend` (needs Postgres).
- Read the page component under `apps/web/src/pages/` or `apps/admin/src/pages/`, and the strings in `apps/web/src/locales/en/translation.json`. That gives you the real accessible names, so you don't have to guess them.

## 3. Write it
- Arrange data through the API with `request` (helpers in `apps/web/e2e/auth.ts`), then act and assert in the UI.
- Use role and label locators scoped to a container, plus the existing CSS hooks where they're needed.
- Use only auto-waiting assertions. No `waitForTimeout`.
- Make data unique per test. Never assert global counts or list positions on the shared DB.
- If the correct assertion fails because of a known FM-BUG, keep the correct assertion and mark the test `test.fail()` with a `// FM-BUG-xx` comment. Don't weaken the assertion.

## 4. Prove it's stable
```
npx playwright test e2e/<file>.spec.ts -g "<title>" --repeat-each=10 --retries=0
```
- It must pass every time, or fail every time if it's a deliberate `test.fail()`.
- Also run the whole spec file once, to catch interference with the other tests.

## 5. Report back
Give the user the scenario covered, the file and test name, the repeat-run result, and any bug the test exposed (written up with the `report-bug` skill).
