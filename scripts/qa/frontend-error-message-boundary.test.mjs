import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const scannedRoots = Object.freeze([
  "web/src/erp/pages",
  "web/src/erp/components",
  "web/src/erp/mobile",
]);

const devUserVisibleAllowlist = Object.freeze(
  new Set(["web/src/erp/pages/DevCustomerConfigPage.jsx"]),
);

const rawMessagePatterns = Object.freeze([
  /message\.(error|warning|success|info)\([^)]*(error|err)\?\.\s*message/iu,
  /const\s+\w*(?:error|message)\w*\s*=\s*(error|err)\?\.\s*message\s*\|\|/iu,
  /String\(\s*(error|err)\?\.\s*message\s*\|\|/iu,
  /set\w*State\(\{[^}]*error:\s*(error|err)\?\.\s*message\s*\|\|/isu,
]);

function listSourceFiles(dir) {
  const absoluteDir = path.join(repoRoot, dir);
  const out = [];
  for (const entry of readdirSync(absoluteDir)) {
    const absolutePath = path.join(absoluteDir, entry);
    const relativePath = path.relative(repoRoot, absolutePath);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      out.push(...listSourceFiles(relativePath));
      continue;
    }
    if (/\.(jsx?|mjs)$/u.test(entry) && !/\.test\./u.test(entry)) {
      out.push(relativePath);
    }
  }
  return out;
}

function isFormalUserVisibleSource(relativePath) {
  if (devUserVisibleAllowlist.has(relativePath)) return true;
  const fileName = path.basename(relativePath);
  if (/^Dev/u.test(fileName)) return false;
  return true;
}

test("frontend error message boundary: formal pages and components use user-facing helpers", () => {
  const offenders = scannedRoots
    .flatMap(listSourceFiles)
    .filter(isFormalUserVisibleSource)
    .flatMap((relativePath) => {
      const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
      return rawMessagePatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relativePath} matches ${pattern}`);
    });

  assert.deepEqual(offenders, []);
});

test("frontend error message boundary: material purchase print uses shared helper", () => {
  const source = readFileSync(
    path.join(
      repoRoot,
      "web/src/erp/components/print/MaterialPurchaseContractWorkbench.jsx",
    ),
    "utf8",
  );
  assert(source.includes("getActionErrorMessage"));
  assert(!source.includes("error?.message || '生成 PDF 预览失败"));
  assert(!source.includes("error?.message || '下载 PDF 失败"));
});

test("frontend error message boundary: PDF preview shell uses shared helper", () => {
  const source = readFileSync(
    path.join(repoRoot, "web/src/erp/utils/printPdf.mjs"),
    "utf8",
  );
  assert(source.includes("getActionErrorMessage"));
  assert(!source.includes("String(error?.message || '').trim()"));
  assert(!source.includes("error?.message || '生成 PDF 预览失败"));
});

test("frontend error message boundary: dev customer config workbench uses shared helper", () => {
  const source = readFileSync(
    path.join(repoRoot, "web/src/erp/pages/DevCustomerConfigPage.jsx"),
    "utf8",
  );
  assert(source.includes("getActionErrorMessage"));
  assert(!source.includes("return rawMessage || fallback"));
  assert(!source.includes("error: error?.message ||"));
});
