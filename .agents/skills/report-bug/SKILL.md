---
name: report-bug
description: Verify a suspected FoodMe defect and write a reproducible bug report (steps, expected, actual, severity, evidence from API, logs, Sentry/GlitchTip, Grafana). Use when the user finds or suspects a bug, asks to "write up", "file" or "report" an issue, or exploratory testing turns something up.
---

# Verify and report a bug

## 1. Confirm it's a bug
- Reproduce it at least twice, from a clean state: a new customer, an empty cart, a new browser context.
- Keep it apart from the intentional demo behavior, which is **not** a bug:
  - 200–1500 ms API latency
  - heartbeat errors in Sentry ("Simulated failure during …", "Storefront background task failed")
  - `/api/debug/boom`
  - open CORS
  - public `GET /admin/dish/**`
- Narrow it down to the smallest reproduction. Prefer a direct API call (`curl` or Swagger at `/swagger-ui.html`) when the UI isn't needed. Note which layer is at fault: API, storefront or admin.
- Check whether code near the fault has an `FM-BUG-xx` marker, and reference the id if so. Don't fix it unless asked.
- Check for duplicates. Is it already in the FM table in `AGENTS.md`, or in the tracker the user names? If it is, add your new evidence to that item instead of filing a new one.
- Known unmarked security gaps, so you can recognize and reference them:
  - customer JWT accepted on `/admin/**`
  - admin login reveals whether the username exists
  - 500 responses include a stack trace (`$.trace`)
  - JWTs never expire

## 2. Gather evidence
- The request and response: method, path, body, status, the relevant part of the response.
- Backend logs: the console, or Loki `{app="foodme-backend"}` in Grafana when monitoring is deployed. If a Grafana MCP server is connected (the stack exposes one at `/mcp`), query Loki and Prometheus through it, e.g. error logs around the time of the reproduction, or `http_server_requests_seconds_count{status="500"}`, and quote the result.
- Each request is logged by `HttpLoggingFilter` (method, path, status, body, with secrets redacted). Find yours by path and time.
- The error in GlitchTip, if the bug threw.
- A screenshot or Playwright trace for a UI bug.
- The environment: local or Render URL, browser, date/time and time zone (needed for time bugs).

## 3. Write the report

```
Title: <Area>: <what is wrong> when <condition>
       e.g. "Checkout: subtotal drops fractions when a dish has quantity > 1"

Severity: Critical | High | Medium | Low   (impact on the user or business, with a one-line reason)
Priority: suggested
Component: backend API | storefront | admin
Environment: <url / local>, <browser>, <date time TZ>
Related: FM-BUG-xx (if applicable)

Preconditions:
- ...

Steps to reproduce:
1. ...
2. ...

Expected result:
<the correct behavior, and where that expectation comes from: requirement, UI text, common sense>

Actual result:
<what happens, with exact values>

Reproducibility: always | n/N attempts
Evidence: <request/response, log lines, screenshot/trace path>
Notes: <scope: which other flows are affected, workaround, suspected cause file:line>
```

Severity guide:
- **Critical**: data loss or corruption, wrong money charged, security hole (XSS, auth bypass).
- **High**: a core flow (browse → cart → checkout → admin order handling) is blocked or wrong for many users.
- **Medium**: wrong behavior with a workaround, or limited to edge cases.
- **Low**: cosmetic or copy issues.

## 4. Deliver it
- By default, give the report in chat as Markdown, ready to paste.
- Only create a ticket when the user asks for it. For Jira, follow the `jira` skill (project `SCRUM`, the SCRUM-5 description layout, a duplicate check first). For other trackers, the user names the project. Show the draft first, because filing is visible to others. After filing, give the user the ticket key or link.

## 5. Offer a regression test
Offer to add an automated test that fails now and will pass once the bug is fixed:
- a JUnit test for an API or logic bug (see `.agents/rules/backend-tests.md`)
- a Playwright test for a UI bug, using the `write-e2e-test` skill

Until it's fixed, mark the test `test.fail()` / `@Disabled("FM-BUG-xx")`.
