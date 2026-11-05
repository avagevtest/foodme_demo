---
name: write-unit-test
description: Write fast, isolated unit tests for FoodMe logic: backend services, DTO mappers and validation (JUnit 5 + Mockito, no Spring context), and frontend pure functions, zod schemas, the cart module and the admin dataProvider (Vitest). Use when asked to unit test a class, function, calculation or rule, or to cover logic below the API and UI level.
---

# Write a FoodMe unit test

Follow `.agents/rules/testing.md`. A unit test exercises **one class or function** with no database, HTTP, Spring context or browser. Use it for calculations, branching and mapping. Use `write-integration-test` for wiring, security, persistence and JSON contracts, and `write-e2e-test` for user flows.

## 1. Choose the targets and the cases
Good targets here, with known defects worth pinning down:

| Target | What to test |
|---|---|
| `OrderService.calculateDeliveryPrice` | below, **exactly at**, and above `freeDeliveryFrom`; null threshold (FM-BUG-03) |
| `OrderService.createOrder` | subtotal with fractional prices × quantity > 1 and with additions (FM-BUG-01); unknown dish → `NotFoundException`; dish from another chef or inactive (FM-BUG-05); non-cash → `BadRequestException`; delivery vs takeaway address handling |
| `ChefService.getActiveChefsPage` | the last page returns every chef in it (FM-BUG-02) |
| `OrderService.createOrder` time | `createdAt` comes from `LocalDateTime.now()` (JVM zone, no offset) while the DB stores UTC (FM-BUG-06). There's no injectable `Clock`, so assert a before/after range, and run once with a non-UTC JVM zone (see `investigate-flaky-test`) |
| `OrderDto.mapEntityToDto` | every field copied, including order dishes and `createdAt` |
| `CustomerAuthService` | duplicate email → `BadRequestException("Email already registered")`; unknown email and wrong password give the **same** message; issued token has role `CUSTOMER` |
| `JwtService` | issue → verify round trip keeps subject and role; wrong secret, wrong issuer or a modified payload → exception. It doesn't set `exp` (tokens never expire), so a test asserting `exp` exists will fail: mark it and report it |
| Bean Validation on DTOs | `CreateOrderDishDto.quantity` null, 0 or negative is rejected (FM-BUG-04) |
| web `lib/utils.ts` | `formatAmd` rounds and groups (`1250.5` → `"1,251 AMD"`, `0`, negatives); `translate` (exact language, missing language → first entry, `undefined` → `""`); `sameLabel` ignores case and accents |
| web `schemas/*.ts` | `checkoutSchema`: DELIVERY needs street and city, TAKEAWAY doesn't; note longer than 300; `paymentType` other than `CASH` |
| web `hooks/useCart.ts` | other-chef `"mismatch"`, `replaceOtherChef`, `minimumOrderCount`, same dish with different additions → separate lines |
| web `api/client.ts` | base URL normalization (`""`, bare host → `https://`), 401 on `/api/customer` clears auth |
| admin `providers/dataProvider.js` | `{list,count}` → `{data,total}`, 1-based → 0-based page, resource → singular path |

For each target, list the happy path, the boundaries, invalid input and error paths before writing any code. The expected values come from the business rule, not from what the code returns today.

## 2. Backend (JUnit 5 + Mockito + AssertJ, already in `spring-boot-starter-test`)
- Location: `apps/backend/src/test/java/am/foodme/backend/<package>/<ClassName>Test.java`, mirroring the main package (e.g. `service/OrderServiceTest.java`).
- **No `@SpringBootTest`, no `@ActiveProfiles`.** Services use constructor injection, so construct them directly:
  ```java
  @ExtendWith(MockitoExtension.class)
  class OrderServiceTest {
      @Mock OrderRepository orderRepository;
      @Mock ChefRepository chefRepository;
      @Mock DishRepository dishRepository;
      @Mock CustomerRepository customerRepository;
      OrderService service;

      @BeforeEach
      void setUp() {
          service = new OrderService(orderRepository, chefRepository, dishRepository,
                  customerRepository, new SimpleMeterRegistry());   // real registry, not a mock
      }
  }
  ```
- Build entities and DTOs with small local factory methods (`chef(deliveryPrice, freeFrom)`, `dish(id, chefId, price)`). Don't load `data.sql`.
- Stub only what the case needs (`when(chefRepository.findById(1L)).thenReturn(Optional.of(chef))`). Mockito strict stubs fail on unused stubs, so stub what you use. Capture saved entities with `ArgumentCaptor` and assert on their fields.
- Money: assert with `isCloseTo(expected, within(0.001))` and pick values that expose truncation, e.g. price `1250.5` × quantity `3`.
- Time: don't assert against `LocalDateTime.now()`. Assert a range (before ≤ value ≤ after) or the zone and offset.
- Bean Validation without Spring:
  ```java
  Validator validator = Validation.buildDefaultValidatorFactory().getValidator();
  assertThat(validator.validate(dto)).extracting(v -> v.getPropertyPath().toString()).contains("quantity");
  ```
- Name tests `method_condition_expectedResult`. Use `@ParameterizedTest` + `@CsvSource` for boundary tables.
- A correct assertion that fails because of a known FM-BUG stays as it is. Mark the test `@Disabled("FM-BUG-xx: <one line>")`.
- Run: `./gradlew test --tests 'am.foodme.backend.service.OrderServiceTest'`. It should take seconds.

## 3. Frontend (Vitest): one-time setup, ask first
Neither SPA has a unit-test runner yet. **Get the user's OK before adding dependencies.** Then:
- `npm i -D vitest` in the app folder. Choose a Vitest version whose peer range includes the app's installed Vite (web is on Vite 8, admin on Vite 6), and check with `npm ls vite` after installing.
- Add the script `"test": "vitest run"` (and `"test:watch": "vitest"`).
- web: add `test: { environment: "node", include: ["src/**/*.test.ts"] }` to `vite.config.ts`, so the `@` alias keeps working. Excluding `e2e/` keeps Playwright specs out.
  - Put `/// <reference types="vitest/config" />` at the top of `vite.config.ts`, so `tsc -b` accepts the `test` key.
  - `tsconfig.app.json` only has `vite/client` types, and test files under `src/` are type-checked by `npm run build`. So **import `describe/it/expect/vi` from `"vitest"` explicitly**. Don't rely on globals.
- For the cart module, add `fake-indexeddb` and `import "fake-indexeddb/auto"` at the top of the test, and call `clearCart()` in `beforeEach`.
- For `client.ts` / `auth-storage.ts`, use `environment: "jsdom"` (add `jsdom`), or stub `fetch` and `localStorage` with `vi.stubGlobal`.
- `client.ts` and admin `base-api.js` compute the API base URL **when the module loads**. To test the URL normalization:
  1. `vi.stubEnv("VITE_API_BASE_URL", "api.example.com")`
  2. `vi.resetModules()`
  3. `await import("@/api/client")`
  4. `vi.unstubAllEnvs()` in `afterEach`
- Put tests next to the code: `src/lib/utils.test.ts`, `src/schemas/checkout-schema.test.ts`, `src/providers/dataProvider.test.js`.
- Mock the axios layer for `dataProvider` with `vi.mock("../api/base-api.js")`.
- Component rendering tests (React Testing Library) are a separate decision that needs more deps. Prefer testing the logic directly, and leave flows to Playwright.

## 4. Verify
- The new tests pass, or are marked `@Disabled` / `it.fails` with an FM id when they expose a known bug.
- Sanity-check that each test can fail: break the line under test for a moment, or flip an expected value, and confirm the test goes red.
- The whole suite still passes: `./gradlew test` and/or `npm test`.

## 5. Report back
Give the targets and cases covered, the files added, any setup added (with the user's OK), and the bugs the tests exposed (use `report-bug`).
