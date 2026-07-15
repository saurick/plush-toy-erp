import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

const scannedRoots = Object.freeze([
  "web/src/common/auth",
  "web/src/common/components",
  "web/src/erp/pages",
  "web/src/erp/components",
  "web/src/erp/mobile",
  "web/src/pages",
]);

const devUserVisibleAllowlist = Object.freeze(
  new Set(["web/src/erp/pages/DevCustomerConfigPage.jsx"]),
);

const rawMessagePatterns = Object.freeze([
  /message\.(error|warning|success|info)\([^)]*(error|err)(?:\?\.|\.)\s*message/iu,
  /const\s+\w*(?:error|message)\w*\s*=\s*(error|err)(?:\?\.|\.)\s*message\s*\|\|/iu,
  /String\(\s*(error|err)(?:\?\.|\.)\s*message\s*\|\|/iu,
  /error\s+instanceof\s+Error\s*&&\s*error\.message/iu,
  /set\w*State\(\{[^}]*error:\s*(error|err)(?:\?\.|\.)\s*message\s*\|\|/isu,
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

test("frontend error message boundary: direct and optional raw messages are both rejected", () => {
  for (const source of [
    "message.error(error.message)",
    "message.warning(err?.message)",
    "const errorText = error.message || '保存失败'",
    "String(err?.message || '加载失败')",
  ]) {
    assert(
      rawMessagePatterns.some((pattern) => pattern.test(source)),
      `raw error message pattern did not reject: ${source}`,
    );
  }
});

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

test("frontend error message boundary: PDF server errors do not expose response body", () => {
  const source = readFileSync(
    path.join(repoRoot, "web/src/erp/utils/printPdf.mjs"),
    "utf8",
  );

  assert(source.includes("getServerPdfErrorMessage"));
  assert(!source.includes("readServerErrorMessage"));
  assert(!source.includes("payload.message"));
  assert(!source.includes("await response.text()"));
});

test("frontend error message boundary: Markdown Mermaid errors do not expose parser messages", () => {
  const source = readFileSync(
    path.join(repoRoot, "web/src/common/components/markdown/index.jsx"),
    "utf8",
  );

  assert(source.includes("请检查 Mermaid 源码语法或稍后重试。"));
  assert(!source.includes("error instanceof Error && error.message"));
  assert(!source.includes("? error.message"));
});

test("frontend error message boundary: dev customer config workbench uses shared helper", () => {
  const source = readFileSync(
    path.join(repoRoot, "web/src/erp/pages/DevCustomerConfigPage.jsx"),
    "utf8",
  );
  assert(source.includes("getActionErrorMessage"));
  assert(!source.includes("return rawMessage || fallback"));
  assert(!source.includes("error: error?.message ||"));
  assert(!source.includes("payload?.message"));
  assert(!source.includes("manifestPayload?.message"));
  assert.doesNotMatch(
    source,
    /throw new Error\([^)]*(payload|manifestPayload)\?\.\s*message/iu,
  );
});

test("frontend error message boundary: auth failure dialog sanitizes raw backend messages", () => {
  const appSource = readFileSync(path.join(repoRoot, "web/src/App.jsx"), "utf8");
  const rpcSource = readFileSync(
    path.join(repoRoot, "web/src/common/utils/jsonRpc.js"),
    "utf8",
  );
  const adminLoginSource = readFileSync(
    path.join(repoRoot, "web/src/pages/AdminLogin/index.jsx"),
    "utf8",
  );

  assert(appSource.includes("getUserFacingErrorMessage"));
  assert(rpcSource.includes("getUserFacingErrorMessage"));
  assert(adminLoginSource.includes("getActionErrorMessage(err, '获取验证码')"));
  assert(adminLoginSource.includes("getActionErrorMessage(err, '登录')"));
  assert(!appSource.includes("message: message || '登录已过期，请重新登录'"));
  assert(!rpcSource.includes("message: message || '请重新登录'"));
});

test("frontend error message boundary: shared helper blocks technical fields even inside Chinese messages", () => {
  const source = readFileSync(
    path.join(repoRoot, "web/src/common/utils/errorMessage.js"),
    "utf8",
  );

  assert(source.includes("TECHNICAL_ERROR_MESSAGE_PATTERN"));
  assert(source.includes("containsTechnicalErrorText(normalized)"));
  assert.match(source, /\(\?:_\[a-z0-9\]\+\)\+/u);
  assert.match(source, /Id\|Key\|Payload\|Revision/u);
  assert.match(source, /workflow/iu);
  assert.match(source, /服务端/u);
  assert.match(
    source,
    /if\s*\(\s*containsTechnicalErrorText\(normalized\)\s*\)\s*return ''/u,
  );
});

test("frontend error message boundary: audit log visible fallbacks do not expose raw backend keys", () => {
  const source = readFileSync(
    path.join(repoRoot, "web/src/erp/pages/AuditLogsPage.jsx"),
    "utf8",
  );

  assert(source.includes("getAuditChangeSummary"));
  assert(source.includes("visibleAuditChangeKeys"));
  assert(source.includes("return '本次操作已记录'"));
  assert(source.includes("return '系统设置需要管理员检查'"));
  assert(!source.includes("getVisibleAuditReason"));
  assert(!source.includes("getUserFacingErrorMessage"));
  assert(!source.includes("payload.reason"));
  assert(!source.includes("event.summary"));
  assert(!source.includes("return typeMap[target.type] || target.type || '-'"));
  assert(!source.includes("event.event_key || '未知动作'"));
  assert(!source.includes("return event.actor_key ||"));
  assert(!source.includes("event.target_key || getTargetText"));
  assert(!source.includes("fieldLabelMap[key] || key"));
  assert(!source.includes("JSON.stringify(value)"));
  assert.doesNotMatch(
    source,
    /if\s*\(\s*event\.summary\s*\)\s*\{\s*return event\.summary\s*\}/u,
  );
  assert(!source.includes("return payload.reason || '-'"));
  assert(source.includes("event.target_label || event.target_name"));
  assert(source.includes("fieldLabelMap[key] || '字段变更'"));
  assert(source.includes("return '已记录'"));
  assert.match(
    source,
    /return typeMap\[target\.type\] \|\| '相关内容'/u,
  );
});
