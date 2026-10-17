import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { generateBusinessManual, generateRuntimeProjectManuals, renderHelpDesignSnapshots } from "./project-manuals.mjs";
import { ROLE_HELP_GUIDES } from "../../web/src/erp/config/roleHelpContent.mjs";
import { getRoleHelpScenarios } from "../../web/src/erp/config/helpScenarios.mjs";
import { findBrokenLocalMarkdownLinks } from "../qa/lib/markdown-links.mjs";

const root = path.resolve(import.meta.dirname, "../..");

test("帮助交互稿从正式来源替换失效说明，保留快照外内容并拒绝重复定义", async () => {
  const source = await readFile(path.join(root, "docs/product/ui-design/index.html"), "utf8");
  const pattern = /    const catalog = ([\s\S]*?);\n/u;
  const [definition, raw] = source.match(pattern);
  const catalog = JSON.parse(raw);
  catalog.roles[0].scenes[0].completion = "失效的自动入账说明";
  const stale = source.replace(definition, `    const catalog = ${JSON.stringify(catalog)};\n`) + "\n<!-- preserved outside help snapshots -->";
  const rendered = renderHelpDesignSnapshots(stale);
  const current = JSON.parse(rendered.match(pattern)[1]);
  assert.equal(current.roles[0].scenes[0].completion, getRoleHelpScenarios(ROLE_HELP_GUIDES[0], { isSuperAdmin: true })[0].completion);
  assert(rendered.endsWith("<!-- preserved outside help snapshots -->"));
  assert.equal(renderHelpDesignSnapshots(rendered), rendered);
  assert.throws(() => renderHelpDesignSnapshots(source + definition), /唯一内容快照 catalog/u);
});
test("生成业务手册没有漂移，三部分手册提供完整阅读路径且引用有效", async () => {
  await generateBusinessManual({ check: true });
  await generateRuntimeProjectManuals({ check: true });
  for (const title of [
    "业务使用手册",
    "管理员与实施手册",
    "技术维护与运维手册",
  ]) {
    const file = path.join(root, `docs/manuals/${title}.md`);
    const text = await readFile(file, "utf8");
    assert(text.startsWith(`# ${title}`), title);
    assert(text.split("\n## ").length >= 8, title);
    assert(!/TODO|待编写|占位正文/u.test(text), title);
    const broken = findBrokenLocalMarkdownLinks({
      rootDir: root,
      sourceFiles: [path.relative(root, file)],
    });
    assert.deepEqual(broken, [], title);
  }
});
