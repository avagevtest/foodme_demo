---
name: run-regression
description: Run the FoodMe regression suite (lint/typecheck, backend JUnit, frontend unit tests if present, web + admin Playwright e2e), sort every failure into known defect / flaky / new regression, and produce a pass-fail report. Use when asked to run the tests, run regression, check that nothing broke, verify a change or branch before merge, or get a release go/no-go.
---

# Run FoodMe regression

**Goal:** an honest picture of the build. These rules come first:
- **Never edit tests or production code during a regression run.** No retries added, no assertions loosened, no `test.skip` inserted, no FM markers "fixed". Report, don't repair.
- **Never report a suite as passed when it didn't run.** Every suite ends in exactly one state: `PASS`, `FAIL`, `NOT RUN (<reason>)`, `PARTIAL`, or `N/A` (the suite doesn't exist in this repo yet).
- Run from the repo root unless a step says otherwise. Record start and end times.

## 0. Pick the scope
| Scope | When | Suites |
|---|---|---|
| `smoke` | quick check after a small change | static checks + backend tests + `happy-path.spec.ts` |
| `full` (default) | before merge or release, or when "run regression" is asked | everything below |
| `targeted` | a change limited to one area | static checks + the suites for the changed area (backend → JUnit + API-dependent e2e; web → web lint/build + web e2e; admin → admin lint/build + admin e2e) |

If the user names a scope, use it. Otherwise use `full`, and say so in the report.

## 1. Preflight: find blockers before running anything
Check each item and record what you find:

| Check | Command | Needed for |
|---|---|---|
| JDK 17–21 | `java -version` and `$JAVA_HOME`. If that shows 22+, look for another JDK: `ls "/c/Program Files/Java" "/c/Program Files/Eclipse Adoptium" "/c/Program Files/Microsoft" ~/.jdks` (Windows) or `/usr/lib/jvm` (Linux). If you find one, point `JAVA_HOME` at it **for this run only** | backend (Gradle 8.6 can't run on JDK 22+, and the toolchain needs 17). The first wrapper run downloads Gradle 8.6, so it needs network |
| Node 20+ / npm | `node -v`, `npm -v` | web, admin |
| Frontend deps | `apps/web/node_modules`, `apps/admin/node_modules` exist | web, admin. If missing, run `npm ci` in that app. That's allowed: it only writes `node_modules`, and takes about 1–2 min per app. `npm audit` warnings in its output **aren't a regression signal**; mention them once under "Notes" |
| Postgres on :5432 (db, user and password `foodme`) | portable port check: Git Bash `(echo > /dev/tcp/127.0.0.1/5432) 2>/dev/null && echo open`, or PowerShell `Test-NetConnection localhost -Port 5432` | starting the backend, so all e2e |
| Backend up | `curl -s http://localhost:8081/actuator/health` → `"UP"` | all e2e |
| Playwright browser | **not a check, an install.** Run `npx playwright install chromium` (in `apps/web`) **only once the backend is reachable** and e2e will really run | e2e |

- If something is missing, **don't install system software** (JDK, Postgres, Docker) without asking. Mark the dependent suites `NOT RUN (<what's missing>)`, and keep going with the suites that can run.
- If Postgres is available but the backend isn't running, start it in the background from `apps/backend`: `./gradlew bootRun` (`gradlew.bat` on Windows). Poll `/actuator/health` until it's `UP`, for up to about 3 minutes: the first start runs Flyway and seeds images. Stop it when you're done if you started it.
- Optional, for faster e2e: start the backend with `FOODME_LATENCY_MAXMS=0`. The default latency is part of what's being tested, though, so for a `full` run before a release, leave it on.

## 2. Run the suites, cheapest first
Run each suite even if an earlier one failed, unless the failure makes the next one meaningless (e.g. the backend fails to start → e2e is `NOT RUN`).

1. **Static checks**
   - `apps/web`: `npm run lint`, then `npm run build` (`tsc -b` is the typecheck)
   - `apps/admin`: `npm run lint`, then `npm run build`
2. **Backend tests** (`apps/backend`): `./gradlew cleanTest test` (on Windows, `gradlew.bat cleanTest test` in PowerShell or cmd, or `./gradlew` in Git Bash). Uses H2, so it doesn't need Postgres.
   - Reports: `build/reports/tests/test/index.html`; machine-readable results in `build/test-results/test/*.xml`.
3. **Frontend unit tests**, only if a `"test"` script exists in that app's `package.json`: `npm test`. Otherwise record `N/A (no unit tests configured)`. **N/A doesn't count toward INCOMPLETE**: there's nothing to run, so nothing is blocked.
4. **Web e2e** (`apps/web`): `npx playwright test --retries=0 --reporter=list,html`
5. **Admin e2e** (`apps/admin`): `npx playwright test --retries=0 --reporter=list,html`
   - HTML report: `playwright-report/` in each app; traces for failed tests in `test-results/`.
   - `--retries=0` on purpose: the first-run result is the true result.

Set `VITE_API_BASE_URL` if the backend isn't at `http://localhost:8081`. Remember that `layout.spec.ts` ignores it.

## 3. Triage every failure
For each failing test, collect: name, file, error message (first lines), and the trace or stack location. Then classify it:

1. **Known defect (expected):** the failure lines up with a planted `FM-BUG-xx` or a listed security gap in `AGENTS.md` (same area, same symptom). Name the id. This doesn't block, because it's course material, unless the user says otherwise.
2. **Flaky:** re-run **that test only**, up to 5 times:
   - Playwright: `npx playwright test <file> -g "<title>" --repeat-each=5 --retries=0`
   - JUnit: `./gradlew test --tests '<Class>.<method>'`

   If it both passes and fails across runs, it's flaky. Name the FM-FLAKE id if one matches. The re-runs are **only for classification**: the suite result stays `FAIL`.
3. **Environment:** the backend is down, a port is taken, the browser is missing, a timeout comes from the machine and not the app. Fix the environment if that's safe and re-run once. Otherwise mark it `NOT RUN`.
   - **Known environment failure:** the last test in `web/e2e/happy-path.spec.ts` ("admin can login and list orders after a storefront checkout") opens `${API}/backoffice/`. That page exists only when the backend serves the **built** admin bundle (Docker image / `bootJar` with the SPAs copied in). Against a plain `bootRun` it fails, and that's environment, not regression.
4. **New regression:** fails every time and isn't a known defect. **This is the important one.** Point to the likely cause using the `file:line` from the stack or trace, plus:
   - in a git repo: `git log -n 20 --oneline -- <area>` / `git diff <base>...HEAD -- <area>`
   - without git (e.g. a downloaded zip): compare with the previous saved regression report, if there is one. Otherwise write "likely cause: cannot determine (no history or baseline)". Don't guess.
5. **Jira:** if the failure matches an existing ticket (search `project = SCRUM AND text ~ "<key words>"`, see the `jira` skill), put the key next to it. Never file tickets during a regression run. Offer to afterwards.

Tests that `@Disabled` or `test.fail()` marks as known failures count as expected. Note them, but don't triage them.

## 4. Report
Give this report in chat, and save it to `test-results/regression-<YYYY-MM-DD-HHmm>.md` at the repo root only if the user asked for a file:

```
# Regression report: <scope>, <date time TZ>
Environment: <OS>, JDK <v>, Node <v>, backend <url> (latency on/off), DB <Postgres/H2>
Verdict: GO | NO-GO | INCOMPLETE
  GO         = every applicable suite ran; failures are only known defects or known environment failures
  NO-GO      = at least one new regression or newly flaky test (this wins over INCOMPLETE)
  INCOMPLETE = no new regression found, but at least one applicable suite NOT RUN (list what's needed to run it)
  (N/A suites don't count. Lint warnings never block; list them under Notes.)

For test suites, fill Passed / Failed / Skipped with test counts. For lint+build rows, use
Passed = "exit 0", Failed = error count, Skipped = "–", and put the warning count in Notes.

| Suite | Result | Passed | Failed | Skipped | Time |
|---|---|---|---|---|---|
| web lint+build | ... |
| admin lint+build | ... |
| backend JUnit | ... |
| frontend unit | ... |
| web e2e | ... |
| admin e2e | ... |

## New regressions (blocking)
- <test> (<file>): <error>. Likely cause: <file:line / commit>. Repro: <command>

## Flaky
- <test>: <n/5 failed on re-run>. Suspected cause / FM-FLAKE-xx

## Known defects (expected failures)
- <test>: FM-BUG-xx / SEC: <gap>

## Not run
- <suite>: <reason>. To enable: <exact step>

## Notes (non-blocking)
- Lint warnings: <count per app, with file:line>. New vs old: compared with <baseline report> / "no baseline".
- Build warnings (e.g. chunk size), npm audit summary.

Artifacts: <report paths>
```

Keep it factual: copy the numbers from the runner output, don't estimate them. Offer next steps: `report-bug` for each new regression, `investigate-flaky-test` for each flaky one.
