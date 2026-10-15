import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".pnpm-store",
  ".vite-cache",
  "dist",
  "node_modules",
  "output",
  "vendor",
]);
const EXCLUDED_RELATIVE_DIRECTORIES = new Set(["web/build", "web/coverage"]);
const TEST_FILE_PATTERN = /(?:\.test\.(?:[cm]?js|jsx|ts|tsx)|_test\.go)$/u;
const JAVASCRIPT_SOURCE_FILE_PATTERN = /\.(?:[cm]?js|jsx|ts|tsx)$/u;
const SOURCE_EXECUTION_RULES = Object.freeze([
  Object.freeze({
    key: "vm.runInContext",
    pattern: /\bvm\.runInContext\s*\(/gu,
  }),
  Object.freeze({
    key: "vm.runInNewContext",
    pattern: /\bvm\.runInNewContext\s*\(/gu,
  }),
  Object.freeze({
    key: "vm.runInThisContext",
    pattern: /\bvm\.runInThisContext\s*\(/gu,
  }),
  Object.freeze({ key: "new vm.Script", pattern: /\bnew\s+vm\.Script\s*\(/gu }),
  Object.freeze({ key: "new Function", pattern: /\bnew\s+Function\s*\(/gu }),
  Object.freeze({
    key: "SourceTextModule",
    pattern: /\bSourceTextModule\s*\(/gu,
  }),
  Object.freeze({
    key: "javascript-data-url",
    pattern: /data:text\/javascript/giu,
  }),
]);
const FILE_READING_PATTERN = /\b(?:readFileSync|readFile)\s*\(/u;

export const LARGE_TEST_REPORT_LINE_THRESHOLD = 800;

// Shrink-only debt ledger. Each entry fixes both the permitted rule and its
// current maximum count, so an allowed file cannot silently add another
// source-execution call. Any reduction must update the ledger in the same change.
export const LEGACY_SOURCE_EXECUTION_FILES = Object.freeze({
  "scripts/qa/customer-config-boundaries.mjs": Object.freeze({
    reason:
      "customer config validation evaluates a generated config module in an isolated sandbox",
    exitCondition:
      "replace generated module evaluation with a data-only parser or direct validator contract",
    maxOccurrences: Object.freeze({ "vm.runInNewContext": 1 }),
  }),
  "web/scripts/test/reactRuntime.mjs": Object.freeze({
    reason:
      "the shared React hook harness imports generated runtime modules through an isolated data URL",
    exitCondition:
      "replace the generated runtime module with a direct injectable React test adapter",
    maxOccurrences: Object.freeze({ "javascript-data-url": 1 }),
  }),
  "web/src/erp/api/businessProgressApi.test.mjs": Object.freeze({
    reason:
      "the API contract uses an isolated source harness pending a direct transport seam",
    exitCondition:
      "bind the API to an injectable transport and import the production module directly",
    maxOccurrences: Object.freeze({ "javascript-data-url": 1 }),
  }),
  "web/src/erp/api/workflowApi.test.mjs": Object.freeze({
    reason:
      "the workflow transport contract still uses an isolated source harness",
    exitCondition:
      "bind the workflow API to an injectable transport and import it directly",
    maxOccurrences: Object.freeze({ "javascript-data-url": 1 }),
  }),
  "web/src/erp/components/orderWorkflowActionGuards.test.mjs": Object.freeze({
    reason:
      "the JSX-adjacent guard is evaluated without a component test runner",
    exitCondition:
      "move the guard to a directly importable module or cover it through the component runner",
    maxOccurrences: Object.freeze({ "vm.runInNewContext": 1 }),
  }),
  "web/src/erp/hooks/useWorkflowTaskActionAccess.test.mjs": Object.freeze({
    reason: "the hook policy is evaluated with a minimal React sandbox",
    exitCondition: "exercise the hook through a direct injectable hook adapter",
    maxOccurrences: Object.freeze({ "vm.runInNewContext": 1 }),
  }),
  "web/src/erp/hooks/useWorkflowTaskAssignmentAccess.test.mjs": Object.freeze({
    reason: "the hook policy is evaluated with a minimal React sandbox",
    exitCondition: "exercise the hook through a direct injectable hook adapter",
    maxOccurrences: Object.freeze({ "vm.runInNewContext": 1 }),
  }),
  "web/src/erp/mobile/hooks/useMobileNavigationCounts.test.mjs": Object.freeze({
    reason: "the mobile hook contract uses a minimal React sandbox",
    exitCondition: "exercise the hook through a direct injectable hook adapter",
    maxOccurrences: Object.freeze({ "vm.runInContext": 1 }),
  }),
  "web/src/erp/mobile/hooks/useMobileRoleTaskActions.test.mjs": Object.freeze({
    reason: "the mobile orchestration hook uses a focused module sandbox",
    exitCondition:
      "extract the orchestration seam into directly importable policy and adapter modules",
    maxOccurrences: Object.freeze({ "vm.runInNewContext": 1 }),
  }),
});

function collectFiles(root, matchesFile) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path
        .relative(root, absolutePath)
        .split(path.sep)
        .join("/");
      if (
        entry.isDirectory() &&
        (EXCLUDED_DIRECTORIES.has(entry.name) ||
          EXCLUDED_RELATIVE_DIRECTORIES.has(relativePath))
      ) {
        continue;
      }
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile() && matchesFile(entry.name)) {
        files.push(absolutePath);
      }
    }
  };
  visit(root);
  return files.sort();
}

function countLines(source) {
  if (!source) return 0;
  const lines = source.split(/\r?\n/u).length;
  return source.endsWith("\n") ? lines - 1 : lines;
}

export function sourceExecutionUsage(source) {
  return Object.fromEntries(
    SOURCE_EXECUTION_RULES.flatMap(({ key, pattern }) => {
      const count = [...source.matchAll(pattern)].length;
      return count > 0 ? [[key, count]] : [];
    }),
  );
}

export function usesSourceExecutionHarness(source) {
  return Object.keys(sourceExecutionUsage(source)).length > 0;
}

export function readsFiles(source) {
  return FILE_READING_PATTERN.test(source);
}

export function auditTestCode(
  root = REPO_ROOT,
  sourceExecutionAllowlist = LEGACY_SOURCE_EXECUTION_FILES,
) {
  const entries = collectFiles(root, (name) =>
    TEST_FILE_PATTERN.test(name),
  ).map((absolutePath) => {
    const source = readFileSync(absolutePath, "utf8");
    return {
      path: path.relative(root, absolutePath).split(path.sep).join("/"),
      lines: countLines(source),
      readsFiles: readsFiles(source),
    };
  });
  const sourceExecutionEntries = collectFiles(root, (name) =>
    JAVASCRIPT_SOURCE_FILE_PATTERN.test(name),
  )
    .flatMap((absolutePath) => {
      const rules = sourceExecutionUsage(readFileSync(absolutePath, "utf8"));
      if (Object.keys(rules).length === 0) return [];
      return [
        {
          path: path.relative(root, absolutePath).split(path.sep).join("/"),
          rules,
        },
      ];
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  const sourceExecutionFiles = sourceExecutionEntries.map(
    (entry) => entry.path,
  );
  const allowedSourceExecutionFiles = Object.keys(
    sourceExecutionAllowlist,
  ).sort();
  const sourceExecutionSet = new Set(sourceExecutionFiles);
  const allowedSourceExecutionSet = new Set(allowedSourceExecutionFiles);
  const sourceExecutionEntryByPath = new Map(
    sourceExecutionEntries.map((entry) => [entry.path, entry]),
  );
  const sourceExecutionPolicyViolations = [];
  const staleSourceExecutionRules = [];
  const invalidSourceExecutionAllowlist = [];

  for (const [file, policy] of Object.entries(sourceExecutionAllowlist)) {
    if (
      !policy ||
      typeof policy.reason !== "string" ||
      policy.reason.trim() === "" ||
      typeof policy.exitCondition !== "string" ||
      policy.exitCondition.trim() === "" ||
      !policy.maxOccurrences ||
      typeof policy.maxOccurrences !== "object"
    ) {
      invalidSourceExecutionAllowlist.push(file);
      continue;
    }
    const actualRules = sourceExecutionEntryByPath.get(file)?.rules || {};
    for (const [rule, maximum] of Object.entries(policy.maxOccurrences)) {
      if (!Number.isInteger(maximum) || maximum <= 0) {
        invalidSourceExecutionAllowlist.push(`${file}:${rule}`);
        continue;
      }
      const actual = actualRules[rule] || 0;
      if (actual < maximum) {
        staleSourceExecutionRules.push(
          `${file}:${rule} allowed=${maximum} actual=${actual}`,
        );
      }
    }
  }

  for (const entry of sourceExecutionEntries) {
    const policy = sourceExecutionAllowlist[entry.path];
    if (!policy?.maxOccurrences) continue;
    for (const [rule, actual] of Object.entries(entry.rules)) {
      const maximum = policy.maxOccurrences[rule] || 0;
      if (actual > maximum) {
        sourceExecutionPolicyViolations.push(
          `${entry.path}:${rule} allowed=${maximum} actual=${actual}`,
        );
      }
    }
  }

  return {
    totalFiles: entries.length,
    totalLines: entries.reduce((sum, entry) => sum + entry.lines, 0),
    fileReadingTests: entries
      .filter((entry) => entry.readsFiles)
      .map((entry) => entry.path)
      .sort(),
    sourceExecutionEntries,
    sourceExecutionFiles,
    unexpectedSourceExecutionFiles: sourceExecutionFiles.filter(
      (file) => !allowedSourceExecutionSet.has(file),
    ),
    staleSourceExecutionAllowlist: allowedSourceExecutionFiles.filter(
      (file) => !sourceExecutionSet.has(file),
    ),
    sourceExecutionPolicyViolations,
    staleSourceExecutionRules,
    invalidSourceExecutionAllowlist,
    largeTestFiles: entries
      .filter((entry) => entry.lines >= LARGE_TEST_REPORT_LINE_THRESHOLD)
      .sort(
        (left, right) =>
          right.lines - left.lines || left.path.localeCompare(right.path),
      )
      .map(({ path: file, lines }) => ({ path: file, lines })),
  };
}

export function assertSourceExecutionDebtDoesNotGrow(report) {
  const problems = [];
  if (report.unexpectedSourceExecutionFiles.length > 0) {
    problems.push(
      `unexpected source-execution files: ${report.unexpectedSourceExecutionFiles.join(", ")}`,
    );
  }
  if (report.staleSourceExecutionAllowlist.length > 0) {
    problems.push(
      `remove resolved allowlist entries: ${report.staleSourceExecutionAllowlist.join(", ")}`,
    );
  }
  if ((report.sourceExecutionPolicyViolations || []).length > 0) {
    problems.push(
      `source-execution policy exceeded: ${report.sourceExecutionPolicyViolations.join(", ")}`,
    );
  }
  if ((report.staleSourceExecutionRules || []).length > 0) {
    problems.push(
      `tighten resolved source-execution rules: ${report.staleSourceExecutionRules.join(", ")}`,
    );
  }
  if ((report.invalidSourceExecutionAllowlist || []).length > 0) {
    problems.push(
      `invalid source-execution allowlist entries: ${report.invalidSourceExecutionAllowlist.join(", ")}`,
    );
  }
  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
}

export function summarizeTestCodeAudit(report) {
  return {
    totalFiles: report.totalFiles,
    totalLines: report.totalLines,
    directFileReadingTestCount: report.fileReadingTests.length,
    sourceExecutionEntries: report.sourceExecutionEntries,
    sourceExecutionFiles: report.sourceExecutionFiles,
    unexpectedSourceExecutionFiles: report.unexpectedSourceExecutionFiles,
    staleSourceExecutionAllowlist: report.staleSourceExecutionAllowlist,
    sourceExecutionPolicyViolations: report.sourceExecutionPolicyViolations,
    staleSourceExecutionRules: report.staleSourceExecutionRules,
    invalidSourceExecutionAllowlist: report.invalidSourceExecutionAllowlist,
    largeTestFileCount: report.largeTestFiles.length,
    largestTestFiles: report.largeTestFiles.slice(0, 20),
  };
}

function main() {
  const report = auditTestCode();
  console.log(JSON.stringify(summarizeTestCodeAudit(report), null, 2));
  assertSourceExecutionDebtDoesNotGrow(report);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
