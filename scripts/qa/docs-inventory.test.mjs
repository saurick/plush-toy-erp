import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const INVENTORY_PATH = path.join(ROOT_DIR, "docs/文档清单.md");

const MAINTAINED_MARKDOWN_PREFIXES = [
  "AGENTS.md",
  "README.md",
  "progress.md",
  "config/",
  "deployments/",
  "docs/",
  "scripts/",
  "server/",
  "web/",
];

const IGNORED_MARKDOWN_PREFIXES = [
  ".agents/",
  "node_modules/",
  "output/",
  "tmp/",
  "server/bin/",
  "web/node_modules/",
];

function gitList(args) {
  const output = execFileSync("git", args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
  });
  return output.split("\0").filter(Boolean);
}

function isMaintainedMarkdown(file) {
  return (
    MAINTAINED_MARKDOWN_PREFIXES.some(
      (prefix) => file === prefix || file.startsWith(prefix),
    ) &&
    !IGNORED_MARKDOWN_PREFIXES.some(
      (prefix) => file === prefix || file.startsWith(prefix) || file.includes(`/${prefix}`),
    )
  );
}

function collectMarkdownFiles() {
  return [
    ...new Set([
      ...gitList(["ls-files", "-z", "--", "*.md"]),
      ...gitList(["ls-files", "--others", "--exclude-standard", "-z", "--", "*.md"]),
    ]),
  ]
    .filter(isMaintainedMarkdown)
    .sort();
}

test("document inventory lists maintained Markdown files", () => {
  const inventory = fs.readFileSync(INVENTORY_PATH, "utf8");
  const markdownFiles = collectMarkdownFiles();
  const missing = markdownFiles.filter((file) => !inventory.includes(`\`${file}\``));

  assert.deepEqual(
    missing,
    [],
    `docs/文档清单.md missing maintained Markdown paths:\n${missing.join("\n")}`,
  );
  console.log(`docs inventory ok: markdownFiles=${markdownFiles.length}`);
});
