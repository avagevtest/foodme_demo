---
name: write-integration-test
description: Write FoodMe backend integration tests that run the real Spring context over HTTP (MockMvc + H2): endpoint contracts, security and roles, validation responses, persistence and multi-step API flows. Also covers API-level Playwright tests against a running backend and checking migrations on real Postgres. Use when asked to test an endpoint, API, auth rule, DB behavior or how components work together.
---

# Write a FoodMe integration test

Follow `.agents/rules/testing.md` and `.agents/rules/backend-tests.md`. Integration tests check that **real components work together**: controller → security → service → JPA → DB → JSON. Logic edge cases belong in `write-unit-test`, browser flows in `write-e2e-test`.

## 1. Choose the scenario
Derive cases from `security/SecurityConfig.java`, the controller signatures and the DTOs:

| Area | Cases |
|---|---|
| Auth & roles | no token on a protected path → 401; admin token on `/api/customer/**` → 403; tampered or wrongly signed JWT → 401 |
| Login | wrong credentials currently return **400** (`BadRequestException`), not 401: `POST /api/auth/login` → `"Invalid email or password"`. Assert what the API actually returns, and treat 400 vs 401 as a question for the product owner |
| Error format | every error body has `timestamp, status, error, message, path`; validation errors (`MethodArgumentNotValidException`) → 400 with `$.message` |
| Validation | missing or invalid fields → 400; `createOrderDishes[].quantity` null, 0 or negative (FM-BUG-04); non-cash `paymentType` → 400 `"Only CASH payment is supported"` |
| Not found | unknown chef, dish or order number → 404 with `$.message` |
| Contract | response field names and types the frontends use (`exploreChefResponseDtoList`, `dishDtoList`, admin `{list,count}`) |
| Persistence | create an order → `GET /api/order/number/{n}` returns the same items, prices and address; it shows up in `GET /api/customer/orders` and `GET /admin/order` |
| Business flows | `POST /api/order/delivery-price` at the free-delivery threshold (FM-BUG-03); dish from another chef or inactive in the order (FM-BUG-05); last page of `/api/chef/active` (FM-BUG-02); `PATCH /admin/order/{id}/status` → the new status shows in `GET /api/order/number/{n}` |
| Pagination | `page`/`size` limits, totals vs list length, the last page |

### Security checks that are expected to fail today
None of these has an FM marker. Write the **correct** assertion, mark the test `@Disabled("SEC: <one line>")`, and report each one with `report-bug`. Don't change the production code unless asked.
- **Customer token on `/admin/**` must get 403.** `SecurityConfig` only requires `authenticated()`, not `hasRole("ADMIN")`, so any valid customer token can call the admin API.
- **Admin login must not reveal which part was wrong.** `AdminAuthService` returns `"Unknown username: <x>"` vs `"Incorrect password"`, which lets someone discover valid usernames. Assert a single generic message.
- **A 500 must not leak a stack trace.** `GlobalExceptionHandler` puts the full stack trace in `$.trace`. `GET /api/debug/boom` always throws, so use it to get a 500, then assert `$.trace` is empty or absent.
- **Tokens must expire.** `JwtService` issues tokens with no `exp` claim, so a token stays valid forever. Decode the issued token and assert that `exp` is present.

### Image URL caveat
`ImageUrlResponseAdvice` rewrites only URLs that start with `/api/images/`. The test fixtures in `data.sql` use `/img/...`, so in H2 tests image URLs are passed through **unchanged**. To test the rewrite, add a fixture row with an `/api/images/...` URL at a new ID, or check it against a running backend (section 4), where the Flyway data uses `/api/images/`.

## 2. Write it (MockMvc + H2, the existing pattern)
- Location: `apps/backend/src/test/java/am/foodme/backend/<Area>ControllerTest.java` or `<Flow>IT.java`. Extend the existing class for the same controller.
- Setup (keep it exactly like this, because the `test` profile turns off Flyway, latency, HTTP logging and the heartbeat job):
  ```java
  @SpringBootTest
  @AutoConfigureMockMvc
  @ActiveProfiles("test")
  class OrderFlowIT {
      @Autowired MockMvc mockMvc;
      @Autowired ObjectMapper objectMapper;
  }
  ```
- Auth helpers (copy them from `OrderControllerTest` / `CustomerAuthControllerTest`):
  - customer: `POST /api/auth/register` with a **unique** email → `token`
  - admin: `POST /admin/auth/login` with `admin` / `admin123` → token
- Build request bodies with `objectMapper.writeValueAsString(Map.of(...))` or the real DTO classes.
- Assert with `status()`, `jsonPath(...)` and, for error cases, `jsonPath("$.message")`. Read a response back with `objectMapper.readTree` to chain steps.
- **Shared state:** the Spring context and H2 DB are shared by all test classes. Create what you assert on, and assert on your own records (by the id or number returned to you). Don't assert global counts, the "first" order number, or position in a list without a defined sort. Don't add `@TestMethodOrder` dependencies.
- Fixtures: use the existing `data.sql` rows (chef 1 is active with dishes 1–2, chef 3 is inactive, dish 4 is inactive). Add new rows at new IDs only, in H2-compatible SQL.
- Repository-only tests (e.g. `DishSearchRepositoryImpl` native SQL) can use `@DataJpaTest` + `@ActiveProfiles("test")` + `@AutoConfigureTestDatabase(replace = Replace.NONE)`. Without `replace = NONE`, Spring swaps in its own H2 URL, which drops `MODE=PostgreSQL` and the `foodme` schema setup. Native SQL that's valid on Postgres but not on H2 is a known limit of this setup, so note it.
- A known FM-BUG keeps its correct assertion, and the test gets `@Disabled("FM-BUG-xx: ...")`.

## 3. Real Postgres and migrations (optional, ask first)
H2 + Hibernate `create-drop` **doesn't run the Flyway migrations**, and native SQL may behave differently there. When a change touches `db/migration` or native queries:
- Quick check: run `./gradlew bootRun` against a local Postgres. If Flyway applies and `ddl-auto=validate` passes, startup succeeds.
- Automated check: propose Testcontainers (`org.testcontainers:postgresql`, `junit-jupiter`) with a `@DynamicPropertySource` datasource and Flyway enabled. It adds dependencies and needs Docker, so **get the user's OK first**.

## 4. API-level tests against a running backend (Playwright `request`)
To check deployed behavior (real latency, real Postgres, CORS, the SPA fallback), write API-only specs with Playwright's `request` fixture under `apps/web/e2e/api-*.spec.ts`:
- Use `process.env.VITE_API_BASE_URL ?? "http://localhost:8081"` and `registerCustomerViaApi` from `e2e/auth.ts`.
- Check `/actuator/health`, auth status codes, and that `/admin/...` and `/api/...` never return HTML (the SPA fallback must not swallow API paths).
- The DB is persistent, so the unique-data and no-counts rules apply even more strongly.

## 5. Verify and report back
- Run the new class alone, then the full suite with `./gradlew cleanTest test`, so you catch interference with other classes.
- Confirm each test can fail: break the expectation for a moment and watch it go red.
- Report back the scenarios covered, the files, the run results, and any defects (use `report-bug`).
