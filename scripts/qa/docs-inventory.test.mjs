import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  extractMarkdownAnchorIds,
  findBrokenLocalMarkdownLinks,
  slugifyMarkdownHeading,
} from "./lib/markdown-links.mjs";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const INVENTORY_PATH = path.join(ROOT_DIR, "docs/文档清单.md");
const CURRENT_TRUTH_PATH = path.join(ROOT_DIR, "docs/当前真源与交接顺序.md");

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
      (prefix) =>
        file === prefix ||
        file.startsWith(prefix) ||
        file.includes(`/${prefix}`),
    )
  );
}

function collectMarkdownFiles() {
  return [
    ...new Set([
      ...gitList(["ls-files", "-z", "--", "*.md"]),
      ...gitList([
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        "*.md",
      ]),
    ]),
  ]
    .filter(isMaintainedMarkdown)
    .filter((file) => fs.existsSync(path.join(ROOT_DIR, file)))
    .sort();
}

function isArchiveIndex(file) {
  return (
    file === "docs/archive/README.md" ||
    (file.startsWith("docs/archive/") && path.basename(file) === "README.md")
  );
}

function collectInventoryMarkdownFiles() {
  return collectMarkdownFiles().filter(
    (file) => !file.startsWith("docs/archive/") || isArchiveIndex(file),
  );
}

function isLocalLinkScanSource(file) {
  return !file.startsWith("docs/archive/") || isArchiveIndex(file);
}

function findMissingArchiveIndexEntries({ rootDir, archivedFiles }) {
  const missing = [];
  for (const file of archivedFiles) {
    const indexFile = path.posix.join(path.posix.dirname(file), "README.md");
    const indexPath = path.join(rootDir, indexFile);
    if (!fs.existsSync(indexPath)) {
      missing.push(`${file} -> ${indexFile} (missing index)`);
      continue;
    }
    const index = fs.readFileSync(indexPath, "utf8");
    const basename = path.posix.basename(file);
    if (!index.includes(`\`${file}\``) && !index.includes(`\`${basename}\``)) {
      missing.push(`${file} -> ${indexFile}`);
    }
  }
  return missing;
}

function collectInventoryMarkdownPaths(inventory) {
  return [...inventory.matchAll(/\|\s*`([^`]+\.md)`\s*\|/gu)].map(
    (match) => match[1],
  );
}

test("document inventory lists maintained Markdown files", () => {
  const inventory = fs.readFileSync(INVENTORY_PATH, "utf8");
  const markdownFiles = collectInventoryMarkdownFiles();
  const missing = markdownFiles.filter(
    (file) => !inventory.includes(`\`${file}\``),
  );

  assert.deepEqual(
    missing,
    [],
    `docs/文档清单.md missing maintained Markdown paths:\n${missing.join("\n")}`,
  );
  console.log(`docs inventory ok: markdownFiles=${markdownFiles.length}`);
});

test("archived Markdown is listed by its nearest archive index", () => {
  const archivedFiles = collectMarkdownFiles().filter(
    (file) => file.startsWith("docs/archive/") && !isArchiveIndex(file),
  );
  const missing = findMissingArchiveIndexEntries({
    rootDir: ROOT_DIR,
    archivedFiles,
  });

  assert.deepEqual(
    missing,
    [],
    `archived Markdown is missing from its nearest README:\n${missing.join("\n")}`,
  );
  console.log(`archive inventory ok: archivedFiles=${archivedFiles.length}`);
});

test("archive inventory reports a missing nearest-index entry", () => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "plush-archive-index-"),
  );
  const archivedFile = "docs/archive/topic/history.md";
  try {
    fs.mkdirSync(path.join(fixtureRoot, "docs/archive/topic"), {
      recursive: true,
    });
    fs.writeFileSync(path.join(fixtureRoot, archivedFile), "# History\n");
    fs.writeFileSync(
      path.join(fixtureRoot, "docs/archive/topic/README.md"),
      "# Index\n",
    );

    assert.deepEqual(
      findMissingArchiveIndexEntries({
        rootDir: fixtureRoot,
        archivedFiles: [archivedFile],
      }),
      [`${archivedFile} -> docs/archive/topic/README.md`],
    );

    fs.writeFileSync(
      path.join(fixtureRoot, "docs/archive/topic/README.md"),
      "# Index\n\n- `history.md`\n",
    );
    assert.deepEqual(
      findMissingArchiveIndexEntries({
        rootDir: fixtureRoot,
        archivedFiles: [archivedFile],
      }),
      [],
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("document inventory does not retain missing Markdown paths", () => {
  const inventory = fs.readFileSync(INVENTORY_PATH, "utf8");
  const missing = collectInventoryMarkdownPaths(inventory).filter(
    (file) => !fs.existsSync(path.join(ROOT_DIR, file)),
  );

  assert.deepEqual(
    missing,
    [],
    `docs/文档清单.md contains missing Markdown paths:\n${missing.join("\n")}`,
  );
});

test("repository does not retain external reference source documents", () => {
  const maintainedReferenceFiles = [
    ...new Set([
      ...gitList(["ls-files", "-z", "--", "docs/reference/**"]),
      ...gitList([
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        "docs/reference/**",
      ]),
    ]),
  ]
    .filter((file) => fs.existsSync(path.join(ROOT_DIR, file)))
    .sort();

  assert.deepEqual(
    maintainedReferenceFiles,
    [],
    `external reference source documents must stay outside the repository:\n${maintainedReferenceFiles.join("\n")}`,
  );
});

test("active Markdown does not name retired adjacent projects", () => {
  const retiredProjectPattern = /trade[-_ ]erp/iu;
  const matches = [];

  for (const sourceFile of collectMarkdownFiles()) {
    if (
      sourceFile === "progress.md" ||
      sourceFile.startsWith("docs/archive/")
    ) {
      continue;
    }
    const lines = fs
      .readFileSync(path.join(ROOT_DIR, sourceFile), "utf8")
      .split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (retiredProjectPattern.test(line)) {
        matches.push(`${sourceFile}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(
    matches,
    [],
    `active Markdown names retired adjacent projects:\n${matches.join("\n")}`,
  );
});

test("current Markdown and archive indexes resolve local links", () => {
  const broken = findBrokenLocalMarkdownLinks({
    rootDir: ROOT_DIR,
    sourceFiles: collectMarkdownFiles().filter(isLocalLinkScanSource),
  });

  assert.deepEqual(
    broken,
    [],
    `current Markdown or archive indexes contain broken local links:\n${broken.join("\n")}`,
  );
});

test("link scan includes progress and archive indexes but freezes archive bodies", () => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "plush-doc-sources-"),
  );
  try {
    fs.mkdirSync(path.join(fixtureRoot, "docs/archive"), { recursive: true });
    fs.writeFileSync(
      path.join(fixtureRoot, "progress.md"),
      "[missing](missing.md)\n",
    );
    fs.writeFileSync(
      path.join(fixtureRoot, "docs/archive/README.md"),
      "[missing](missing-index.md)\n",
    );
    fs.writeFileSync(
      path.join(fixtureRoot, "docs/archive/frozen.md"),
      "[historical](retired.md)\n",
    );

    const sourceFiles = [
      "progress.md",
      "docs/archive/README.md",
      "docs/archive/frozen.md",
    ].filter(isLocalLinkScanSource);
    assert.deepEqual(sourceFiles, ["progress.md", "docs/archive/README.md"]);
    assert.deepEqual(
      findBrokenLocalMarkdownLinks({ rootDir: fixtureRoot, sourceFiles }),
      [
        "docs/archive/README.md -> missing-index.md",
        "progress.md -> missing.md",
      ],
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("Markdown anchor extraction matches the repository viewer contract", () => {
  const anchors = extractMarkdownAnchorIds(`# Title

## 阅读与同步维护 / Reading and Maintenance
## 重复标题
## 重复标题

<a id="stable-explicit-anchor"></a>

## Stable Target

\`\`\`
## fenced heading is not rendered
\`\`\`

~~~
## tilde fenced heading is not rendered
~~~
`);

  assert.equal(
    slugifyMarkdownHeading("销售订单 Excel 辅助录入 / Sales Order Excel Entry"),
    "销售订单-excel-辅助录入--sales-order-excel-entry",
  );
  assert.equal(
    slugifyMarkdownHeading("角色、能力和责任池"),
    "角色能力和责任池",
  );
  assert.deepEqual(
    [...anchors].sort(),
    [
      "stable-explicit-anchor",
      "stable-target",
      "title",
      "重复标题",
      "重复标题-1",
      "阅读与同步维护--reading-and-maintenance",
    ].sort(),
  );
});

test("local Markdown link audit reports a missing section anchor", () => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "plush-doc-links-"),
  );
  try {
    fs.writeFileSync(
      path.join(fixtureRoot, "source.md"),
      "[valid](target.md#existing-section)\n[invalid](target.md#missing-section)\n",
    );
    fs.writeFileSync(
      path.join(fixtureRoot, "target.md"),
      "## Existing Section\n",
    );

    assert.deepEqual(
      findBrokenLocalMarkdownLinks({
        rootDir: fixtureRoot,
        sourceFiles: ["source.md", "target.md"],
      }),
      [
        "source.md -> target.md#missing-section (missing anchor #missing-section)",
      ],
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("current truth stays a compact routing document", () => {
  const source = fs.readFileSync(CURRENT_TRUTH_PATH, "utf8");
  const lineCount = source.split(/\r?\n/u).length;
  const byteCount = Buffer.byteLength(source, "utf8");

  assert(
    lineCount <= 120,
    `docs/当前真源与交接顺序.md must stay at or below 120 lines, got ${lineCount}`,
  );
  assert(
    byteCount <= 20 * 1024,
    `docs/当前真源与交接顺序.md must stay at or below 20 KiB, got ${byteCount} bytes`,
  );

  for (const required of [
    "## 阅读顺序",
    "## 真源层级",
    "## 当前业务边界",
    "## Workflow 与 Fact",
    "## 前端入口",
    "## 测试与发布",
    "产品能力进度台账.md",
    "自动化测试策略.md",
    "server/deploy/README.md",
  ]) {
    assert(
      source.includes(required),
      `current truth missing routing anchor: ${required}`,
    );
  }

  for (const volatileDetail of [
    /customer-trial-133/u,
    /workflow\.task-mutation-result\/v\d+/u,
    /domain_command_compensated_by/u,
    /2026\d{10}_migrate\.sql/u,
    /\d+ 项只读浏览器/u,
  ]) {
    assert.doesNotMatch(
      source,
      volatileDetail,
      `current truth must route to implementation evidence instead of copying ${volatileDetail}`,
    );
  }
});
