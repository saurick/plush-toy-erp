import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CORE_DIR = path.join(ROOT_DIR, "server/internal/core");

const FORBIDDEN_IMPORTS = [
  {
    pattern: /^server\/internal\/(?!core(?:\/|$))/,
    reason: "core must not depend on non-core internal packages",
  },
  {
    pattern: /^internal\/(?!core(?:\/|$))/,
    reason: "core must not depend on non-core internal packages",
  },
  {
    pattern: /^server\/internal\/data\/model\/ent(?:\/|$)/,
    reason: "core must not import Ent generated packages",
  },
  {
    pattern: /^entgo\.io\/ent(?:\/|$)/,
    reason: "core must not import Ent",
  },
  {
    pattern: /^database\/sql$/,
    reason: "core must not open SQL connections or depend on SQL APIs",
  },
  {
    pattern: /^net\/http$/,
    reason: "core must not depend on HTTP transport",
  },
  {
    pattern: /^github\.com\/go-kratos\/kratos\/v2\/transport(?:\/|$)/,
    reason: "core must not depend on Kratos transport",
  },
  {
    pattern: /^gopkg\.in\/yaml\.v3$/,
    reason: "core must not parse config files",
  },
  {
    pattern: /^os$/,
    reason: "core must not read environment variables or filesystem state",
  },
  {
    pattern: /^io\/fs$/,
    reason: "core must not read filesystem state",
  },
  {
    pattern: /^path\/filepath$/,
    reason: "core must not locate files",
  },
];

const FORBIDDEN_SOURCE_PATTERNS = [
  {
    pattern: /\bos\.(Getenv|LookupEnv|Environ)\s*\(/,
    reason: "core must not read environment variables",
  },
  {
    pattern: /\bsql\.Open\s*\(/,
    reason: "core must not open database connections",
  },
  {
    pattern: /\bhttp\.(Get|Post|DefaultClient|NewRequest)\b/,
    reason: "core must not perform HTTP calls",
  },
];

function collectGoFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectGoFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".go")) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

function extractImports(source) {
  const imports = [];

  for (const match of source.matchAll(/^\s*import\s+(?:[._\w]+\s+)?["`]([^"`]+)["`]/gm)) {
    imports.push(match[1]);
  }

  for (const blockMatch of source.matchAll(/^\s*import\s*\(([\s\S]*?)^\s*\)/gm)) {
    const block = blockMatch[1];
    for (const lineMatch of block.matchAll(/^\s*(?:[._\w]+\s+)?["`]([^"`]+)["`]/gm)) {
      imports.push(lineMatch[1]);
    }
  }

  return imports;
}

function formatViolation(file, detail, reason) {
  const relativeFile = path.relative(ROOT_DIR, file);
  return `${relativeFile}: ${detail} (${reason})`;
}

test("server/internal/core keeps pure domain-rule boundaries", () => {
  const goFiles = collectGoFiles(CORE_DIR);
  const violations = [];
  let importCount = 0;

  for (const file of goFiles) {
    const source = fs.readFileSync(file, "utf8");
    const imports = extractImports(source);
    importCount += imports.length;

    for (const importPath of imports) {
      for (const forbidden of FORBIDDEN_IMPORTS) {
        if (forbidden.pattern.test(importPath)) {
          violations.push(
            formatViolation(file, `forbidden import "${importPath}"`, forbidden.reason),
          );
        }
      }
    }

    for (const forbidden of FORBIDDEN_SOURCE_PATTERNS) {
      if (forbidden.pattern.test(source)) {
        violations.push(
          formatViolation(file, `forbidden source pattern ${forbidden.pattern}`, forbidden.reason),
        );
      }
    }
  }

  assert.deepEqual(violations, [], `core boundary violations:\n${violations.join("\n")}`);
  console.log(`core boundary ok: goFiles=${goFiles.length}, imports=${importCount}`);
});

test("server/internal/core README documents the no-runtime boundary", () => {
  const readmePath = path.join(CORE_DIR, "README.md");
  const readme = fs.readFileSync(readmePath, "utf8");

  for (const expected of [
    "只承载稳定、纯粹、可复用、无 IO 的产品领域规则",
    "不是第二套 `biz`",
    "不是第二套 `data`",
    "JSON-RPC",
    "Ent",
    "schema / migration",
  ]) {
    assert(
      readme.includes(expected),
      `server/internal/core/README.md must document boundary: ${expected}`,
    );
  }
});
