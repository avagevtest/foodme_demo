# Testing rules (all test code)

Applies to: `apps/web/e2e/**`, `apps/admin/e2e/**`, `apps/backend/src/test/**`

## Assertions
- **Assert the correct behavior, never the buggy one.** Don't loosen an assertion to get past a known defect. For example, `apps/web/e2e/layout.spec.ts` uses `toBeGreaterThanOrEqual(4)` to tolerate FM-BUG-02. Instead, mark the test as a known failure with the bug id: `test.fail()` with a comment in Playwright, or `@Disabled("FM-BUG-xx")` in JUnit.
- **Assert on what the API guarantees.** Don't assert on list position unless the endpoint defines a sort order with no ties. Don't assert exact totals or counts against a shared or persistent DB; check that the record you created is present.
- **Make time deterministic.** Don't compare server timestamps with `LocalDate.now()` or `new Date()`. The DB stores UTC, but the code calls `LocalDateTime.now()` in the JVM's time zone. Use UTC, allow a tolerance, or inject a `Clock`.
- **Every bug fix needs a regression test** that fails before the fix and passes after it.

## Isolation
- No dependence on execution order or on another test's data.
- Create unique data per test, e.g. an email like `e2e-${Date.now()}-${random}@example.com`.
- Never sleep to wait for something (`waitForTimeout`, `Thread.sleep`). Wait for a condition instead.

## Coverage
Cover negative paths and boundaries, not only the happy path:
- 401 with no token or a wrong role (customer token on `/admin/**`)
- 400 for invalid input: quantity null, 0 or negative; non-cash payment; missing required fields
- 404 for a missing dish, chef or order
- values exactly at the free-delivery threshold, and one unit either side
- non-integer prices and quantities above 1 (rounding)
- HTML or script payloads in free-text fields such as the order note

## Flakiness
- Reproduce a flaky test before you claim a fix:
  - Playwright: `--repeat-each=20 --retries=0`
  - Gradle: repeated `./gradlew cleanTest test` runs
- Retries in CI hide flakiness and don't fix it. Don't raise retry counts to make a suite green.
- Never commit `test.only` (CI enforces `forbidOnly`).
