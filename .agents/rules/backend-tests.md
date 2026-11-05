# Backend test rules (JUnit / MockMvc)

Applies to: `apps/backend/src/test/**`

- Tests are `@SpringBootTest` + `@AutoConfigureMockMvc` + `@ActiveProfiles("test")`. Keep that setup, because the `test` profile turns off Flyway, latency, HTTP logging and the heartbeat job.
- **One Spring context, and so one H2 database, is shared by every test class in a run.** Rows created in one class (orders, customers, the `order_number_seq` sequence) are visible to the others. Don't assert values that depend on what ran before, such as "the first order is FM-100001" (that's FM-FLAKE-02). Avoid `@TestMethodOrder` for correctness.
- If a test really needs a clean state, use `@Transactional` rollback for repository-level tests. Treat `@DirtiesContext` as a last resort, because it slows the suite.
- **Fixtures** live in `src/test/resources/data.sql` and run on top of the Hibernate `create-drop` schema, not the Flyway migrations.
  - Existing tests assert on fixture IDs and names, so add new rows and don't change existing ones.
  - The SQL must run on H2 in `MODE=PostgreSQL`.
  - Dishes 1 and 2 of chef 1 share `priority_index 0`, so their order isn't guaranteed (FM-FLAKE-03).
- To get a customer token, `POST /api/auth/register` with a unique email and read `token` from the response. For admin endpoints, `POST /admin/auth/login` as `admin` / `admin123`.
- Check status codes and error bodies (`$.message`) for failures, not only the happy path.
- Because Flyway is off in tests, a broken migration won't show up here. When a change touches `db/migration`, start the app against Postgres too.

Run:
```
./gradlew test --tests am.foodme.backend.<Class>
./gradlew test --tests 'am.foodme.backend.<Class>.<method>'
./gradlew cleanTest test     # bypass Gradle's up-to-date cache
```
