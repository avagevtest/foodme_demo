// PreToolUse (Bash|PowerShell): deny destructive or outward-facing commands, ask for risky ones.
const { readInput, decide } = require("./lib");

const input = readInput();
const cmd = String(input.tool_input?.command || "");
if (!cmd) process.exit(0);

// Build/output dirs that are safe to delete recursively.
const SAFE_DEL = /^(\.\/)?(apps\/(web|admin|backend)\/)?(node_modules|dist|build|test-results|playwright-report|blob-report|\.gradle|coverage|\.vite)\/?$/;

// Split on shell separators so each sub-command is judged on its own.
const parts = cmd.split(/&&|\|\||;|\n|\|/).map((s) => s.trim()).filter(Boolean);

const DENY = [
  [/\bgit\s+push\b[^\n]*(\s--force\b|\s-f\b|\s--force-with-lease\b|\s\+\S+)/, "Force push rewrites shared history."],
  [/\bgit\s+push\b[^\n]*(\s|:)(refs\/heads\/)?(main|master)(\s|$)/, "Pushing to main/master directly. Push a feature branch and open a PR."],
  [/\bgit\s+push\b[^\n]*\s(--delete|-d)\b|\bgit\s+push\s+\S+\s+:\S+/, "Deleting a remote branch."],
  [/\bgit\s+push\b[^\n]*\s--mirror\b/, "Mirror push overwrites the remote."],
  [/\bgit\b[^\n]*\s--no-verify\b/, "--no-verify skips git hooks."],
  [/\bgit\s+filter-(branch|repo)\b/, "History rewrite."],
  [/\bnpm\s+publish\b|\bgradlew?\S*\s+publish\b/, "Publishing a package."],
  [/\b(mkfs|format)\s+[a-z]:?|\bdd\s+if=|\bshutdown\b|\breboot\b|\bdiskpart\b/i, "System-level destructive command."],
  [/\bchmod\s+-R\s+777\b|\bchown\s+-R\b/, "Recursive permission change."],
  [/\b(curl|wget|iwr|Invoke-WebRequest)\b[^|]*\|\s*(sh|bash|iex|Invoke-Expression|pwsh|powershell)\b/i, "Piping a downloaded script into a shell."],
  [/\b(DROP\s+(DATABASE|SCHEMA|TABLE)|TRUNCATE\s+TABLE)\b/i, "Dropping or truncating database objects."],
  [/\bdel\s+(\/[sqf]\s*)+|\b(rd|rmdir)\s+\/s\b/i, "Recursive delete (cmd)."],
  [/:\(\)\s*\{\s*:\|:&\s*\};:/, "Fork bomb."],
];

const ASK = [
  [/\bgit\s+push\b/, "Pushing to a remote is visible to others."],
  [/\bgit\s+reset\s+--hard\b/, "git reset --hard discards local changes."],
  [/\bgit\s+clean\s+-[a-z]*f/, "git clean -f deletes untracked files."],
  [/\bgit\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/, "Discards all working-tree changes."],
  [/\bgit\s+branch\s+-D\b/, "Force-deletes a local branch."],
  [/\bgit\s+(rebase|commit\s+--amend)\b/, "Rewrites local history."],
  [/\bdocker\s+(system\s+prune|volume\s+rm|rm\s+-f)\b/, "Removes Docker data."],
];

function recursiveDeleteTargets(part) {
  // rm with both -r and -f (any order/combination), or PowerShell Remove-Item -Recurse
  const rm = part.match(/^\s*(sudo\s+)?rm\s+(.*)$/);
  if (rm) {
    const args = rm[2].split(/\s+/);
    const flags = args.filter((a) => a.startsWith("-")).join("");
    if (/r|R|--recursive/.test(flags) && /f|--force/.test(flags)) return args.filter((a) => !a.startsWith("-"));
    if (/r|R|--recursive/.test(flags)) return args.filter((a) => !a.startsWith("-"));
  }
  const ri = part.match(/\b(Remove-Item|ri|rm|del|erase)\b(.*)/i);
  if (ri && /-Recurse\b/i.test(ri[2])) {
    return ri[2]
      .split(/\s+/)
      .filter((a) => a && !a.startsWith("-"))
      .map((a) => a.replace(/^['"]|['"]$/g, ""));
  }
  return null;
}

// Pipe-based patterns (curl | sh) need the unsplit command.
for (const [re, why] of DENY) if (re.test(cmd)) decide("deny", `Blocked by FoodMe safety hook: ${why}\n  > ${cmd.trim()}`, input);

for (const part of parts) {
  for (const [re, why] of DENY) if (re.test(part)) decide("deny", `Blocked by FoodMe safety hook: ${why}\n  > ${part}`, input);

  const targets = recursiveDeleteTargets(part);
  if (targets) {
    const norm = targets.map((t) => t.replace(/\\/g, "/"));
    const unsafe = norm.filter((t) => !SAFE_DEL.test(t));
    if (unsafe.length === 0 && norm.length > 0) continue; // e.g. rm -rf node_modules dist
    const catastrophic = unsafe.some((t) => /^(\/|~|\$HOME|\*|\.|\.\.|[a-zA-Z]:\/?|\/\*|\.\/\*|\.\.\/.*)$/.test(t) || t === "");
    decide(
      "deny",
      `Blocked by FoodMe safety hook: recursive delete of ${unsafe.join(", ") || "(no explicit target)"}` +
        (catastrophic ? " would wipe the project, the home folder or the disk." : ". Only build output (node_modules, dist, build, test-results, playwright-report, .gradle) may be deleted recursively.") +
        ` Ask the user to run it themselves if it is really intended.\n  > ${part}`,
      input,
    );
  }
}

for (const part of parts) {
  for (const [re, why] of ASK) if (re.test(part)) decide("ask", `FoodMe safety hook: ${why} Confirm to continue.\n  > ${part}`, input);
}

process.exit(0);
