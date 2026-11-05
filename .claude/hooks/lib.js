// Shared helpers for FoodMe Claude Code hooks. Plain Node, no dependencies.
const fs = require("fs");
const path = require("path");

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, "..", "..");
const LOG_FILE = path.join(PROJECT_DIR, ".claude", "logs", "actions.jsonl");

function readInput() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function truncate(s, n = 300) {
  if (s == null) return s;
  s = String(s).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// Mask obvious secrets before anything is written to the log.
function redact(s) {
  if (s == null) return s;
  return String(s)
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1<redacted>")
    .replace(/((?:password|passwd|secret|token|api[_-]?key|dsn)\s*[=:]\s*)\S+/gi, "$1<redacted>")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "<jwt-redacted>");
}

function log(entry) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
  } catch {
    // logging must never break a tool call
  }
}

// PreToolUse decision: "deny" blocks, "ask" forces a permission prompt.
function decide(decision, reason, input) {
  log({
    event: "PreToolUse",
    decision,
    hook: path.basename(process.argv[1] || ""),
    session: input.session_id,
    tool: input.tool_name,
    target: truncate(redact(input.tool_input?.command || input.tool_input?.file_path)),
    reason,
  });
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

function rel(p) {
  if (!p) return "";
  return path.relative(PROJECT_DIR, path.resolve(p)).split(path.sep).join("/");
}

module.exports = { PROJECT_DIR, LOG_FILE, readInput, truncate, redact, log, decide, rel };
