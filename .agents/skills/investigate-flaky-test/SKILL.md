---
name: investigate-flaky-test
description: Diagnose and fix an intermittently failing FoodMe test (Playwright e2e or JUnit backend), including the FM-FLAKE-xx course exercises. Use when a test "sometimes fails", passes on retry, fails only in CI or only in the full suite, or the user mentions flakiness.
---

# Investigate a flaky test

Rule zero: **no fix without a reproduction and a cause.** Retries, longer timeouts and sleeps are not fixes.

## 1. Reproduce and measure
- Playwright:
  ```
  npx playwright test <file> -g "<title>" --repeat-each=30 --retries=0
  ```
  Then try it with parallel load (`--workers=4`) and in the full suite.
- JUnit: run the single test alone, then the whole class, then `./gradlew cleanTest test`. If it passes alone but fails in the suite, suspect shared state.
- Suspect the environment? Force it instead of waiting for it to happen:
  - **Time zone (JUnit):** `JAVA_TOOL_OPTIONS="-Duser.timezone=Pacific/Kiritimati" ./gradlew cleanTest test --tests '<Class>'`. Gradle's forked test JVM reads `JAVA_TOOL_OPTIONS`. Try a zone near the date line on each side (`Pacific/Kiritimati`, `Pacific/Pago_Pago`).
  - **Time zone (Playwright):** `test.use({ timezoneId: "Pacific/Kiritimati" })` in the spec.
  - **Slow API:** the latency is already random (200–1500 ms). Raise it with `FOODME_LATENCY_MAXMS=4000` on the backend to make races show up. Use `FOODME_LATENCY_MAXMS=0` to check whether a failure goes away without latency.
  - **CPU contention:** `--workers=8`.
  - **CI only:** set `CI=1` to get CI's config (`forbidOnly`, no server reuse), and add `--retries=0` so CI's retries don't hide the failure.
- Write down the failure rate, e.g. "4/30 fail". It's your baseline for proving the fix.
- For a Playwright failure, open the trace (`npx playwright show-report`) and look at the failing step, network timing, and DOM state.

## 2. Classify the cause
Check these, in order. Every one of them exists somewhere in this repo:

| Symptom | Likely cause | Example |
|---|---|---|
| Fails when the API is slow | fixed `waitForTimeout` / missing condition wait | FM-FLAKE-01 |
| Fails after reload or navigation | acted before the async state was saved (IndexedDB cart) | FM-FLAKE-05 (fixed) |
| Passes alone, fails in suite | shared H2 DB / sequence across classes, or order dependence | FM-FLAKE-02 |
| Wrong item at index 0 | asserting an order the API doesn't define (ties) | FM-FLAKE-03 |
| Fails near midnight or in another TZ | local date compared with server or UTC time | FM-FLAKE-04 |
| Count mismatch | persistent DB grows between runs | `layout.spec.ts` counts |
| Random 200–1500 ms delays | `SimulatedLatencyConfig`, which is by design | — |

Also decide whether **the product is the flaky part** rather than the test, e.g. a real race in the app. If so, it's a bug: report it, and don't hide it in the test.

## 3. Fix the root cause
- Replace sleeps with condition waits: `expect(...)`, `expect.poll`, `waitForResponse`.
- Wait for the state you depend on before you reload or navigate.
- Make data unique per test. Assert on your own record, not on totals or position.
- Remove order dependence (`@Order`, shared sequences). Have each test create what it asserts on.
- Make time deterministic: UTC, a tolerance, or an injected `Clock`.
- For an FM-FLAKE item, keep the marker and append `FIX` plus a one-line reason (the format `FM-FLAKE-05` uses).

## 4. Verify
Re-run the same repeat command from step 1. It must reach 0 failures over at least the same number of runs. Run the full suite once.

## 5. Report back
Give the before and after failure rates, the root cause in one sentence, what you changed, and whether a product bug was found.
