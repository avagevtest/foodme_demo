// Action log: one JSON line per event in .claude/logs/actions.jsonl (gitignored).
// Logs a short, redacted summary of each action, not file contents or full outputs.
const { readInput, truncate, redact, log } = require("./lib");

const input = readInput();
const event = input.hook_event_name || process.argv[2] || "unknown";
const ti = input.tool_input || {};

function summary() {
  if (ti.command) return ti.command;
  if (ti.file_path) return ti.file_path + (ti.old_string != null ? " (edit)" : ti.content != null ? " (write)" : "");
  if (ti.pattern) return `${ti.pattern}${ti.path ? " in " + ti.path : ""}`;
  if (ti.url) return ti.url;
  if (ti.skill) return `skill ${ti.skill}`;
  if (ti.description) return ti.description;
  if (ti.jql) return `JQL: ${ti.jql}`;
  if (ti.issueIdOrKey) return `issue ${ti.issueIdOrKey}`;
  if (ti.summary) return `create: ${ti.summary}`;
  const keys = Object.keys(ti);
  return keys.length ? keys.slice(0, 5).join(",") : "";
}

const entry = { event, session: input.session_id };
if (input.tool_name) {
  entry.tool = input.tool_name;
  entry.target = truncate(redact(summary()));
}
if (event === "PostToolUse") {
  const r = input.tool_response;
  entry.ok = !(r && (r.is_error || r.error || r.interrupted));
  if (r && typeof r.exitCode === "number") entry.exitCode = r.exitCode;
}
if (event === "PostToolUseFailure") entry.ok = false;
if (event === "UserPromptSubmit") entry.prompt = truncate(redact(input.prompt), 200);
if (event === "SessionStart") entry.source = input.source;

log(entry);
process.exit(0);
