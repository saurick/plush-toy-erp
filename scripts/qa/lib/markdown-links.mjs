import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const EXTERNAL_LINK_SCHEMES = new Set([
  "app:",
  "chatgpt-conversation:",
  "data:",
  "http:",
  "https:",
  "mailto:",
  "sandbox:",
  "tel:",
]);

export function stripFencedCode(markdown) {
  return markdown.replace(/^\s*(```|~~~)[\s\S]*?^\s*\1\s*$/gmu, "");
}

export function markdownLinkTargets(markdown) {
  const targets = [];
  const source = stripFencedCode(markdown);
  const linkPattern = /!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^)]*["'])?\)/gu;
  for (const match of source.matchAll(linkPattern)) {
    targets.push(match[1].replace(/^<|>$/gu, ""));
  }
  return targets;
}

export function resolveLocalMarkdownLink({ rootDir, sourceFile, rawTarget }) {
  const target = rawTarget.trim();
  if (!target || target.startsWith("#") || target.startsWith("/")) {
    return null;
  }
  try {
    const url = new URL(target);
    if (EXTERNAL_LINK_SCHEMES.has(url.protocol)) {
      return null;
    }
  } catch {
    // Relative repository links are not absolute URLs and are handled below.
  }
  const pathOnly = target.split(/[?#]/u, 1)[0];
  if (!pathOnly) {
    return null;
  }
  let decodedPath = pathOnly;
  try {
    decodedPath = decodeURIComponent(pathOnly);
  } catch {
    // Keep the original path so a malformed target is reported as broken.
  }
  return path.resolve(rootDir, path.dirname(sourceFile), decodedPath);
}

function sourceIsIgnored(sourceFile, ignoredPrefixes) {
  return ignoredPrefixes.some(
    (prefix) => sourceFile === prefix || sourceFile.startsWith(prefix),
  );
}

export function findBrokenLocalMarkdownLinks({
  rootDir,
  sourceFiles,
  ignoredPrefixes = [],
}) {
  const resolvedRoot = path.resolve(rootDir);
  const broken = [];

  for (const sourceFile of sourceFiles) {
    if (sourceIsIgnored(sourceFile, ignoredPrefixes)) {
      continue;
    }
    const markdown = readFileSync(path.join(resolvedRoot, sourceFile), "utf8");
    for (const rawTarget of markdownLinkTargets(markdown)) {
      const resolved = resolveLocalMarkdownLink({
        rootDir: resolvedRoot,
        sourceFile,
        rawTarget,
      });
      if (!resolved) {
        continue;
      }
      const relative = path.relative(resolvedRoot, resolved);
      const escapesRoot = relative === ".." || relative.startsWith(`..${path.sep}`);
      if (escapesRoot || !existsSync(resolved)) {
        broken.push(`${sourceFile} -> ${rawTarget}`);
      }
    }
  }

  return broken.sort();
}
