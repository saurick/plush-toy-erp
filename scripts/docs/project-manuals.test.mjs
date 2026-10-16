import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { generateBusinessManual } from "./project-manuals.mjs";
import { findBrokenLocalMarkdownLinks } from "../qa/lib/markdown-links.mjs";

const root = path.resolve(import.meta.dirname, "../..");
test("生成业务手册没有漂移，三部分手册提供完整阅读路径且引用有效", async () => {
  await generateBusinessManual({ check: true });
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
