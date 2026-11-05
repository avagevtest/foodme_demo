# Backend code rules

Applies to: `apps/backend/src/main/**`

- **Schema changes:** add a new `db/migration/V<n>__<name>.sql`. Never edit an existing migration. `ddl-auto=validate` makes startup fail if entities and schema drift apart.
- **New endpoints:**
  - Add the route prefix to `utils/ControllerUtil.java`.
  - Put the controller under `controller/api` (public or customer) or `controller/admin` (back office).
  - Check `security/SecurityConfig.java`. The rules match in order, and `/api/**` is `permitAll` unless an earlier matcher restricts it.
- **Errors:** throw `BadRequestException` (400) or `NotFoundException` (404). `GlobalExceptionHandler` turns them into `{ message }`. Don't return error bodies by hand.
- **Validation:** request DTOs are where bad input should be rejected, using Bean Validation plus `@Valid` on the controller parameter. Missing validation is a real defect class here (see FM-BUG-04).
- **Images:** a DTO field that holds an `/api/images/...` URL must be added to `config/ImageUrlResponseAdvice`, or clients get a relative URL.
- **Admin lists** return `AdminListResponseDto` (`{ list, count }`) with 0-based `page` and `size`, which the admin `dataProvider` depends on.
- **Money:** prices are `double`. Don't truncate to `int` (see FM-BUG-01).
- **Time:** the DB stores UTC. Prefer UTC-aware time, or an injected `Clock`, over `LocalDateTime.now()`.
- **FM-BUG-xx markers:** don't fix one unless you've been asked to. See AGENTS.md.
