// PostToolUse (Edit|Write|MultiEdit): auto-fix the edited file with the app's own linter.
// web -> oxlint --fix, admin -> eslint --fix. No new formatter or style is introduced.
// Remaining (unfixable) problems are fed back to Claude as context, never blocking.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { PROJECT_DIR, readInput, rel, log } = require("./lib");

const input = readInput();
const filePath = input.tool_input?.file_path || input.tool_response?.filePath;
const file = rel(filePath);
if (!file || !fs.existsSync(path.join(PROJECT_DIR, file))) process.exit(0);

let app, bin, args;
let m;
if ((m = file.match(/^apps\/web\/(.+\.(ts|tsx|js|jsx))$/))) {
  app = "apps/web";
  bin = "oxlint";
  args = ["--fix", m[1]];
} else if ((m = file.match(/^apps\/admin\/(.+\.(js|jsx))$/))) {
  app = "apps/admin";
  bin = "eslint";
  args = ["--fix", m[1]];
} else {
  process.exit(0); // Java, Markdown, JSON, etc.: no formatter configured in this repo
}

const cwd = path.join(PROJECT_DIR, app);
const binPath = (name) => path.join(cwd, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
const run = (exe, a) => {
  try {
    return { ok: true, out: execFileSync(exe, a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 50000, shell: process.platform === "win32" }) };
  } catch (e) {
    return { ok: false, out: (e.stdout || "") + (e.stderr || "") };
  }
};

// 1) Real formatting, only if the app has Prettier installed (opt-in: `npm i -D prettier` in that app).
const usedPrettier = fs.existsSync(binPath("prettier"));
if (usedPrettier) run(binPath("prettier"), ["--write", "--log-level", "warn", args[1]]);

// 2) Lint auto-fix with the app's own linter.
if (!fs.existsSync(binPath(bin))) process.exit(0); // deps not installed (run npm ci); skip silently
const { ok, out } = run(binPath(bin), args);

log({ event: "PostToolUse", hook: "format-file.js", session: input.session_id, tool: input.tool_name, target: file, formatter: (usedPrettier ? "prettier+" : "") + bin, ok });

const remaining = out.split("\n").filter((l) => /(error|warning|×|⚠)/i.test(l)).slice(0, 15).join("\n");
if (!ok && remaining) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `${bin} --fix ran on ${file}; problems it could not auto-fix:\n${remaining}`,
      },
    }),
  );
}
process.exit(0);
