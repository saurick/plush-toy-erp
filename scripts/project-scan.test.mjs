import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const scriptPath = path.join(repoRoot, "scripts/project-scan.sh");

function runProjectScan(documentText) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-scan-docs-"));
  const docsDir = path.join(root, "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(
    path.join(docsDir, "当前真源与交接顺序.md"),
    `${documentText}\n`,
    "utf8",
  );
  return spawnSync("bash", [scriptPath, "--strict"], {
    cwd: root,
    encoding: "utf8",
  });
}

test("project scan does not misclassify negative template-default boundaries", () => {
  const result = runProjectScan(
    [
      "业务行不由模板默认值伪造。",
      "不得使用模板默认值填充业务事实。",
      "禁止模板默认行为覆盖来源单据。",
    ].join("\n"),
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(result.stdout, /文档与首页仍保留旧占位措辞/);
});

test("project scan still rejects affirmative template placeholders", () => {
  const result = runProjectScan(
    [
      "本模板默认使用示例公司名。",
      "派生项目请修改服务名称。",
      "初始化后请替换示例配置。",
    ].join("\n"),
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /文档与首页仍保留旧占位措辞/);
  assert.match(result.stdout, /本模板默认使用示例公司名/);
  assert.match(result.stdout, /派生项目请修改服务名称/);
  assert.match(result.stdout, /初始化后请替换示例配置/);
});
