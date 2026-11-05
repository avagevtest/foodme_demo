---
name: jira
description: Work with the FoodMe Jira project (SCRUM on avagevtest.atlassian.net) through the Atlassian MCP server. Find and read issues, file bugs from verified reports, attach evidence, move issues through the QA workflow (In Progress → In Review → Ready for test → Done), retest and verify fixes, link tests to tickets, and summarize sprint status. Use whenever the user mentions Jira, a ticket or an issue key (SCRUM-123), filing a bug, the sprint or board, or "ready for test".
---

# Working with Jira (FoodMe)

## Site facts (checked 2026-11-05; re-check if a call fails)
| | |
|---|---|
| Site | `https://avagevtest.atlassian.net`, cloudId `d9b0e44e-06df-4a26-b380-aaa657feae4d` (the hostname also works as `cloudId`) |
| Project | key **`SCRUM`**, name "AM_QA", team-managed (next-gen) software project |
| Issue types | Epic, Story, Task, Bug, Subtask |
| Workflow | `To Do` → `In Progress` → `In Review` → `Ready for test` → `Done` |
| Sprint | active sprint "SCRUM Sprint 0" on board 1 (sprint field `customfield_10020`) |
| Labels in use | `bug` plus an area label, e.g. `shopping-cart` |
| Reference bug | **SCRUM-5**: copy its description layout and its verification-comment style |

If a fact here looks stale (a call rejects a status, type or field), look it up again: `listJiraProjects` (with `expand: issueTypes`), `listJiraStatuses` (mode `project`), `listJiraIssueTransitions`, `getJiraIssueTypeMetaWithFields`. Then tell the user so this table can be updated.

## Tools
Use the Atlassian MCP server.
- **Primary tools:** `searchJiraIssuesUsingJql`, `getJiraIssue`, `createJiraIssue`, `editJiraIssue`, `addOrEditJiraIssueComment`, `transitionJiraIssue`.
- **Other operations:** find them with `discover` and run them with `executeRead` / `executeWrite`. Examples: `listJiraIssueTransitions`, `uploadAttachmentToJiraIssue`, issue links, `listJiraBoards`.
- Never guess an operation name. If you're unsure, call `discover`.
- If no Atlassian tools are available, see **Setup** at the end.

## Safety rules
- **Reads are free.** Every write is visible to the team, so draft it first and get the user's OK. Writes include creating issues, editing fields, comments, transitions, attachments, links and sprint moves.
  - A user request that names both the action and the issue (e.g. "move SCRUM-7 to Ready for test") counts as approval for that one action.
- **Never delete** issues, comments or attachments unless the user explicitly asks for that specific item.
- **JQL must be bounded.** The site rejects unbounded queries, so always include `project = SCRUM` or another restriction.
- **No secrets in tickets:** no JWTs, passwords, API keys or `.env` values. Redact tokens in request and response samples (`Bearer <redacted>`).
- `editJiraIssue` **replaces** multi-value fields such as labels and components. Read the current values first, then send the full list.
- Use the transition **name or id** from `listJiraIssueTransitions`, not the target status name.
- Put comments in `addOrEditJiraIssueComment`, not in a transition's `update` field, because those are silently dropped.
- After each write, give the user the issue key and its `https://avagevtest.atlassian.net/browse/<KEY>` link.

## Workflows

### A. Find and read
JQL cookbook (always bounded):
```
project = SCRUM AND statusCategory != Done ORDER BY priority DESC, updated DESC     -- open work
project = SCRUM AND issuetype = Bug AND statusCategory != Done                     -- open bugs
project = SCRUM AND status = "Ready for test" ORDER BY updated ASC                 -- QA queue
project = SCRUM AND sprint in openSprints()                                        -- current sprint
project = SCRUM AND text ~ "cart decrement"                                        -- duplicate check
project = SCRUM AND labels in (security) AND statusCategory != Done
project = SCRUM AND assignee = currentUser() AND statusCategory != Done
```
- For one issue, use `getJiraIssue` with `view: "evidence"`, which also returns links, comments and custom fields.
- Summarize what matters: status, assignee, steps, the latest comment. Don't paste raw JSON.

### B. File a bug
1. **Verify first.** Follow the `report-bug` skill: reproduce it, gather evidence, classify it.
2. **Check for duplicates.** Run a `text ~ "<key words>"` search plus a search by area label. If you find a match, offer to comment on that issue instead of filing a new one.
3. **Draft the issue and show it to the user:**
   - `issueType`: `Bug`; `projectKey`: `SCRUM`
   - `summary`: `<Area>: <what is wrong> when <condition>`, under about 100 characters
   - `priority`, mapped from report-bug severity: Critical → `Highest`, High → `High`, Medium → `Medium`, Low → `Low`
   - `labels`: `bug` + an area label (`shopping-cart`, `checkout`, `admin`, `orders`, `auth`, `api`), plus `fm-bug-0X` when a planted marker matches, or `security` for the known security gaps listed in `AGENTS.md`
   - `description` (markdown), with the sections SCRUM-5 uses:
     ```
     ## Environment
     * Application: <URL, local or https://foodme-<user>.onrender.com>
     * Browser / client: <Chrome version / curl / Playwright>
     * Testing type: <Manual UI / API / Automated (test name)>
     * Test date: <YYYY-MM-DD, TZ>
     * Page or endpoint: <route or METHOD /path>

     ## Preconditions
     ## Steps to Reproduce
     ## Expected Result
     ## Actual Result
     ## Reproducibility        (n/N attempts, one line per run)
     ## Additional Findings    (console, network, scope; suspected cause file:line, marked unconfirmed)
     ## Evidence               (attachment filenames + what each shows; redacted request/response)
     ```
   - Sprint: add `assignToSprint: "active"` only if the user asks.
4. **Create it** with `createJiraIssue`, then attach evidence (step C).
5. **Report back** the key, the link, and a one-line summary.

### C. Attach evidence
- Find the upload operation with `discover` ("upload attachment to jira issue") and run it with `executeWrite`.
- Name files in order with a short description: `01_before_<x>.png`, `02_after_<x>.png`, `trace_<test>.zip`.
- Screenshots come from Playwright (`test-results/`) or a browser. Logs are Loki or console excerpts with secrets removed.
- List every attachment in the description's **Evidence** section.

### D. Retest a fix (Ready for test → Done, or back)
1. Read the issue: the steps, the fix comment, the commit or deploy.
2. Re-run the **original steps**, plus the obvious neighbours (boundaries, the related flow). Run the matching automated test if there is one (look for the issue key in test names or comments).
3. Draft a comment in SCRUM-5's style:
   ```
   ## Verified on <env> | ## Retest failed on <env>
   **Build/commit:** <id or bundle hash>   **Date:** <YYYY-MM-DD>   **Browser:** <x>
   * <step/case> → <result> ✅/❌
   * Regression checks: <what else was run>
   Evidence: <attachments>
   ```
4. After the user OKs it, post the comment and transition the issue:
   - passed → `Done`
   - failed → back to `In Progress`, with the failing case first in the comment
   - Get the transition from `listJiraIssueTransitions`.

### E. Link tests and tickets
- When you write a regression test for a ticket, put the key in the test: Playwright title `"... (SCRUM-12)"` or a `// SCRUM-12` comment; in JUnit, `@DisplayName("... SCRUM-12")` or a comment.
- When a test is disabled for an open bug, put both ids in the reason: `@Disabled("SCRUM-12 / FM-BUG-03: ...")`, or `test.fail()` plus the same comment.
- After a `run-regression` report, offer:
  - a bug draft (B) for each **new regression**
  - a comment on the existing ticket for each failure that maps to one

### F. Test-work tickets
- For a feature or story, create one `Subtask` per test area under the story's key, using `parent`, e.g. "Test: checkout delivery price boundaries".
- Put the test cases in the description as a checklist (`- [ ] case → expected`).

### G. Sprint and QA status
Use the JQL above to list items by status, then report:
- the counts per status
- the `Ready for test` queue, oldest first
- open bugs by priority
- issues `In Progress` with no update in more than 3 days

This is read-only. Don't move issues without approval.

## Setup (only if no Atlassian tools are available)
- **Claude Code** in this workspace uses the **Atlassian connector from the user's claude.ai account**. Run `/mcp` to check that it's connected and authenticated.
- **Without that connector**, e.g. a teammate's CLI, add Atlassian's remote MCP server once per user. Atlassian's docs have the current URL; at the time of writing it was `https://mcp.atlassian.com/v1/mcp`:
  ```
  claude mcp add --transport http atlassian https://mcp.atlassian.com/v1/mcp
  ```
  Then run `/mcp`, choose `atlassian`, and complete the browser OAuth sign-in to `avagevtest.atlassian.net`.
- Don't add it if the claude.ai connector is already connected, or every tool will show up twice.
- Never put API tokens in repo files.
- **Other agents:** configure the same remote MCP server in that agent's MCP settings. The workflows above don't change.
