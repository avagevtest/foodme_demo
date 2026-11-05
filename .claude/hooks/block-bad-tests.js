// PreToolUse (Edit|Write|MultiEdit): block test-quality anti-patterns in NEW test code.
// Mirrors .agents/rules/testing.md. Only the text being added is checked, so
// existing course material (e.g. FM-FLAKE-01) does not block unrelated edits.
const { readInput, decide, rel } = require("./lib");

const input = readInput();
const ti = input.tool_input || {};
const file = rel(ti.file_path);

const isTestFile =
  /^apps\/(web|admin)\/e2e\/.+\.(ts|js)$/.test(file) ||
  /^apps\/backend\/src\/test\/.+\.java$/.test(file) ||
  /^apps\/(web|admin)\/src\/.+\.test\.(ts|tsx|js|jsx)$/.test(file);
const isPlaywrightConfig = /^apps\/(web|admin)\/playwright\.config\.ts$/.test(file);

if (!isTestFile && !isPlaywrightConfig) process.exit(0);

// Text being added by this call.
let added = "";
if (input.tool_name === "Write") added = ti.content || "";
else if (input.tool_name === "Edit") added = ti.new_string || "";
else if (input.tool_name === "MultiEdit") added = (ti.edits || []).map((e) => e.new_string || "").join("\n");

// For Edit, ignore lines that were already present in old_string (moving code is not adding it).
const oldLines = new Set(
  (input.tool_name === "Edit" ? ti.old_string || "" : (ti.edits || []).map((e) => e.old_string || "").join("\n"))
    .split("\n")
    .map((l) => l.trim()),
);
const newLines = added.split("\n").filter((l) => !oldLines.has(l.trim()));
const text = newLines.join("\n");

// A known-defect reference makes skip/fail/disable legitimate.
const HAS_REF = /(FM-(BUG|FLAKE)-\d+|SCRUM-\d+|SEC:)/;

const problems = [];
const check = (re, msg) => {
  for (const line of newLines) if (re.test(line)) { problems.push(`${msg}\n    > ${line.trim()}`); break; }
};

if (isTestFile) {
  check(/\bwaitForTimeout\s*\(/, "Fixed sleep `page.waitForTimeout(...)`: wait for a condition instead (expect(...).toBeVisible(), expect.poll, waitForResponse). See FM-FLAKE-01.");
  check(/\bThread\.sleep\s*\(|\bTimeUnit\.\w+\.sleep\s*\(/, "`Thread.sleep` in a test: wait for a condition or inject a Clock instead.");
  check(/\bnew\s+Promise\s*\(\s*\(?\s*\w*\s*\)?\s*=>\s*setTimeout/, "Hand-rolled setTimeout sleep in a test: use an auto-waiting assertion.");
  check(/\b(test|it|describe)\.only\s*\(/, "`.only` would skip the rest of the suite (and CI's forbidOnly fails on it).");
  check(/\bexpect\s*\(\s*true\s*\)\s*\.\s*toBe(Truthy)?\s*\(\s*(true)?\s*\)|\bassertTrue\s*\(\s*true\s*\)|\bassertEquals\s*\(\s*(\w+)\s*,\s*\2\s*\)/, "Assertion that can never fail.");
  check(/toBeGreaterThanOrEqual\s*\(\s*0\s*\)/, "`toBeGreaterThanOrEqual(0)` asserts nothing: assert the expected value.");
  check(/\bcatch\s*(\(\s*\w*\s*\))?\s*\{\s*\}/, "Empty catch block swallows failures in a test.");

  for (const line of newLines) {
    if (/\b(test|it|describe)\.(skip|fixme|fail)\s*\(|@Disabled\b/.test(line) && !HAS_REF.test(line)) {
      // allow the reference on the line itself or anywhere in the added block (e.g. a comment above)
      if (!HAS_REF.test(text)) {
        problems.push(
          "skip/fixme/fail/@Disabled without a defect reference. Add the id, e.g. `@Disabled(\"FM-BUG-03: ...\")`, `@Disabled(\"SCRUM-12: ...\")`, or a `// FM-BUG-xx` / `// SEC: ...` comment.\n    > " +
            line.trim(),
        );
        break;
      }
    }
  }
}

if (isPlaywrightConfig) {
  check(/\bretries\s*:\s*(process\.env\.CI\s*\?\s*)?([3-9]|\d{2,})\b/, "Raising Playwright retries hides flakiness. Fix the flaky test instead (see the investigate-flaky-test skill).");
  check(/forbidOnly\s*:\s*false/, "Disabling forbidOnly lets `.only` slip into CI.");
}

if (problems.length) {
  decide(
    "deny",
    `Blocked by FoodMe test-quality hook (.claude/hooks/block-bad-tests.js) in ${file}:\n- ` +
      problems.join("\n- ") +
      "\nRules: .agents/rules/testing.md and e2e-tests.md. Rewrite the test. Don't work around this hook.",
    input,
  );
}
process.exit(0);
