# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

FoodMe is a food-ordering demo app used as a **QA / observability course project**. It has three apps under `apps/`, deployed as **one** Render service (`render.yaml`), plus a separate monitoring stack (`render-monitoring.yaml`, `infra/monitoring/`). The root `README.md` is a step-by-step deploy guide for students who don't code.

- `apps/backend`: Spring Boot 3.3 / Java 17 / Gradle, Postgres + Flyway, JWT auth. Package root `am.foodme.backend`.
- `apps/web`: customer storefront. React 19 + TypeScript + Vite 8 + Tailwind 4 + shadcn-style UI (`src/components/ui`), TanStack Query, react-hook-form + zod, Dexie (IndexedDB) cart.
- `apps/admin`: back office. react-admin 5 + MUI, plain JS/JSX, React 18, axios.

## Planted bugs and flaky tests (course material)

The codebase contains **deliberate** defects, marked with comments. The marker sits on or right above the faulty line.

| Marker | Where | Area |
|---|---|---|
| FM-BUG-01 | `OrderService.createOrder` subtotal | money math / rounding |
| FM-BUG-02 | `ChefService` active-chef paging | last page drops a chef |
| FM-BUG-03 | `OrderService` delivery price | free-delivery threshold boundary |
| FM-BUG-04 | `CreateOrderDishDto.quantity` | missing input validation |
| FM-BUG-05 | `OrderService` dish lookup | dish not checked against chef or status |
| FM-BUG-06 | `OrderService` / `OrderDto` `createdAt` | time zone handling |
| FM-BUG-08 | admin `OrderShow.jsx` note | XSS via `dangerouslySetInnerHTML` |
| FM-FLAKE-01 | `web/e2e/flake-dish-modal.spec.ts` | fixed `waitForTimeout` instead of an assertion |
| FM-FLAKE-02 | `OrderControllerTest` | depends on test order and a shared sequence |
| FM-FLAKE-03 | `DishControllerTest` | asserts an order the API doesn't guarantee (priority tie) |
| FM-FLAKE-04 | `OrderControllerTest` | compares server time to the local date |
| FM-FLAKE-05 | `web/e2e/flake-cart-persistence.spec.ts` | already fixed (`FIX` comment); the reference solution |

FM-BUG-07 was the cart "minus" button removing the whole line at quantity 2 (`decrementCartItem` in `apps/web/src/hooks/useCart.ts`). It's tracked as Jira **SCRUM-5** (Done, fixed in commit `8ae6a07`), so this copy has no marker for it.

Rules for these markers:
- **Don't fix an FM-* item unless asked.** Students are supposed to find them. If you find one while working on something else, mention it. Don't change it.
- When asked to fix one, fix the root cause, add a regression test that fails before the fix, and keep the marker comment (append `FIX`, as FM-FLAKE-05 does).
- Other demo behavior is intentional and not a bug:
  - simulated API latency (`SimulatedLatencyConfig`)
  - flaky heartbeat jobs that report to Sentry/GlitchTip
  - `/api/debug/boom`, which always throws
  - open CORS (`*`)
  - hardcoded dev JWT secret and internal API key
  - public `GET /admin/dish/**`

### Unmarked security gaps (found in review, no FM marker)
These may be planted or real, and haven't been confirmed with the course owner. Treat them like FM-BUGs: test for the correct behavior, report them, and don't fix unless asked.
- `/admin/**` accepts any valid JWT, including a customer token (`SecurityConfig` uses `authenticated()`, not `hasRole("ADMIN")`).
- Admin login returns different messages for an unknown username and a wrong password, which reveals valid usernames.
- `GlobalExceptionHandler` returns the full stack trace in `$.trace` on 500.
- `JwtService` issues tokens with no expiry.

## Commands

Backend (run from `apps/backend`; on Windows use `gradlew.bat`):
```
./gradlew bootRun                                  # needs your own Postgres on localhost:5432, db/user/pass "foodme"
./gradlew test                                     # H2 in-memory, "test" profile, no Postgres needed
./gradlew test --tests am.foodme.backend.OrderControllerTest
./gradlew test --tests 'am.foodme.backend.OrderControllerTest.createOrder_cashPayment_succeeds'
./gradlew cleanTest test                           # force a re-run (Gradle caches passing tests)
./gradlew bootJar
```
Swagger UI: `http://localhost:8081/swagger-ui.html`. Health: `/actuator/health`. Metrics: `/actuator/prometheus`. Seeded admin login: `admin` / `admin123` (Flyway `V1` and test `data.sql`).

Web (`apps/web`):
```
npm run dev            # Vite; calls backend at http://localhost:8081 in dev
npm run build          # tsc -b && vite build  (this is also the typecheck)
npm run lint           # oxlint
npm run test:e2e       # Playwright; auto-starts dev server on :5180 (PLAYWRIGHT_BASE_URL overrides)
npx playwright test e2e/happy-path.spec.ts
npx playwright test -g "takeaway checkout"
npx playwright test e2e/flake-dish-modal.spec.ts --repeat-each=20 --retries=0   # flake hunting
npm run test:e2e:all   # web e2e, then admin e2e
```

Admin (`apps/admin`):
```
npm run dev | build | lint     # lint = eslint
npm run test:e2e               # Playwright; dev server on :5174 (ADMIN_BASE_URL overrides), serial (fullyParallel: false)
```

E2E prerequisites:
- Both suites hit a **real running backend** at `VITE_API_BASE_URL` (default `http://localhost:8081`); start it first.
- `web/e2e/layout.spec.ts` ignores that variable and always uses `http://localhost:8081`.
- The last test in `web/e2e/happy-path.spec.ts` opens `${API}/backoffice/#/login`. That page exists only when the backend serves the **built** admin bundle, so the test fails against a plain `bootRun` from source.
- CI (`CI` env set) turns on `forbidOnly` and retries: 2 for web, 1 for admin.

Full production image (from repo root, the Docker context is the root):
```
docker build -f apps/backend/Dockerfile .
```

## Architecture

### Single-origin deployment
`apps/backend/Dockerfile` builds both SPAs, copies `web/dist` into `static/` and `admin/dist` into `static/backoffice/`, then builds the jar. `SpaWebConfig` serves the storefront at `/` and admin at `/backoffice`, with an SPA fallback for extension-less paths. The fallback never serves an SPA shell for `api/`, `admin/`, `actuator/`, `swagger-ui` or `v3/`.

- Admin lives at `/backoffice` because `/admin/**` is the admin **REST API**. The admin Vite `base` is `/backoffice/` only in production builds.
- Admin uses react-admin's **hash router** (`/#/orders`, `/backoffice/#/login`). The storefront uses a browser router (`web/src/router.tsx`).
- Both frontends default the API base to `""` (relative) in production builds and `http://localhost:8081` in dev (`web/src/api/client.ts`, `admin/src/api/base-api.js`).
- Frontend Sentry DSNs are baked in at build time. Render passes `VITE_SENTRY_DSN_WEB` / `VITE_SENTRY_DSN_ADMIN` as build args, and each one maps to `VITE_SENTRY_DSN` for its app.

### Backend API layout
- Route prefixes are constants in `utils/ControllerUtil.java`. Public/customer endpoints live in `controller/api/` (`/api/...`), back-office endpoints in `controller/admin/` (`/admin/...`).
- `security/SecurityConfig.java` is the source of truth for access rules:
  - `/api/customer/**` and `POST /api/order` need `ROLE_CUSTOMER`.
  - `/admin/**` needs auth, except `/admin/auth/login` and `GET /admin/dish/**`.
  - The rest of `/api/**` is public.
  - Unauthenticated requests get 401. Sessions are stateless JWT (`JwtService`, `JwtAuthenticationFilter`).
- Layering: controller → service (separate `Admin*Service` classes for back office) → Spring Data repositories (`DishSearchRepositoryImpl` runs a native name-search query) → JPA entities in `model/`. DTOs live in `dto/`. Errors go through `exceptionHandler/GlobalExceptionHandler` (`BadRequestException` → 400, `NotFoundException` → 404).
- Business rule: only `CASH` payment is accepted. Other payment types get a 400, and the storefront's "Idram" option still places a cash order.
- Translatable fields are stored as `_en/_am/_ru` columns and exposed via the `*DtoTranslation` DTOs.
- Admin list endpoints return `{ list, count }` (`AdminListResponseDto`) and are paged with `page` (0-based) and `size`. `admin/src/providers/dataProvider.js` maps this to react-admin's `{ data, total }` and maps plural resource names to singular paths (`orders`→`/order`). Sorting is client-side, so it only sorts the current page.

### Images
Images are stored **in Postgres** (`foodme.image`, migration `V2`) and served from `/api/images/**`. `ImageSeedRunner` loads `src/main/resources/img-seed/` into the table on first start (idempotent; turn off with `foodme.images.seed-enabled=false`). The DB stores API-relative URLs. `ImageUrlResponseAdvice` rewrites them to absolute URLs per request, so **a new DTO that carries an image URL must be added to that advice**.

### Database / config
- Schema `foodme`, managed by Flyway (`src/main/resources/db/migration/V*__*.sql`). `ddl-auto=validate`, so every entity change needs a new migration. Never edit an existing migration.
- `DatabaseUrlEnvironmentPostProcessor` (registered in `META-INF/spring.factories`) converts a Render/Neon `DATABASE_URL=postgresql://...` into JDBC settings. Otherwise the app uses `SPRING_DATASOURCE_URL` or the `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` variables.
- Hibernate stores times in UTC (`jdbc.time_zone=UTC`), but code calls `LocalDateTime.now()`, which uses the JVM's default time zone.
- Test profile (`application-test.properties`): H2 in PostgreSQL mode, Flyway **off**, schema from Hibernate `create-drop`, fixtures from `src/test/resources/data.sql`. Latency is 0, HTTP logging is off, and the heartbeat job is off.

### Observability (demo features)
- `SimulatedLatencyConfig` adds a random 200–1500 ms delay to `/api/**` and `/admin/**` (not `/api/images/**`). Tune it with `foodme.latency.min-ms` / `max-ms` (env `FOODME_LATENCY_MAXMS=0` turns it off locally; Spring's env-var form drops the dash).
- `observability/FlakyHeartbeatJob` (backend, off under the `test` profile) and `lib/flakyHeartbeat.*` (web and admin) fail about 1 in 10 ticks on purpose and report the failure to Sentry.
- `observability/HttpLoggingFilter` logs `/api/**` and `/admin/**` requests and responses, redacting auth and API-key headers (`HTTP_LOGGING_ENABLED`).
- Logging (`logback-spring.xml`):
  - Plain-text console logs under the `local` profile, JSON (Logstash) otherwise.
  - ERROR logs also go to Sentry.
  - Logs are pushed to Loki only when `LOKI_PUSH_URL` is set.
  - Logback `<if>` blocks must stay direct children of `<configuration>` (see the comment in the file).
- `infra/monitoring/stack` runs Grafana, Prometheus, Loki and Grafana MCP in one container behind nginx (`/`, `/prom/`, `/loki/`, `/mcp`). See `infra/monitoring/README.md`.

### Storefront specifics
- The cart is stored client-side in IndexedDB via Dexie (`lib/db.ts`, `hooks/useCart.ts`). A cart holds dishes from only one chef: adding a dish from another chef returns `"mismatch"` unless `replaceOtherChef` is set. The line uid is `chefId-dishId-sortedAdditionIds`.
- Customer auth token storage is in `lib/auth-storage.ts`. A 401 on `/api/customer*` clears it. The admin JWT is in `localStorage.token`, and a 401 redirects to login.
- UI strings live in `src/locales/en/translation.json` (i18next, English only). E2E tests match on this text, so changing copy can break them.
- Path alias `@` → `apps/web/src`.

## Testing rules and skills

Detailed rules live in `.agents/rules/`. **Read the matching file before you edit code in its area:**

| Rule file | Applies to |
|---|---|
| `.agents/rules/testing.md` | all test code: assertions, isolation, coverage, flakiness |
| `.agents/rules/e2e-tests.md` | `apps/web/e2e/**`, `apps/admin/e2e/**` |
| `.agents/rules/backend-tests.md` | `apps/backend/src/test/**` |
| `.agents/rules/backend-code.md` | `apps/backend/src/main/**` |
| `.agents/rules/frontend-code.md` | `apps/web/src/**`, `apps/admin/src/**` |

The non-negotiables, in short:
- Assert the correct behavior, never the buggy one. Mark known defects `test.fail()` / `@Disabled("FM-BUG-xx")`.
- No sleeps in tests.
- No dependence on order or shared data.
- Create unique data per test.
- Reproduce flakiness with repeated runs before claiming a fix.

Test at the lowest layer that can catch the defect: unit for logic, integration for wiring, security and the DB, e2e for user flows.

Step-by-step workflows live in `.agents/skills/<name>/SKILL.md`:
- `write-unit-test`: isolated logic tests. Backend uses JUnit 5 + Mockito with no Spring context; frontend uses Vitest, which isn't installed yet and needs the user's OK to add.
- `write-integration-test`: real Spring context over HTTP (MockMvc + H2) for contracts, security, validation and persistence. Optional: Postgres/Testcontainers and API-level Playwright specs.
- `write-e2e-test`: add a Playwright test for a storefront or admin flow.
- `investigate-flaky-test`: reproduce, classify and fix an intermittent failure.
- `report-bug`: verify a defect and write a reproducible bug report.
- `jira`: Jira project `SCRUM` on avagevtest.atlassian.net, through the Atlassian MCP server: JQL search, filing bugs in the SCRUM-5 format, evidence, retesting and transitions, linking tests to tickets. Draft every write and get the user's OK first.
- `run-regression`: preflight checks, then all suites cheapest-first, triage of every failure (known defect / flaky / environment / new regression), and a GO / NO-GO / INCOMPLETE report. It never edits code during a run.

Claude Code also has a `test-runner` subagent (`.claude/agents/test-runner.md`). It follows `run-regression` and has no file-editing tools, so it can report failures but can't "fix" them.

`.claude/rules/` and `.claude/skills/` are thin wrappers that load these files in Claude Code. Edit the `.agents/` copies only.

## Gotchas
- The root `.env.example` mentions `infra/docker-compose.yml`, Jenkins, and `docs/deployment.md`. **None of these exist in this repo**, so local dev needs a Postgres you provide yourself.
- `render.yaml`'s service `name` is meant to be personalized per student (`foodme-<github-username>`).
